-- Preparación, empaque y despacho sobre ventas ya registradas.
INSERT INTO storage_locations(company_id,warehouse_id,code,name,location_type,is_default,allow_mixed_products)
SELECT company_id,id,'DESPACHO','Zona de despacho','dispatch',false,true
FROM warehouses WHERE company_id IS NOT NULL
ON CONFLICT(warehouse_id,code) DO NOTHING;

CREATE TABLE IF NOT EXISTS fulfillment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id),
  fulfillment_number VARCHAR(32) NOT NULL,
  status VARCHAR(28) NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','picking','picked','packed','partially_dispatched','dispatched','cancelled')),
  picking_strategy VARCHAR(8) NOT NULL DEFAULT 'fefo' CHECK(picking_strategy IN ('fifo','fefo')),
  priority VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  recipient_name VARCHAR(180),
  shipping_address TEXT,
  shipping_city VARCHAR(100),
  shipping_phone VARCHAR(60),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  packed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dispatched_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  packed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(company_id,sale_id),
  UNIQUE(company_id,fulfillment_number)
);

CREATE SEQUENCE IF NOT EXISTS fulfillment_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS fulfillment_wave_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS dispatch_number_seq START 1;

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120);
UPDATE products p SET barcode=(
  SELECT gri.barcode FROM goods_receipt_items gri WHERE gri.product_id=p.id AND gri.barcode IS NOT NULL AND BTRIM(gri.barcode)<>''
  ORDER BY gri.created_at DESC LIMIT 1
) WHERE p.barcode IS NULL;

CREATE TABLE IF NOT EXISTS fulfillment_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sales_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  source_inventory_id UUID NOT NULL REFERENCES inventory(id),
  reserved_inventory_id UUID NOT NULL REFERENCES inventory(id),
  ordered_quantity INTEGER NOT NULL CHECK(ordered_quantity>0),
  picked_quantity INTEGER NOT NULL DEFAULT 0 CHECK(picked_quantity>=0),
  packed_quantity INTEGER NOT NULL DEFAULT 0 CHECK(packed_quantity>=0),
  dispatched_quantity INTEGER NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fulfillment_order_id,sale_item_id)
);

CREATE TABLE IF NOT EXISTS fulfillment_waves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  wave_number VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','picking','completed','cancelled')),
  picking_strategy VARCHAR(8) NOT NULL DEFAULT 'fefo' CHECK(picking_strategy IN ('fifo','fefo')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  UNIQUE(company_id,wave_number)
);

CREATE TABLE IF NOT EXISTS fulfillment_wave_orders (
  wave_id UUID NOT NULL REFERENCES fulfillment_waves(id) ON DELETE CASCADE,
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  PRIMARY KEY(wave_id,fulfillment_order_id)
);

CREATE TABLE IF NOT EXISTS fulfillment_wave_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wave_id UUID NOT NULL REFERENCES fulfillment_waves(id) ON DELETE CASCADE,
  fulfillment_item_id UUID NOT NULL REFERENCES fulfillment_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  picked_quantity INTEGER NOT NULL DEFAULT 0 CHECK(picked_quantity>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wave_id,fulfillment_item_id)
);

CREATE TABLE IF NOT EXISTS fulfillment_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wave_item_id UUID NOT NULL REFERENCES fulfillment_wave_items(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  verified_barcode VARCHAR(120),
  picked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  picked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE fulfillment_picks ADD COLUMN IF NOT EXISTS dispatched_quantity INTEGER NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0);

CREATE TABLE IF NOT EXISTS fulfillment_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  package_number VARCHAR(48) NOT NULL,
  package_type VARCHAR(16) NOT NULL CHECK(package_type IN ('box','bundle','pallet','container')),
  weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK(weight_kg>=0),
  volume_m3 NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(volume_m3>=0),
  label_code VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fulfillment_order_id,package_number)
);

CREATE TABLE IF NOT EXISTS fulfillment_package_items (
  package_id UUID NOT NULL REFERENCES fulfillment_packages(id) ON DELETE CASCADE,
  fulfillment_item_id UUID NOT NULL REFERENCES fulfillment_items(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  PRIMARY KEY(package_id,fulfillment_item_id)
);
ALTER TABLE fulfillment_package_items ADD COLUMN IF NOT EXISTS dispatched_quantity INTEGER NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0);

CREATE TABLE IF NOT EXISTS fulfillment_checklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  check_key VARCHAR(40) NOT NULL,
  label VARCHAR(180) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE(fulfillment_order_id,check_key)
);

CREATE TABLE IF NOT EXISTS dispatch_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id),
  dispatch_number VARCHAR(40) NOT NULL UNIQUE,
  carrier_name VARCHAR(160),
  driver_name VARCHAR(160),
  vehicle_plate VARCHAR(40),
  tracking_number VARCHAR(100),
  document_reference VARCHAR(120),
  notes TEXT,
  dispatched_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_event_items (
  dispatch_event_id UUID NOT NULL REFERENCES dispatch_events(id) ON DELETE CASCADE,
  fulfillment_item_id UUID NOT NULL REFERENCES fulfillment_items(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  PRIMARY KEY(dispatch_event_id,fulfillment_item_id)
);

ALTER TABLE storage_movements DROP CONSTRAINT IF EXISTS storage_movements_movement_type_check;
ALTER TABLE storage_movements ADD CONSTRAINT storage_movements_movement_type_check
  CHECK(movement_type IN ('putaway','relocation','replenishment','consolidation','split','status_change','cross_dock','dispatch'));

CREATE TABLE IF NOT EXISTS fulfillment_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  dispatch_event_id UUID REFERENCES dispatch_events(id) ON DELETE CASCADE,
  evidence_type VARCHAR(30) NOT NULL CHECK(evidence_type IN ('photo','document','signed_delivery','other')),
  file_name VARCHAR(240) NOT NULL,
  file_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
  ('dispatch.read','logistics','Consultar preparación, empaque y despachos'),
  ('dispatch.manage','logistics','Crear órdenes de preparación y olas de picking'),
  ('dispatch.pick','logistics','Confirmar picking y verificación de artículos'),
  ('dispatch.pack','logistics','Empacar pedidos y emitir etiquetas logísticas'),
  ('dispatch.confirm','logistics','Confirmar despachos parciales o totales')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES('admin'),('warehouse')) r(role)
CROSS JOIN (VALUES('dispatch.read'),('dispatch.manage'),('dispatch.pick'),('dispatch.pack'),('dispatch.confirm')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

CREATE INDEX IF NOT EXISTS fulfillment_orders_company_status_idx ON fulfillment_orders(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS fulfillment_items_order_idx ON fulfillment_items(fulfillment_order_id);
CREATE INDEX IF NOT EXISTS fulfillment_waves_company_status_idx ON fulfillment_waves(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS dispatch_events_order_idx ON dispatch_events(fulfillment_order_id,dispatched_at DESC);
