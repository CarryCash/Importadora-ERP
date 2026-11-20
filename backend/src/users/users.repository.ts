import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string) {
    const res = await this.db.query(`
      SELECT u.id, u.username, u.email, u.full_name, m.role, m.is_active, u.avatar_url, u.last_login, u.created_at,
             u.phone,u.department_id,d.name department_name,u.position_id,p.name position_name,
             ARRAY(SELECT ur.role_key FROM company_user_roles ur WHERE ur.company_id=m.company_id AND ur.user_id=u.id ORDER BY ur.is_primary DESC) role_keys,
             ARRAY(SELECT bm.branch_id FROM branch_memberships bm JOIN branches br ON br.id=bm.branch_id WHERE bm.user_id=u.id AND br.company_id=m.company_id) branch_ids,
             w.name as warehouse_name
      FROM users u
      JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $1 AND m.is_active = true
      LEFT JOIN company_departments d ON d.id=u.department_id AND d.company_id=m.company_id
      LEFT JOIN company_positions p ON p.id=u.position_id AND p.company_id=m.company_id
      LEFT JOIN warehouses w ON u.assigned_warehouse_id = w.id AND w.company_id=m.company_id
      ORDER BY u.created_at DESC
    `, [companyId]);
    return res.rows;
  }

  async findByUsername(username: string) {
    const res = await this.db.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
  }

  async findDefaultMembership(userId: string) {
    const res = await this.db.query(
      `SELECT m.company_id, m.role, COALESCE(bm.branch_id, (
          SELECT b.id FROM branches b WHERE b.company_id = m.company_id AND b.is_active = true ORDER BY b.created_at LIMIT 1
        )) AS branch_id
       FROM company_memberships m
       JOIN companies c ON c.id = m.company_id AND c.is_active = true
       LEFT JOIN branch_memberships bm ON bm.user_id = m.user_id
         AND EXISTS (SELECT 1 FROM branches valid_branch WHERE valid_branch.id = bm.branch_id
                     AND valid_branch.company_id = m.company_id AND valid_branch.is_active = true)
       LEFT JOIN branches b ON b.id = bm.branch_id AND b.company_id = m.company_id AND b.is_active = true
       WHERE m.user_id = $1 AND m.is_active = true
       ORDER BY m.is_default DESC, b.created_at ASC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] || null;
  }

  async findPermissions(companyId: string, role: string) {
    const res = await this.db.query(
      `SELECT permission_key FROM role_permissions
       WHERE company_id = $1 AND role = $2 AND allowed = true
       ORDER BY permission_key`,
      [companyId, role],
    );
    return res.rows.map((row) => row.permission_key as string);
  }

  async findCompanyRoles(companyId: string, userId: string) {
    const result = await this.db.query(
      `SELECT ur.role_key FROM company_user_roles ur
       JOIN company_roles r ON r.company_id=ur.company_id AND r.role_key=ur.role_key
       WHERE ur.company_id=$1 AND ur.user_id=$2 ORDER BY ur.is_primary DESC,ur.role_key`,
      [companyId, userId],
    );
    return result.rows.map((row) => row.role_key as string);
  }

  async findCompanyPermissions(companyId: string, userId: string) {
    const result = await this.db.query(
      `SELECT DISTINCT rp.permission_key FROM company_user_roles ur
       JOIN role_permissions rp ON rp.company_id=ur.company_id AND rp.role=ur.role_key AND rp.allowed=true
       WHERE ur.company_id=$1 AND ur.user_id=$2 ORDER BY rp.permission_key`,
      [companyId, userId],
    );
    return result.rows.map((row) => row.permission_key as string);
  }

  async createSession(session: { id: string; companyId: string; userId: string; ip?: string; userAgent?: string; expiresAt: Date }) {
    await this.db.query(
      `INSERT INTO user_sessions(id,company_id,user_id,ip_address,user_agent,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [session.id,session.companyId,session.userId,session.ip||null,session.userAgent||null,session.expiresAt],
    );
  }

  async revokeSession(sessionId: string, userId: string) {
    await this.db.query('UPDATE user_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionId,userId]);
  }

  async recordLoginAttempt(username: string, ip: string | undefined, succeeded: boolean, companyId?:string) {
    await this.db.query('INSERT INTO login_attempts(username,ip_address,succeeded,company_id) VALUES(LOWER($1),$2,$3,$4)',[username,ip||null,succeeded,companyId||null]);
    await this.db.query("DELETE FROM login_attempts WHERE attempted_at < NOW()-INTERVAL '90 days'");
  }

  async markLogin(userId:string){await this.db.query('UPDATE users SET last_login=NOW() WHERE id=$1',[userId]);}

  async isLoginLocked(username: string, companyId: string) {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS failures, COALESCE(MAX(sp.max_login_attempts),5)::int AS max_attempts,
              COALESCE(MAX(sp.lockout_minutes),15)::int AS lockout_minutes
       FROM login_attempts la CROSS JOIN security_policies sp
       WHERE la.username=LOWER($1) AND sp.company_id=$2 AND la.company_id=$2 AND la.succeeded=false
         AND la.attempted_at>NOW()-(sp.lockout_minutes * INTERVAL '1 minute')`, [username,companyId],
    );
    return Number(result.rows[0]?.failures || 0) >= Number(result.rows[0]?.max_attempts || 5);
  }

  async getSecurityPolicy(companyId: string) {
    const result = await this.db.query('SELECT * FROM security_policies WHERE company_id=$1',[companyId]);
    return result.rows[0] || null;
  }

  async validOrgAssignment(companyId:string,departmentId?:string,positionId?:string){if(departmentId){const department=await this.db.query('SELECT id FROM company_departments WHERE id=$1 AND company_id=$2 AND is_active',[departmentId,companyId]);if(!department.rowCount)return false;}if(positionId){const position=await this.db.query('SELECT id FROM company_positions WHERE id=$1 AND company_id=$2 AND is_active AND ($3::uuid IS NULL OR department_id=$3)',[positionId,companyId,departmentId||null]);if(!position.rowCount)return false;}return true;}
  async validWarehouseAssignment(companyId:string,warehouseId?:string){if(!warehouseId)return true;const result=await this.db.query('SELECT 1 FROM warehouses WHERE id=$1 AND company_id=$2 AND is_active',[warehouseId,companyId]);return Boolean(result.rowCount);}

  async findByEmail(email: string) {
    const res = await this.db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows[0];
  }

  async findById(id: string, companyId?: string) {
    const res = await this.db.query(
      `SELECT u.*,COALESCE((SELECT m.role FROM company_memberships m WHERE m.user_id=u.id AND m.company_id=$2 LIMIT 1),u.role) AS role,
       COALESCE((SELECT m.is_active FROM company_memberships m WHERE m.user_id=u.id AND m.company_id=$2),u.is_active) AS is_active,
       ARRAY(SELECT ur.role_key FROM company_user_roles ur WHERE ur.user_id=u.id AND ur.company_id=$2 ORDER BY ur.is_primary DESC) role_keys
       FROM users u WHERE u.id = $1
       AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM company_memberships m WHERE m.user_id = u.id AND m.company_id = $2 AND m.is_active = true))`,
      [id, companyId || null],
    );
    return res.rows[0];
  }

  async create(companyId: string, userData: any) {
    const { username, password_hash, email, full_name, role, assigned_warehouse_id, avatar_url,phone,department_id,position_id } = userData;
    
    // Validar que el warehouse_id sea null si viene vacío, para evitar error de sintaxis UUID
    const warehouseId = (assigned_warehouse_id && assigned_warehouse_id.trim() !== '') 
      ? assigned_warehouse_id 
      : null;

    const res = await this.db.query(
      `WITH created_user AS (
         INSERT INTO users (username, password_hash, email, full_name, role, assigned_warehouse_id, avatar_url,phone,department_id,position_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7,$10,$11,$12)
         RETURNING id, username, email, full_name, role, created_at
       ), assigned_company AS (
         INSERT INTO company_memberships (company_id, user_id, role, is_default)
         SELECT $8, u.id, u.role, true FROM created_user u
         RETURNING user_id
       ), assigned_roles AS (
         INSERT INTO company_user_roles(company_id,user_id,role_key,is_primary)
         SELECT $8,u.id,u.role,true FROM created_user u ON CONFLICT DO NOTHING
         RETURNING user_id
       ), assigned_branch AS (
         INSERT INTO branch_memberships (branch_id, user_id)
         SELECT b.id, u.id FROM created_user u
         JOIN LATERAL (
           SELECT id FROM branches WHERE company_id = $8 AND is_active = true AND ($9::uuid IS NULL OR id = $9)
           ORDER BY created_at LIMIT 1
         ) b ON true
         ON CONFLICT DO NOTHING
         RETURNING user_id
       )
       SELECT id, username, email, full_name, role, created_at FROM created_user`,
      [username, password_hash, email, full_name, role || 'user', warehouseId, avatar_url || null, companyId, userData.branch_id || null,phone||null,department_id||null,position_id||null],
    );
    return res.rows[0];
  }

  async update(companyId: string, id: string, userData: any) {
    const { full_name, email, assigned_warehouse_id, avatar_url, phone, department_id, position_id, password_hash } = userData;
    const res = await this.db.query(
      `WITH updated AS (
         UPDATE users SET full_name=$1,email=$2,assigned_warehouse_id=$3,avatar_url=$4,phone=$5,department_id=$6,position_id=$7,
           password_hash=COALESCE($8,password_hash),updated_at=CURRENT_TIMESTAMP
         WHERE id=$9 AND EXISTS(SELECT 1 FROM company_memberships m WHERE m.user_id=users.id AND m.company_id=$10 AND m.is_active=true)
         RETURNING id,username,email,full_name
       )
       SELECT u.id,u.username,u.email,u.full_name,m.role,m.is_active FROM updated u
       JOIN company_memberships m ON m.user_id=u.id AND m.company_id=$10`,
      [full_name,email,assigned_warehouse_id||null,avatar_url||null,phone||null,department_id||null,position_id||null,password_hash||null,id,companyId]
    );
    return res.rows[0];
  }

  async updatePassword(id: string, passwordHash: string) {
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }

  async syncMembershipAccess(companyId: string, userId: string, role?: string, isActive?: boolean) {
    if (role === undefined && isActive === undefined) return;
    await this.db.query(
      `UPDATE company_memberships SET
         role = COALESCE($2, role),
         is_active = COALESCE($3, is_active)
       WHERE user_id = $1 AND company_id = $4`,
      [userId, role ?? null, isActive ?? null, companyId],
    );
  }

  async syncUserRoles(companyId:string,userId:string,roles:string[],primaryRole:string){
    const client=await this.db.getPool().connect();try{await client.query('BEGIN');await client.query('DELETE FROM company_user_roles WHERE company_id=$1 AND user_id=$2',[companyId,userId]);for(const role of [...new Set(roles)])await client.query('INSERT INTO company_user_roles(company_id,user_id,role_key,is_primary) VALUES($1,$2,$3,$4)',[companyId,userId,role,role===primaryRole]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  async revokeUserSessions(companyId:string,userId:string){await this.db.query('UPDATE user_sessions SET revoked_at=NOW() WHERE company_id=$1 AND user_id=$2 AND revoked_at IS NULL',[companyId,userId]);}

  async updateProfile(id: string, fullName: string, email: string) {
    const res = await this.db.query(
      `UPDATE users SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING id, username, email, full_name, role, is_active, avatar_url, created_at`,
      [fullName, email, id],
    );
    return res.rows[0];
  }
}
