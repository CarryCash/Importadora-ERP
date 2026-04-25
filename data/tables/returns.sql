-- ============================================================
-- RETURNS: Manejo de devoluciones
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    customer_id UUID REFERENCES customers(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    refund_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- RETURN_ITEMS: Productos devueltos
-- ============================================================
CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    sale_item_id UUID NOT NULL REFERENCES sales_items(id),
    quantity INT NOT NULL,
    disposition TEXT CHECK (disposition IN ('restock', 'discard', 'repair')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
