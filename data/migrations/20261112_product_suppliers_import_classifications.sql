CREATE UNIQUE INDEX IF NOT EXISTS products_id_company_uq ON products(id,company_id);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_id_company_uq ON suppliers(id,company_id);

CREATE TABLE IF NOT EXISTS product_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_product_code VARCHAR(100),
  supplier_product_name VARCHAR(240),
  quoted_unit_cost NUMERIC(18,6) CHECK(quoted_unit_cost IS NULL OR quoted_unit_cost>=0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  minimum_order_quantity NUMERIC(18,6) CHECK(minimum_order_quantity IS NULL OR minimum_order_quantity>0),
  lead_time_days INTEGER CHECK(lead_time_days IS NULL OR lead_time_days>=0),
  origin_country VARCHAR(100),
  purchase_unit VARCHAR(60),
  packaging VARCHAR(160),
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(valid_until IS NULL OR valid_until>=valid_from),
  UNIQUE(company_id,product_id,supplier_id,valid_from),
  FOREIGN KEY(product_id,company_id) REFERENCES products(id,company_id) ON DELETE RESTRICT,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS product_suppliers_lookup_idx ON product_suppliers(company_id,product_id,valid_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_one_preferred_idx ON product_suppliers(company_id,product_id) WHERE is_preferred AND valid_until IS NULL;

CREATE TABLE IF NOT EXISTS product_supplier_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_supplier_id UUID NOT NULL REFERENCES product_suppliers(id) ON DELETE RESTRICT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL, previous_values JSONB, new_values JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_import_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  origin_country VARCHAR(100), manufacturing_country VARCHAR(100), foreign_manufacturer VARCHAR(200),
  tariff_heading VARCHAR(16) NOT NULL, tariff_subheading VARCHAR(16), customs_unit VARCHAR(40),
  customs_weight NUMERIC(18,6) CHECK(customs_weight IS NULL OR customs_weight>=0),
  import_restrictions TEXT, required_permits TEXT, customs_notes TEXT,
  source_name VARCHAR(240) NOT NULL, source_url TEXT, evidence_url TEXT,
  valid_from DATE NOT NULL, valid_until DATE,
  review_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','superseded')),
  review_reason TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(valid_until IS NULL OR valid_until>=valid_from),
  FOREIGN KEY(product_id,company_id) REFERENCES products(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS product_import_classifications_lookup_idx ON product_import_classifications(company_id,product_id,review_status,valid_from DESC);

ALTER TABLE import_items ADD COLUMN IF NOT EXISTS product_supplier_id UUID REFERENCES product_suppliers(id) ON DELETE SET NULL;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS supplier_product_code_snapshot VARCHAR(100);
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS import_classification_id UUID REFERENCES product_import_classifications(id) ON DELETE SET NULL;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS tariff_heading_snapshot VARCHAR(16);
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS tariff_subheading_snapshot VARCHAR(16);
