import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LogisticsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getConfiguration(companyId: string) {
    const result = await this.db.query(
      `SELECT configuration FROM logistics_configurations WHERE company_id = $1`,
      [companyId],
    );
    return result.rows[0]?.configuration || {};
  }

  async saveConfiguration(companyId: string, userId: string, configuration: Record<string, unknown>) {
    const result = await this.db.query(
      `INSERT INTO logistics_configurations (company_id, configuration, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (company_id) DO UPDATE SET
         configuration = EXCLUDED.configuration,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING configuration, updated_at`,
      [companyId, JSON.stringify(configuration), userId],
    );
    return result.rows[0];
  }

  async getUpcomingDeliveries() {
    const res = await this.db.query(`
      SELECT d.*, s.sale_number 
      FROM deliveries d
      JOIN sales s ON d.sale_id = s.id
      WHERE d.status != 'Entregado' AND d.status != 'Cancelado'
      ORDER BY d.scheduled_time ASC
    `);
    return res.rows;
  }

  async getStats() {
    // En Tránsito (En Ruta)
    const inTransitRes = await this.db.query(`SELECT COUNT(*) FROM deliveries WHERE status = 'En Ruta'`);
    
    // Entregados Hoy
    const deliveredTodayRes = await this.db.query(`
      SELECT COUNT(*) FROM deliveries 
      WHERE status = 'Entregado' AND DATE(updated_at) = CURRENT_DATE
    `);

    // Flota Activa % (asumiendo max 5 vehículos para este ejemplo, calculado dinámicamente)
    // Número de entregas 'En Ruta' o 'Preparando' / capacidad flota (ej. 10)
    const activeDeliveriesRes = await this.db.query(`SELECT COUNT(*) FROM deliveries WHERE status IN ('En Ruta', 'Preparando')`);
    const activeDeliveries = parseInt(activeDeliveriesRes.rows[0].count);
    const fleetCapacity = 5; // Valor fijo de ejemplo
    const activeFleetPercent = Math.min(Math.round((activeDeliveries / fleetCapacity) * 100), 100);

    // Capacidad de bodega
    const inventoryRes = await this.db.query(`SELECT COALESCE(SUM(quantity), 0) as total FROM inventory`);
    const warehouseCapacity = 5000; // Valor de ejemplo
    const currentInventory = parseInt(inventoryRes.rows[0].total) || 0;
    const warehousePercent = Math.min(Math.round((currentInventory / warehouseCapacity) * 100), 100);

    // Tiempo promedio (ejemplo: 2.4 días fijo por ahora)
    const avgDeliveryTime = 2.4; 

    return {
      inTransit: parseInt(inTransitRes.rows[0].count),
      deliveredToday: parseInt(deliveredTodayRes.rows[0].count),
      activeFleetPercent,
      warehousePercent,
      avgDeliveryTime
    };
  }

  async updateDeliveryStatus(id: string, status: string) {
    const res = await this.db.query(`
      UPDATE deliveries 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);
    return res.rows[0];
  }

  async assignDriver(id: string, driverName: string, vehiclePlate: string, scheduledTime: string) {
    const res = await this.db.query(`
      UPDATE deliveries
      SET driver_name = $1, vehicle_plate = $2, scheduled_time = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [driverName, vehiclePlate, scheduledTime, id]);
    return res.rows[0];
  }
}
