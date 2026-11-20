-- Scope invoices to the company/branch of their sale and distinguish an
-- internal tracking number from an SRI document number.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS internal_number VARCHAR(80),
  ADD COLUMN IF NOT EXISTS legacy_number VARCHAR(80);

UPDATE invoices i
SET company_id = s.company_id,
    branch_id = s.branch_id
FROM sales s
WHERE s.id = i.sale_id
  AND (i.company_id IS NULL OR i.branch_id IS NULL);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- Preserve numbers created by the old internal placeholder. A number is
-- considered an SRI number only when the row already records authorization.
UPDATE invoices
SET legacy_number = invoice_number,
    internal_number = 'LEGACY-' || LEFT(id::text, 12),
    invoice_number = CASE
      WHEN status = 'authorized' AND authorization_code IS NOT NULL THEN invoice_number
      ELSE NULL
    END,
    status = CASE
      WHEN status IS NULL THEN 'not_issued'
      WHEN status IN ('pending', 'authorized') AND authorization_code IS NULL THEN 'not_issued'
      ELSE status
    END
WHERE internal_number IS NULL;

ALTER TABLE invoices
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL,
  ALTER COLUMN internal_number SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'not_issued',
  ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS branches_company_id_id_uq
  ON branches(company_id, id);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_company_branch_fk;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_company_branch_fk
  FOREIGN KEY (company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT;

-- Issued or pending fiscal evidence must not disappear when a sale is removed.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_sale_id_fkey;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('not_issued', 'pending', 'authorized', 'rejected', 'cancelled'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_branch_internal_number_uq
  ON invoices(company_id, branch_id, internal_number);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_sri_number_uq
  ON invoices(company_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_company_branch_created_idx
  ON invoices(company_id, branch_id, created_at DESC);

COMMENT ON COLUMN invoices.invoice_number IS
  'Número del comprobante electrónico SRI; permanece NULL hasta su emisión electrónica.';
COMMENT ON COLUMN invoices.internal_number IS
  'Referencia interna del ERP; no representa un comprobante autorizado por el SRI.';
COMMENT ON COLUMN invoices.legacy_number IS
  'Número conservado de la generación anterior para trazabilidad histórica.';

CREATE TABLE IF NOT EXISTS invoice_internal_sequences (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  document_year SMALLINT NOT NULL CHECK (document_year BETWEEN 2000 AND 9999),
  last_sequence BIGINT NOT NULL CHECK (last_sequence > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, branch_id, document_year),
  FOREIGN KEY (company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE CASCADE
);

-- Start new internal sequences after existing invoices for that branch/year.
INSERT INTO invoice_internal_sequences(company_id, branch_id, document_year, last_sequence)
SELECT company_id,
       branch_id,
       EXTRACT(YEAR FROM COALESCE(issued_at, created_at))::smallint,
       COUNT(*)::bigint
FROM invoices
GROUP BY company_id, branch_id, EXTRACT(YEAR FROM COALESCE(issued_at, created_at))::smallint
ON CONFLICT (company_id, branch_id, document_year)
DO UPDATE SET last_sequence = GREATEST(invoice_internal_sequences.last_sequence, EXCLUDED.last_sequence),
              updated_at = NOW();
