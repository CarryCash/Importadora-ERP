CREATE TABLE imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id),
    import_date DATE NOT NULL,
    country TEXT,
    shipping_cost NUMERIC,
    tax_cost NUMERIC,
    total_cost NUMERIC,
    status TEXT DEFAULT 'PENDING', -- PENDING, IN_TRANSIT, CUSTOMS, WAREHOUSE, CANCELED
    bl_number VARCHAR(100),
    tracking_number VARCHAR(100),
    estimated_arrival DATE,
    actual_arrival DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP    
);




    

