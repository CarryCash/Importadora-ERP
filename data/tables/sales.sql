-- ============================================================
-- SALES: Venta principal
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_number VARCHAR(20) UNIQUE,
    customer_id UUID REFERENCES customers(id),
    user_id UUID REFERENCES users(id),
    sale_date DATE NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('draft','completed','cancelled','refunded')),
    subtotal NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    tax NUMERIC DEFAULT 0,
    tax_rate NUMERIC(5,2) DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid')),
    notes TEXT,
    pos_terminal VARCHAR(50),
    receipt_number VARCHAR(50),
    cashier_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SALES_ITEMS: Productos vendidos en cada venta
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES product_batches(id),
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 13,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SALE_PAYMENTS: Pagos registrados por venta (múltiples métodos)
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('cash','card','transfer','mobile_payment','credit')),
    amount NUMERIC NOT NULL,
    reference TEXT,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- MIGRATION: Agregar columnas nuevas si la tabla ya existe
-- ============================================================
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_number VARCHAR(20) UNIQUE;
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed' CHECK (status IN ('draft','completed','cancelled','refunded'));
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT;
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS pos_terminal VARCHAR(50);
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(50);
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES users(id);
-- ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
