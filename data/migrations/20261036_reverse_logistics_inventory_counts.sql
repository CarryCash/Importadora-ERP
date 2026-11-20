-- Operational returns (customer and supplier) plus warehouse inventory counts.
CREATE SEQUENCE IF NOT EXISTS logistics_return_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS logistics_count_number_seq START 1;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS return_number VARCHAR(40);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS direction VARCHAR(12) NOT NULL DEFAULT 'customer';
ALTER TABLE returns ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS fulfillment_order_id UUID REFERENCES fulfillment_orders(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS authorization_notes TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS inspection_notes TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS resolution VARCHAR(20);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS transport_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(transport_cost>=0);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS warranty_until DATE;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE returns ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE returns ADD CONSTRAINT returns_origin_check CHECK((direction='customer' AND sale_id IS NOT NULL) OR (direction='supplier' AND supplier_id IS NOT NULL));
ALTER TABLE returns ADD CONSTRAINT returns_direction_check CHECK(direction IN ('customer','supplier'));
ALTER TABLE returns ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
ALTER TABLE returns ADD CONSTRAINT returns_status_check CHECK(status IN ('pending','authorized','received','inspected','resolved','rejected','completed'));
UPDATE returns r SET company_id=s.company_id FROM sales s WHERE r.sale_id=s.id AND r.company_id IS NULL;
UPDATE returns SET return_number='DEV-LEGACY-'||substr(id::text,1,8) WHERE return_number IS NULL;
ALTER TABLE returns ALTER COLUMN return_number SET NOT NULL;

ALTER TABLE return_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id);
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES inventory(id);
ALTER TABLE return_items ALTER COLUMN sale_item_id DROP NOT NULL;
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS receipt_item_id UUID REFERENCES goods_receipt_items(id) ON DELETE SET NULL;
ALTER TABLE goods_receipt_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL;
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0);
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS condition VARCHAR(20) NOT NULL DEFAULT 'unknown';
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS inspected_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE return_items ri SET product_id=pb.product_id,batch_id=si.batch_id
FROM sales_items si JOIN product_batches pb ON pb.id=si.batch_id WHERE ri.sale_item_id=si.id AND ri.product_id IS NULL;
UPDATE goods_receipt_items gri SET batch_id=(SELECT pb.id FROM goods_receipts gr JOIN product_batches pb ON pb.import_id=gr.source_id AND pb.product_id=gri.product_id AND pb.batch_number=gri.batch_number WHERE gr.id=gri.receipt_id AND gr.source_type='import' ORDER BY pb.created_at DESC LIMIT 1) WHERE gri.batch_id IS NULL;
ALTER TABLE return_items DROP CONSTRAINT IF EXISTS return_items_disposition_check;
ALTER TABLE return_items ADD CONSTRAINT return_items_disposition_check CHECK(disposition IN ('sellable','repair','quarantine','scrap','restock','discard'));
ALTER TABLE return_items ADD CONSTRAINT return_items_condition_check CHECK(condition IN ('sealed','opened','damaged','defective','unknown'));

CREATE TABLE IF NOT EXISTS logistics_return_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logistics_inventory_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  count_number VARCHAR(40) NOT NULL,
  count_type VARCHAR(12) NOT NULL CHECK(count_type IN ('cycle','full')),
  status VARCHAR(16) NOT NULL DEFAULT 'counting' CHECK(status IN ('counting','submitted','reconciled','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  UNIQUE(company_id,count_number)
);
CREATE TABLE IF NOT EXISTS logistics_inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id UUID NOT NULL REFERENCES logistics_inventory_counts(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id),
  expected_quantity INTEGER NOT NULL CHECK(expected_quantity>=0),
  counted_quantity INTEGER CHECK(counted_quantity>=0),
  reason TEXT,
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ,
  UNIQUE(count_id,inventory_id)
);

CREATE TABLE IF NOT EXISTS inventory_unit_serials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
  serial_number VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'in_stock' CHECK(status IN ('in_stock','reserved','sold','returned','quarantine','scrap')),
  source_reference VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,serial_number)
);

CREATE INDEX IF NOT EXISTS returns_company_status_idx ON returns(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_return_events_return_idx ON logistics_return_events(return_id,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_counts_company_status_idx ON logistics_inventory_counts(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_count_lines_count_idx ON logistics_inventory_count_lines(count_id,counted_at);
CREATE INDEX IF NOT EXISTS inventory_unit_serials_lookup_idx ON inventory_unit_serials(company_id,serial_number);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('returns.read','logistics','Consultar devoluciones y garantías'),
 ('returns.manage','logistics','Crear y autorizar devoluciones'),
 ('returns.receive','logistics','Recibir e inspeccionar artículos devueltos'),
 ('returns.resolve','logistics','Resolver devoluciones y disponer productos'),
 ('logistics_inventory.read','logistics','Consultar inventario logístico y trazabilidad'),
 ('logistics_inventory.count','logistics','Crear y registrar conteos de inventario'),
 ('logistics_inventory.reconcile','logistics','Conciliar conteos y aplicar diferencias autorizadas')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'admin',p.permission_key,true FROM companies c
CROSS JOIN (VALUES('returns.read'),('returns.manage'),('returns.receive'),('returns.resolve'),('logistics_inventory.read'),('logistics_inventory.count'),('logistics_inventory.reconcile')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'warehouse',p.permission_key,true FROM companies c
CROSS JOIN (VALUES('returns.read'),('returns.receive'),('logistics_inventory.read'),('logistics_inventory.count')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'sales',p.permission_key,true FROM companies c
CROSS JOIN (VALUES('returns.read'),('returns.manage')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
