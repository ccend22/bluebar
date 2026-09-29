-- Bumped by every write that changes what /api/state returns — commands and the few
-- direct writes (fiscal results, PIN/pattern changes). Devices poll with their last
-- revision and get a tiny "unchanged" reply instead of the whole state.
-- Separate from `version`, which is the optimistic-concurrency check for commands:
-- a background fiscal result must not make a waiter's next command look stale.
ALTER TABLE bluebar.control ADD COLUMN revision bigint NOT NULL DEFAULT 0;
