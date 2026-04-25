import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StockMovementsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(client: any, movement: {
    inventory_id: string;
    batch_id: string;
    movement_type: 'sale' | 'return' | 'adjustment' | 'purchase' | 'write_off' | 'sample';
    quantity_change: number;
    reference_id?: string;
    notes?: string;
    created_by?: string;
  }) {
    const query = `
      INSERT INTO stock_movements (
        inventory_id, batch_id, movement_type, quantity_change, 
        reference_id, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      movement.inventory_id,
      movement.batch_id,
      movement.movement_type,
      movement.quantity_change,
      movement.reference_id || null,
      movement.notes || null,
      movement.created_by || null
    ];

    const res = await client.query(query, params);
    return res.rows[0];
  }

  async findByInventory(inventoryId: string) {
    const query = `
      SELECT sm.*, u.name as user_name
      FROM stock_movements sm
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.inventory_id = $1
      ORDER BY sm.created_at DESC
    `;
    const res = await this.db.query(query, [inventoryId]);
    return res.rows;
  }
}
