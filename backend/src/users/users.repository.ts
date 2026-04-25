import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.avatar_url, u.last_login, u.created_at,
             w.name as warehouse_name
      FROM users u
      LEFT JOIN warehouses w ON u.assigned_warehouse_id = w.id
      ORDER BY u.created_at DESC
    `);
    return res.rows;
  }

  async findByUsername(username: string) {
    const res = await this.db.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
  }

  async findById(id: string) {
    const res = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  }

  async create(userData: any) {
    const { username, password_hash, email, full_name, role, assigned_warehouse_id, avatar_url } = userData;
    
    // Validar que el warehouse_id sea null si viene vacío, para evitar error de sintaxis UUID
    const warehouseId = (assigned_warehouse_id && assigned_warehouse_id.trim() !== '') 
      ? assigned_warehouse_id 
      : null;

    const res = await this.db.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, assigned_warehouse_id, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, full_name, role, created_at`,
      [username, password_hash, email, full_name, role || 'user', warehouseId, avatar_url || null]
    );
    return res.rows[0];
  }

  async update(id: string, userData: any) {
    const { full_name, email, role, is_active, assigned_warehouse_id, avatar_url } = userData;
    const res = await this.db.query(
      `UPDATE users SET
        full_name = $1, email = $2, role = $3, is_active = $4, 
        assigned_warehouse_id = $5, avatar_url = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 RETURNING id, username, email, full_name, role, is_active`,
      [full_name, email, role, is_active, assigned_warehouse_id, avatar_url, id]
    );
    return res.rows[0];
  }

  async updatePassword(id: string, passwordHash: string) {
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }
}
