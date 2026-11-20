-- WMS: ubicaciones físicas, ocupación, disponibilidad, reglas y trazabilidad.
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (volume_m3 >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_pallet NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (units_per_pallet > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hazardous BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hazard_class VARCHAR(40);

-- Recepción y almacenamiento son secciones internas del módulo Logística.
UPDATE company_settings
SET settings=jsonb_set(settings,'{enabledModules}',COALESCE(settings->'enabledModules','[]'::jsonb)-'receiving',true)
WHERE settings ? 'enabledModules';

CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  zone VARCHAR(80),
  aisle VARCHAR(40),
  rack VARCHAR(40),
  level VARCHAR(40),
  position VARCHAR(40),
  location_type VARCHAR(24) NOT NULL DEFAULT 'storage' CHECK (location_type IN ('receiving','picking','storage','quarantine','cross_dock','temporary','transit','dispatch')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  capacity_units NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (capacity_units >= 0),
  capacity_weight_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (capacity_weight_kg >= 0),
  capacity_volume_m3 NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (capacity_volume_m3 >= 0),
  capacity_pallets NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (capacity_pallets >= 0),
  pick_minimum NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (pick_minimum >= 0),
  pick_maximum NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (pick_maximum >= pick_minimum),
  allow_mixed_products BOOLEAN NOT NULL DEFAULT true,
  allows_hazardous BOOLEAN NOT NULL DEFAULT false,
  allowed_hazard_classes TEXT[] NOT NULL DEFAULT '{}',
  compatible_categories TEXT[] NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (warehouse_id, code)
);

-- Una ubicación base por bodega y ubicaciones heredadas para preservar los bins actuales.
INSERT INTO storage_locations (company_id,warehouse_id,code,name,location_type,is_default)
SELECT w.company_id,w.id,'SIN-UBICAR','Sin ubicación asignada',
       CASE WHEN w.code='WH-QUARANTINE' THEN 'quarantine' WHEN w.code='WH-TRANSIT' THEN 'transit' ELSE 'storage' END,true
FROM warehouses w WHERE w.company_id IS NOT NULL
ON CONFLICT (warehouse_id,code) DO NOTHING;

INSERT INTO storage_locations (company_id,warehouse_id,code,name,zone,location_type)
SELECT w.company_id,w.id,'LEGACY-'||substr(md5(w.id::text||'|'||COALESCE(i.bin_location,'')),1,12),
       LEFT(COALESCE(NULLIF(BTRIM(i.bin_location),''),'Ubicación heredada'),160),'Heredado','storage'
FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id
WHERE i.bin_location IS NOT NULL AND BTRIM(i.bin_location)<>'' AND w.company_id IS NOT NULL
GROUP BY w.company_id,w.id,i.bin_location
ON CONFLICT (warehouse_id,code) DO NOTHING;

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES storage_locations(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_status VARCHAR(16) NOT NULL DEFAULT 'available'
  CHECK (stock_status IN ('available','quarantine','damaged','reserved'));
UPDATE inventory i SET storage_location_id = l.id
FROM warehouses w, storage_locations l
WHERE w.id=i.warehouse_id AND l.warehouse_id=i.warehouse_id AND l.code='LEGACY-'||substr(md5(w.id::text||'|'||COALESCE(i.bin_location,'')),1,12)
  AND i.storage_location_id IS NULL;
UPDATE inventory i SET storage_location_id=l.id
FROM storage_locations l WHERE l.warehouse_id=i.warehouse_id AND l.code='SIN-UBICAR' AND i.storage_location_id IS NULL;
UPDATE inventory i SET stock_status='quarantine'
FROM warehouses w WHERE w.id=i.warehouse_id AND w.code='WH-QUARANTINE';
ALTER TABLE inventory ALTER COLUMN storage_location_id SET NOT NULL;
DROP INDEX IF EXISTS idx_inventory_batch_warehouse;
ALTER TABLE inventory ADD CONSTRAINT inventory_batch_warehouse_location_status_key
  UNIQUE (batch_id,warehouse_id,storage_location_id,stock_status);

CREATE TABLE IF NOT EXISTS storage_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category VARCHAR(80),
  required_location_type VARCHAR(24) CHECK (required_location_type IN ('receiving','picking','storage','quarantine','cross_dock','temporary','transit','dispatch')),
  preferred_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  incompatible_categories TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (product_id IS NOT NULL OR category IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS storage_movements (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id),
  batch_id UUID NOT NULL REFERENCES product_batches(id),
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  from_location_id UUID REFERENCES storage_locations(id),
  to_location_id UUID REFERENCES storage_locations(id),
  movement_type VARCHAR(24) NOT NULL CHECK (movement_type IN ('putaway','relocation','replenishment','consolidation','split','status_change','cross_dock')),
  quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  from_status VARCHAR(16),
  to_status VARCHAR(16),
  reference VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL;
ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
UPDATE sales_items si SET
  inventory_id = (SELECT i.id FROM inventory i WHERE i.batch_id=si.batch_id ORDER BY i.created_at LIMIT 1),
  storage_location_id = (SELECT i.storage_location_id FROM inventory i WHERE i.batch_id=si.batch_id ORDER BY i.created_at LIMIT 1)
WHERE si.inventory_id IS NULL;

CREATE INDEX IF NOT EXISTS storage_locations_warehouse_type_idx ON storage_locations(warehouse_id,location_type,status);
CREATE INDEX IF NOT EXISTS storage_rules_lookup_idx ON storage_rules(company_id,product_id,category,is_active,priority);
CREATE INDEX IF NOT EXISTS storage_movements_company_date_idx ON storage_movements(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_location_status_idx ON inventory(storage_location_id,stock_status);

INSERT INTO permission_catalog (permission_key,module,description) VALUES
  ('storage.read','logistics','Consultar ubicaciones, ocupación y reposición'),
  ('storage.write','logistics','Asignar, mover y bloquear ubicaciones')
ON CONFLICT (permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES ('admin'),('warehouse')) AS r(role)
CROSS JOIN (VALUES ('storage.read'),('storage.write')) AS p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES ('admin'),('warehouse')) AS r(role)
CROSS JOIN (VALUES ('receiving.read'),('receiving.create'),('receiving.close'),('logistics.read'),('logistics.write')) AS p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
