-- Foundation for the enterprise supplier workspace. Existing records are
-- preserved and assigned a type from their current country value.
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(24),
  ADD COLUMN IF NOT EXISTS national_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS international_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(20) NOT NULL DEFAULT 'international',
  ADD COLUMN IF NOT EXISTS legal_name VARCHAR(180),
  ADD COLUMN IF NOT EXISTS trade_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(40),
  ADD COLUMN IF NOT EXISTS tax_id_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS supplier_status VARCHAR(24) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(24) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) NOT NULL DEFAULT 'unrated',
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS payment_currency CHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE suppliers
SET supplier_type=CASE
  WHEN upper(trim(coalesce(country,''))) IN ('EC','ECU','ECUADOR','ECUADOR, REPUBLIC OF') THEN 'national'
  ELSE 'international'
END,
legal_name=coalesce(legal_name,name),
trade_name=coalesce(trade_name,name),
approved_at=coalesce(approved_at,created_at);

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_type_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_type_check CHECK (supplier_type IN ('national','international'));
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_status_check CHECK (supplier_status IN ('draft','active','suspended','blocked','archived'));
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_approval_status_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_approval_status_check CHECK (approval_status IN ('not_required','pending','in_review','approved','rejected'));
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_risk_level_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_risk_level_check CHECK (risk_level IN ('unrated','low','medium','high','critical'));
ALTER TABLE suppliers ALTER COLUMN supplier_type DROP DEFAULT;
ALTER TABLE suppliers ALTER COLUMN supplier_status SET DEFAULT 'draft';
ALTER TABLE suppliers ALTER COLUMN approval_status SET DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS supplier_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_type VARCHAR(20) NOT NULL CHECK (supplier_type IN ('national','international')),
  parent_id UUID,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,supplier_type,name),
  UNIQUE(id,company_id),
  FOREIGN KEY(parent_id,company_id) REFERENCES supplier_categories(id,company_id) ON DELETE RESTRICT
);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_category_company_fk
  FOREIGN KEY(category_id,company_id) REFERENCES supplier_categories(id,company_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS supplier_categories_lookup_idx ON supplier_categories(company_id,supplier_type,is_active,sort_order,name);
CREATE INDEX IF NOT EXISTS suppliers_workspace_lookup_idx ON suppliers(company_id,supplier_type,supplier_status,approval_status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_code_uq ON suppliers(company_id,supplier_code) WHERE supplier_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_tax_id_uq ON suppliers(company_id,supplier_type,tax_id) WHERE tax_id IS NOT NULL AND btrim(tax_id)<>'';

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role_title VARCHAR(100),
  email VARCHAR(180),
  phone VARCHAR(60),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS supplier_contacts_lookup_idx ON supplier_contacts(company_id,supplier_id,is_active);

CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  bank_name VARCHAR(160) NOT NULL,
  account_holder VARCHAR(180) NOT NULL,
  account_number_ciphertext TEXT NOT NULL,
  account_last_four VARCHAR(4),
  account_type VARCHAR(30),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  country_code CHAR(2),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','rejected')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS supplier_bank_accounts_lookup_idx ON supplier_bank_accounts(company_id,supplier_id,verification_status,is_active);

CREATE TABLE IF NOT EXISTS supplier_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(120),
  file_url TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120),
  expires_at DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired','archived')),
  notes TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS supplier_documents_expiry_idx ON supplier_documents(company_id,status,expires_at);

CREATE TABLE IF NOT EXISTS supplier_approval_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_type VARCHAR(20) NOT NULL CHECK(supplier_type IN ('national','international')),
  name VARCHAR(140) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,supplier_type,name,version)
);

CREATE TABLE IF NOT EXISTS supplier_approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  policy_id UUID REFERENCES supplier_approval_policies(id) ON DELETE SET NULL,
  policy_version INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_review','approved','rejected','cancelled')),
  current_step INTEGER NOT NULL DEFAULT 1,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_reason TEXT,
  supplier_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_approval_queue_idx ON supplier_approval_requests(company_id,status,requested_at DESC);

CREATE TABLE IF NOT EXISTS supplier_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  score NUMERIC(6,2) NOT NULL CHECK(score BETWEEN 0 AND 100),
  performance_class VARCHAR(20) NOT NULL CHECK(performance_class IN ('excellent','good','watch','poor')),
  risk_level VARCHAR(16) NOT NULL CHECK(risk_level IN ('low','medium','high','critical')),
  notes TEXT,
  evaluated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(period_end>=period_start),
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_evaluations_lookup_idx ON supplier_evaluations(company_id,supplier_id,period_end DESC);

CREATE TABLE IF NOT EXISTS supplier_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  incident_type VARCHAR(40) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','closed')),
  title VARCHAR(180) NOT NULL,
  description TEXT,
  resolution TEXT,
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_incidents_queue_idx ON supplier_incidents(company_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  before_values JSONB,
  after_values JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_events_audit_idx ON supplier_events(company_id,supplier_id,created_at DESC);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('suppliers.approve','suppliers','Aprobar o rechazar proveedores'),
 ('suppliers.documents','suppliers','Revisar documentación de proveedores'),
 ('suppliers.evaluate','suppliers','Evaluar desempeño y riesgos de proveedores'),
 ('suppliers.configure','suppliers','Configurar categorías y políticas de proveedores')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true
FROM companies c
CROSS JOIN (VALUES ('admin'),('erp_admin')) r(role)
CROSS JOIN (VALUES ('suppliers.approve'),('suppliers.documents'),('suppliers.evaluate'),('suppliers.configure')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true,updated_at=NOW();

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true
FROM companies c
CROSS JOIN (VALUES ('gerente_general'),('gerente_financiero'),('jefe_importaciones'),('comprador')) r(role)
CROSS JOIN (VALUES ('suppliers.approve'),('suppliers.documents'),('suppliers.evaluate')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true,updated_at=NOW();
