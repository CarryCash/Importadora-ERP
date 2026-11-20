CREATE SEQUENCE IF NOT EXISTS logistics_export_number_seq START 1;

CREATE TABLE IF NOT EXISTS logistics_import_expeditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  mode VARCHAR(12) NOT NULL DEFAULT 'sea' CHECK(mode IN ('sea','air','land','courier')),
  foreign_supplier_name TEXT,
  freight_forwarder TEXT,
  customs_broker TEXT,
  container_number TEXT,
  seal_number TEXT,
  cargo_type TEXT,
  transport_document_type VARCHAR(20) CHECK(transport_document_type IN ('bl','awb','cmr','other')),
  transport_document_number TEXT,
  origin_port TEXT,
  transshipment_ports TEXT,
  destination_port TEXT,
  etd DATE,
  eta DATE,
  actual_departure DATE,
  actual_arrival DATE,
  temporary_depot TEXT,
  temporary_depot_entry DATE,
  temporary_depot_release DATE,
  domestic_carrier TEXT,
  domestic_transport_status TEXT,
  estimated_logistics_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(estimated_logistics_cost>=0),
  actual_logistics_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(actual_logistics_cost>=0),
  status VARCHAR(24) NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','booked','in_transit','at_port','customs','released','delivered','incident','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,import_id)
);

CREATE TABLE IF NOT EXISTS logistics_export_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shipment_number VARCHAR(40) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  destination_country TEXT NOT NULL,
  destination_address TEXT,
  mode VARCHAR(12) NOT NULL DEFAULT 'sea' CHECK(mode IN ('sea','air','land','courier')),
  carrier TEXT,
  freight_forwarder TEXT,
  booking_reference TEXT,
  origin_port TEXT,
  destination_port TEXT,
  cargo_cutoff DATE,
  planned_pickup DATE,
  etd DATE,
  eta DATE,
  actual_departure DATE,
  actual_delivery DATE,
  status VARCHAR(24) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','scheduled','booked','ready','picked_up','in_transit','departed','delivered','incident','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,shipment_number)
);
CREATE TABLE IF NOT EXISTS logistics_export_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES logistics_export_shipments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
  packages INTEGER NOT NULL DEFAULT 0 CHECK(packages>=0),
  weight_kg NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(weight_kg>=0),
  volume_m3 NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(volume_m3>=0),
  packaging TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_expedition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction VARCHAR(8) NOT NULL CHECK(direction IN ('import','export')),
  expedition_id UUID NOT NULL, event_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), location TEXT, is_incident BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_expedition_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction VARCHAR(8) NOT NULL CHECK(direction IN ('import','export')), expedition_id UUID NOT NULL,
  category VARCHAR(24) NOT NULL CHECK(category IN ('freight','insurance','handling','storage','domestic_transport','customs','other')),
  description TEXT NOT NULL, estimated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(estimated_amount>=0),
  actual_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(actual_amount>=0), currency CHAR(3) NOT NULL DEFAULT 'USD',
  finance_allocated BOOLEAN NOT NULL DEFAULT false, finance_reference TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_expedition_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction VARCHAR(8) NOT NULL CHECK(direction IN ('import','export')), expedition_id UUID NOT NULL,
  document_type TEXT NOT NULL, document_number TEXT, file_name TEXT NOT NULL, file_url TEXT,
  notes TEXT, uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS logistics_expedition_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction VARCHAR(8) NOT NULL CHECK(direction IN ('import','export')), expedition_id UUID NOT NULL,
  parent_package_id UUID REFERENCES logistics_expedition_packages(id) ON DELETE SET NULL,
  package_number TEXT NOT NULL, package_type TEXT, seal_number TEXT, weight_kg NUMERIC(14,3) NOT NULL DEFAULT 0,
  volume_m3 NUMERIC(14,3) NOT NULL DEFAULT 0, cargo_reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS logistics_import_expeditions_company_status_idx ON logistics_import_expeditions(company_id,status,eta);
CREATE INDEX IF NOT EXISTS logistics_export_shipments_company_status_idx ON logistics_export_shipments(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS logistics_expedition_events_lookup_idx ON logistics_expedition_events(company_id,direction,expedition_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS logistics_expedition_costs_lookup_idx ON logistics_expedition_costs(company_id,direction,expedition_id);
CREATE INDEX IF NOT EXISTS logistics_expedition_documents_lookup_idx ON logistics_expedition_documents(company_id,direction,expedition_id);

INSERT INTO permission_catalog(permission_key,module,description) VALUES
 ('imports.logistics.read','imports','Consultar expedientes logísticos de importación'),('imports.logistics.manage','imports','Gestionar expedientes logísticos de importación'),
 ('exports.logistics.read','logistics','Consultar expedientes logísticos de exportación'),('exports.logistics.manage','logistics','Gestionar expedientes logísticos de exportación')
ON CONFLICT(permission_key) DO NOTHING;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,r.role,p.permission_key,true FROM companies c CROSS JOIN (VALUES('admin'),('manager')) r(role)
CROSS JOIN (VALUES('imports.logistics.read'),('imports.logistics.manage'),('exports.logistics.read'),('exports.logistics.manage')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
INSERT INTO role_permissions(company_id,role,permission_key,allowed)
SELECT c.id,'warehouse',p.permission_key,true FROM companies c CROSS JOIN (VALUES('imports.logistics.read'),('imports.logistics.manage'),('exports.logistics.read'),('exports.logistics.manage')) p(permission_key)
ON CONFLICT(company_id,role,permission_key) DO UPDATE SET allowed=true;
