-- Configurable supplier review workflow, explicit lifecycle states and decision audit.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_status_check CHECK (supplier_status IN ('draft','pending_approval','in_review','observed','approved','active','suspended','blocked','inactive','archived'));
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_approval_status_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_approval_status_check CHECK (approval_status IN ('not_required','pending','in_review','observed','approved','rejected'));

ALTER TABLE supplier_categories ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supplier_approval_policies ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE supplier_approval_policies ADD COLUMN IF NOT EXISTS auto_activate BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_approval_policies_one_active_idx ON supplier_approval_policies(company_id,supplier_type) WHERE is_active;

ALTER TABLE supplier_approval_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(40) NOT NULL DEFAULT 'registration';
ALTER TABLE supplier_approval_requests ADD COLUMN IF NOT EXISTS supplier_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE supplier_approval_requests ADD COLUMN IF NOT EXISTS reviewed_documents JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE supplier_approval_requests DROP CONSTRAINT IF EXISTS supplier_approval_requests_status_check;
ALTER TABLE supplier_approval_requests ADD CONSTRAINT supplier_approval_requests_status_check CHECK (status IN ('pending','in_review','observed','approved','rejected','cancelled'));

CREATE TABLE IF NOT EXISTS supplier_approval_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES supplier_approval_requests(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_type VARCHAR(32) NOT NULL CHECK(decision_type IN ('approved','rejected','observed','auto_approved','activated')),
  comment TEXT,
  supplier_version INTEGER NOT NULL,
  reviewed_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  result VARCHAR(24) NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id,company_id) REFERENCES suppliers(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_approval_decisions_lookup_idx ON supplier_approval_decisions(company_id,supplier_id,decided_at DESC);
CREATE INDEX IF NOT EXISTS supplier_approval_decisions_request_idx ON supplier_approval_decisions(company_id,request_id,decided_at);
