import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WarehousesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query('SELECT * FROM warehouses WHERE is_active = true ORDER BY name ASC');
    return res.rows;
  }

  async findById(id: string) {
    const res = await this.db.query('SELECT * FROM warehouses WHERE id = $1', [id]);
    return res.rows[0];
  }

  async create(data: { name: string, code: string, type: string }) {
    const res = await this.db.query(
      'INSERT INTO warehouses (name, code, type) VALUES ($1, $2, $3) RETURNING *',
      [data.name, data.code, data.type]
    );
    return res.rows[0];
  }
}
