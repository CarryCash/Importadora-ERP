ALTER TABLE customers ADD COLUMN IF NOT EXISTS code VARCHAR(32);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS party_type VARCHAR(20) NOT NULL DEFAULT 'natural';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS trade_name VARCHAR(180);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'EC';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legal_representative VARCHAR(180);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_review_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
UPDATE customers SET code='CLI-'||LPAD(row_number::text,6,'0') FROM (SELECT id,row_number() OVER(PARTITION BY company_id ORDER BY created_at,id) row_number FROM customers WHERE code IS NULL) x WHERE customers.id=x.id;
ALTER TABLE customers ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_code_uq ON customers(company_id,code);
CREATE INDEX IF NOT EXISTS customers_company_name_idx ON customers(company_id,lower(name));
CREATE INDEX IF NOT EXISTS customers_company_identification_idx ON customers(company_id,identification_type,identification_number);

CREATE TABLE IF NOT EXISTS customer_contacts (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, full_name VARCHAR(180) NOT NULL,
 department VARCHAR(100), job_title VARCHAR(100), phone VARCHAR(40), phone_extension VARCHAR(12), email VARCHAR(180),
 preferred_channel VARCHAR(24), contact_type VARCHAR(32) NOT NULL DEFAULT 'general', is_primary BOOLEAN NOT NULL DEFAULT false,
 is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_contacts_company_customer_idx ON customer_contacts(company_id,customer_id,is_active);
CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_primary_uq ON customer_contacts(company_id,customer_id) WHERE is_primary AND is_active;

CREATE TABLE IF NOT EXISTS customer_addresses (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, address_type VARCHAR(24) NOT NULL DEFAULT 'other',
 label VARCHAR(120), country_code CHAR(2) NOT NULL DEFAULT 'EC', province VARCHAR(100), canton VARCHAR(100), city VARCHAR(100),
 postal_code VARCHAR(20), street VARCHAR(180), street_number VARCHAR(40), intersection VARCHAR(180), reference TEXT,
 delivery_instructions TEXT, is_billing_default BOOLEAN NOT NULL DEFAULT false, is_delivery_default BOOLEAN NOT NULL DEFAULT false,
 is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_addresses_company_customer_idx ON customer_addresses(company_id,customer_id,is_active);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_billing_default_uq ON customer_addresses(company_id,customer_id) WHERE is_billing_default AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_delivery_default_uq ON customer_addresses(company_id,customer_id) WHERE is_delivery_default AND is_active;

CREATE TABLE IF NOT EXISTS customer_credit_history (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, previous_limit NUMERIC(14,2) NOT NULL,
 new_limit NUMERIC(14,2) NOT NULL, previous_terms INTEGER NOT NULL, new_terms INTEGER NOT NULL,
 reason TEXT NOT NULL, approved_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_credit_history_customer_idx ON customer_credit_history(company_id,customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_credit_requests (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, previous_limit NUMERIC(14,2) NOT NULL,
 requested_limit NUMERIC(14,2) NOT NULL CHECK(requested_limit>=0), previous_terms INTEGER NOT NULL,
 requested_terms INTEGER NOT NULL CHECK(requested_terms BETWEEN 0 AND 365), reason TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by UUID REFERENCES users(id) ON DELETE SET NULL, reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
 review_note TEXT, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS customer_credit_requests_pending_idx ON customer_credit_requests(company_id,status,requested_at DESC);

CREATE TABLE IF NOT EXISTS customer_activity (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, event_type VARCHAR(40) NOT NULL,
 description TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_activity_customer_idx ON customer_activity(company_id,customer_id,created_at DESC);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('customers.credit.manage','customers','Modificar condiciones de crédito'),
 ('customers.credit.approve','customers','Aprobar cambios de crédito'),
 ('customers.export','customers','Exportar datos de clientes')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES('admin'),('manager')) r(role)
CROSS JOIN (VALUES('customers.credit.manage'),('customers.credit.approve'),('customers.export')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

