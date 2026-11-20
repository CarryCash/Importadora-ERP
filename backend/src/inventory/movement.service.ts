import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { FifoService } from './fifo.service';

export interface MovementLineInput {
  productId: string;
  lotId?: string | null;
  fromWarehouseId?: string | null;
  fromLocationId?: string | null;
  toWarehouseId?: string | null;
  toLocationId?: string | null;
  quantity: number;
  unitCost?: number;
  serials?: string[];
}

export interface CreateMovementInput {
  companyId: string;
  operationType:
    | 'receipt'
    | 'issue'
    | 'transfer_out'
    | 'transfer_in'
    | 'adjustment_positive'
    | 'adjustment_negative'
    | 'count_reconciliation'
    | 'return_customer'
    | 'return_supplier';
  referenceDocType?: string;
  referenceDocId?: string;
  notes?: string;
  idempotencyKey?: string;
  userId?: string;
  lines: MovementLineInput[];
}

@Injectable()
export class MovementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly fifoService: FifoService,
  ) {}

  /**
   * Ejecuta un movimiento de inventario completo de manera estrictamente atómica.
   * Maneja actualización de saldos, consumo/creación de capas FIFO, números de serie y auditoría.
   */
  async executeMovement(input: CreateMovementInput): Promise<any> {
    const client: PoolClient = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      // 1. Verificación de Idempotencia
      if (input.idempotencyKey) {
        const existing = await client.query(
          `SELECT id, movement_number, status FROM inventory_movements WHERE company_id = $1 AND idempotency_key = $2 FOR UPDATE`,
          [input.companyId, input.idempotencyKey],
        );
        if (existing.rowCount) {
          await client.query('COMMIT');
          return existing.rows[0];
        }
      }

      // 2. Generar número secuencial MOV-YYYY-NNNNNN
      const seqRes = await client.query("SELECT nextval('inventory_movement_number_seq') AS n");
      const year = new Date().getFullYear();
      const movementNumber = `MOV-${year}-${String(seqRes.rows[0].n).padStart(6, '0')}`;

      // 3. Crear cabecera del movimiento
      const headerRes = await client.query(
        `INSERT INTO inventory_movements (
           company_id, movement_number, operation_type, status,
           reference_doc_type, reference_doc_id, notes, idempotency_key,
           created_by, confirmed_by, confirmed_at
         ) VALUES ($1, $2, $3, 'confirmed', $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          input.companyId,
          movementNumber,
          input.operationType,
          input.referenceDocType || null,
          input.referenceDocId || null,
          input.notes || null,
          input.idempotencyKey || null,
          input.userId || null,
        ],
      );
      const movement = headerRes.rows[0];

      // 4. Procesar cada línea de movimiento
      for (const line of input.lines) {
        if (line.quantity <= 0) {
          throw new ConflictException('La cantidad de cada línea de movimiento debe ser mayor a cero.');
        }

        // Determinar impacto de entrada o salida
        const isEntry = ['receipt', 'transfer_in', 'adjustment_positive', 'return_customer'].includes(input.operationType);
        const isExit = ['issue', 'transfer_out', 'adjustment_negative', 'return_supplier'].includes(input.operationType);

        let unitCostApplied = line.unitCost || 0;
        let totalCostApplied = unitCostApplied * line.quantity;

        // Validar y bloquear stock origen en salidas
        if (isExit) {
          if (!line.fromLocationId || !line.fromWarehouseId) {
            throw new ConflictException('Las operaciones de salida o transferencia requieren bodega y ubicación de origen.');
          }

          // Bloquear saldo de proyección
          const balanceRes = await client.query(
            `SELECT * FROM inventory_balances
             WHERE company_id = $1 AND product_id = $2 AND warehouse_id = $3 AND location_id = $4
               AND ($5::uuid IS NULL OR lot_id = $5)
             FOR UPDATE`,
            [input.companyId, line.productId, line.fromWarehouseId, line.fromLocationId, line.lotId || null],
          );

          if (!balanceRes.rowCount || Number(balanceRes.rows[0].physical_stock) < line.quantity) {
            throw new ConflictException(`Existencias físicas insuficientes en la ubicación de origen para el producto.`);
          }

          // Verificar que el disponible cubra la salida
          const currentAvailable = Number(balanceRes.rows[0].available_stock);
          if (currentAvailable < line.quantity && input.operationType === 'issue') {
            throw new ConflictException(`El stock disponible (${currentAvailable}) no alcanza para despachar ${line.quantity} unidades (existen reservas o bloqueos).`);
          }
        }

        // Crear la línea de movimiento
        const lineRes = await client.query(
          `INSERT INTO inventory_movement_lines (
             movement_id, product_id, lot_id,
             from_warehouse_id, from_location_id,
             to_warehouse_id, to_location_id,
             quantity, unit_cost, total_cost
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            movement.id,
            line.productId,
            line.lotId || null,
            line.fromWarehouseId || null,
            line.fromLocationId || null,
            line.toWarehouseId || null,
            line.toLocationId || null,
            line.quantity,
            unitCostApplied,
            totalCostApplied,
          ],
        );
        const movementLine = lineRes.rows[0];

        // 5. Aplicar lógica del Motor FIFO
        if (isExit) {
          // Salida: consume capas FIFO
          const fifoResult = await this.fifoService.consumeFifoLayers(client, {
            companyId: input.companyId,
            productId: line.productId,
            quantity: line.quantity,
            movementLineId: movementLine.id,
            warehouseId: line.fromWarehouseId,
          });

          unitCostApplied = fifoResult.weightedUnitCost;
          totalCostApplied = fifoResult.totalCost;

          // Actualizar el costo real aplicado en la línea
          await client.query(
            `UPDATE inventory_movement_lines SET unit_cost = $1, total_cost = $2 WHERE id = $3`,
            [unitCostApplied, totalCostApplied, movementLine.id],
          );

          // Restar saldo en origen
          await this.decrementBalance(client, {
            companyId: input.companyId,
            productId: line.productId,
            warehouseId: line.fromWarehouseId!,
            locationId: line.fromLocationId!,
            lotId: line.lotId,
            quantity: line.quantity,
          });
        } else if (isEntry) {
          // Entrada: crea una nueva capa de costo FIFO
          if (!line.toLocationId || !line.toWarehouseId) {
            throw new ConflictException('Las operaciones de entrada requieren bodega y ubicación de destino.');
          }

          await this.fifoService.createCostLayer(client, {
            companyId: input.companyId,
            productId: line.productId,
            warehouseId: line.toWarehouseId,
            locationId: line.toLocationId,
            lotId: line.lotId,
            originDocType: input.operationType,
            originDocId: movement.id,
            originDocLineId: movementLine.id,
            quantity: line.quantity,
            unitCost: unitCostApplied,
          });

          // Incrementar saldo en destino
          await this.incrementBalance(client, {
            companyId: input.companyId,
            productId: line.productId,
            warehouseId: line.toWarehouseId,
            locationId: line.toLocationId,
            lotId: line.lotId,
            quantity: line.quantity,
          });
        }

        // 6. Trazabilidad de Números de Serie si aplican
        if (line.serials && line.serials.length > 0) {
          for (const serialNum of line.serials) {
            const cleanSerial = serialNum.trim();
            if (!cleanSerial) continue;

            if (isEntry) {
              await client.query(
                `INSERT INTO inventory_serials (
                   company_id, product_id, lot_id, serial_number,
                   acquisition_cost, current_warehouse_id, current_location_id,
                   status, source_reference
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_stock', $8)
                 ON CONFLICT (company_id, product_id, serial_number) 
                 DO UPDATE SET 
                   current_warehouse_id = EXCLUDED.current_warehouse_id,
                   current_location_id = EXCLUDED.current_location_id,
                   status = 'in_stock',
                   updated_at = CURRENT_TIMESTAMP`,
                [
                  input.companyId,
                  line.productId,
                  line.lotId || null,
                  cleanSerial,
                  unitCostApplied,
                  line.toWarehouseId,
                  line.toLocationId,
                  movement.movement_number,
                ],
              );
            } else if (isExit) {
              await client.query(
                `UPDATE inventory_serials
                 SET status = CASE WHEN $1 = 'issue' THEN 'sold' ELSE 'quarantine' END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE company_id = $2 AND product_id = $3 AND serial_number = $4`,
                [input.operationType, input.companyId, line.productId, cleanSerial],
              );
            }
          }
        }
      }

      // 7. Registro Inmutable de Auditoría
      await client.query(
        `INSERT INTO inventory_audit_log (
           company_id, user_id, action, entity_type, entity_id, new_state, reason
         ) VALUES ($1, $2, $3, 'inventory_movement', $4, $5, $6)`,
        [
          input.companyId,
          input.userId || null,
          input.operationType,
          movement.id,
          JSON.stringify({ movement_number: movement.movementNumber, lines_count: input.lines.length }),
          input.notes || 'Confirmación de movimiento de inventario',
        ],
      );

      await client.query('COMMIT');
      return movement;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private async incrementBalance(
    client: PoolClient,
    data: { companyId: string; productId: string; warehouseId: string; locationId: string; lotId?: string | null; quantity: number },
  ) {
    await client.query(
      `INSERT INTO inventory_balances (
         company_id, product_id, warehouse_id, location_id, lot_id, physical_stock, last_reconciled_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (company_id, product_id, warehouse_id, location_id, lot_id)
       DO UPDATE SET physical_stock = inventory_balances.physical_stock + EXCLUDED.physical_stock,
                     last_reconciled_at = CURRENT_TIMESTAMP`,
      [data.companyId, data.productId, data.warehouseId, data.locationId, data.lotId || null, data.quantity],
    );

    // Compatibilidad: mantener sincronizada la tabla legacy inventory si existe en product_batches
    if (data.lotId) {
      const batchExists = await client.query('SELECT 1 FROM product_batches WHERE id = $1', [data.lotId]);
      if (batchExists.rowCount) {
        await client.query(
          `INSERT INTO inventory (batch_id, warehouse_id, storage_location_id, stock_status, quantity, last_updated)
           VALUES ($1, $2, $3, 'available', $4, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, warehouse_id, storage_location_id, stock_status)
           DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, last_updated = CURRENT_TIMESTAMP`,
          [data.lotId, data.warehouseId, data.locationId, data.quantity],
        );
      }
    }
  }

  private async decrementBalance(
    client: PoolClient,
    data: { companyId: string; productId: string; warehouseId: string; locationId: string; lotId?: string | null; quantity: number },
  ) {
    await client.query(
      `UPDATE inventory_balances
       SET physical_stock = GREATEST(0, physical_stock - $1),
           last_reconciled_at = CURRENT_TIMESTAMP
       WHERE company_id = $2 AND product_id = $3 AND warehouse_id = $4 AND location_id = $5
         AND ($6::uuid IS NULL OR lot_id = $6)`,
      [data.quantity, data.companyId, data.productId, data.warehouseId, data.locationId, data.lotId || null],
    );

    // Compatibilidad: mantener sincronizada la tabla legacy inventory
    if (data.lotId) {
      await client.query(
        `UPDATE inventory
         SET quantity = GREATEST(0, quantity - $1), last_updated = CURRENT_TIMESTAMP
         WHERE batch_id = $2 AND warehouse_id = $3 AND storage_location_id = $4`,
        [data.quantity, data.lotId, data.warehouseId, data.locationId],
      );
    }
  }
}

