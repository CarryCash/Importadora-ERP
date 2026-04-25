CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    type VARCHAR(20) CHECK (type IN ('physical', 'virtual')),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults
INSERT INTO warehouses (name, code, type, description) VALUES
('Bodega Principal', 'WH-MAIN', 'physical', 'Bodega matriz operativa'),
('Vitrina / Local', 'WH-RETAIL', 'physical', 'Stock disponible en vitrina para venta directa'),
('Puerto / En Tránsito', 'WH-TRANSIT', 'virtual', 'Mercadería comprada que aún no llega físicamente');
