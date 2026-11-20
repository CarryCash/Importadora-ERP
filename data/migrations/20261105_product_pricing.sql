CREATE TABLE IF NOT EXISTS product_price_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL, list_type VARCHAR(24) NOT NULL CHECK(list_type IN ('retail','wholesale','distributor','special')),
  currency CHAR(3) NOT NULL DEFAULT 'USD', rounding_rule VARCHAR(20) NOT NULL DEFAULT 'cent' CHECK(rounding_rule IN ('cent','whole','five_cents')),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE, customer_segment VARCHAR(40), branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  starts_at DATE, ends_at DATE, max_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(max_discount_percent BETWEEN 0 AND 100),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected')),
  is_active BOOLEAN NOT NULL DEFAULT true, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS product_price_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES product_price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK(min_quantity>0),
  unit_price NUMERIC(14,4) NOT NULL CHECK(unit_price>=0), discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 100),
  starts_at DATE, ends_at DATE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(price_list_id,product_id,min_quantity)
);
CREATE TABLE IF NOT EXISTS product_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES product_price_lists(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES product_price_rules(id) ON DELETE SET NULL, product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_values JSONB, new_values JSONB NOT NULL, changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_price_lists_match_idx ON product_price_lists(company_id,is_active,approval_status,list_type,branch_id,customer_id,customer_segment);
CREATE INDEX IF NOT EXISTS product_price_rules_lookup_idx ON product_price_rules(price_list_id,product_id,min_quantity DESC);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES product_price_lists(id) ON DELETE SET NULL;
