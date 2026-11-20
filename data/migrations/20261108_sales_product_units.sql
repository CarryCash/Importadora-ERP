-- Persist the commercial quantity/unit alongside the inventory base quantity.
ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS input_quantity NUMERIC(20,8);
ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS product_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL;
ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_code_snapshot VARCHAR(32);
ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(20,10);
UPDATE sales_items SET input_quantity=quantity,unit_code_snapshot='unidad',conversion_factor_snapshot=1 WHERE input_quantity IS NULL;
ALTER TABLE sales_items ALTER COLUMN input_quantity SET NOT NULL;
ALTER TABLE sales_items ALTER COLUMN unit_code_snapshot SET NOT NULL;
ALTER TABLE sales_items ALTER COLUMN conversion_factor_snapshot SET NOT NULL;
