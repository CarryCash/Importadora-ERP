import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CompanyRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSettings(companyId: string) {
    const result = await this.db.query(
      `SELECT c.id AS company_id, c.slug, c.legal_name, c.trade_name AS "companyName",
              c.tax_id, c.country_code, c.currency_code, c.timezone,
              COALESCE(s.settings->>'logoDataUrl', '') AS "logoDataUrl",
              COALESCE(s.settings->>'brandColor', '#064035') AS "brandColor",
              COALESCE(s.settings->>'actionColor', '#17365D') AS "actionColor",
              COALESCE(s.settings->'enabledModules', '[]'::jsonb) AS "enabledModules",
              s.updated_at
       FROM companies c
       LEFT JOIN company_settings s ON s.company_id = c.id
       WHERE c.id = $1 AND c.is_active = true`,
      [companyId],
    );
    return result.rows[0] || null;
  }

  async updateSettings(companyId: string, actorId: string, companyName: string, settings: Record<string, unknown>) {
    const result = await this.db.query(
      `WITH updated_company AS (
         UPDATE companies SET trade_name = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_active = true
         RETURNING id
       )
       INSERT INTO company_settings (company_id, settings, updated_by, updated_at)
       SELECT id, $3::jsonb, $4, CURRENT_TIMESTAMP FROM updated_company
       ON CONFLICT (company_id) DO UPDATE SET
         settings = company_settings.settings || EXCLUDED.settings,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING company_id`,
      [companyId, companyName, JSON.stringify(settings), actorId],
    );
    if (!result.rowCount) return null;
    return this.getSettings(companyId);
  }

  async getRolePermissions(companyId: string) {
    const result = await this.db.query(
      `SELECT p.permission_key, p.module, p.description, roles.role_key AS role,
              COALESCE(rp.allowed, false) AS allowed
       FROM permission_catalog p
       CROSS JOIN company_roles roles
       LEFT JOIN role_permissions rp
         ON rp.company_id = roles.company_id AND rp.permission_key = p.permission_key AND rp.role = roles.role_key
       WHERE roles.company_id = $1
       ORDER BY p.module, p.permission_key, roles.role_key`,
      [companyId],
    );
    return result.rows;
  }

  async getRoles(companyId: string) {
    const result = await this.db.query(
      `SELECT r.role_key, r.display_name, r.description, r.is_system,
              COUNT(DISTINCT m.user_id)::int AS member_count
       FROM company_roles r
       LEFT JOIN company_memberships m ON m.company_id = r.company_id AND m.role = r.role_key AND m.is_active = true
       WHERE r.company_id = $1
       GROUP BY r.company_id, r.role_key
       ORDER BY r.is_system DESC, r.display_name`,
      [companyId],
    );
    return result.rows;
  }

  async getPermissionKeys() {
    const result = await this.db.query('SELECT permission_key FROM permission_catalog');
    return result.rows.map((row) => row.permission_key as string);
  }

  async roleExists(companyId: string, roleKey: string) {
    const result = await this.db.query('SELECT 1 FROM company_roles WHERE company_id = $1 AND role_key = $2', [companyId, roleKey]);
    return Boolean(result.rowCount);
  }

  async hasRoleMembers(companyId: string, roleKey: string) {
    const result = await this.db.query(
      'SELECT 1 FROM company_memberships WHERE company_id = $1 AND role = $2 LIMIT 1',
      [companyId, roleKey],
    );
    return Boolean(result.rowCount);
  }

  async createRole(companyId: string, roleKey: string, displayName: string, description: string) {
    const result = await this.db.query(
      `INSERT INTO company_roles(company_id, role_key, display_name, description)
       VALUES ($1, $2, $3, $4) RETURNING role_key, display_name, description, is_system`,
      [companyId, roleKey, displayName, description],
    );
    await this.db.query(
      `INSERT INTO role_permissions(company_id, role, permission_key, allowed)
       SELECT $1, $2, permission_key, false FROM permission_catalog
       ON CONFLICT (company_id, role, permission_key) DO NOTHING`,
      [companyId, roleKey],
    );
    return result.rows[0];
  }

  async deleteRole(companyId: string, roleKey: string) {
    const result = await this.db.query(
      `DELETE FROM company_roles r
       WHERE r.company_id = $1 AND r.role_key = $2 AND r.is_system = false
         AND NOT EXISTS (SELECT 1 FROM company_memberships m WHERE m.company_id = r.company_id AND m.role = r.role_key)
       RETURNING r.role_key`,
      [companyId, roleKey],
    );
    return Boolean(result.rowCount);
  }

  async updateRolePermissions(companyId: string, role: string, permissionKeys: string[]) {
    await this.db.query(
      `INSERT INTO role_permissions (company_id, role, permission_key, allowed, updated_at)
       SELECT $1, $2, p.permission_key, p.permission_key = ANY($3::varchar[]), CURRENT_TIMESTAMP
       FROM permission_catalog p
       ON CONFLICT (company_id, role, permission_key) DO UPDATE SET
         allowed = EXCLUDED.allowed, updated_at = CURRENT_TIMESTAMP`,
      [companyId, role, permissionKeys],
    );
    return this.getRolePermissions(companyId);
  }
}
