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
    fob_value NUMERIC DEFAULT 0,
    freight_cost NUMERIC DEFAULT 0,
    insurance_cost NUMERIC DEFAULT 0,
    customs_taxes NUMERIC DEFAULT 0,
    arcsa_taxes NUMERIC DEFAULT 0,
    exchange_rate NUMERIC DEFAULT 1,
    incoterm VARCHAR(10),
    courier VARCHAR(100),
    fodinfa_cost NUMERIC DEFAULT 0,
    iva_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP    
);




    

