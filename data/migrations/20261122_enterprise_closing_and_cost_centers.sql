-- Migración: 20261122_enterprise_closing_and_cost_centers.sql
-- Cierre integral de Compras, Inventario, Recepción, Ventas, Despacho, Expedientes de Importación y Costeo;
-- Enlace de Documentos, Pagos/Cobros, Gastos y Centros de Costo; Reportes Operativos.

-- 1. Centros de Costo y Enlaces Financieros
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'operational' CHECK (type IN ('operational', 'logistics', 'commercial', 'administrative', 'import')),
  description TEXT,
  budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, code)
);

-- Migrar/Sincronizar con logistics_cost_centers si existen
INSERT INTO cost_centers (id, company_id, code, name, type, description, is_active, created_at)
SELECT id, company_id, code, name, 'logistics', description, is_active, created_at
FROM logistics_cost_centers
ON CONFLICT (company_id, code) DO NOTHING;

-- 2. Enlazar Centros de Costo en Órdenes de Compra, Expedientes, Gastos y Ventas
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'cancelled'));

ALTER TABLE imports ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(100);
ALTER TABLE imports ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid'));

ALTER TABLE sales ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cogs_total NUMERIC(15,4) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS gross_margin NUMERIC(15,4) NOT NULL DEFAULT 0;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference_doc_type VARCHAR(40);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference_doc_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid'));
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 3. Tabla de Pagos a Proveedores (Accounts Payable Payments)
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  import_id UUID REFERENCES imports(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(40) NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('cash', 'transfer', 'check', 'credit_card', 'other')),
  reference VARCHAR(120),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Secuencia y Función de Cierre Automático de Recepción -> Creación de Capas FIFO y Movimientos
CREATE SEQUENCE IF NOT EXISTS inventory_movement_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION sync_goods_receipt_to_enterprise_fifo(p_company UUID, p_receipt UUID, p_actor UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_receipt goods_receipts%ROWTYPE;
  v_item RECORD;
  v_unit_cost NUMERIC(15,4);
  v_layer_id UUID;
  v_mov_id UUID;
  v_mov_number VARCHAR(40);
  v_seq BIGINT;
  v_target_wh UUID;
  v_cost_center UUID;
BEGIN
  SELECT * INTO v_receipt FROM goods_receipts WHERE id = p_receipt AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recepción no encontrada.' USING ERRCODE = 'P0002';
  END IF;

  v_target_wh := v_receipt.target_warehouse_id;

  -- Determinar centro de costo predeterminado
  SELECT id INTO v_cost_center FROM cost_centers WHERE company_id = p_company AND code IN ('CC-LOG', 'CC-IMP') ORDER BY code DESC LIMIT 1;

  -- Generar número de movimiento
  SELECT nextval('inventory_movement_number_seq') INTO v_seq;
  v_mov_number := 'MOV-' || to_char(CURRENT_TIMESTAMP, 'YYYY') || '-' || lpad(v_seq::text, 6, '0');

  INSERT INTO inventory_movements (
    company_id, movement_number, operation_type, status,
    reference_doc_type, reference_doc_id,
    notes, created_by, confirmed_at
  ) VALUES (
    p_company, v_mov_number, 'RECEIPT', 'CONFIRMED',
    'goods_receipt', p_receipt,
    'Recepción formal cerrada ' || v_receipt.receipt_number,
    p_actor, CURRENT_TIMESTAMP
  ) RETURNING id INTO v_mov_id;

  FOR v_item IN
    SELECT gri.*, p.name AS product_name, p.sku
    FROM goods_receipt_items gri
    JOIN products p ON p.id = gri.product_id
    WHERE gri.receipt_id = p_receipt AND gri.quality_status = 'approved' AND gri.received_quantity > 0
  LOOP
    v_unit_cost := v_item.unit_cost;

    -- Si el origen es importación, consultar costo unitario final con prorrateo de import_items
    IF v_receipt.source_type = 'import' AND v_item.source_line_id IS NOT NULL THEN
      SELECT unit_cost INTO v_unit_cost FROM import_items WHERE id = v_item.source_line_id;
      IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
        v_unit_cost := v_item.unit_cost;
      END IF;
    END IF;

    -- 1. Crear Capa FIFO
    INSERT INTO inventory_cost_layers (
      company_id, product_id, warehouse_id,
      origin_doc_type, origin_doc_id,
      initial_quantity, remaining_quantity,
      functional_unit_cost, effective_date, status
    ) VALUES (
      p_company, v_item.product_id, v_target_wh,
      'goods_receipt', p_receipt,
      v_item.received_quantity, v_item.received_quantity,
      v_unit_cost, CURRENT_TIMESTAMP, 'active'
    ) RETURNING id INTO v_layer_id;

    -- 2. Actualizar Saldos en inventory_balances
    INSERT INTO inventory_balances (
      company_id, product_id, warehouse_id,
      physical_stock, available_stock, reserved_stock, blocked_stock, in_transit_stock
    ) VALUES (
      p_company, v_item.product_id, v_target_wh,
      v_item.received_quantity, v_item.received_quantity, 0, 0, 0
    )
    ON CONFLICT (company_id, product_id, warehouse_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      physical_stock = inventory_balances.physical_stock + EXCLUDED.physical_stock,
      available_stock = inventory_balances.available_stock + EXCLUDED.available_stock;

    -- 3. Detalle de movimiento inmutable
    INSERT INTO inventory_movement_lines (
      movement_id, product_id, to_warehouse_id,
      quantity, unit_cost, total_cost
    ) VALUES (
      v_mov_id, v_item.product_id, v_target_wh,
      v_item.received_quantity, v_unit_cost, (v_item.received_quantity * v_unit_cost)
    );
  END LOOP;
END;
$$;

-- 5. Índices para acelerar reportes operativos y enlace documental
CREATE INDEX IF NOT EXISTS idx_cost_centers_company ON cost_centers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cost_center ON expenses(company_id, cost_center_id);
CREATE INDEX IF NOT EXISTS idx_sales_cost_center ON sales(company_id, cost_center_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_cost_center ON purchase_orders(company_id, cost_center_id);
