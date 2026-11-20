-- Keep the commercial quantity entered on a purchase order and store operational quantities in base units.
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS input_quantity NUMERIC(20,8);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_code_snapshot VARCHAR(32);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(20,10);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS input_unit_cost NUMERIC(20,8);

UPDATE purchase_order_items
SET input_quantity=ordered_quantity,
    unit_code_snapshot='unidad',
    conversion_factor_snapshot=1,
    input_unit_cost=unit_cost
WHERE input_quantity IS NULL;

ALTER TABLE purchase_order_items ALTER COLUMN input_quantity SET NOT NULL;
ALTER TABLE purchase_order_items ALTER COLUMN unit_code_snapshot SET NOT NULL;
ALTER TABLE purchase_order_items ALTER COLUMN conversion_factor_snapshot SET NOT NULL;
ALTER TABLE purchase_order_items ALTER COLUMN input_unit_cost SET NOT NULL;
