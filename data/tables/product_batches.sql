CREATE TABLE product_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID REFERENCES imports(id),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_number VARCHAR(100) NOT NULL,
    manufacturing_date DATE,
    expiration_date DATE NOT NULL,
    
    -- Valorización de Inventario
    unit_cost NUMERIC(15,4) DEFAULT 0, -- Landed cost per unit
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
