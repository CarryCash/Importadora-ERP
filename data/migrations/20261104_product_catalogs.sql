CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL, name VARCHAR(120) NOT NULL,
  description TEXT, image_url TEXT, attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, parent_id, name)
);
CREATE TABLE IF NOT EXISTS product_manufacturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL, country VARCHAR(100), website TEXT, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id, name)
);
CREATE TABLE IF NOT EXISTS product_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  manufacturer_id UUID REFERENCES product_manufacturers(id) ON DELETE SET NULL, name VARCHAR(120) NOT NULL,
  logo_url TEXT, origin_country VARCHAR(100), website TEXT, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id, name)
);
CREATE TABLE IF NOT EXISTS product_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES product_brands(id) ON DELETE SET NULL, name VARCHAR(140) NOT NULL, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id, brand_id, name)
);
CREATE TABLE IF NOT EXISTS product_families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES product_families(id) ON DELETE SET NULL, name VARCHAR(140) NOT NULL, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, parent_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_root_name_idx ON product_categories(company_id, COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS product_families_root_name_idx ON product_families(company_id, COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS product_models_unassigned_brand_name_idx ON product_models(company_id, COALESCE(brand_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name));
