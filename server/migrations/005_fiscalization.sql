-- BlueBill fiscalization result, stored per invoice. Best-effort: order.pay never rolls
-- back on a fiscalization failure, so most invoices are 'pa_fiskalizuar' until BlueBill
-- is configured (BLUEBILL_API_TOKEN/BLUEBILL_VENUE_SLUG) or a manager retries one.
ALTER TABLE bluebar.invoices
  ADD COLUMN fiscal_status text NOT NULL DEFAULT 'pa_fiskalizuar'
    CHECK (fiscal_status IN ('pa_fiskalizuar', 'fiskalizuar', 'dështoi')),
  ADD COLUMN fiscal_iic text,
  ADD COLUMN fiscal_fic text,
  ADD COLUMN fiscal_verification_url text;
