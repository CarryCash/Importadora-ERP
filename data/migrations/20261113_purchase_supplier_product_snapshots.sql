ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_supplier_id UUID REFERENCES product_suppliers(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS supplier_product_code_snapshot VARCHAR(100);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS supplier_currency_snapshot CHAR(3);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS supplier_quoted_cost_snapshot NUMERIC(18,6);
