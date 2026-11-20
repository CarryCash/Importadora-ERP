-- Phase 1: company-scoped product master, normalized catalog references,
-- identifiers, category attributes, archive state and immutable audit events.
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
UPDATE products SET company_id='10000000-0000-4000-8000-000000000001' WHERE company_id IS NULL;
ALTER TABLE products ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS commercial_name VARCHAR(160);
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description VARCHAR(500);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS family_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_product_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS archive_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_category_company_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_company_fk FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_brand_company_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_brand_company_fk FOREIGN KEY(brand_id) REFERENCES product_brands(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_manufacturer_company_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_manufacturer_company_fk FOREIGN KEY(manufacturer_id) REFERENCES product_manufacturers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_model_company_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_model_company_fk FOREIGN KEY(model_id) REFERENCES product_models(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_family_company_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_family_company_fk FOREIGN KEY(family_id) REFERENCES product_families(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_parent_product_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_parent_product_fk FOREIGN KEY(parent_product_id) REFERENCES products(id) ON DELETE RESTRICT;
  END IF;
END $$;

INSERT INTO product_categories(company_id,name)
SELECT DISTINCT p.company_id,LEFT(BTRIM(p.category),120) FROM products p
WHERE NULLIF(BTRIM(p.category),'') IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE products p SET category_id=c.id FROM product_categories c
WHERE p.category_id IS NULL AND c.company_id=p.company_id AND LOWER(c.name)=LOWER(BTRIM(p.category));

INSERT INTO product_brands(company_id,name)
SELECT DISTINCT p.company_id,LEFT(BTRIM(p.brand),120) FROM products p
WHERE NULLIF(BTRIM(p.brand),'') IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE products p SET brand_id=b.id FROM product_brands b
WHERE p.brand_id IS NULL AND b.company_id=p.company_id AND LOWER(b.name)=LOWER(BTRIM(p.brand));

UPDATE products SET commercial_name=name WHERE commercial_name IS NULL;
CREATE INDEX IF NOT EXISTS products_company_created_idx ON products(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS products_company_category_idx ON products(company_id,category_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS products_company_brand_idx ON products(company_id,brand_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS products_company_parent_idx ON products(company_id,parent_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_idx ON products(company_id,LOWER(BTRIM(sku))) WHERE sku IS NOT NULL AND BTRIM(sku)<>'';

CREATE TABLE IF NOT EXISTS product_identifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  identifier_type VARCHAR(32) NOT NULL CHECK(identifier_type IN ('ean8','upca','ean13','gtin14','internal','manufacturer_reference','supplier_reference','previous_code','other')),
  value VARCHAR(160) NOT NULL,
  normalized_value VARCHAR(160) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS product_identifiers_company_value_idx ON product_identifiers(company_id,identifier_type,normalized_value);
CREATE UNIQUE INDEX IF NOT EXISTS product_identifiers_primary_idx ON product_identifiers(product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS product_identifiers_product_idx ON product_identifiers(company_id,product_id);
INSERT INTO product_identifiers(company_id,product_id,identifier_type,value,normalized_value,is_primary)
SELECT p.company_id,p.id,
  CASE LENGTH(REGEXP_REPLACE(p.barcode,'\s','','g')) WHEN 8 THEN 'ean8' WHEN 12 THEN 'upca' WHEN 13 THEN 'ean13' WHEN 14 THEN 'gtin14' ELSE 'other' END,
  BTRIM(p.barcode),UPPER(REGEXP_REPLACE(BTRIM(p.barcode),'[\s-]','','g')),true
FROM products p WHERE NULLIF(BTRIM(p.barcode),'') IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS product_attribute_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  data_type VARCHAR(16) NOT NULL CHECK(data_type IN ('text','number','decimal','boolean','date','select','multiselect')),
  unit VARCHAR(32),
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,category_id,code)
);
CREATE TABLE IF NOT EXISTS product_attribute_values (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  definition_id UUID NOT NULL REFERENCES product_attribute_definitions(id) ON DELETE RESTRICT,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(product_id,definition_id)
);
CREATE INDEX IF NOT EXISTS product_attribute_definitions_category_idx ON product_attribute_definitions(company_id,category_id,is_active,sort_order);

CREATE TABLE IF NOT EXISTS product_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(24) NOT NULL CHECK(action IN ('created','updated','activated','deactivated','archived','restored','identifiers_changed','attributes_changed')),
  field_name VARCHAR(100),
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  request_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_audit_events_product_idx ON product_audit_events(company_id,product_id,created_at DESC);

-- Default product edit/read permissions already exist; archive is deliberately
-- managed through products.write during the transition to configurable roles.
