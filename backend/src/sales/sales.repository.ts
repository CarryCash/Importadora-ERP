import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StockMovementsRepository } from '../inventory/stock-movements.repository';
import { InvoicesRepository } from './invoices.repository';

@Injectable()
export class SalesRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly stockMovements: StockMovementsRepository,
    private readonly invoices: InvoicesRepository
  ) {}

  // ─── Generar número de venta automático VTA-YYYY-NNNN ─────────────────────
  private async generateSaleNumber(client: any): Promise<string> {
    const year = new Date().getFullYear();
    const res = await client.query(
      `SELECT COUNT(*) as total FROM sales WHERE EXTRACT(YEAR FROM sale_date) = $1`,
      [year],
    );
    const seq = (parseInt(res.rows[0].total, 10) + 1).toString().padStart(4, '0');
    return `VTA-${year}-${seq}`;
  }

  // ─── Listar todas las ventas ───────────────────────────────────────────────
  async findAll() {
    const res = await this.db.query(`
      SELECT 
        s.id, s.sale_number, s.sale_date, s.status, s.payment_status,
        s.subtotal, s.discount, s.tax, s.total_amount, s.notes, s.created_at,
        c.name AS customer_name, c.id AS customer_id,
        COUNT(si.id)::int AS items_count
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sales_items si ON si.sale_id = s.id
      GROUP BY s.id, c.name, c.id
      ORDER BY s.created_at DESC
    `);
    return res.rows;
  }

  // ─── Obtener venta por ID con items y pagos ────────────────────────────────
  async findById(id: string) {
    const saleRes = await this.db.query(
      `SELECT 
        s.*, 
        c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1`,
      [id],
    );
    if (!saleRes.rows[0]) throw new NotFoundException('Venta no encontrada');

    const itemsRes = await this.db.query(
      `SELECT 
        si.id, si.quantity, si.unit_price, si.discount, si.total_amount,
        p.name AS product_name, p.sku,
        pb.batch_number, pb.expiration_date
       FROM sales_items si
       JOIN product_batches pb ON si.batch_id = pb.id
       JOIN products p ON pb.product_id = p.id
       WHERE si.sale_id = $1
       ORDER BY si.created_at ASC`,
      [id],
    );

    const paymentsRes = await this.db.query(
      `SELECT id, method, amount, reference, payment_date
       FROM sale_payments
       WHERE sale_id = $1
       ORDER BY payment_date ASC`,
      [id],
    );

    return {
      ...saleRes.rows[0],
      items: itemsRes.rows,
      payments: paymentsRes.rows,
    };
  }

  // ─── Crear venta con FEFO + pagos (transacción atómica) ───────────────────
  async createTransaction(saleData: any) {
    const client = await (this.db as any).pool.connect();

    try {
      await client.query('BEGIN');

      const {
        customer_id,
        sale_date,
        items,
        payments = [],
        discount = 0,
        tax = 0,
        notes = null,
        user_id = null,
        pos_terminal = null,
        cashier_id = null,
      } = saleData;

      if (!items || items.length === 0) {
        throw new BadRequestException('La venta debe tener al menos un producto.');
      }

      const saleNumber = await this.generateSaleNumber(client);
      let subtotal = 0;

      // 1. Cabecera provisional (total se actualiza al final)
      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, customer_id, user_id, sale_date, status, 
          payment_status, subtotal, discount, tax, total_amount, 
          notes, pos_terminal, cashier_id
        )
         VALUES ($1, $2, $3, $4, 'completed', 'pending', 0, $5, $6, 0, $7, $8, $9)
         RETURNING *`,
        [
          saleNumber, customer_id, user_id, sale_date, 
          discount, tax, notes, pos_terminal, cashier_id
        ],
      );
      const saleId = saleRes.rows[0].id;

      // 2. FEFO por cada producto
      for (const item of items) {
        let qtyNeeded = item.quantity;
        const itemDiscount = item.discount ?? 0;

        // Buscar lotes ordenados por fecha de vencimiento (FEFO) - SOLO BODERAS FISICAS
        const batchesRes = await client.query(
          `SELECT i.id AS inventory_id, i.batch_id, i.quantity, 
                  b.expiration_date, p.name AS product_name
           FROM inventory i
           JOIN product_batches b ON i.batch_id = b.id
           JOIN products p ON b.product_id = p.id
           JOIN warehouses w ON i.warehouse_id = w.id
           WHERE b.product_id = $1 AND i.quantity > 0 AND w.type = 'physical'
           ORDER BY b.expiration_date ASC
           FOR UPDATE`,
          [item.product_id],
        );

        const batches = batchesRes.rows;

        for (const batch of batches) {
          if (qtyNeeded === 0) break;
          const deductQty = Math.min(batch.quantity, qtyNeeded);

          // Descontar stock
          await client.query(
            `UPDATE inventory SET quantity = quantity - $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2`,
            [deductQty, batch.inventory_id],
          );

          const linePriceBase = deductQty * item.unit_price;
          const lineDiscount = linePriceBase * (itemDiscount / 100);
          const lineTotal = linePriceBase - lineDiscount;
          subtotal += lineTotal;

          // Insertar item
          await client.query(
            `INSERT INTO sales_items (sale_id, batch_id, quantity, unit_price, discount, total_amount)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [saleId, batch.batch_id, deductQty, item.unit_price, itemDiscount, lineTotal],
          );

          // REGISTRAR MOVIMIENTO (Trazabilidad Fase 1)
          await this.stockMovements.create(client, {
            inventory_id: batch.inventory_id,
            batch_id: batch.batch_id,
            movement_type: 'sale',
            quantity_change: -deductQty,
            reference_id: saleId,
            notes: `Venta ${saleNumber}`,
            created_by: user_id
          });

          qtyNeeded -= deductQty;
        }

        if (qtyNeeded > 0) {
          const name = batches.length > 0 ? batches[0].product_name : `ID: ${item.product_id}`;
          throw new BadRequestException(
            `Stock insuficiente para "${name}". Faltan ${qtyNeeded} unidades.`,
          );
        }
      }

      // 3. Calcular totales finales
      const discountAmount = subtotal * (Number(discount) / 100);
      const subtotalAfterDiscount = subtotal - discountAmount;
      const taxAmount = subtotalAfterDiscount * (Number(tax) / 100);
      const totalAmount = subtotalAfterDiscount + taxAmount;

      await client.query(
        `UPDATE sales SET subtotal = $1, discount = $2, tax = $3, total_amount = $4 WHERE id = $5`,
        [subtotal, discountAmount, taxAmount, totalAmount, saleId],
      );

      // 4. Registrar pagos
      let totalPaid = 0;
      for (const pay of payments) {
        await client.query(
          `INSERT INTO sale_payments (sale_id, method, amount, reference)
           VALUES ($1, $2, $3, $4)`,
          [saleId, pay.method, pay.amount, pay.reference ?? null],
        );
        totalPaid += Number(pay.amount);
      }

      // 5. Calcular payment_status
      let paymentStatus = 'pending';
      if (totalPaid >= totalAmount) paymentStatus = 'paid';
      else if (totalPaid > 0) paymentStatus = 'partial';

      await client.query(
        `UPDATE sales SET payment_status = $1 WHERE id = $2`,
        [paymentStatus, saleId],
      );

      // 6. GENERAR FACTURA AUTOMÁTICA (Fase 3 - SRI)
      const invoiceNumber = await this.invoices.generateNextInvoiceNumber(client);
      await this.invoices.createInvoice(client, {
        sale_id: saleId,
        invoice_number: invoiceNumber,
        status: 'pending', // Esperando autorización del SRI
        issued_at: new Date(sale_date),
      });

      await client.query('COMMIT');

      return {
        success: true,
        message: `Venta ${saleNumber} creada correctamente.`,
        sale_id: saleId,
        sale_number: saleNumber,
        total_amount: totalAmount,
        payment_status: paymentStatus,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transacción de venta falló:', error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(`Error al procesar venta: ${error.message}`);
    } finally {
      client.release();
    }
  }

  // ─── Agregar pago a venta existente ───────────────────────────────────────
  async addPayment(saleId: string, paymentDto: any) {
    const client = await (this.db as any).pool.connect();
    try {
      await client.query('BEGIN');

      const saleRes = await client.query(
        `SELECT total_amount FROM sales WHERE id = $1 AND status != 'cancelled' FOR UPDATE`,
        [saleId],
      );
      if (!saleRes.rows[0]) throw new NotFoundException('Venta no encontrada o cancelada.');

      await client.query(
        `INSERT INTO sale_payments (sale_id, method, amount, reference)
         VALUES ($1, $2, $3, $4)`,
        [saleId, paymentDto.method, paymentDto.amount, paymentDto.reference ?? null],
      );

      // Recalcular payment_status
      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM sale_payments WHERE sale_id = $1`,
        [saleId],
      );
      const totalPaid = Number(paidRes.rows[0].total_paid);
      const totalAmount = Number(saleRes.rows[0].total_amount);

      let paymentStatus = 'pending';
      if (totalPaid >= totalAmount) paymentStatus = 'paid';
      else if (totalPaid > 0) paymentStatus = 'partial';

      await client.query(
        `UPDATE sales SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [paymentStatus, saleId],
      );

      await client.query('COMMIT');
      return { success: true, payment_status: paymentStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Error al registrar pago.');
    } finally {
      client.release();
    }
  }

  // ─── Cancelar venta y revertir stock ──────────────────────────────────────
  async cancel(id: string) {
    const client = await (this.db as any).pool.connect();
    try {
      await client.query('BEGIN');

      const saleRes = await client.query(
        `SELECT status FROM sales WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!saleRes.rows[0]) throw new NotFoundException('Venta no encontrada.');
      if (saleRes.rows[0].status === 'cancelled') {
        throw new BadRequestException('La venta ya está cancelada.');
      }

      // Revertir stock de todos los items
      const itemsRes = await client.query(
        `SELECT si.batch_id, si.quantity, i.id as inventory_id 
         FROM sales_items si
         JOIN inventory i ON si.batch_id = i.batch_id
         WHERE si.sale_id = $1`,
        [id],
      );
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE inventory SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [item.quantity, item.inventory_id],
        );

        // REGISTRAR REVERSIÓN (Trazabilidad Fase 1)
        await this.stockMovements.create(client, {
          inventory_id: item.inventory_id,
          batch_id: item.batch_id,
          movement_type: 'return', // O 'adjustment' según se prefiera para cancelaciones
          quantity_change: item.quantity,
          reference_id: id,
          notes: `Cancelación de venta ${id}`
        });
      }

      // Cancelar venta
      await client.query(
        `UPDATE sales SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id],
      );

      await client.query('COMMIT');
      return { success: true, message: 'Venta cancelada y stock revertido.' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Error al cancelar venta.');
    } finally {
      client.release();
    }
  }

  // ─── KPIs / Resumen ───────────────────────────────────────────────────────
  async getSummary() {
    const today = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE DATE(sale_date) = CURRENT_DATE AND status != 'cancelled'
    `);
    const week = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE sale_date >= DATE_TRUNC('week', CURRENT_DATE) AND status != 'cancelled'
    `);
    const month = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled'
    `);
    const topProducts = await this.db.query(`
      SELECT p.name, SUM(si.quantity)::int AS units_sold, SUM(si.total_amount)::numeric AS revenue
      FROM sales_items si
      JOIN product_batches pb ON si.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status != 'cancelled'
        AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY p.name
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    return {
      today: today.rows[0],
      week: week.rows[0],
      month: month.rows[0],
      top_products: topProducts.rows,
    };
  }
}
