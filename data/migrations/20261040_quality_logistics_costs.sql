-- Quality controls, cold chain, incidents, shared logistics costing and finance reconciliation.
CREATE SEQUENCE IF NOT EXISTS logistics_quality_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS logistics_cost_number_seq START 1;

CREATE TABLE IF NOT EXISTS logistics_quality_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name VARCHAR(160) NOT NULL, product_id UUID REFERENCES products(id) ON DELETE CASCADE, product_category VARCHAR(120),
 sector VARCHAR(32) NOT NULL DEFAULT 'general' CHECK(sector IN ('general','food','pharmaceutical','hazardous','other')),
 sample_size INTEGER NOT NULL DEFAULT 1 CHECK(sample_size>0), acceptance_limit INTEGER NOT NULL DEFAULT 0 CHECK(acceptance_limit>=0),
 criteria JSONB NOT NULL DEFAULT '[]'::jsonb, requires_temperature BOOLEAN NOT NULL DEFAULT false,
 min_temperature NUMERIC(8,2), max_temperature NUMERIC(8,2), requires_authorized_release BOOLEAN NOT NULL DEFAULT true,
 hazardous_class VARCHAR(40), is_active BOOLEAN NOT NULL DEFAULT true, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(min_temperature IS NULL OR max_temperature IS NULL OR min_temperature<=max_temperature)
);
CREATE TABLE IF NOT EXISTS logistics_quality_inspections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 inspection_number VARCHAR(40) NOT NULL, plan_id UUID REFERENCES logistics_quality_plans(id) ON DELETE SET NULL,
 product_id UUID REFERENCES products(id) ON DELETE SET NULL, batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
 inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
 source_type VARCHAR(24) NOT NULL DEFAULT 'inventory' CHECK(source_type IN ('receipt','inventory','dispatch','import','export','other')),
 source_id UUID, stage VARCHAR(16) NOT NULL CHECK(stage IN ('incoming','storage','outgoing')),
 sample_size INTEGER NOT NULL DEFAULT 1 CHECK(sample_size>0), accepted_quantity INTEGER NOT NULL DEFAULT 0 CHECK(accepted_quantity>=0),
 rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0), status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','quarantine','released','rejected')),
 criteria_results JSONB NOT NULL DEFAULT '[]'::jsonb, notes TEXT, inspected_by UUID REFERENCES users(id) ON DELETE SET NULL,
 released_by UUID REFERENCES users(id) ON DELETE SET NULL, released_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(company_id,inspection_number)
);
CREATE TABLE IF NOT EXISTS logistics_temperature_readings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 inspection_id UUID REFERENCES logistics_quality_inspections(id) ON DELETE CASCADE,
 product_id UUID REFERENCES products(id) ON DELETE SET NULL, batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
 source_type VARCHAR(24) NOT NULL DEFAULT 'inventory', source_id UUID,
 temperature NUMERIC(8,2) NOT NULL, min_allowed NUMERIC(8,2), max_allowed NUMERIC(8,2),
 excursion BOOLEAN NOT NULL DEFAULT false, measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), location TEXT,
 notes TEXT, recorded_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_quality_incidents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 inspection_id UUID REFERENCES logistics_quality_inspections(id) ON DELETE SET NULL,
 temperature_reading_id UUID REFERENCES logistics_temperature_readings(id) ON DELETE SET NULL,
 incident_type VARCHAR(24) NOT NULL CHECK(incident_type IN ('damage','contamination','temperature_excursion','expiry','hazardous','shortage','other')),
 severity VARCHAR(12) NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
 status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','corrective_action','closed')),
 description TEXT NOT NULL, corrective_action TEXT, owner_name TEXT, due_date DATE,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
 closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_quality_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 inspection_id UUID REFERENCES logistics_quality_inspections(id) ON DELETE CASCADE, event_type TEXT NOT NULL,
 notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_cost_centers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 code VARCHAR(40) NOT NULL, name VARCHAR(160) NOT NULL, description TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,code)
);
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100);
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS service_type VARCHAR(32) NOT NULL DEFAULT 'distribution';
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS effective_from DATE;
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS effective_until DATE;
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE tms_tariffs ADD COLUMN IF NOT EXISTS contract_notes TEXT;
CREATE TABLE IF NOT EXISTS logistics_tariff_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 tariff_id UUID NOT NULL REFERENCES tms_tariffs(id) ON DELETE CASCADE, changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
 previous_values JSONB NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION save_logistics_tariff_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO logistics_tariff_history(company_id,tariff_id,changed_by,previous_values)
 VALUES(OLD.company_id,OLD.id,NULLIF(current_setting('app.actor_id',true),'')::uuid,to_jsonb(OLD));
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS logistics_tariff_history_trigger ON tms_tariffs;
CREATE TRIGGER logistics_tariff_history_trigger BEFORE UPDATE ON tms_tariffs FOR EACH ROW EXECUTE FUNCTION save_logistics_tariff_history();
CREATE TABLE IF NOT EXISTS logistics_costs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 cost_number VARCHAR(40) NOT NULL, source_type VARCHAR(20) NOT NULL CHECK(source_type IN ('receipt','picking','storage','delivery','trip','import','export','order','other')),
 source_id UUID, stage VARCHAR(24) NOT NULL DEFAULT 'operation', description TEXT NOT NULL,
 carrier_id UUID REFERENCES tms_carriers(id) ON DELETE SET NULL, tariff_id UUID REFERENCES tms_tariffs(id) ON DELETE SET NULL,
 cost_center_id UUID REFERENCES logistics_cost_centers(id) ON DELETE SET NULL,
 estimated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(estimated_amount>=0), actual_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(actual_amount>=0),
 currency CHAR(3) NOT NULL DEFAULT 'USD', vendor_invoice_number VARCHAR(100), vendor_invoice_date DATE,
 ap_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(ap_status IN ('pending','pending_approval','approved','reconciled','cancelled')),
 overrun_percent NUMERIC(8,2) NOT NULL DEFAULT 0, approved_by UUID REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ,
 expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
 allocation_import_id UUID REFERENCES imports(id) ON DELETE SET NULL,
 allocation_policy VARCHAR(16) CHECK(allocation_policy IN ('quantity','value','equal','weight')),
 notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,cost_number)
);
CREATE TABLE IF NOT EXISTS logistics_cost_allocations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cost_id UUID NOT NULL REFERENCES logistics_costs(id) ON DELETE CASCADE,
 import_item_id UUID NOT NULL REFERENCES import_items(id) ON DELETE CASCADE,
 allocated_amount NUMERIC(14,4) NOT NULL CHECK(allocated_amount>=0), allocation_policy VARCHAR(16) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(cost_id,import_item_id)
);
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS allocated_logistics_cost NUMERIC(14,4) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS logistics_quality_inspections_idx ON logistics_quality_inspections(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_temperature_excursions_idx ON logistics_temperature_readings(company_id,excursion,measured_at DESC);
CREATE INDEX IF NOT EXISTS logistics_quality_incidents_idx ON logistics_quality_incidents(company_id,status,severity,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_costs_status_idx ON logistics_costs(company_id,ap_status,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_cost_allocations_import_idx ON logistics_cost_allocations(import_item_id);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('logistics_quality.read','logistics','Consultar inspecciones, cadena de frío e incidentes de calidad'),
 ('logistics_quality.manage','logistics','Registrar inspecciones, planes, lecturas e incidentes de calidad'),
 ('logistics_quality.release','logistics','Liberar mercancía de cuarentena tras aprobación'),
 ('logistics_costs.read','logistics','Consultar presupuestos, costos, centros y tarifas logísticas'),
 ('logistics_costs.manage','logistics','Registrar presupuestos, gastos, contratos y asignaciones logísticas'),
 ('logistics_costs.approve','logistics','Autorizar sobrecostos logísticos'),
 ('logistics_costs.reconcile','logistics','Conciliar gastos logísticos con Finanzas y Cuentas por Pagar')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c CROSS JOIN (VALUES('admin'),('manager')) r(role)
CROSS JOIN (VALUES('logistics_quality.read'),('logistics_quality.manage'),('logistics_quality.release'),('logistics_costs.read'),('logistics_costs.manage'),('logistics_costs.approve'),('logistics_costs.reconcile')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'warehouse',p.permission_key,true FROM companies c CROSS JOIN (VALUES('logistics_quality.read'),('logistics_quality.manage'),('logistics_costs.read')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
