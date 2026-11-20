-- Capacidad operacional: muelles y reservas de ventanas de recepción/despacho.
CREATE TABLE IF NOT EXISTS logistics_docks (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE, warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
 code VARCHAR(40) NOT NULL, name VARCHAR(120) NOT NULL, direction VARCHAR(12) NOT NULL DEFAULT 'both' CHECK(direction IN ('inbound','outbound','both')),
 capacity_vehicles INTEGER NOT NULL DEFAULT 1 CHECK(capacity_vehicles>0), is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(company_id,warehouse_id,code)
);
CREATE TABLE IF NOT EXISTS logistics_dock_appointments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 dock_id UUID NOT NULL REFERENCES logistics_docks(id) ON DELETE RESTRICT,
 appointment_number VARCHAR(40) NOT NULL, direction VARCHAR(12) NOT NULL CHECK(direction IN ('inbound','outbound')),
 source_type VARCHAR(20) NOT NULL DEFAULT 'other' CHECK(source_type IN ('purchase_order','import','transfer','dispatch','other')),
 source_id UUID, supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
 carrier_name VARCHAR(160), vehicle_plate VARCHAR(20), driver_name VARCHAR(160),
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','arrived','unloading','completed','cancelled','no_show')),
 arrived_at TIMESTAMPTZ, service_started_at TIMESTAMPTZ, departed_at TIMESTAMPTZ,
 expected_pallets NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(expected_pallets>=0), notes TEXT,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(ends_at>starts_at), UNIQUE(company_id,appointment_number)
);
CREATE TABLE IF NOT EXISTS logistics_dock_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 appointment_id UUID NOT NULL REFERENCES logistics_dock_appointments(id) ON DELETE CASCADE,
 event_type VARCHAR(24) NOT NULL, from_status VARCHAR(16), to_status VARCHAR(16), notes TEXT,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE SEQUENCE IF NOT EXISTS logistics_dock_appointment_number_seq START 1;
CREATE INDEX IF NOT EXISTS logistics_dock_appointments_schedule_idx ON logistics_dock_appointments(company_id,dock_id,starts_at,ends_at) WHERE status NOT IN ('cancelled','no_show');
CREATE INDEX IF NOT EXISTS logistics_dock_events_appointment_idx ON logistics_dock_events(appointment_id,created_at DESC);
INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('logistics_docks.manage','logistics','Administrar muelles, agenda y ventanas de atención')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,'logistics_docks.manage',true FROM companies c CROSS JOIN (VALUES('admin'),('manager'),('warehouse')) r(role)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
