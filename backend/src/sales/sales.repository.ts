import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StockMovementsRepository } from '../inventory/stock-movements.repository';
import { InvoicesRepository } from './invoices.repository';
import { decrementInventory } from '../common/logistics-idempotency';

const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

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
  async findAll(companyId:string,branchId?:string|null) {
    const res = await this.db.query(`
      SELECT 
        s.id, s.sale_number, s.sale_date, s.status, s.payment_status,
        s.subtotal, s.discount, s.tax, s.total_amount, s.notes, s.created_at,s.price_list_name_snapshot,s.price_list_currency_snapshot,s.price_exchange_rate_snapshot,
        c.name AS customer_name, c.id AS customer_id,
        COUNT(si.id)::int AS items_count
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sales_items si ON si.sale_id = s.id
      WHERE s.company_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2)
      GROUP BY s.id, c.name, c.id
      ORDER BY s.created_at DESC
    `,[companyId,branchId||null]);
    return res.rows;
  }

  // ─── Obtener venta por ID con items y pagos ────────────────────────────────
  async findById(companyId:string,id: string,branchId?:string|null) {
    const saleRes = await this.db.query(
      `SELECT 
        s.*, 
        c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1 AND s.company_id=$2 AND ($3::uuid IS NULL OR s.branch_id=$3)`,
      [id,companyId,branchId||null],
    );
    if (!saleRes.rows[0]) throw new NotFoundException('Venta no encontrada');

    const itemsRes = await this.db.query(
      `SELECT 
        si.id, si.quantity, si.input_quantity, si.unit_code_snapshot,si.conversion_factor_snapshot,si.unit_price,si.list_unit_price_snapshot,si.price_currency_snapshot, si.discount, si.total_amount,
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
        notes = null,
        user_id = null,
        pos_terminal = null,
        cashier_id = null,
        company_id,
        branch_id,
        price_list_id = null,
        user_roles = [],
      } = saleData;
      const canOverrideDiscount=Array.isArray(user_roles)&&user_roles.some((role:string)=>['admin','erp_admin'].includes(role));

      if(!company_id)throw new BadRequestException('La sesión no tiene empresa activa.');
      const branch=await client.query(`SELECT id,code FROM branches WHERE company_id=$1 AND is_active=true AND ($2::uuid IS NULL OR id=$2) ORDER BY CASE WHEN code='MATRIZ' THEN 0 ELSE 1 END LIMIT 1`,[company_id,branch_id||null]);
      if(!branch.rowCount)throw new BadRequestException('No existe una sucursal activa para registrar esta venta.');
      let selectedPriceList:any=null;
      if(customer_id){const customer=await client.query('SELECT id,is_active,customer_type,default_discount FROM customers WHERE id=$1 AND company_id=$2',[customer_id,company_id]);if(!customer.rowCount)throw new BadRequestException('El cliente no pertenece a esta empresa.');if(!customer.rows[0].is_active)throw new BadRequestException('No se puede vender a un cliente inactivo.');}
      if(price_list_id){
        const result=await client.query(`SELECT l.* FROM product_price_lists l LEFT JOIN customers c ON c.id=$3 AND c.company_id=l.company_id
          WHERE l.id=$1 AND l.company_id=$2 AND l.is_active AND l.approval_status='approved'
          AND (l.starts_at IS NULL OR l.starts_at<=CURRENT_DATE) AND (l.ends_at IS NULL OR l.ends_at>=CURRENT_DATE)
          AND (l.customer_id IS NULL OR l.customer_id=$3) AND (l.customer_segment IS NULL OR l.customer_segment=c.customer_type)
          AND (l.branch_id IS NULL OR l.branch_id=$4)`,[price_list_id,company_id,customer_id||null,branch.rows[0].id]);
        if(!result.rowCount)throw new BadRequestException('La lista de precios no está aprobada o no corresponde al cliente/sucursal.');
        selectedPriceList=result.rows[0];
        if(selectedPriceList.currency!=='USD')throw new BadRequestException('La venta requiere una lista en USD; configura una conversión monetaria antes de usar otra moneda.');
        if(!canOverrideDiscount&&Number(discount)>Number(selectedPriceList.max_discount_percent))throw new BadRequestException('El descuento general supera la política autorizada de la lista.');
      }
      if(!selectedPriceList&&!canOverrideDiscount&&Number(discount)>0)throw new BadRequestException('Selecciona una lista de precios aprobada para aplicar descuentos.');

      if (!items || items.length === 0) {
        throw new BadRequestException('La venta debe tener al menos un producto.');
      }
      if (!Number.isFinite(Number(discount)) || Number(discount) < 0 || Number(discount) > 100) {
        throw new BadRequestException('El descuento general debe estar entre 0 y 100%.');
      }

      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`sale-number-${new Date().getFullYear()}`]);
      const saleNumber = await this.generateSaleNumber(client);
      let subtotal = 0;

      // 1. Cabecera provisional (total se actualiza al final)
      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, customer_id, user_id, sale_date, status, company_id, branch_id,
          payment_status, subtotal, discount, tax, total_amount, 
          notes, pos_terminal, cashier_id, price_list_id
        )
         VALUES ($1, $2, $3, $4, 'completed', $5, $6, 'pending', 0, $7, 0, 0, $8, $9, $10, $11)
         RETURNING *`,
        [
          saleNumber, customer_id, user_id, sale_date,
          company_id,branch.rows[0].id,discount, notes, pos_terminal, cashier_id, price_list_id
        ],
      );
      const saleId = saleRes.rows[0].id;

      // 2. FEFO por cada producto
      for (const item of items) {
        const inputQuantity=Number(item.quantity);
        if (!Number.isFinite(inputQuantity)||inputQuantity<=0) {
          throw new BadRequestException('La cantidad de cada producto debe ser un número positivo.');
        }
        let conversionFactor=1, unitCode='unidad', unitId:string|null=null;
        let precisionScale=0;
        if(item.unit_id){
          const unit=await client.query(`SELECT id,unit_code,is_base,precision_scale FROM product_units WHERE id=$1 AND company_id=$2 AND product_id=$3 AND is_active`,[item.unit_id,company_id,item.product_id]);
          if(!unit.rowCount)throw new BadRequestException('La unidad elegida no pertenece al producto o está inactiva.');
          unitId=unit.rows[0].id;unitCode=unit.rows[0].unit_code;
          precisionScale=Number(unit.rows[0].precision_scale||0);
          if(!unit.rows[0].is_base){const base=await client.query('SELECT id FROM product_units WHERE company_id=$1 AND product_id=$2 AND is_base AND is_active',[company_id,item.product_id]);if(!base.rowCount)throw new BadRequestException('Configura una unidad base antes de vender con conversiones.');
            const conversion=await client.query(`SELECT factor FROM product_unit_conversions WHERE company_id=$1 AND product_id=$2 AND from_unit_id=$3 AND to_unit_id=$4 AND status='approved' AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY valid_from DESC LIMIT 1`,[company_id,item.product_id,unitId,base.rows[0].id]);if(!conversion.rowCount)throw new BadRequestException(`No existe conversión aprobada vigente de ${unitCode} a la unidad base.`);conversionFactor=Number(conversion.rows[0].factor);}
        }
        if(Math.abs(inputQuantity*Math.pow(10,precisionScale)-Math.round(inputQuantity*Math.pow(10,precisionScale)))>1e-7)throw new BadRequestException(`La unidad ${unitCode} admite hasta ${precisionScale} decimales.`);
        const baseQuantity=inputQuantity*conversionFactor;
        if(!Number.isSafeInteger(baseQuantity))throw new BadRequestException(`La cantidad en unidad base debe ser entera; ${inputQuantity} ${unitCode} equivale a ${baseQuantity} unidades.`);
        let qtyNeeded = baseQuantity;
        let itemDiscount = Number(item.discount ?? 0);
        if (!Number.isFinite(itemDiscount) || itemDiscount < 0 || itemDiscount > 100) {
          throw new BadRequestException('El descuento de cada producto debe estar entre 0 y 100%.');
        }
        if(!selectedPriceList&&!canOverrideDiscount&&itemDiscount>0)throw new BadRequestException('Selecciona una lista de precios aprobada para aplicar descuentos.');
        let priceRule:any=null;
        if(selectedPriceList){
            const rule=await client.query(`SELECT r.* FROM product_price_rules r JOIN product_price_lists l ON l.id=r.price_list_id
            WHERE r.company_id=$1 AND r.price_list_id=$2 AND r.product_id=$3 AND r.min_quantity<=$4
            AND (r.starts_at IS NULL OR r.starts_at<=CURRENT_DATE) AND (r.ends_at IS NULL OR r.ends_at>=CURRENT_DATE)
          ORDER BY r.min_quantity DESC LIMIT 1`,[company_id,price_list_id,item.product_id,inputQuantity]);
          if(rule.rowCount)priceRule=rule.rows[0];
          if(priceRule){
            const automatic=Number(priceRule.discount_percent||0);
            itemDiscount=100*(1-(1-automatic/100)*(1-itemDiscount/100));
          }
          const effectiveDiscount=100*(1-(1-itemDiscount/100)*(1-Number(discount)/100));
          if(!canOverrideDiscount&&effectiveDiscount>Number(selectedPriceList.max_discount_percent))throw new BadRequestException('El descuento por volumen, por línea y general supera la política autorizada.');
        }

        // Buscar lotes ordenados por fecha de vencimiento (FEFO) - SOLO BODERAS FISICAS
        const batchesRes = await client.query(
          `SELECT i.id AS inventory_id, i.batch_id, i.quantity, i.storage_location_id,
                  b.expiration_date, p.name AS product_name,
                  p.sale_price, p.price, p.iva_rate
           FROM inventory i
           JOIN product_batches b ON i.batch_id = b.id
           JOIN products p ON b.product_id = p.id
           JOIN warehouses w ON i.warehouse_id = w.id
           JOIN storage_locations sl ON sl.id=i.storage_location_id
           WHERE b.product_id = $1 AND p.company_id=$2 AND w.company_id=$2 AND w.branch_id=$3 AND i.quantity > 0 AND i.stock_status='available' AND sl.status='active' AND w.type = 'physical'
           ORDER BY b.expiration_date ASC
           FOR UPDATE`,
          [item.product_id,company_id,branch.rows[0].id],
        );

        const batches = batchesRes.rows;

        for (const batch of batches) {
          if (qtyNeeded === 0) break;
          const deductQty = Math.min(batch.quantity, qtyNeeded);

          // Descontar stock
          await decrementInventory(client,batch.inventory_id,Number(deductQty));

          const listUnitPrice=priceRule?Number(priceRule.unit_price):Number(batch.sale_price||batch.price||0);
          let unitPrice = listUnitPrice*conversionFactor;
          if(priceRule&&selectedPriceList.rounding_rule==='whole')unitPrice=Math.round(unitPrice);
          else if(priceRule&&selectedPriceList.rounding_rule==='five_cents')unitPrice=Math.round(unitPrice*20)/20;
          else unitPrice=roundCurrency(unitPrice);
          const taxRate = Number(batch.iva_rate ?? 13);
          if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 15) {
            throw new BadRequestException(`Precio o tarifa IVA inválidos para "${batch.product_name}".`);
          }
          const linePriceBase = deductQty * unitPrice;
          const lineDiscount = linePriceBase * (itemDiscount / 100);
          const lineTotal = roundCurrency(linePriceBase - lineDiscount);
          subtotal += lineTotal;
          const lineTax = roundCurrency(lineTotal * (1 - Number(discount) / 100) * (taxRate / 100));

          // Insertar item
          await client.query(
            `INSERT INTO sales_items (sale_id, batch_id, inventory_id, storage_location_id, quantity, input_quantity,product_unit_id,unit_code_snapshot,conversion_factor_snapshot,unit_price,list_unit_price_snapshot,price_currency_snapshot,discount, total_amount, tax_rate, tax_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14,$15)`,
            [saleId,batch.batch_id,batch.inventory_id,batch.storage_location_id,deductQty,inputQuantity,unitId,unitCode,conversionFactor,unitPrice,listUnitPrice*conversionFactor,itemDiscount,lineTotal,taxRate,lineTax],
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
      const discountAmount = roundCurrency(subtotal * (Number(discount) / 100));
      const subtotalAfterDiscount = roundCurrency(subtotal - discountAmount);
      const taxResult = await client.query(
        `SELECT COALESCE(SUM(tax_amount), 0) AS tax_amount FROM sales_items WHERE sale_id = $1`,
        [saleId],
      );
      const taxAmount = Number(taxResult.rows[0].tax_amount);
      const totalAmount = roundCurrency(subtotalAfterDiscount + taxAmount);

      const cogsRes = await client.query(
        `SELECT COALESCE(SUM(si.quantity * pb.unit_cost), 0)::numeric(15,4) AS cogs
         FROM sales_items si
         JOIN product_batches pb ON pb.id = si.batch_id
         WHERE si.sale_id = $1`,
        [saleId],
      );
      const cogsTotal = Number(cogsRes.rows[0]?.cogs || 0);
      const grossMargin = Number(subtotalAfterDiscount - cogsTotal);

      const ccRes = await client.query(
        `SELECT id FROM cost_centers WHERE company_id = $1 AND code IN ('CC-COM', 'CC-OPER') ORDER BY code ASC LIMIT 1`,
        [company_id],
      );
      const costCenterId = ccRes.rows[0]?.id || null;

      await client.query(
        `UPDATE sales SET subtotal = $1, discount = $2, tax = $3, total_amount = $4,
          cogs_total = $5, gross_margin = $6, cost_center_id = COALESCE(cost_center_id, $7),
          price_list_name_snapshot=$8,price_list_currency_snapshot=$9,price_exchange_rate_snapshot=$10 WHERE id = $11`,
        [subtotal, discountAmount, taxAmount, totalAmount, cogsTotal, grossMargin, costCenterId, selectedPriceList?.name||null,selectedPriceList?.currency||'USD',1, saleId],
      );

      // 4. Registrar pagos
      let totalPaid = 0;
      for (const pay of payments) {
        const amount = Number(pay.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new BadRequestException('Cada pago debe tener un monto mayor a cero.');
        }
        if (!['cash', 'card', 'transfer', 'mobile_payment'].includes(pay.method)) {
          throw new BadRequestException('Método de pago no válido.');
        }
        if (totalPaid + amount > totalAmount + 0.01) {
          throw new BadRequestException('El pago supera el total de la venta.');
        }
        await client.query(
          `INSERT INTO sale_payments (sale_id, method, amount, reference, cost_center_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [saleId, pay.method, amount, pay.reference ?? null, costCenterId],
        );
        totalPaid += amount;
      }

      // 5. Calcular payment_status
      let paymentStatus = 'pending';
      if (totalPaid >= totalAmount) paymentStatus = 'paid';
      else if (totalPaid > 0) paymentStatus = 'partial';

      await client.query(
        `UPDATE sales SET payment_status = $1 WHERE id = $2`,
        [paymentStatus, saleId],
      );

      // Keep an internal reference separate from an SRI number. Electronic
      // issuance remains pending until the configured SRI connector authorizes it.
      const internalNumber = await this.invoices.generateNextInternalNumber(
        client,
        company_id,
        branch.rows[0].id,
        branch.rows[0].code,
        sale_date,
      );
      await this.invoices.createInvoice(client, {
        sale_id: saleId,
        company_id,
        branch_id: branch.rows[0].id,
        internal_number: internalNumber,
        status: 'not_issued',
      });

      await client.query('COMMIT');

      return {
        success: true,
        message: `Venta ${saleNumber} creada correctamente.`,
        sale_id: saleId,
        sale_number: saleNumber,
        invoice_internal_number: internalNumber,
        invoice_status: 'not_issued',
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
  async addPayment(companyId:string,saleId: string, paymentDto: any,branchId?:string|null) {
    const client = await (this.db as any).pool.connect();
    try {
      await client.query('BEGIN');

      const saleRes = await client.query(
        `SELECT total_amount FROM sales WHERE id = $1 AND company_id=$2 AND status != 'cancelled' AND ($3::uuid IS NULL OR branch_id=$3) FOR UPDATE`,
        [saleId,companyId,branchId||null],
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
  async cancel(companyId:string,id: string,branchId?:string|null) {
    const client = await (this.db as any).pool.connect();
    try {
      await client.query('BEGIN');

      const saleRes = await client.query(
        `SELECT status FROM sales WHERE id = $1 AND company_id=$2 AND ($3::uuid IS NULL OR branch_id=$3) FOR UPDATE`,
        [id,companyId,branchId||null],
      );
      if (!saleRes.rows[0]) throw new NotFoundException('Venta no encontrada.');
      if (saleRes.rows[0].status === 'cancelled') {
        throw new BadRequestException('La venta ya está cancelada.');
      }

      const fulfillment = await client.query(`SELECT status FROM fulfillment_orders WHERE sale_id=$1 AND status<>'cancelled' LIMIT 1`,[id]);
      if (fulfillment.rowCount) throw new BadRequestException('No se puede anular la venta porque ya inició su preparación o despacho. Cancela primero el flujo logístico.');

      // Revertir stock de todos los items
      const itemsRes = await client.query(
        `SELECT si.batch_id, si.quantity, i.id as inventory_id 
         FROM sales_items si
         JOIN inventory i ON i.id = si.inventory_id
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
  async getSummary(companyId:string,branchId?:string|null) {
    const today = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE DATE(sale_date) = CURRENT_DATE AND status != 'cancelled' AND company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2)
    `,[companyId,branchId||null]);
    const week = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE sale_date >= DATE_TRUNC('week', CURRENT_DATE) AND status != 'cancelled' AND company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2)
    `,[companyId,branchId||null]);
    const month = await this.db.query(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM sales
      WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled' AND company_id=$1 AND ($2::uuid IS NULL OR branch_id=$2)
    `,[companyId,branchId||null]);
    const topProducts = await this.db.query(`
      SELECT p.name, SUM(si.quantity)::int AS units_sold, SUM(si.total_amount)::numeric AS revenue
      FROM sales_items si
      JOIN product_batches pb ON si.batch_id = pb.id
      JOIN products p ON pb.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status != 'cancelled'
        AND s.company_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2)
        AND s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY p.name
      ORDER BY units_sold DESC
      LIMIT 5
    `,[companyId,branchId||null]);

    return {
      today: today.rows[0],
      week: week.rows[0],
      month: month.rows[0],
      top_products: topProducts.rows,
    };
  }
}
