ALTER TABLE product_price_lists ADD COLUMN IF NOT EXISTS last_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE product_price_lists SET last_requested_by=created_by WHERE last_requested_by IS NULL;

CREATE TABLE IF NOT EXISTS product_price_list_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES product_price_lists(id) ON DELETE CASCADE,
  event_type VARCHAR(24) NOT NULL CHECK(event_type IN ('created','updated','submitted','approved','rejected','activated','deactivated')),
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_price_list_events_lookup_idx ON product_price_list_events(company_id,price_list_id,created_at DESC);
