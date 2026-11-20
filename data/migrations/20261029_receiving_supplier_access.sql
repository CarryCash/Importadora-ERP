-- Bodega consulta proveedores para crear y recibir órdenes de compra.
INSERT INTO role_permissions (company_id, role, permission_key, allowed)
SELECT c.id, 'warehouse', 'suppliers.read', true
FROM companies c
WHERE c.slug = 'importadora-erp'
ON CONFLICT (company_id, role, permission_key) DO UPDATE SET allowed = true;
