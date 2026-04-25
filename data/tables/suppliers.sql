CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    country TEXT,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    
    -- Logistica internacional
    incoterm_default VARCHAR(10), -- FOB, EXW, CIF
    shipping_port VARCHAR(100),
    estimated_lead_time INTEGER, -- Días de producción
    payment_terms TEXT, -- e.g. '30% Advance, 70% BL'
    brands_handled TEXT,
    website VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
