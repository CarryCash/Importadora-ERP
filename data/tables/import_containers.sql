CREATE TABLE IF NOT EXISTS import_containers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    container_number VARCHAR(100),
    container_type VARCHAR(30) DEFAULT '40HQ',
    port_name VARCHAR(100),
    customs_status VARCHAR(80) DEFAULT 'En Tránsito',
    free_days_deadline DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
