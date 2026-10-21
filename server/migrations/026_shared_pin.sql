-- Two people with the same PIN can't be told apart when signing in with the PIN alone. New
-- duplicates are refused when a PIN is set; one found at sign-in (from before that rule) is
-- marked here, so the manager sees who needs a new PIN until it is changed.
ALTER TABLE bluebar.accounts ADD COLUMN shared_pin boolean NOT NULL DEFAULT false;
