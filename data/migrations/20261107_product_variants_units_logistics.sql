-- Phase 2: sellable product variants, explicit units/conversions and
-- versioned logistics profiles. Inventory remains keyed by product id.
CREATE INDEX IF NOT EXISTS products_company_parent_active_idx
  ON products(company_id,parent_product_id,is_active) WHERE archived_at IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_parent_not_self_ck') THEN
    ALTER TABLE products ADD CONSTRAINT products_parent_not_self_ck CHECK(parent_product_id IS NULL OR parent_product_id<>id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  dimension VARCHAR(16) NOT NULL CHECK(dimension IN ('count','mass','length','volume','area','time')),
  precision_scale SMALLINT NOT NULL DEFAULT 0 CHECK(precision_scale BETWEEN 0 AND 6),
  is_base BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id,unit_code),
  UNIQUE(id,product_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_units_one_base_idx ON product_units(product_id) WHERE is_base AND is_active;
CREATE INDEX IF NOT EXISTS product_units_product_idx ON product_units(company_id,product_id,is_active);

CREATE TABLE IF NOT EXISTS product_unit_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_unit_id UUID NOT NULL,
  to_unit_id UUID NOT NULL,
  factor NUMERIC(20,10) NOT NULL CHECK(factor>0),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected','superseded')),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(from_unit_id<>to_unit_id),
  CHECK(valid_until IS NULL OR valid_until>=valid_from),
  FOREIGN KEY(from_unit_id,product_id) REFERENCES product_units(id,product_id) ON DELETE RESTRICT,
  FOREIGN KEY(to_unit_id,product_id) REFERENCES product_units(id,product_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS product_unit_conversion_lookup_idx ON product_unit_conversions(company_id,product_id,from_unit_id,to_unit_id,status,valid_from DESC);

CREATE TABLE IF NOT EXISTS product_logistics_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  net_weight NUMERIC(18,6) CHECK(net_weight IS NULL OR net_weight>=0),
  gross_weight NUMERIC(18,6) CHECK(gross_weight IS NULL OR gross_weight>=0),
  weight_unit VARCHAR(16) NOT NULL DEFAULT 'kg',
  length NUMERIC(18,6) CHECK(length IS NULL OR length>=0),
  width NUMERIC(18,6) CHECK(width IS NULL OR width>=0),
  height NUMERIC(18,6) CHECK(height IS NULL OR height>=0),
  volume NUMERIC(18,8) CHECK(volume IS NULL OR volume>=0),
  dimension_unit VARCHAR(16) NOT NULL DEFAULT 'cm',
  packaging_type VARCHAR(60),
  units_per_box NUMERIC(14,4) CHECK(units_per_box IS NULL OR units_per_box>0),
  units_per_package NUMERIC(14,4) CHECK(units_per_package IS NULL OR units_per_package>0),
  units_per_pallet NUMERIC(14,4) CHECK(units_per_pallet IS NULL OR units_per_pallet>0),
  stackable BOOLEAN,
  handling_requirements TEXT,
  storage_conditions TEXT,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_logistics_current_idx ON product_logistics_profiles(product_id) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS product_logistics_history_idx ON product_logistics_profiles(company_id,product_id,valid_from DESC);
