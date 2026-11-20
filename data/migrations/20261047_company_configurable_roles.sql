-- Configurable company roles backed by the existing RBAC permission catalog.
CREATE TABLE IF NOT EXISTS company_roles (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_key VARCHAR(30) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, role_key),
  CHECK (role_key ~ '^[a-z][a-z0-9_]{1,29}$')
);

INSERT INTO company_roles(company_id, role_key, display_name, description, is_system)
SELECT c.id, r.role_key, r.display_name, r.description, true
FROM companies c
CROSS JOIN (VALUES
  ('admin', 'Administrador', 'Administración completa del ERP'),
  ('sales', 'Ventas', 'Gestión comercial y ventas'),
  ('warehouse', 'Bodega', 'Operación de bodega e inventario'),
  ('user', 'Usuario', 'Acceso básico al ERP')
) AS r(role_key, display_name, description)
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO company_roles(company_id, role_key, display_name, description, is_system)
SELECT DISTINCT m.company_id, m.role, INITCAP(REPLACE(m.role, '_', ' ')), 'Rol existente migrado', m.role IN ('admin','sales','warehouse','user')
FROM company_memberships m
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO role_permissions(company_id, role, permission_key, allowed)
SELECT cr.company_id, cr.role_key, p.permission_key, false
FROM company_roles cr CROSS JOIN permission_catalog p
ON CONFLICT (company_id, role, permission_key) DO NOTHING;
