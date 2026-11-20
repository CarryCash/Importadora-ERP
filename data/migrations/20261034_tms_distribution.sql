-- Transport Management System: carrier network, fleet, trips, POD, expenses and claims.
CREATE SEQUENCE IF NOT EXISTS tms_trip_number_seq START 1;

CREATE TABLE IF NOT EXISTS tms_carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  carrier_type VARCHAR(24) NOT NULL DEFAULT 'transport_company' CHECK(carrier_type IN ('transport_company','courier','own')),
  tax_id VARCHAR(20),
  contact_name VARCHAR(140),
  phone VARCHAR(60),
  email VARCHAR(180),
  service_zones TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,tax_id)
);

CREATE TABLE IF NOT EXISTS tms_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES tms_carriers(id) ON DELETE SET NULL,
  plate VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(40) NOT NULL DEFAULT 'camioneta',
  is_owned BOOLEAN NOT NULL DEFAULT false,
  capacity_kg NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(capacity_kg>=0),
  capacity_m3 NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK(capacity_m3>=0),
  capacity_packages INTEGER NOT NULL DEFAULT 0 CHECK(capacity_packages>=0),
  registration_expiry DATE,
  insurance_expiry DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','maintenance','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,plate)
);

CREATE TABLE IF NOT EXISTS tms_drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES tms_carriers(id) ON DELETE SET NULL,
  full_name VARCHAR(180) NOT NULL,
  identification_number VARCHAR(20),
  phone VARCHAR(60),
  license_number VARCHAR(50) NOT NULL,
  license_type VARCHAR(30),
  license_expiry DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,license_number)
);

CREATE TABLE IF NOT EXISTS tms_tariffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES tms_carriers(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  zone VARCHAR(120),
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(base_amount>=0),
  per_km NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(per_km>=0),
  per_kg NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(per_kg>=0),
  per_m3 NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(per_m3>=0),
  per_package NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(per_package>=0),
  per_stop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(per_stop>=0),
  minimum_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(minimum_amount>=0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tms_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  trip_number VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_route','closed','cancelled')),
  carrier_id UUID REFERENCES tms_carriers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES tms_vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES tms_drivers(id) ON DELETE SET NULL,
  tariff_id UUID REFERENCES tms_tariffs(id) ON DELETE SET NULL,
  route_name VARCHAR(180) NOT NULL,
  zone VARCHAR(120),
  planned_departure TIMESTAMPTZ NOT NULL,
  planned_return TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  planned_distance_km NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(planned_distance_km>=0),
  planned_duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK(planned_duration_minutes>=0),
  estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(estimated_cost>=0),
  actual_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(actual_cost>=0),
  invoiced_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(invoiced_amount>=0),
  invoice_reference VARCHAR(100),
  reconciliation_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(reconciliation_status IN ('pending','matched','variance')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,trip_number)
);

CREATE TABLE IF NOT EXISTS tms_trip_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES tms_trips(id) ON DELETE CASCADE,
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id),
  sequence_number INTEGER NOT NULL CHECK(sequence_number>0),
  stop_name VARCHAR(180),
  address TEXT,
  city VARCHAR(100),
  scheduled_from TIMESTAMPTZ,
  scheduled_to TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','arrived','delivered','partial','failed','rescheduled')),
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rescheduled_for TIMESTAMPTZ,
  received_by VARCHAR(180),
  signature_reference TEXT,
  photo_reference TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  delivery_notes TEXT,
  failure_reason TEXT,
  UNIQUE(trip_id,sequence_number)
);

CREATE TABLE IF NOT EXISTS tms_stop_items (
  stop_id UUID NOT NULL REFERENCES tms_trip_stops(id) ON DELETE CASCADE,
  fulfillment_item_id UUID NOT NULL REFERENCES fulfillment_items(id),
  expected_quantity INTEGER NOT NULL CHECK(expected_quantity>0),
  delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0),
  PRIMARY KEY(stop_id,fulfillment_item_id),
  CHECK(delivered_quantity<=expected_quantity)
);

CREATE TABLE IF NOT EXISTS tms_trip_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES tms_trips(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES tms_trip_stops(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tms_trip_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES tms_trips(id) ON DELETE CASCADE,
  expense_type VARCHAR(20) NOT NULL CHECK(expense_type IN ('fuel','toll','parking','per_diem','other')),
  description VARCHAR(180) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),
  receipt_reference TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tms_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES tms_trips(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES tms_trip_stops(id) ON DELETE SET NULL,
  incident_type VARCHAR(24) NOT NULL CHECK(incident_type IN ('delay','damage','loss','accident','theft','vehicle','customer','other')),
  severity VARCHAR(12) NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','claim')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT NOT NULL,
  claim_reference VARCHAR(100),
  estimated_loss NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(estimated_loss>=0),
  resolution_notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tms_trip_manifest_items (
  trip_id UUID NOT NULL REFERENCES tms_trips(id) ON DELETE CASCADE,
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id),
  manifest_number VARCHAR(44) NOT NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(trip_id,fulfillment_order_id),
  UNIQUE(manifest_number,fulfillment_order_id)
);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
  ('tms.read','logistics','Consultar viajes, entregas y flota'),
  ('tms.manage','logistics','Planificar viajes y administrar recursos de transporte'),
  ('tms.dispatch','logistics','Iniciar y cerrar viajes de distribución'),
  ('tms.delivery','logistics','Registrar entrega, prueba de entrega y reprogramación'),
  ('tms.finance','logistics','Registrar gastos y conciliar tarifas de transporte'),
  ('tms.incidents','logistics','Registrar y resolver incidentes y siniestros')
ON CONFLICT(permission_key) DO UPDATE SET module=EXCLUDED.module,description=EXCLUDED.description;

INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c
CROSS JOIN (VALUES('admin'),('warehouse')) r(role)
CROSS JOIN (VALUES('tms.read'),('tms.manage'),('tms.dispatch'),('tms.delivery'),('tms.incidents')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;

CREATE INDEX IF NOT EXISTS tms_trips_company_status_idx ON tms_trips(company_id,status,planned_departure DESC);
CREATE INDEX IF NOT EXISTS tms_trip_stops_trip_sequence_idx ON tms_trip_stops(trip_id,sequence_number);
CREATE INDEX IF NOT EXISTS tms_trip_stops_order_idx ON tms_trip_stops(fulfillment_order_id);
CREATE INDEX IF NOT EXISTS tms_trip_events_trip_idx ON tms_trip_events(trip_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tms_incidents_company_status_idx ON tms_incidents(company_id,status,occurred_at DESC);
