CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category VARCHAR(50),
    sku VARCHAR(50) UNIQUE,
    
    -- Precios y Costos
    price NUMERIC DEFAULT 0, -- Base price (deprecated favor of tiers)
    cost_price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0, -- Retail (PVP)
    wholesale_price NUMERIC DEFAULT 0, -- Mayoreo
    professional_price NUMERIC DEFAULT 0, -- Profesional
    
    -- Atributos Cosméticos
    image_url TEXT,
    skin_type VARCHAR(50), -- Seca, Grasa, Mixta, etc.
    is_vegan BOOLEAN DEFAULT false,
    product_type VARCHAR(50), -- Finished good, Sample, Tester
    
    -- Regulación ARCSA (Ecuador)
    sanitary_registration VARCHAR(100), -- NSO Number
    nso_expiry DATE,
    
    -- Logistica y Reposición
    min_stock INTEGER DEFAULT 20,
    lead_time_days INTEGER DEFAULT 45,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
