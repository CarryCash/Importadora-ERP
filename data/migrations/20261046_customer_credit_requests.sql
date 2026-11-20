CREATE TABLE IF NOT EXISTS customer_credit_requests (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, previous_limit NUMERIC(14,2) NOT NULL,
 requested_limit NUMERIC(14,2) NOT NULL CHECK(requested_limit>=0), previous_terms INTEGER NOT NULL,
 requested_terms INTEGER NOT NULL CHECK(requested_terms BETWEEN 0 AND 365), reason TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by UUID REFERENCES users(id) ON DELETE SET NULL, reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
 review_note TEXT, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS customer_credit_requests_pending_idx ON customer_credit_requests(company_id,status,requested_at DESC);
