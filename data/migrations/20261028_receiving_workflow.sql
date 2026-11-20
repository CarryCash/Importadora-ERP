-- Compras mínimas y recepción trazable; toda recepción cerrada genera inventario y kardex.
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  order_number VARCHAR(32) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved','partial','received','cancelled')),
  expected_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, order_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  ordered_quantity INTEGER NOT NULL CHECK (ordered_quantity > 0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  expected_quantity INTEGER NOT NULL CHECK (expected_quantity > 0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  batch_number VARCHAR(100),
  expiration_date DATE,
  suggested_location VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  transfer_number VARCHAR(40) NOT NULL,
  origin_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  target_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status VARCHAR(20) NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','partial','received','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, transfer_number),
  CHECK (origin_warehouse_id <> target_warehouse_id)
);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0
);

-- Conserva como esperadas las líneas de importaciones creadas por la versión anterior.
INSERT INTO import_items (import_id, product_id, expected_quantity, received_quantity, unit_cost, batch_number, expiration_date)
SELECT pb.import_id, pb.product_id, GREATEST(SUM(i.quantity), 1)::INTEGER, GREATEST(SUM(i.quantity), 0)::INTEGER,
       COALESCE(pb.unit_cost, 0), pb.batch_number, pb.expiration_date
FROM product_batches pb
LEFT JOIN inventory i ON i.batch_id = pb.id
WHERE pb.import_id IS NOT NULL
GROUP BY pb.import_id, pb.product_id, pb.unit_cost, pb.batch_number, pb.expiration_date
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  receipt_number VARCHAR(40) NOT NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('purchase_order','import','transfer','manual')),
  source_id UUID,
  supplier_id UUID REFERENCES suppliers(id),
  origin_warehouse_id UUID REFERENCES warehouses(id),
  target_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  carrier_name VARCHAR(160),
  vehicle_plate VARCHAR(20),
  arrived_at TIMESTAMPTZ,
  unloaded_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','inspection','ready','closed','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  source_line_id UUID,
  product_id UUID NOT NULL REFERENCES products(id),
  expected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  missing_quantity INTEGER NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
  surplus_quantity INTEGER NOT NULL DEFAULT 0 CHECK (surplus_quantity >= 0),
  barcode VARCHAR(100),
  batch_number VARCHAR(100),
  serial_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  expiration_date DATE,
  quality_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','approved','rejected','hold')),
  quality_notes TEXT,
  temporary_location VARCHAR(160),
  quarantine BOOLEAN NOT NULL DEFAULT false,
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_receipt_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  file_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  data_url TEXT NOT NULL,
  description VARCHAR(500),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS goods_receipt_number_seq;
CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq;
CREATE SEQUENCE IF NOT EXISTS warehouse_transfer_number_seq;
CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx ON purchase_orders(company_id, status, expected_date);
CREATE INDEX IF NOT EXISTS goods_receipts_company_created_idx ON goods_receipts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS goods_receipt_items_receipt_idx ON goods_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS warehouse_transfers_company_status_idx ON warehouse_transfers(company_id, status);

INSERT INTO warehouses (name, code, type, description)
VALUES ('Bodega de Cuarentena', 'WH-QUARANTINE', 'virtual', 'Mercadería retenida por inspección de calidad')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permission_catalog (permission_key, module, description) VALUES
  ('receiving.read', 'receiving', 'Consultar recepciones y órdenes de compra'),
  ('receiving.create', 'receiving', 'Crear órdenes de compra y recepciones'),
  ('receiving.close', 'receiving', 'Validar y cerrar recepciones generando inventario')
ON CONFLICT (permission_key) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

UPDATE company_settings
SET settings = jsonb_set(
  settings,
  '{enabledModules}',
  CASE WHEN COALESCE(settings->'enabledModules','[]'::jsonb) @> '["receiving"]'::jsonb
       THEN COALESCE(settings->'enabledModules','[]'::jsonb)
       ELSE COALESCE(settings->'enabledModules','[]'::jsonb) || '["receiving"]'::jsonb END,
  true
)
WHERE company_id IN (SELECT id FROM companies);

INSERT INTO role_permissions (company_id, role, permission_key, allowed)
SELECT c.id, role_name.role, grants.permission_key, true
FROM companies c
CROSS JOIN (VALUES ('admin'), ('warehouse')) AS role_name(role)
CROSS JOIN (VALUES ('receiving.read'), ('receiving.create'), ('receiving.close'), ('suppliers.read')) AS grants(permission_key)
WHERE c.slug = 'importadora-erp'
ON CONFLICT (company_id, role, permission_key) DO UPDATE SET allowed = true;
