CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    bin_location VARCHAR(100), -- Pasillo, percha, estante
    
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint to ensure unique inventory per batch/warehouse combination
CREATE UNIQUE INDEX idx_inventory_batch_warehouse ON inventory (batch_id, warehouse_id);
