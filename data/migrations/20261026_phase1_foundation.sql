-- Fase 1: company/branch foundation, persistent settings, permissions and audit.
-- Existing operational rows are assigned to one preserved legacy workspace.

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  legal_name VARCHAR(180),
  trade_name VARCHAR(120) NOT NULL,
  tax_id VARCHAR(20),
  country_code CHAR(2) NOT NULL DEFAULT 'EC',
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Guayaquil',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO companies (id, slug, trade_name)
VALUES ('10000000-0000-4000-8000-000000000001', 'importadora-erp', 'Importadora ERP')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, code)
);

INSERT INTO branches (id, company_id, code, name)
SELECT '10000000-0000-4000-8000-000000000002', id, 'MATRIZ', 'Matriz'
FROM companies WHERE slug = 'importadora-erp'
ON CONFLICT (company_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS company_memberships (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, user_id)
);

INSERT INTO company_memberships (company_id, user_id, role, is_default)
SELECT c.id, u.id, u.role, true
FROM users u CROSS JOIN companies c
WHERE c.slug = 'importadora-erp'
ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = true;

CREATE TABLE IF NOT EXISTS branch_memberships (
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id, user_id)
);

INSERT INTO branch_memberships (branch_id, user_id)
SELECT b.id, u.id FROM branches b CROSS JOIN users u
JOIN companies c ON c.id = b.company_id
WHERE c.slug = 'importadora-erp' AND b.code = 'MATRIZ'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO company_settings (company_id, settings)
SELECT id,
  '{"logoDataUrl":"","brandColor":"#064035","enabledModules":["dashboard","logistics","products","inventory","sales","imports","customers","suppliers","finance","users"]}'::jsonb
FROM companies WHERE slug = 'importadora-erp'
ON CONFLICT (company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS permission_catalog (
  permission_key VARCHAR(100) PRIMARY KEY,
  module VARCHAR(60) NOT NULL,
  description VARCHAR(240) NOT NULL
);

INSERT INTO permission_catalog (permission_key, module, description) VALUES
  ('dashboard.read', 'dashboard', 'Ver panel e indicadores'),
  ('products.read', 'products', 'Consultar catálogo de productos'),
  ('products.write', 'products', 'Crear y actualizar productos'),
  ('customers.read', 'customers', 'Consultar clientes'),
  ('customers.write', 'customers', 'Crear y actualizar clientes'),
  ('suppliers.read', 'suppliers', 'Consultar proveedores'),
  ('suppliers.write', 'suppliers', 'Crear y actualizar proveedores'),
  ('inventory.read', 'inventory', 'Consultar existencias y movimientos'),
  ('inventory.adjust', 'inventory', 'Ajustar existencias'),
  ('inventory.transfer', 'inventory', 'Transferir existencias entre bodegas'),
  ('inventory.reorder', 'inventory', 'Cambiar parámetros de reorden'),
  ('imports.read', 'imports', 'Consultar importaciones'),
  ('imports.write', 'imports', 'Crear y actualizar importaciones'),
  ('imports.receive', 'imports', 'Recibir importaciones'),
  ('logistics.read', 'logistics', 'Consultar logística y entregas'),
  ('logistics.write', 'logistics', 'Asignar y actualizar entregas'),
  ('sales.read', 'sales', 'Consultar ventas y cotizaciones'),
  ('sales.create', 'sales', 'Registrar ventas'),
  ('sales.payments', 'sales', 'Registrar pagos de ventas'),
  ('sales.cancel', 'sales', 'Anular ventas'),
  ('finance.read', 'finance', 'Consultar información financiera'),
  ('finance.write', 'finance', 'Registrar gastos y operaciones financieras'),
  ('users.read', 'users', 'Consultar usuarios'),
  ('users.manage', 'users', 'Crear y administrar usuarios'),
  ('users.profile', 'users', 'Consultar y actualizar el propio perfil'),
  ('settings.read', 'settings', 'Consultar configuración de empresa'),
  ('settings.manage', 'settings', 'Modificar configuración de empresa y permisos')
ON CONFLICT (permission_key) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS role_permissions (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL,
  permission_key VARCHAR(100) NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, role, permission_key)
);

WITH grants(role, permission_key) AS (
  SELECT 'admin', permission_key FROM permission_catalog
  UNION ALL SELECT 'warehouse', unnest(ARRAY['dashboard.read','settings.read','users.profile','products.read','inventory.read','inventory.adjust','inventory.transfer','inventory.reorder','imports.read','imports.receive','logistics.read','logistics.write'])
  UNION ALL SELECT 'sales', unnest(ARRAY['dashboard.read','settings.read','users.profile','products.read','customers.read','customers.write','inventory.read','logistics.read','sales.read','sales.create','sales.payments'])
  UNION ALL SELECT 'user', unnest(ARRAY['dashboard.read','settings.read','users.profile'])
)
INSERT INTO role_permissions (company_id, role, permission_key, allowed)
SELECT c.id, g.role, g.permission_key, true
FROM grants g CROSS JOIN companies c
WHERE c.slug = 'importadora-erp'
ON CONFLICT (company_id, role, permission_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(16) NOT NULL,
  resource VARCHAR(240) NOT NULL,
  resource_id VARCHAR(100),
  status_code INTEGER NOT NULL,
  request_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_logs_company_created_idx ON audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS role_permissions_lookup_idx ON role_permissions(company_id, role, permission_key, allowed);
CREATE INDEX IF NOT EXISTS company_memberships_user_idx ON company_memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS branch_memberships_user_idx ON branch_memberships(user_id);

DO $$
DECLARE
  company_uuid UUID;
  branch_uuid UUID;
  table_name TEXT;
BEGIN
  SELECT id INTO company_uuid FROM companies WHERE slug = 'importadora-erp';
  SELECT id INTO branch_uuid FROM branches WHERE company_id = company_uuid AND code = 'MATRIZ';

  FOREACH table_name IN ARRAY ARRAY['warehouses','products','customers','suppliers','imports','sales','expenses','quotes','sales_orders','deliveries'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)', table_name);
    EXECUTE format('UPDATE %I SET company_id = $1 WHERE company_id IS NULL', table_name) USING company_uuid;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET DEFAULT %L', table_name, company_uuid);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)', table_name || '_company_id_idx', table_name);
  END LOOP;

  ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
  UPDATE warehouses SET branch_id = branch_uuid WHERE branch_id IS NULL;
  EXECUTE format('ALTER TABLE warehouses ALTER COLUMN branch_id SET DEFAULT %L', branch_uuid);
  ALTER TABLE warehouses ALTER COLUMN branch_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS warehouses_branch_id_idx ON warehouses(branch_id);

  ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
  UPDATE sales SET branch_id = branch_uuid WHERE branch_id IS NULL;
  EXECUTE format('ALTER TABLE sales ALTER COLUMN branch_id SET DEFAULT %L', branch_uuid);
  ALTER TABLE sales ALTER COLUMN branch_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS sales_branch_id_idx ON sales(branch_id);

  ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
  UPDATE expenses SET branch_id = branch_uuid WHERE branch_id IS NULL;
  EXECUTE format('ALTER TABLE expenses ALTER COLUMN branch_id SET DEFAULT %L', branch_uuid);
  ALTER TABLE expenses ALTER COLUMN branch_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS expenses_branch_id_idx ON expenses(branch_id);
END $$;
