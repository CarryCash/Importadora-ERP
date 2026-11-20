-- Configurable supplier performance model and auditable risk alerts.
CREATE TABLE IF NOT EXISTS supplier_evaluation_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  criteria_weights JSONB NOT NULL DEFAULT '{"quality":25,"delivery":25,"price":20,"documents":15,"communication":15}'::jsonb,
  class_thresholds JSONB NOT NULL DEFAULT '{"excellent":90,"good":80,"acceptable":70,"deficient":50,"critical":0}'::jsonb,
  minimum_confidence_operations INTEGER NOT NULL DEFAULT 10 CHECK(minimum_confidence_operations>0),
  reference_score NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK(reference_score BETWEEN 0 AND 100),
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_evaluation_policies_one_active_idx ON supplier_evaluation_policies(company_id) WHERE is_active;

ALTER TABLE supplier_evaluations ADD COLUMN IF NOT EXISTS raw_score NUMERIC(6,2);
ALTER TABLE supplier_evaluations ADD COLUMN IF NOT EXISTS confidence_factor NUMERIC(6,4) NOT NULL DEFAULT 1;
ALTER TABLE supplier_evaluations ADD COLUMN IF NOT EXISTS operation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_evaluations ADD COLUMN IF NOT EXISTS criteria_scores JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE supplier_evaluations ADD COLUMN IF NOT EXISTS policy_version INTEGER;
ALTER TABLE supplier_evaluations DROP CONSTRAINT IF EXISTS supplier_evaluations_performance_class_check;
UPDATE supplier_evaluations SET performance_class=CASE performance_class WHEN 'watch' THEN 'acceptable' WHEN 'poor' THEN 'deficient' ELSE performance_class END;
ALTER TABLE supplier_evaluations ADD CONSTRAINT supplier_evaluations_performance_class_check CHECK(performance_class IN ('excellent','good','acceptable','deficient','critical'));

CREATE TABLE IF NOT EXISTS supplier_risk_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  alert_key VARCHAR(100) NOT NULL,
  risk_category VARCHAR(24) NOT NULL CHECK(risk_category IN ('commercial','financial','logistical','documentary','compliance')),
  severity VARCHAR(16) NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  review_required BOOLEAN NOT NULL DEFAULT false,
  review_status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(review_status IN ('open','in_review','observed','reviewed','resolved')),
  source_type VARCHAR(40),
  source_id UUID,
  review_request_id UUID REFERENCES supplier_approval_requests(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_risk_alerts_open_key_uq ON supplier_risk_alerts(company_id,supplier_id,alert_key) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS supplier_risk_alerts_queue_idx ON supplier_risk_alerts(company_id,review_status,severity,created_at DESC);
