-- Sensitive supplier data access, private document storage and distinct bank approvers.
ALTER TABLE supplier_approval_policies ADD COLUMN IF NOT EXISTS require_distinct_approvers BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supplier_approval_requests ADD COLUMN IF NOT EXISTS require_distinct_approvers BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS storage_key VARCHAR(200);
ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64);
ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS file_size BIGINT CHECK(file_size IS NULL OR file_size BETWEEN 0 AND 20971520);
ALTER TABLE supplier_documents ALTER COLUMN file_url DROP NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_documents_storage_key_idx ON supplier_documents(storage_key) WHERE storage_key IS NOT NULL;

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('suppliers.bank.read','suppliers','Consultar números completos de cuentas bancarias de proveedores'),
 ('suppliers.bank.manage','suppliers','Administrar validación de cuentas bancarias de proveedores')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

-- Full account numbers are intentionally limited to finance and ERP administrators.
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,'suppliers.bank.read',true FROM companies c
CROSS JOIN (VALUES ('admin'),('erp_admin'),('gerente_financiero'),('contador')) r(role)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true,updated_at=NOW();

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,'suppliers.bank.manage',true FROM companies c
CROSS JOIN (VALUES ('admin'),('erp_admin'),('gerente_financiero')) r(role)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true,updated_at=NOW();
