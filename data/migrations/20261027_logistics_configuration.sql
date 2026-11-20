-- Catálogos configurables de logística por empresa.
CREATE TABLE IF NOT EXISTS logistics_configurations (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL DEFAULT '{"facilities":[],"locations":[],"docks":[],"handlingUnits":[],"unitConversions":[],"storageRules":[],"schedules":[],"serviceAreas":[],"documentSeries":[],"policies":[]}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO logistics_configurations (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;
