-- Pattern-lock sign-in for waiters (the "pattern" login mode): a 3x3 dot pattern,
-- stored like the PIN as a scrypt hash, next to it rather than instead of it — so a
-- venue can switch login modes without anyone losing their PIN.
ALTER TABLE bluebar.accounts ADD COLUMN pattern_hash text;
-- A waiter may have only a pattern; every account still needs some secret.
ALTER TABLE bluebar.accounts ALTER COLUMN secret_hash DROP NOT NULL;
ALTER TABLE bluebar.accounts ADD CONSTRAINT accounts_has_secret
  CHECK (secret_hash IS NOT NULL OR pattern_hash IS NOT NULL);
