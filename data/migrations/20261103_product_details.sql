-- Campos complementarios del maestro de productos. Se guardan en JSONB para
-- permitir atributos y extensiones por categoría sin alterar el esquema.
ALTER TABLE products ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx ON products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
