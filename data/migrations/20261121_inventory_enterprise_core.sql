-- ==============================================================================
-- Migración: 20261121_inventory_enterprise_core.sql
-- Módulo de Inventario Definitivo — ERP Ecuador
-- Trazabilidad (Lotes/Series), Valoración FIFO, Movimientos Inmutables y Proyección
-- ==============================================================================

-- 1. EXTENSIÓN DE PRODUCTOS Y BODEGAS
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS tracking_type VARCHAR(20) NOT NULL DEFAULT 'none' 
  CHECK (tracking_type IN ('none', 'lot', 'serial', 'lot_and_serial'));

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS operating_type VARCHAR(30) NOT NULL DEFAULT 'principal'
  CHECK (operating_type IN ('principal', 'secundaria', 'distribucion', 'temporal', 'transito', 'cuarentena', 'danada', 'devoluciones'));

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS allows_sale_dispatch BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Configurar restricciones de despacho en bodegas especiales
UPDATE warehouses SET 
  operating_type = 'transito', 
  allows_sale_dispatch = false 
WHERE code IN ('WH-TRANSIT', 'TR-TRANSFER') OR operating_type = 'transito';

UPDATE warehouses SET 
  operating_type = 'cuarentena', 
  allows_sale_dispatch = false 
WHERE code IN ('WH-QUARANTINE', 'QA-TRANSFER') OR operating_type = 'cuarentena';

-- 2. TRAZABILIDAD: LOTES FORMALES
CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  lot_number VARCHAR(80) NOT NULL,
  manufacturing_date DATE,
  expiration_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  initial_quantity NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (initial_quantity >= 0),
  current_quantity NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked', 'quarantine', 'expired', 'depleted')),
  origin_document_type VARCHAR(40),
  origin_document_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, product_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_lookup 
  ON inventory_lots(company_id, product_id, status, expiration_date);

-- Migrar lotes heredados desde product_batches preservando IDs
INSERT INTO inventory_lots (id, company_id, product_id, lot_number, expiration_date, initial_quantity, current_quantity, status)
SELECT 
  pb.id,
  p.company_id,
  pb.product_id,
  pb.batch_number,
  pb.expiration_date,
  COALESCE((SELECT SUM(quantity) FROM inventory WHERE batch_id = pb.id), 0),
  COALESCE((SELECT SUM(quantity) FROM inventory WHERE batch_id = pb.id), 0),
  CASE 
    WHEN pb.expiration_date < CURRENT_DATE THEN 'expired'
    WHEN (SELECT SUM(quantity) FROM inventory WHERE batch_id = pb.id) <= 0 THEN 'depleted'
    ELSE 'available'
  END
FROM product_batches pb
JOIN products p ON p.id = pb.product_id
ON CONFLICT (id) DO NOTHING;

-- 3. TRAZABILIDAD: NÚMEROS DE SERIE CON HISTORIAL
CREATE TABLE IF NOT EXISTS inventory_serials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  serial_number VARCHAR(160) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  acquisition_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  current_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  current_location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'sold', 'returned', 'quarantine', 'damaged', 'scrap')),
  source_reference VARCHAR(100),
  warranty_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, product_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_serials_product_status 
  ON inventory_serials(company_id, product_id, status);

-- Migrar series existentes desde inventory_unit_serials
INSERT INTO inventory_serials (id, company_id, product_id, lot_id, serial_number, status, source_reference, created_at)
SELECT 
  s.id,
  s.company_id,
  s.product_id,
  s.batch_id,
  s.serial_number,
  s.status,
  s.source_reference,
  s.created_at
FROM inventory_unit_serials s
ON CONFLICT (company_id, product_id, serial_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS inventory_serial_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_id UUID NOT NULL REFERENCES inventory_serials(id) ON DELETE CASCADE,
  movement_line_id UUID,
  from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  from_location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_serial_movements_serial 
  ON inventory_serial_movements(serial_id, created_at DESC);

-- 4. MOTOR DE VALORACIÓN FIFO
CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  origin_doc_type VARCHAR(40) NOT NULL, -- 'receipt', 'import', 'purchase', 'adjustment', 'initial'
  origin_doc_id UUID,
  origin_doc_line_id UUID,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  initial_quantity NUMERIC(14,4) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity NUMERIC(14,4) NOT NULL CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity),
  origin_currency CHAR(3) NOT NULL DEFAULT 'USD',
  unit_cost NUMERIC(18,6) NOT NULL CHECK (unit_cost >= 0),
  functional_unit_cost NUMERIC(18,6) NOT NULL CHECK (functional_unit_cost >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'adjusted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_layers_fifo 
  ON inventory_cost_layers(company_id, product_id, status, effective_date ASC);

-- 5. MOVIMIENTOS INMUTABLES DE INVENTARIO (FUENTE DE VERDAD)
CREATE SEQUENCE IF NOT EXISTS inventory_movement_number_seq START 1;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_number VARCHAR(40) NOT NULL,
  operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN (
    'receipt', 'issue', 'transfer_out', 'transfer_in', 
    'adjustment_positive', 'adjustment_negative', 
    'count_reconciliation', 'return_customer', 'return_supplier'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  reference_doc_type VARCHAR(40),
  reference_doc_id UUID,
  notes TEXT,
  idempotency_key VARCHAR(100),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, movement_number),
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_lookup 
  ON inventory_movements(company_id, operation_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_movement_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  from_location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  to_warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movement_lines_product 
  ON inventory_movement_lines(product_id, created_at DESC);

-- Consumo de capas FIFO
CREATE TABLE IF NOT EXISTS inventory_cost_consumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cost_layer_id UUID NOT NULL REFERENCES inventory_cost_layers(id) ON DELETE RESTRICT,
  movement_line_id UUID NOT NULL REFERENCES inventory_movement_lines(id) ON DELETE CASCADE,
  quantity_consumed NUMERIC(14,4) NOT NULL CHECK (quantity_consumed > 0),
  unit_cost_applied NUMERIC(18,6) NOT NULL CHECK (unit_cost_applied >= 0),
  total_cost NUMERIC(18,4) GENERATED ALWAYS AS (quantity_consumed * unit_cost_applied) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_consumptions_layer 
  ON inventory_cost_consumptions(cost_layer_id);

CREATE TABLE IF NOT EXISTS inventory_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cost_layer_id UUID NOT NULL REFERENCES inventory_cost_layers(id) ON DELETE RESTRICT,
  old_unit_cost NUMERIC(18,6) NOT NULL,
  new_unit_cost NUMERIC(18,6) NOT NULL,
  cost_difference NUMERIC(18,6) NOT NULL,
  reason TEXT NOT NULL,
  authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_valuation_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  snapshot_date DATE NOT NULL,
  total_valuation NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_units NUMERIC(18,4) NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, warehouse_id, snapshot_date)
);

-- 6. SALDOS Y PROYECCIÓN DE EXISTENCIAS
CREATE TABLE IF NOT EXISTS inventory_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE CASCADE,
  physical_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (physical_stock >= 0),
  reserved_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  blocked_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (blocked_stock >= 0),
  available_stock NUMERIC(14,4) GENERATED ALWAYS AS (GREATEST(0, physical_stock - reserved_stock - blocked_stock)) STORED,
  in_transit_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (in_transit_stock >= 0),
  in_receipt_stock NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (in_receipt_stock >= 0),
  last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inventory_balance UNIQUE NULLS NOT DISTINCT (company_id, product_id, warehouse_id, location_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_search 
  ON inventory_balances(company_id, product_id, warehouse_id, location_id);

-- Sembrar saldos iniciales desde la tabla legacy inventory
INSERT INTO inventory_balances (company_id, product_id, warehouse_id, location_id, lot_id, physical_stock, blocked_stock)
SELECT 
  w.company_id,
  b.product_id,
  i.warehouse_id,
  i.storage_location_id,
  i.batch_id,
  SUM(i.quantity),
  SUM(CASE WHEN i.stock_status IN ('quarantine', 'damaged') THEN i.quantity ELSE 0 END)
FROM inventory i
JOIN warehouses w ON w.id = i.warehouse_id
JOIN product_batches b ON b.id = i.batch_id
WHERE w.company_id IS NOT NULL AND i.storage_location_id IS NOT NULL
GROUP BY w.company_id, b.product_id, i.warehouse_id, i.storage_location_id, i.batch_id
ON CONFLICT DO NOTHING;

-- Sembrar capas FIFO iniciales a partir de las existencias actuales valorizadas
INSERT INTO inventory_cost_layers (company_id, product_id, warehouse_id, location_id, lot_id, origin_doc_type, origin_doc_id, initial_quantity, remaining_quantity, unit_cost, functional_unit_cost, status)
SELECT 
  w.company_id,
  b.product_id,
  i.warehouse_id,
  i.storage_location_id,
  i.batch_id,
  'initial',
  i.id,
  i.quantity,
  i.quantity,
  COALESCE(b.unit_cost, 0),
  COALESCE(b.unit_cost, 0),
  'active'
FROM inventory i
JOIN warehouses w ON w.id = i.warehouse_id
JOIN product_batches b ON b.id = i.batch_id
WHERE i.quantity > 0 AND w.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. RESERVAS DE INVENTARIO
CREATE SEQUENCE IF NOT EXISTS inventory_reservation_number_seq START 1;

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reservation_number VARCHAR(40) NOT NULL,
  source_doc_type VARCHAR(40) NOT NULL, -- 'sale_order', 'quote', 'transfer_request'
  source_doc_id UUID NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('requested', 'reserved', 'partially_fulfilled', 'released', 'consumed', 'cancelled')),
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, reservation_number)
);

CREATE TABLE IF NOT EXISTS inventory_reservation_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES inventory_reservations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES storage_locations(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  fulfilled_quantity NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. AJUSTES FORMALES DE INVENTARIO
CREATE SEQUENCE IF NOT EXISTS inventory_adjustment_number_seq START 1;

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  adjustment_number VARCHAR(40) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN ('positive', 'negative', 'location_correction', 'lot_serial_correction', 'count_variance', 'regularization')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled')),
  reason TEXT NOT NULL,
  document_reference VARCHAR(100),
  total_valuation_impact NUMERIC(18,4) NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, adjustment_number)
);

CREATE TABLE IF NOT EXISTS inventory_adjustment_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adjustment_id UUID NOT NULL REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  quantity_before NUMERIC(14,4) NOT NULL,
  quantity_after NUMERIC(14,4) NOT NULL,
  difference NUMERIC(14,4) GENERATED ALWAYS AS (quantity_after - quantity_before) STORED,
  unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
  valuation_impact NUMERIC(18,4) GENERATED ALWAYS AS ((quantity_after - quantity_before) * unit_cost) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. CONTEOS FÍSICOS DE INVENTARIO
CREATE SEQUENCE IF NOT EXISTS inventory_count_number_seq START 1;

CREATE TABLE IF NOT EXISTS inventory_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  count_number VARCHAR(40) NOT NULL,
  count_type VARCHAR(20) NOT NULL CHECK (count_type IN ('full', 'cyclic')),
  status VARCHAR(20) NOT NULL DEFAULT 'counting' CHECK (status IN ('draft', 'counting', 'submitted', 'reconciled', 'cancelled')),
  notes TEXT,
  cut_off_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, count_number)
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  expected_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  counted_quantity NUMERIC(14,4),
  variance NUMERIC(14,4) GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - expected_quantity) STORED,
  reason TEXT,
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ
);

-- 10. REGISTRO INMUTABLE DE AUDITORÍA
CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_entity 
  ON inventory_audit_log(company_id, entity_type, entity_id, created_at DESC);

-- 11. CATÁLOGO DE PERMISOS
INSERT INTO permission_catalog(permission_key, module, description) VALUES
  ('inventory.balances.read', 'inventory', 'Consultar existencias y disponibilidad'),
  ('inventory.kardex.read', 'inventory', 'Consultar Kardex cronológico'),
  ('inventory.movements.create', 'inventory', 'Registrar movimientos de inventario'),
  ('inventory.movements.confirm', 'inventory', 'Confirmar y aplicar movimientos inmutables'),
  ('inventory.transfers.manage', 'inventory', 'Gestionar traslados entre bodegas'),
  ('inventory.adjustments.request', 'inventory', 'Solicitar ajustes de inventario'),
  ('inventory.adjustments.approve', 'inventory', 'Aprobar ajustes de inventario con impacto contable'),
  ('inventory.counts.manage', 'inventory', 'Ejecutar y conciliar conteos físicos'),
  ('inventory.reservations.manage', 'inventory', 'Crear y liberar reservas de inventario'),
  ('inventory.fifo.read', 'inventory', 'Consultar capas FIFO y valoraciones'),
  ('inventory.fifo.adjust', 'inventory', 'Ajustar costos y valoraciones contables'),
  ('inventory.audit.read', 'inventory', 'Consultar bitácora inmutable de auditoría')
ON CONFLICT (permission_key) DO UPDATE SET module=EXCLUDED.module, description=EXCLUDED.description;

-- Conceder permisos por rol
INSERT INTO role_permissions(company_id, role, permission_key, allowed)
SELECT c.id, r.role, p.permission_key, true
FROM companies c
CROSS JOIN (VALUES ('admin'), ('erp_admin'), ('jefe_bodega'), ('contador')) r(role)
CROSS JOIN (VALUES 
  ('inventory.balances.read'), ('inventory.kardex.read'), 
  ('inventory.movements.create'), ('inventory.movements.confirm'), 
  ('inventory.transfers.manage'), ('inventory.adjustments.request'), 
  ('inventory.adjustments.approve'), ('inventory.counts.manage'), 
  ('inventory.reservations.manage'), ('inventory.fifo.read'), 
  ('inventory.fifo.adjust'), ('inventory.audit.read')
) p(permission_key)
ON CONFLICT (company_id, role, permission_key) DO UPDATE SET allowed=true, updated_at=NOW();

