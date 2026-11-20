-- Ejecutar una vez sobre bases de datos existentes antes de usar el POS actualizado.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,2) NOT NULL DEFAULT 13;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_iva_rate_check;
ALTER TABLE products
  ADD CONSTRAINT products_iva_rate_check CHECK (iva_rate >= 0 AND iva_rate <= 15);

ALTER TABLE sales_items
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 13,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Los registros históricos quedan con IVA 0 porque no se puede inferir la tarifa
-- aplicada a cada producto en el momento de la venta.
UPDATE sales_items SET tax_rate = 0 WHERE tax_amount = 0;
