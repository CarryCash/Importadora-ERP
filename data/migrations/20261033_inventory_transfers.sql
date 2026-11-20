-- Traslados auditables entre ubicaciones, bodegas y sucursales.
INSERT INTO storage_locations(company_id,warehouse_id,code,name,location_type,is_default)
SELECT company_id,id,'TR-TRANSFER','Tránsito de transferencias','transit',false
FROM warehouses WHERE company_id IS NOT NULL
ON CONFLICT(warehouse_id,code) DO NOTHING;

INSERT INTO storage_locations(company_id,warehouse_id,code,name,location_type,is_default)
SELECT company_id,id,'QA-TRANSFER','Cuarentena de transferencias','quarantine',false
FROM warehouses WHERE company_id IS NOT NULL
ON CONFLICT(warehouse_id,code) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS inventory_transfer_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_transfer_receipt_number_seq START 1;

CREATE TABLE IF NOT EXISTS inventory_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number VARCHAR(36) NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_location_id UUID NOT NULL REFERENCES storage_locations(id),
  status VARCHAR(24) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','partially_shipped','in_transit','partially_received','received','cancelled')),
  reason TEXT NOT NULL,
  request_notes TEXT,
  approval_notes TEXT,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  shipped_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMPTZ,
  last_shipped_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  UNIQUE(company_id,transfer_number),
  CHECK(from_warehouse_id<>to_warehouse_id OR to_location_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  source_inventory_id UUID NOT NULL REFERENCES inventory(id),
  source_location_id UUID NOT NULL REFERENCES storage_locations(id),
  reserved_inventory_id UUID REFERENCES inventory(id),
  transit_inventory_id UUID REFERENCES inventory(id),
  requested_quantity INTEGER NOT NULL CHECK(requested_quantity>0),
  shipped_quantity INTEGER NOT NULL DEFAULT 0 CHECK(shipped_quantity>=0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK(damaged_quantity>=0),
  lost_quantity INTEGER NOT NULL DEFAULT 0 CHECK(lost_quantity>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(shipped_quantity<=requested_quantity),
  CHECK(received_quantity+damaged_quantity+lost_quantity<=shipped_quantity)
);

CREATE TABLE IF NOT EXISTS inventory_transfer_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES inventory_transfers(id),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transfer_receipt_items (
  receipt_id UUID NOT NULL REFERENCES inventory_transfer_receipts(id) ON DELETE CASCADE,
  transfer_item_id UUID NOT NULL REFERENCES inventory_transfer_items(id),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK(damaged_quantity>=0),
  lost_quantity INTEGER NOT NULL DEFAULT 0 CHECK(lost_quantity>=0),
  notes TEXT,
  PRIMARY KEY(receipt_id,transfer_item_id),
  CHECK(received_quantity+damaged_quantity+lost_quantity>0)
);

CREATE TABLE IF NOT EXISTS inventory_transfer_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL CHECK(event_type IN ('requested','approved','shipped','received','cancelled')),
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE storage_movements DROP CONSTRAINT IF EXISTS storage_movements_movement_type_check;
ALTER TABLE storage_movements ADD CONSTRAINT storage_movements_movement_type_check
  CHECK(movement_type IN ('putaway','relocation','replenishment','consolidation','split','status_change','cross_dock','dispatch','transfer'));

INSERT INTO permission_catalog(permission_key,module,description) VALUES
  ('transfers.read','logistics','Consultar transferencias y trazabilidad'),
  ('transfers.request','logistics','Solicitar transferencias de inventario'),
  ('transfers.approve','logistics','Aprobar y reservar transferencias'),
  ('transfers.ship','logistics','Preparar y despachar transferencias de origen'),
  ('transfers.receive','logistics','Recibir transferencias y registrar diferencias'),
  ('transfers.cancel','logistics','Cancelar solicitudes antes del despacho')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES('admin'),('warehouse')) r(role)
CROSS JOIN (VALUES('transfers.read'),('transfers.request'),('transfers.ship'),('transfers.receive'),('transfers.cancel')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'admin',p.permission_key,true FROM companies c
CROSS JOIN (VALUES('transfers.approve')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

CREATE INDEX IF NOT EXISTS inventory_transfers_company_status_idx ON inventory_transfers(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transfer_items_transfer_idx ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS inventory_transfer_events_transfer_idx ON inventory_transfer_events(transfer_id,created_at);
CREATE INDEX IF NOT EXISTS inventory_transfer_receipts_transfer_idx ON inventory_transfer_receipts(transfer_id,received_at DESC);
