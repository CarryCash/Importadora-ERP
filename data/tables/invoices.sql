-- ============================================================
-- INVOICES: Facturación Electrónica SRI
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE,
    authorization_code VARCHAR(100),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'rejected', 'cancelled')),
    issued_at TIMESTAMP,
    xml_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
