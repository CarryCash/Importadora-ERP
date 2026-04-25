import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StockMovementsRepository } from '../inventory/stock-movements.repository';

@Injectable()
export class ReturnsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly stockMovements: StockMovementsRepository,
  ) {}

  async createReturn(dto: any) {
    const client = await (this.db as any).pool.connect();
    try {
      await client.query('BEGIN');

      const { sale_id, items, reason, customer_id = null } = dto;

      // 1. Crear cabecera de devolución
      const returnRes = await client.query(
        `INSERT INTO returns (sale_id, customer_id, reason, status)
         VALUES ($1, $2, $3, 'completed')
         RETURNING *`,
        [sale_id, customer_id, reason],
      );
      const returnId = returnRes.rows[0].id;

      let totalRefund = 0;

      // 2. Procesar cada item devuelto
      for (const item of items) {
        // Validar que el item exista en la venta original
        const saleItemRes = await client.query(
          `SELECT si.*, i.id as inventory_id 
           FROM sales_items si
           JOIN inventory i ON si.batch_id = i.batch_id
           WHERE si.id = $1 AND si.sale_id = $2`,
          [item.sale_item_id, sale_id],
        );

        if (!saleItemRes.rows[0]) {
          throw new BadRequestException(`El ítem ${item.sale_item_id} no pertenece a la venta ${sale_id}`);
        }

        const saleItem = saleItemRes.rows[0];

        if (item.quantity > saleItem.quantity) {
          throw new BadRequestException(`No puedes devolver más unidades de las vendidas (${saleItem.quantity}).`);
        }

        // Registrar item devuelto
        await client.query(
          `INSERT INTO return_items (return_id, sale_item_id, quantity, disposition)
           VALUES ($1, $2, $3, $4)`,
          [returnId, item.sale_item_id, item.quantity, item.disposition],
        );

        // 3. Manejar disposición (Logica Cosméticos)
        if (item.disposition === 'restock') {
          // Vuelve al inventario vendible
          await client.query(
            `UPDATE inventory SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2`,
            [item.quantity, saleItem.inventory_id],
          );
        }

        // Registrar movimiento de stock
        await this.stockMovements.create(client, {
          inventory_id: saleItem.inventory_id,
          batch_id: saleItem.batch_id,
          movement_type: 'return',
          quantity_change: item.disposition === 'restock' ? item.quantity : 0, // Si es discard, no suma stock
          reference_id: returnId,
          notes: `Devolución: ${reason} (${item.disposition})`
        });

        const refundPerUnit = Number(saleItem.total_amount) / saleItem.quantity;
        totalRefund += refundPerUnit * item.quantity;
      }

      // 4. Actualizar monto de reembolso
      await client.query(
        `UPDATE returns SET refund_amount = $1 WHERE id = $2`,
        [totalRefund, returnId],
      );

      await client.query('COMMIT');
      return { ...returnRes.rows[0], refund_amount: totalRefund };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll() {
    const res = await this.db.query(`
      SELECT r.*, s.sale_number, c.name as customer_name
      FROM returns r
      JOIN sales s ON r.sale_id = s.id
      LEFT JOIN customers c ON r.customer_id = c.id
      ORDER BY r.created_at DESC
    `);
    return res.rows;
  }
}
