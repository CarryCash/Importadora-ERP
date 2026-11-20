import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InventoryRepository {
  constructor(private readonly db: DatabaseService) {}

  async getProductTotals(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    const result = await this.db.query(
      `
      SELECT p.id AS product_id, COALESCE(SUM(i.quantity) FILTER (WHERE w.id IS NOT NULL),0)::numeric AS total_stock
      FROM products p
      LEFT JOIN product_batches b ON b.product_id=p.id
      LEFT JOIN inventory i ON i.batch_id=b.id
      LEFT JOIN warehouses w ON w.id=i.warehouse_id AND w.company_id=$1
        AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)
      WHERE p.company_id=$1
      GROUP BY p.id`,
      [companyId, branchId || null, restrictedWarehouseId || null],
    );
    return result.rows;
  }

  async getStats(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    const query = `
      WITH product_totals AS (
        SELECT 
          p.id, 
          p.min_stock, 
          SUM(i.quantity) FILTER(WHERE w.id IS NOT NULL) as total_quantity
        FROM products p
        LEFT JOIN product_batches b ON p.id = b.product_id
        LEFT JOIN inventory i ON b.id = i.batch_id
        LEFT JOIN warehouses w ON w.id=i.warehouse_id AND w.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)
        WHERE p.company_id=$1
        GROUP BY p.id, p.min_stock
      ),
      fifo_summary AS (
        SELECT 
          COALESCE(SUM(remaining_quantity * functional_unit_cost), 0) AS total_fifo_valuation
        FROM inventory_cost_layers l
        LEFT JOIN warehouses w ON w.id = l.warehouse_id
        WHERE l.company_id = $1 AND l.status = 'active'
          AND ($2::uuid IS NULL OR w.branch_id = $2) AND ($3::uuid IS NULL OR w.id = $3)
      )
      SELECT 
        (SELECT COUNT(*) FROM inventory_lots lot WHERE lot.company_id=$1 AND lot.expiration_date < CURRENT_DATE AND lot.current_quantity > 0) as expired,
        (SELECT COUNT(*) FROM inventory_lots lot WHERE lot.company_id=$1 AND lot.expiration_date >= CURRENT_DATE AND lot.expiration_date <= CURRENT_DATE + INTERVAL '90 days' AND lot.current_quantity > 0) as critical,
        (SELECT COUNT(*) FROM product_totals WHERE total_quantity <= min_stock) as low_stock_count,
        (SELECT COALESCE(SUM(physical_stock), 0) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)) as total_quantity,
        (SELECT COALESCE(SUM(reserved_stock), 0) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)) as total_reserved,
        (SELECT COALESCE(SUM(blocked_stock), 0) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)) as total_blocked,
        (SELECT COALESCE(SUM(available_stock), 0) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)) as total_available,
        (SELECT total_fifo_valuation FROM fifo_summary) as total_valuation,
        (SELECT COUNT(DISTINCT product_id) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3) AND b.physical_stock > 0) as total_items
    `;
    const res = await this.db.query(query, [companyId, branchId || null, restrictedWarehouseId || null]);
    const row = res.rows[0];
    return {
      total: Number(row.total_items || 0),
      expired: Number(row.expired || 0),
      critical: Number(row.critical || 0),
      lowStockCount: Number(row.low_stock_count || 0),
      totalQuantity: Number(row.total_quantity || 0),
      totalReserved: Number(row.total_reserved || 0),
      totalBlocked: Number(row.total_blocked || 0),
      totalAvailable: Number(row.total_available || 0),
      totalValuation: Math.round((Number(row.total_valuation || 0) + Number.EPSILON) * 100) / 100,
    };
  }

  /**
   * Consulta multinivel de existencias sobre inventory_balances con proyección FIFO.
   */
  async findBalances(
    companyId: string,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      warehouseId?: string;
      locationId?: string;
      status?: string;
      branchId?: string | null;
      restrictedWarehouseId?: string | null;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const params: any[] = [companyId];
    const where: string[] = ['b.company_id = $1'];

    if (filters.branchId) {
      params.push(filters.branchId);
      where.push(`w.branch_id = $${params.length}`);
    }
    if (filters.restrictedWarehouseId) {
      params.push(filters.restrictedWarehouseId);
      where.push(`w.id = $${params.length}`);
    }
    if (filters.warehouseId && filters.warehouseId !== 'all') {
      params.push(filters.warehouseId);
      where.push(`b.warehouse_id = $${params.length}`);
    }
    if (filters.locationId) {
      params.push(filters.locationId);
      where.push(`b.location_id = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR lot.lot_number ILIKE $${params.length} OR loc.code ILIKE $${params.length})`);
    }

    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
      FROM inventory_balances b
      JOIN products p ON p.id = b.product_id
      JOIN warehouses w ON w.id = b.warehouse_id
      JOIN storage_locations loc ON loc.id = b.location_id
      LEFT JOIN inventory_lots lot ON lot.id = b.lot_id
      ${whereStr}
    `;

    const dataQuery = `
      SELECT 
        b.id AS balance_id,
        b.physical_stock, b.reserved_stock, b.blocked_stock, b.available_stock,
        b.in_transit_stock, b.in_receipt_stock, b.last_reconciled_at,
        p.id AS product_id, p.name AS product_name, p.sku, p.tracking_type,
        p.min_stock, p.lead_time_days,
        w.id AS warehouse_id, w.name AS warehouse_name, w.operating_type AS warehouse_type,
        loc.id AS location_id, loc.code AS location_code, loc.name AS location_name,
        loc.zone, loc.aisle, loc.rack, loc.level, loc.position,
        lot.id AS lot_id, lot.lot_number, lot.expiration_date, lot.status AS lot_status,
        COALESCE((
          SELECT ROUND(AVG(l.functional_unit_cost), 4)
          FROM inventory_cost_layers l
          WHERE l.product_id = p.id AND l.company_id = $1 AND l.status = 'active'
        ), 0) AS unit_cost_fifo
      FROM inventory_balances b
      JOIN products p ON p.id = b.product_id
      JOIN warehouses w ON w.id = b.warehouse_id
      JOIN storage_locations loc ON loc.id = b.location_id
      LEFT JOIN inventory_lots lot ON lot.id = b.lot_id
      ${whereStr}
      ORDER BY p.name ASC, w.name ASC, loc.code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const [countRes, dataRes] = await Promise.all([
      this.db.query(countQuery, countParams),
      this.db.query(dataQuery, params),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    return {
      data: dataRes.rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Ficha Integral del Producto (360°) con soporte para las 10 pestañas operativas y financieras.
   */
  async getProduct360(companyId: string, productId: string, branchId?: string | null, warehouseId?: string | null) {
    // 1. Resumen general del producto
    const productRes = await this.db.query(
      `SELECT p.*, c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN product_brands b ON b.id = p.brand_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [productId, companyId],
    );
    if (!productRes.rowCount) throw new NotFoundException('Producto no encontrado.');
    const product = productRes.rows[0];

    // 2. Existencias por bodega
    const byWarehouseRes = await this.db.query(
      `SELECT 
         w.id AS warehouse_id, w.name AS warehouse_name, w.operating_type,
         COALESCE(SUM(b.physical_stock), 0) AS physical_stock,
         COALESCE(SUM(b.reserved_stock), 0) AS reserved_stock,
         COALESCE(SUM(b.blocked_stock), 0) AS blocked_stock,
         COALESCE(SUM(b.available_stock), 0) AS available_stock,
         COALESCE(SUM(b.in_transit_stock), 0) AS in_transit_stock
       FROM warehouses w
       LEFT JOIN inventory_balances b ON b.warehouse_id = w.id AND b.product_id = $1
       WHERE w.company_id = $2 AND ($3::uuid IS NULL OR w.branch_id = $3)
       GROUP BY w.id, w.name, w.operating_type
       ORDER BY w.name`,
      [productId, companyId, branchId || null],
    );

    // 3. Existencias por ubicación detallada
    const byLocationRes = await this.db.query(
      `SELECT 
         loc.id AS location_id, loc.code AS location_code, loc.name AS location_name,
         loc.zone, loc.aisle, loc.rack, loc.level, loc.position,
         w.name AS warehouse_name,
         b.physical_stock, b.reserved_stock, b.available_stock,
         lot.lot_number
       FROM inventory_balances b
       JOIN storage_locations loc ON loc.id = b.location_id
       JOIN warehouses w ON w.id = b.warehouse_id
       LEFT JOIN inventory_lots lot ON lot.id = b.lot_id
       WHERE b.product_id = $1 AND b.company_id = $2 AND b.physical_stock > 0
       ORDER BY w.name, loc.code`,
      [productId, companyId],
    );

    // 4. Lotes
    const lotsRes = await this.db.query(
      `SELECT * FROM inventory_lots WHERE product_id = $1 AND company_id = $2 ORDER BY expiration_date ASC NULLS LAST`,
      [productId, companyId],
    );

    // 5. Números de serie
    const serialsRes = await this.db.query(
      `SELECT s.*, w.name AS warehouse_name, loc.code AS location_code
       FROM inventory_serials s
       LEFT JOIN warehouses w ON w.id = s.current_warehouse_id
       LEFT JOIN storage_locations loc ON loc.id = s.current_location_id
       WHERE s.product_id = $1 AND s.company_id = $2
       ORDER BY s.serial_number`,
      [productId, companyId],
    );

    // 6. Kardex cronológico
    const kardexRes = await this.getEnterpriseKardex(companyId, productId, warehouseId || undefined);

    // 7. Capas FIFO
    const layersRes = await this.db.query(
      `SELECT l.*, w.name AS warehouse_name, loc.code AS location_code
       FROM inventory_cost_layers l
       LEFT JOIN warehouses w ON w.id = l.warehouse_id
       LEFT JOIN storage_locations loc ON loc.id = l.location_id
       WHERE l.product_id = $1 AND l.company_id = $2
       ORDER BY l.effective_date DESC`,
      [productId, companyId],
    );

    // 8. Reservas activas
    const reservationsRes = await this.db.query(
      `SELECT r.reservation_number, r.source_doc_type, r.status, r.expires_at,
              rl.quantity, rl.fulfilled_quantity, w.name AS warehouse_name
       FROM inventory_reservation_lines rl
       JOIN inventory_reservations r ON r.id = rl.reservation_id
       JOIN warehouses w ON w.id = r.warehouse_id
       WHERE rl.product_id = $1 AND r.company_id = $2 AND r.status IN ('reserved', 'partially_fulfilled')
       ORDER BY r.created_at DESC`,
      [productId, companyId],
    );

    // 9. Documentos relacionados
    const docsRes = await this.db.query(
      `SELECT m.movement_number, m.operation_type, m.confirmed_at, ml.quantity, ml.unit_cost, ml.total_cost,
              m.reference_doc_type, m.reference_doc_id
       FROM inventory_movement_lines ml
       JOIN inventory_movements m ON m.id = ml.movement_id
       WHERE ml.product_id = $1 AND m.company_id = $2
       ORDER BY m.confirmed_at DESC LIMIT 50`,
      [productId, companyId],
    );

    // 10. Auditoría
    const auditRes = await this.db.query(
      `SELECT l.*, u.username, u.full_name
       FROM inventory_audit_log l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.company_id = $1 AND (l.entity_id = $2 OR (l.new_state::text ILIKE $3))
       ORDER BY l.created_at DESC LIMIT 50`,
      [companyId, productId, `%${productId}%`],
    );

    return {
      product,
      byWarehouse: byWarehouseRes.rows,
      byLocation: byLocationRes.rows,
      lots: lotsRes.rows,
      serials: serialsRes.rows,
      kardex: kardexRes,
      costLayers: layersRes.rows,
      reservations: reservationsRes.rows,
      relatedDocuments: docsRes.rows,
      audit: auditRes.rows,
    };
  }

  /**
   * Kardex cronológico inmutable con entradas, salidas, costos y cálculo de saldos.
   */
  async getEnterpriseKardex(companyId: string, productId: string, warehouseId?: string) {
    const params: any[] = [companyId, productId];
    let whFilter = '';
    if (warehouseId && warehouseId !== 'all') {
      params.push(warehouseId);
      whFilter = `AND (ml.from_warehouse_id = $${params.length} OR ml.to_warehouse_id = $${params.length})`;
    }

    const query = `
      SELECT 
        m.confirmed_at AS movement_date,
        m.movement_number,
        m.operation_type,
        m.reference_doc_type,
        m.reference_doc_id,
        m.notes,
        u.username AS confirmed_by_user,
        ml.quantity,
        ml.unit_cost,
        ml.total_cost,
        from_w.name AS from_warehouse_name,
        from_loc.code AS from_location_code,
        to_w.name AS to_warehouse_name,
        to_loc.code AS to_location_code,
        lot.lot_number,
        CASE 
          WHEN m.operation_type IN ('receipt', 'transfer_in', 'adjustment_positive', 'return_customer') THEN ml.quantity 
          ELSE 0 
        END AS quantity_in,
        CASE 
          WHEN m.operation_type IN ('issue', 'transfer_out', 'adjustment_negative', 'return_supplier') THEN ml.quantity 
          ELSE 0 
        END AS quantity_out
      FROM inventory_movement_lines ml
      JOIN inventory_movements m ON m.id = ml.movement_id
      LEFT JOIN users u ON u.id = m.confirmed_by
      LEFT JOIN warehouses from_w ON from_w.id = ml.from_warehouse_id
      LEFT JOIN storage_locations from_loc ON from_loc.id = ml.from_location_id
      LEFT JOIN warehouses to_w ON to_w.id = ml.to_warehouse_id
      LEFT JOIN storage_locations to_loc ON to_loc.id = ml.to_location_id
      LEFT JOIN inventory_lots lot ON lot.id = ml.lot_id
      WHERE m.company_id = $1 AND ml.product_id = $2 AND m.status = 'confirmed' ${whFilter}
      ORDER BY m.confirmed_at ASC, ml.created_at ASC
    `;

    const res = await this.db.query(query, params);
    const rows = res.rows;

    // Calcular saldo running cronológico
    let runningBalance = 0;
    return rows.map((r) => {
      const qIn = Number(r.quantity_in || 0);
      const qOut = Number(r.quantity_out || 0);
      runningBalance += qIn - qOut;
      return {
        ...r,
        running_balance: runningBalance,
      };
    });
  }

  /**
   * Métodos heredados para compatibilidad directa con código existente
   */
  async findAll(
    companyId: string,
    page: number = 1,
    limit: number = 50,
    search: string = '',
    warehouseId: string = '',
    status: string = '',
    branchId?: string | null,
    restrictedWarehouseId?: string | null,
  ) {
    return this.findBalances(companyId, {
      page,
      limit,
      search,
      warehouseId,
      status,
      branchId,
      restrictedWarehouseId,
    });
  }

  async findByProduct(companyId: string, productId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    const query = `
      SELECT 
        b.id as balance_id, b.physical_stock as quantity, loc.code as bin_location,
        lot.lot_number as batch_number, lot.expiration_date,
        w.name as warehouse_name
      FROM inventory_balances b
      JOIN warehouses w ON w.id = b.warehouse_id
      JOIN storage_locations loc ON loc.id = b.location_id
      LEFT JOIN inventory_lots lot ON lot.id = b.lot_id
      WHERE b.product_id = $2 AND b.company_id = $1 
        AND ($3::uuid IS NULL OR w.branch_id = $3) AND ($4::uuid IS NULL OR w.id = $4)
      ORDER BY lot.expiration_date ASC NULLS LAST
    `;
    const result = await this.db.query(query, [companyId, productId, branchId || null, restrictedWarehouseId || null]);
    return result.rows;
  }

  async getBatchTraceability(companyId: string, batchId: string, branchId?: string | null) {
    const query = `
      SELECT 
        s.sale_number, s.sale_date, si.quantity as quantity_delivered,
        c.name as customer_name, c.phone as customer_phone, c.business_name
      FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN customers c ON s.customer_id = c.id
      WHERE si.batch_id = $1 AND s.company_id = $2 AND ($3::uuid IS NULL OR s.branch_id = $3)
      ORDER BY s.sale_date DESC
    `;
    const result = await this.db.query(query, [batchId, companyId, branchId || null]);
    return result.rows;
  }

  async updateQuantity(inventoryId: string, newQuantity: number, client?: any) {
    const query = `UPDATE inventory SET quantity = $1, last_updated = NOW() WHERE id = $2 RETURNING *`;
    const params = [newQuantity, inventoryId];
    const res = client ? await client.query(query, params) : await this.db.query(query, params);
    return res.rows[0];
  }

  async updateReorderSettings(companyId: string, productId: string, minStock: number, lead_time_days: number) {
    const query = `UPDATE products SET min_stock = $1, lead_time_days = $2 WHERE id = $3 AND company_id=$4 RETURNING *`;
    const res = await this.db.query(query, [minStock, lead_time_days, productId, companyId]);
    return res.rows[0];
  }

  async getForecastingReport(companyId: string, branchId?: string | null, restrictedWarehouseId?: string | null) {
    const query = `
      WITH product_sales AS (
        SELECT 
          pb.product_id,
          SUM(si.quantity) as total_sold_30d,
          (SUM(si.quantity) / 30.0) as ads
        FROM sales_items si
        JOIN product_batches pb ON si.batch_id = pb.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days' AND s.company_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2)
        GROUP BY pb.product_id
      ),
      current_inventory AS (
        SELECT 
          b.product_id,
          SUM(b.physical_stock) as total_stock
        FROM inventory_balances b
        JOIN warehouses w ON w.id=b.warehouse_id
        WHERE b.company_id=$1 AND ($2::uuid IS NULL OR w.branch_id=$2) AND ($3::uuid IS NULL OR w.id=$3)
        GROUP BY b.product_id
      )
    SELECT 
      p.id as product_id,
      p.name as product_name,
      p.sku,
      p.lead_time_days,
      COALESCE(ci.total_stock, 0) as current_stock,
      COALESCE(ps.ads, 0) as ads,
      COALESCE(ps.total_sold_30d, 0) as total_sold_30d,
      CASE 
        WHEN COALESCE(ps.ads, 0) > 0 THEN (COALESCE(ci.total_stock, 0) / ps.ads)
        ELSE 999 
      END as days_left
    FROM products p
    LEFT JOIN product_sales ps ON p.id = ps.product_id
    LEFT JOIN current_inventory ci ON p.id = ci.product_id
    WHERE p.is_active = true AND p.company_id=$1
    ORDER BY (CASE WHEN COALESCE(ps.ads, 0) > 0 THEN (COALESCE(ci.total_stock, 0) / ps.ads) ELSE 999 END) ASC
    `;
    const res = await this.db.query(query, [companyId, branchId || null, restrictedWarehouseId || null]);
    return res.rows;
  }

  // ─── GESTIÓN DE CONTEOS FÍSICOS Y CONGELAMIENTO TRANSACCIONAL ─────────────

  async listCounts(companyId: string, warehouseId?: string) {
    const params: any[] = [companyId];
    let filter = '';
    if (warehouseId && warehouseId !== 'all') {
      params.push(warehouseId);
      filter = `AND c.warehouse_id = $${params.length}`;
    }

    const query = `
      SELECT 
        c.*,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        u1.full_name AS created_by_name,
        u2.full_name AS reconciled_by_name,
        COUNT(cl.id)::int AS total_lines,
        COUNT(cl.id) FILTER (WHERE cl.counted_quantity IS NOT NULL)::int AS counted_lines,
        COUNT(cl.id) FILTER (WHERE cl.variance <> 0)::int AS variance_lines
      FROM inventory_counts c
      JOIN warehouses w ON w.id = c.warehouse_id
      LEFT JOIN users u1 ON u1.id = c.created_by
      LEFT JOIN users u2 ON u2.id = c.reconciled_by
      LEFT JOIN inventory_count_lines cl ON cl.count_id = c.id
      WHERE c.company_id = $1 ${filter}
      GROUP BY c.id, w.name, w.code, u1.full_name, u2.full_name
      ORDER BY c.created_at DESC
    `;
    const res = await this.db.query(query, params);
    return res.rows;
  }

  async getCount(companyId: string, id: string) {
    const header = await this.db.query(
      `SELECT c.*, w.name AS warehouse_name, w.code AS warehouse_code,
              u1.full_name AS created_by_name, u2.full_name AS reconciled_by_name
       FROM inventory_counts c
       JOIN warehouses w ON w.id = c.warehouse_id
       LEFT JOIN users u1 ON u1.id = c.created_by
       LEFT JOIN users u2 ON u2.id = c.reconciled_by
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId],
    );
    if (!header.rowCount) throw new NotFoundException('Conteo de inventario no encontrado.');

    const lines = await this.db.query(
      `SELECT 
         cl.*,
         p.name AS product_name, p.sku,
         loc.code AS location_code, loc.zone, loc.aisle, loc.rack, loc.level, loc.position,
         lot.lot_number, lot.expiration_date,
         COALESCE((
           SELECT ROUND(AVG(l.functional_unit_cost), 4)
           FROM inventory_cost_layers l
           WHERE l.product_id = p.id AND l.company_id = $1 AND l.status = 'active'
         ), 0) AS unit_cost_fifo
       FROM inventory_count_lines cl
       JOIN products p ON p.id = cl.product_id
       JOIN storage_locations loc ON loc.id = cl.location_id
       LEFT JOIN inventory_lots lot ON lot.id = cl.lot_id
       WHERE cl.count_id = $2
       ORDER BY loc.code ASC, p.name ASC`,
      [companyId, id],
    );

    return {
      ...header.rows[0],
      lines: lines.rows,
    };
  }

  async createCount(
    companyId: string,
    userId: string,
    data: {
      warehouse_id: string;
      count_type: 'full' | 'cyclic';
      notes?: string;
      freeze_locations?: boolean;
      product_ids?: string[];
      category_id?: string;
    },
  ) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      const wh = await client.query('SELECT id, name FROM warehouses WHERE id = $1 AND company_id = $2', [
        data.warehouse_id,
        companyId,
      ]);
      if (!wh.rowCount) throw new NotFoundException('Bodega no encontrada.');

      const seqRes = await client.query("SELECT nextval('inventory_count_number_seq') AS n");
      const year = new Date().getFullYear();
      const countNumber = `CNT-${year}-${String(seqRes.rows[0].n).padStart(5, '0')}`;

      // Crear cabecera con corte transaccional al momento actual
      const headerRes = await client.query(
        `INSERT INTO inventory_counts (
           company_id, warehouse_id, count_number, count_type, status,
           notes, cut_off_date, created_by
         ) VALUES ($1, $2, $3, $4, 'counting', $5, CURRENT_TIMESTAMP, $6)
         RETURNING *`,
        [companyId, data.warehouse_id, countNumber, data.count_type, data.notes || null, userId],
      );
      const countHeader = headerRes.rows[0];

      // Filtro de productos para conteo cíclico
      let productFilter = '';
      const params: any[] = [companyId, data.warehouse_id];
      if (data.count_type === 'cyclic' && data.product_ids && data.product_ids.length > 0) {
        params.push(data.product_ids);
        productFilter = `AND b.product_id = ANY($${params.length}::uuid[])`;
      }

      // Snapshot transaccional de existencias del sistema (Expected Stock)
      await client.query(
        `INSERT INTO inventory_count_lines (
           count_id, product_id, location_id, lot_id, expected_quantity
         )
         SELECT 
           $3, b.product_id, b.location_id, b.lot_id, b.physical_stock
         FROM inventory_balances b
         WHERE b.company_id = $1 AND b.warehouse_id = $2 ${productFilter}
           AND b.physical_stock > 0`,
        [companyId, data.warehouse_id, countHeader.id],
      );

      // Si se activa congelamiento transaccional, marcar stock_status en inventory_balances
      if (data.freeze_locations) {
        await client.query(
          `UPDATE inventory_balances
           SET blocked_stock = blocked_stock + physical_stock
           WHERE company_id = $1 AND warehouse_id = $2 ${productFilter}`,
          params,
        );
      }

      await client.query('COMMIT');
      return this.getCount(companyId, countHeader.id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateCountLines(
    companyId: string,
    countId: string,
    userId: string,
    lines: Array<{ id: string; counted_quantity: number; reason?: string }>,
  ) {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const countCheck = await client.query(
        `SELECT id, status FROM inventory_counts WHERE id = $1 AND company_id = $2 FOR UPDATE`,
        [countId, companyId],
      );
      if (!countCheck.rowCount) throw new NotFoundException('Conteo no encontrado.');
      if (countCheck.rows[0].status === 'reconciled') {
        throw new ConflictException('No se pueden editar las líneas de un conteo ya conciliado.');
      }

      for (const line of lines) {
        await client.query(
          `UPDATE inventory_count_lines
           SET counted_quantity = $1, reason = $2, counted_by = $3, counted_at = CURRENT_TIMESTAMP
           WHERE id = $4 AND count_id = $5`,
          [line.counted_quantity, line.reason || null, userId, line.id, countId],
        );
      }

      await client.query('COMMIT');
      return this.getCount(companyId, countId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
