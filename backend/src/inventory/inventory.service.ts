import { Injectable } from '@nestjs/common';
import { InventoryRepository } from './inventory.repository';
import { StockMovementsRepository } from './stock-movements.repository';
import { WarehousesRepository } from './warehouses.repository';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly movementsRepository: StockMovementsRepository,
    private readonly warehousesRepository: WarehousesRepository,
    private readonly db: DatabaseService,
  ) {}

  async getStats() {
    return this.inventoryRepository.getStats();
  }

  async findAll(page: number, limit: number, search: string, warehouseId: string, status: string) {
    return this.inventoryRepository.findAll(page, limit, search, warehouseId, status);
  }

  async findByProduct(productId: string) {
    return this.inventoryRepository.findByProduct(productId);
  }

  async getTraceability(batchId: string) {
    return this.inventoryRepository.getBatchTraceability(batchId);
  }

  async getKardex(inventoryId: string) {
    return this.movementsRepository.findByInventory(inventoryId);
  }

  async createAdjustment(data: {
    inventory_id: string;
    batch_id: string;
    movement_type: 'adjustment' | 'write_off' | 'sample';
    quantity_change: number;
    notes: string;
    created_by?: string;
  }) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      // 1. Get current item to calculate new balance
      const query = `SELECT quantity FROM inventory WHERE id = $1 FOR UPDATE`;
      const itemRes = await client.query(query, [data.inventory_id]);
      if (itemRes.rows.length === 0) throw new Error('Inventory item not found');
      
      const newQty = Number(itemRes.rows[0].quantity) + data.quantity_change;
      if (newQty < 0) throw new Error('Resulting quantity cannot be negative');

      // 2. Update Inventory
      await this.inventoryRepository.updateQuantity(data.inventory_id, newQty, client);

      // 3. Create Movement Record
      const movement = await this.movementsRepository.create(client, {
        ...data,
        quantity_change: data.quantity_change
      });

      await client.query('COMMIT');
      return movement;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateReorderSettings(productId: string, data: { min_stock: number, lead_time_days: number }) {
    return this.inventoryRepository.updateReorderSettings(productId, data.min_stock, data.lead_time_days);
  }

  async getWarehouses() {
    return this.warehousesRepository.findAll();
  }

  async transferStock(data: {
    from_inventory_id: string;
    to_warehouse_id: string;
    quantity: number;
    notes?: string;
  }) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      // 1. Get Source Inventory
      const fromQuery = `SELECT * FROM inventory WHERE id = $1 FOR UPDATE`;
      const fromRes = await client.query(fromQuery, [data.from_inventory_id]);
      if (fromRes.rows.length === 0) throw new Error('Source inventory not found');
      const source = fromRes.rows[0];

      if (Number(source.quantity) < data.quantity) {
        throw new Error('Insufficient quantity for transfer');
      }

      // 2. Subtract from Source
      const newSourceQty = Number(source.quantity) - data.quantity;
      await this.inventoryRepository.updateQuantity(source.id, newSourceQty, client);

      // 3. Find or Create in Target Warehouse
      const targetQuery = `SELECT * FROM inventory WHERE batch_id = $1 AND warehouse_id = $2 FOR UPDATE`;
      const targetRes = await client.query(targetQuery, [source.batch_id, data.to_warehouse_id]);
      
      let targetId: string;
      if (targetRes.rows.length > 0) {
        const target = targetRes.rows[0];
        const newTargetQty = Number(target.quantity) + data.quantity;
        await this.inventoryRepository.updateQuantity(target.id, newTargetQty, client);
        targetId = target.id;
      } else {
        const insertQuery = `
          INSERT INTO inventory (batch_id, warehouse_id, quantity, bin_location)
          VALUES ($1, $2, $3, $4) RETURNING id
        `;
        const insertRes = await client.query(insertQuery, [source.batch_id, data.to_warehouse_id, data.quantity, 'Transferido']);
        targetId = insertRes.rows[0].id;
      }

      // 4. Record Movements
      await this.movementsRepository.create(client, {
        inventory_id: source.id,
        batch_id: source.batch_id,
        movement_type: 'adjustment',
        quantity_change: -data.quantity,
        notes: `Transferencia a bodega ${data.to_warehouse_id}. ${data.notes || ''}`
      });

      await this.movementsRepository.create(client, {
        inventory_id: targetId,
        batch_id: source.batch_id,
        movement_type: 'adjustment',
        quantity_change: data.quantity,
        notes: `Transferencia desde inventario ${source.id}. ${data.notes || ''}`
      });

      await client.query('COMMIT');
      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getForecasting() {
    return this.inventoryRepository.getForecastingReport();
  }
}
