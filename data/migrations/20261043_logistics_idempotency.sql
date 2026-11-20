-- Replay-safe responses for inventory- and finance-affecting HTTP operations.
CREATE TABLE IF NOT EXISTS logistics_idempotency_records (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 operation_key VARCHAR(80) NOT NULL, request_key VARCHAR(120) NOT NULL, request_hash CHAR(64) NOT NULL,
 response_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
 UNIQUE(company_id,operation_key,request_key)
);
CREATE INDEX IF NOT EXISTS logistics_idempotency_created_idx ON logistics_idempotency_records(created_at);
