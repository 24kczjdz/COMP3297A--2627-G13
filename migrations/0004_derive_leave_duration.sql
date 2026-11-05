-- Verify that the initial leave schema does not store a calculated duration.
-- This filename remains a migration checkpoint for databases already using it.
-- Requires migrations 0001 through 0003; runs inside Wrangler's migration transaction.
-- A legacy database with day_count must first apply the archived upgrade described
-- in database/README.md using database/legacy-migrations. Do not mark it applied
-- manually or delete existing application records to bypass this check.
-- The guard table is removed on success; existing application data is unchanged.

CREATE TABLE migration_0004_duration_check (
  stored_duration_columns INTEGER NOT NULL
    CONSTRAINT legacy_duration_requires_upgrade CHECK (stored_duration_columns = 0)
);

INSERT INTO migration_0004_duration_check (stored_duration_columns)
SELECT COUNT(*) FROM pragma_table_info('leave_application') WHERE name = 'day_count';

DROP TABLE migration_0004_duration_check;
