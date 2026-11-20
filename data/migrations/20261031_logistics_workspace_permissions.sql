-- Logística, recepción y almacenamiento forman un único módulo del sidebar.
UPDATE company_settings
SET settings=jsonb_set(settings,'{enabledModules}',COALESCE(settings->'enabledModules','[]'::jsonb)-'receiving',true)
WHERE settings ? 'enabledModules';

-- Aplicar permisos base a cada empresa actual, incluidas las creadas después de la instalación inicial.
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES ('admin'),('warehouse')) AS r(role)
CROSS JOIN (VALUES ('storage.read'),('storage.write'),('receiving.read'),('receiving.create'),('receiving.close'),('logistics.read'),('logistics.write')) AS p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
