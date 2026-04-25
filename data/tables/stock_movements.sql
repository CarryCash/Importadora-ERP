CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID NOT NULL REFERENCES inventory(id),
    batch_id UUID NOT NULL REFERENCES product_batches(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'return', 'adjustment', 'purchase', 'write_off', 'sample')),
    quantity_change INT NOT NULL,
    reference_id UUID, -- Puede ser sale_id, return_id, etc.
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);
