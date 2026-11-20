CREATE TABLE IF NOT EXISTS product_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  related_product_id UUID NOT NULL,
  relation_type VARCHAR(24) NOT NULL CHECK (relation_type IN ('kit_component','substitute','related')),
  quantity NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id) ON DELETE RESTRICT,
  FOREIGN KEY (related_product_id, company_id) REFERENCES products(id, company_id) ON DELETE RESTRICT,
  CHECK (product_id <> related_product_id),
  UNIQUE (company_id, product_id, related_product_id, relation_type)
);
CREATE INDEX IF NOT EXISTS product_relations_product_idx ON product_relations(company_id, product_id, relation_type);

CREATE TABLE IF NOT EXISTS product_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  normalized_name VARCHAR(60) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, normalized_name),
  UNIQUE (id, company_id)
);
CREATE TABLE IF NOT EXISTS product_tag_assignments (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, product_id, tag_id),
  FOREIGN KEY (product_id, company_id) REFERENCES products(id, company_id) ON DELETE RESTRICT,
  FOREIGN KEY (tag_id, company_id) REFERENCES product_tags(id, company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS product_tag_assignments_product_idx ON product_tag_assignments(company_id, product_id);
