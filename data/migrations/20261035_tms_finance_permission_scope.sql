-- The warehouse role can track and operate trips but financial reconciliation stays restricted.
UPDATE role_permissions rp
SET allowed=false
FROM permission_catalog pc
WHERE rp.permission_key=pc.permission_key
  AND rp.role='warehouse'
  AND rp.permission_key='tms.finance';
