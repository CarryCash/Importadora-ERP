ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position_id UUID;

CREATE TABLE IF NOT EXISTS company_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, description VARCHAR(240) NOT NULL DEFAULT '', manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, name)
);
CREATE TABLE IF NOT EXISTS company_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES company_departments(id) ON DELETE SET NULL, name VARCHAR(100) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id, name)
);
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_department_fk FOREIGN KEY(department_id) REFERENCES company_departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_position_fk FOREIGN KEY(position_id) REFERENCES company_positions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS company_user_roles (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key VARCHAR(30) NOT NULL, is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(company_id,user_id,role_key),
  FOREIGN KEY(company_id,role_key) REFERENCES company_roles(company_id,role_key) ON DELETE CASCADE
);
INSERT INTO company_user_roles(company_id,user_id,role_key,is_primary)
SELECT company_id,user_id,role,true FROM company_memberships WHERE is_active
ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS company_user_roles_one_primary_uq ON company_user_roles(company_id,user_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, ip_address INET, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_sessions_active_idx ON user_sessions(company_id,user_id,expires_at DESC) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY, username VARCHAR(80) NOT NULL, ip_address INET, succeeded BOOLEAN NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts(username,attempted_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_company_idx ON login_attempts(company_id,attempted_at DESC);
CREATE TABLE IF NOT EXISTS security_policies (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  min_password_length SMALLINT NOT NULL DEFAULT 10 CHECK(min_password_length BETWEEN 8 AND 128),
  max_login_attempts SMALLINT NOT NULL DEFAULT 5 CHECK(max_login_attempts BETWEEN 3 AND 20),
  lockout_minutes SMALLINT NOT NULL DEFAULT 15 CHECK(lockout_minutes BETWEEN 1 AND 1440),
  session_hours SMALLINT NOT NULL DEFAULT 12 CHECK(session_hours BETWEEN 1 AND 168),
  require_mfa BOOLEAN NOT NULL DEFAULT false, updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO security_policies(company_id) SELECT id FROM companies ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS user_mfa_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, method VARCHAR(20) NOT NULL DEFAULT 'totp',
  secret_ciphertext TEXT NOT NULL, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,user_id,method)
);
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(180) NOT NULL, role_key VARCHAR(30) NOT NULL, invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(company_id,role_key) REFERENCES company_roles(company_id,role_key) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL, module VARCHAR(60) NOT NULL, operation VARCHAR(60) NOT NULL,
  amount_threshold NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(amount_threshold>=0), approver_role VARCHAR(30) NOT NULL,
  require_distinct_actor BOOLEAN NOT NULL DEFAULT true, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,module,operation,name),
  FOREIGN KEY(company_id,approver_role) REFERENCES company_roles(company_id,role_key) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE RESTRICT,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL, record_type VARCHAR(80) NOT NULL, record_id VARCHAR(100) NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','returned')),
  reason TEXT NOT NULL, decided_by UUID REFERENCES users(id) ON DELETE SET NULL, decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decided_at TIMESTAMPTZ
);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes JSONB;

INSERT INTO company_roles(company_id,role_key,display_name,description,is_system)
SELECT c.id,r.role_key,r.display_name,r.description,true FROM companies c
CROSS JOIN (VALUES
 ('erp_admin','Administrador ERP','Administración operativa del sistema'),
 ('gerente_general','Gerente general','Supervisión empresarial y autorizaciones'),
 ('gerente_financiero','Gerente financiero','Control financiero y contable'),
 ('contador','Contador','Procesos contables y tributarios'),
 ('jefe_importaciones','Jefe de importaciones','Gestión y revisión de importaciones'),
 ('asistente_importaciones','Asistente de importaciones','Operación y documentación de importaciones'),
 ('jefe_logistica','Jefe de logística','Gestión de transporte y embarques'),
 ('jefe_inventario','Jefe de inventario','Control de existencias'),
 ('jefe_ventas','Jefe de ventas','Supervisión comercial'),
 ('comprador','Comprador','Gestión de compras'),
 ('auditor','Auditor','Consulta y revisión de operaciones')
) AS r(role_key,display_name,description)
ON CONFLICT(company_id,role_key) DO NOTHING;

UPDATE company_roles SET display_name='Superadministrador' WHERE role_key='admin';
UPDATE company_roles SET display_name='Vendedor' WHERE role_key='sales';
UPDATE company_roles SET display_name='Bodeguero' WHERE role_key='warehouse';

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT cr.company_id,cr.role_key,p.permission_key,false FROM company_roles cr CROSS JOIN permission_catalog p
ON CONFLICT(company_id,role,permission_key) DO NOTHING;

WITH grant_map(role_key,permission_key) AS (
 SELECT 'erp_admin',permission_key FROM permission_catalog
 UNION ALL SELECT 'gerente_general',permission_key FROM permission_catalog WHERE permission_key LIKE '%.read' OR permission_key IN ('approvals.review','approvals.read','users.read','dashboard.read')
 UNION ALL SELECT 'gerente_financiero',permission_key FROM permission_catalog WHERE module IN ('finance','approvals') OR permission_key IN ('dashboard.read','users.read')
 UNION ALL SELECT 'contador',permission_key FROM permission_catalog WHERE module='finance' OR permission_key IN ('dashboard.read','sales.read','customers.read','suppliers.read')
 UNION ALL SELECT 'jefe_importaciones',permission_key FROM permission_catalog WHERE module IN ('imports','logistics','approvals') OR permission_key IN ('dashboard.read','inventory.read','products.read','suppliers.read')
 UNION ALL SELECT 'asistente_importaciones',permission_key FROM permission_catalog WHERE module='imports' OR permission_key IN ('dashboard.read','products.read','inventory.read','suppliers.read')
 UNION ALL SELECT 'jefe_logistica',permission_key FROM permission_catalog WHERE module IN ('logistics','receiving','storage','dispatch','transfers','tms','returns','logistics_inventory','logistics_quality','logistics_costs','approvals') OR permission_key IN ('dashboard.read','inventory.read','products.read')
 UNION ALL SELECT 'jefe_inventario',permission_key FROM permission_catalog WHERE module IN ('inventory','storage','transfers','logistics_inventory') OR permission_key IN ('dashboard.read','products.read','imports.read')
 UNION ALL SELECT 'jefe_ventas',permission_key FROM permission_catalog WHERE module IN ('sales','customers','approvals') OR permission_key IN ('dashboard.read','products.read','inventory.read')
 UNION ALL SELECT 'comprador',permission_key FROM permission_catalog WHERE module IN ('suppliers','imports') OR permission_key IN ('dashboard.read','products.read','inventory.read')
 UNION ALL SELECT 'auditor',permission_key FROM permission_catalog WHERE permission_key LIKE '%.read' OR permission_key IN ('dashboard.read','users.audit','approvals.read')
)
UPDATE role_permissions rp SET allowed=true,updated_at=NOW()
FROM grant_map g WHERE rp.role=g.role_key AND rp.permission_key=g.permission_key;

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('users.audit','users','Consultar auditoría y actividad de usuarios'),
 ('users.security.manage','users','Administrar políticas y sesiones de seguridad'),
 ('users.invite','users','Crear y revocar invitaciones de acceso'),
 ('users.departments.manage','users','Administrar departamentos y cargos'),
 ('approvals.read','approvals','Consultar flujos y solicitudes de aprobación'),
 ('approvals.manage','approvals','Configurar flujos de aprobación'),
 ('approvals.review','approvals','Aprobar o rechazar solicitudes')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT r.company_id,r.role_key,p.permission_key,
  (r.role_key IN ('admin','erp_admin') OR
   (r.role_key IN ('gerente_general','gerente_financiero','jefe_importaciones','jefe_logistica','jefe_ventas') AND p.permission_key IN ('approvals.read','approvals.review')) OR
   (r.role_key='auditor' AND p.permission_key='users.audit'))
FROM company_roles r CROSS JOIN permission_catalog p
WHERE p.permission_key IN ('users.audit','users.security.manage','users.invite','users.departments.manage','approvals.read','approvals.manage','approvals.review')
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_at=NOW();
