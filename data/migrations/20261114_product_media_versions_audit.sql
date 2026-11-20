ALTER TABLE product_audit_events DROP CONSTRAINT IF EXISTS product_audit_events_action_check;
ALTER TABLE product_audit_events ADD CONSTRAINT product_audit_events_action_check CHECK(action IN ('created','updated','activated','deactivated','archived','restored','identifiers_changed','attributes_changed','media_added','media_versioned','media_metadata_updated','media_archived'));
ALTER TABLE product_audit_events ADD COLUMN IF NOT EXISTS correlation_id UUID;
CREATE INDEX IF NOT EXISTS product_audit_events_correlation_idx ON product_audit_events(company_id,correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  media_type VARCHAR(24) NOT NULL CHECK(media_type IN ('primary_image','gallery','technical_sheet','manual','certificate','warranty','safety_sheet','manufacturer_document','other')),
  description TEXT, is_primary BOOLEAN NOT NULL DEFAULT false, sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ,
  FOREIGN KEY(product_id,company_id) REFERENCES products(id,company_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS product_media_product_idx ON product_media(company_id,product_id,archived_at,sort_order,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS product_media_one_primary_idx ON product_media(company_id,product_id) WHERE is_primary AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_media_id_company_uq ON product_media(id,company_id);

CREATE TABLE IF NOT EXISTS product_media_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES product_media(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number>0), storage_key VARCHAR(120) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL, mime_type VARCHAR(120) NOT NULL, file_size BIGINT NOT NULL CHECK(file_size>=0),
  checksum_sha256 CHAR(64) NOT NULL, uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(media_id,version_number),
  FOREIGN KEY(media_id,company_id) REFERENCES product_media(id,company_id) ON DELETE RESTRICT
);
ALTER TABLE product_media_versions ADD COLUMN IF NOT EXISTS public_url TEXT;
CREATE INDEX IF NOT EXISTS product_media_versions_lookup_idx ON product_media_versions(company_id,media_id,version_number DESC);
