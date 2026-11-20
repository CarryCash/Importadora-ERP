-- Control de incidencias, activos, servicios, reglas y fuentes de indicadores logísticos.
CREATE SEQUENCE IF NOT EXISTS logistics_incident_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS logistics_asset_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS logistics_service_number_seq START 1;

CREATE TABLE IF NOT EXISTS logistics_incidents (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 incident_number VARCHAR(40) NOT NULL, source_type VARCHAR(24) NOT NULL DEFAULT 'other', source_id UUID,
 incident_type VARCHAR(32) NOT NULL DEFAULT 'other', severity VARCHAR(12) NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
 status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','investigating','corrective_action','resolved','closed')),
 title VARCHAR(200) NOT NULL, description TEXT, root_cause TEXT, corrective_action TEXT,
 owner_id UUID REFERENCES users(id) ON DELETE SET NULL, due_at TIMESTAMPTZ,
 resolution TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL, resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
 resolved_at TIMESTAMPTZ, closed_by UUID REFERENCES users(id) ON DELETE SET NULL, closed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(company_id,incident_number)
);
CREATE TABLE IF NOT EXISTS logistics_incident_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 incident_id UUID NOT NULL REFERENCES logistics_incidents(id) ON DELETE CASCADE, event_type VARCHAR(32) NOT NULL,
 from_status VARCHAR(16), to_status VARCHAR(16), notes TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_assets (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 asset_number VARCHAR(40) NOT NULL, asset_type VARCHAR(32) NOT NULL, name VARCHAR(160) NOT NULL,
 serial_number VARCHAR(100), warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','maintenance','inactive','retired')),
 acquired_at DATE, last_maintenance_at DATE, next_maintenance_at DATE, maintenance_notes TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,asset_number)
);

CREATE TABLE IF NOT EXISTS logistics_service_jobs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 job_number VARCHAR(40) NOT NULL, service_type VARCHAR(32) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'scheduled'
 CHECK(status IN ('requested','scheduled','in_progress','completed','cancelled','failed')),
 customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
 customer_name VARCHAR(180), contact_phone VARCHAR(60), service_address TEXT, service_city VARCHAR(100),
 scheduled_start TIMESTAMPTZ, scheduled_end TIMESTAMPTZ, assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
 description TEXT, completion_notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
 completed_by UUID REFERENCES users(id) ON DELETE SET NULL, completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,job_number)
);
CREATE TABLE IF NOT EXISTS logistics_service_events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 service_job_id UUID NOT NULL REFERENCES logistics_service_jobs(id) ON DELETE CASCADE,
 event_type VARCHAR(32) NOT NULL, notes TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_automation_rules (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name VARCHAR(160) NOT NULL, trigger_key VARCHAR(40) NOT NULL, conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
 actions JSONB NOT NULL DEFAULT '{}'::jsonb, is_active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
 created_by UUID REFERENCES users(id) ON DELETE SET NULL, updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS logistics_incidents_company_status_due_idx ON logistics_incidents(company_id,status,due_at);
CREATE INDEX IF NOT EXISTS logistics_incident_events_idx ON logistics_incident_events(incident_id,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_assets_company_status_idx ON logistics_assets(company_id,status,next_maintenance_at);
CREATE INDEX IF NOT EXISTS logistics_service_jobs_company_status_idx ON logistics_service_jobs(company_id,status,scheduled_start);
CREATE INDEX IF NOT EXISTS logistics_automation_rules_company_trigger_idx ON logistics_automation_rules(company_id,trigger_key,is_active);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('logistics_control.read','logistics','Consultar incidencias, indicadores, activos y servicios logísticos'),
 ('logistics_incidents.manage','logistics','Registrar, asignar y resolver incidencias logísticas'),
 ('logistics_assets.manage','logistics','Administrar activos y mantenimientos logísticos'),
 ('logistics_services.manage','logistics','Programar y ejecutar servicios logísticos'),
 ('logistics_automation.manage','logistics','Configurar reglas y automatizaciones logísticas')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES('admin'),('manager')) r(role)
CROSS JOIN (VALUES('logistics_control.read'),('logistics_incidents.manage'),('logistics_assets.manage'),('logistics_services.manage'),('logistics_automation.manage')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'warehouse',p.permission_key,true FROM companies c
CROSS JOIN (VALUES('logistics_control.read'),('logistics_incidents.manage'),('logistics_services.manage')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
