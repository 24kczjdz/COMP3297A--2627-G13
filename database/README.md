# Database management

## Files and data model

- `migrations/0001_schema.sql`: creates the four tables. The application table
  stores start/end dates and never creates a duration column.
- `migrations/0002_seed.sql`: demo fixtures matching that date-only table.
- `migrations/0003_calendar_year_leave_rules.sql`: data-preserving upgrade adding
  decision metadata, a revision number, indexes, views, and rule-enforcing triggers.
- `migrations/0004_derive_leave_duration.sql`: verifies that no stored `day_count`
  exists. It keeps the migration filename for existing migration ledgers, but does
  not create or remove a duration column on a fresh database.
- `database/legacy-migrations/0001` through `0004`: unchanged copies of the old
  schema/seed/rules/column-removal upgrade, used only for databases that still
  contain the old duration column. They are outside the normal migration directory.
- `database/preflight.sql`: read-only date/overlap/quota checks before or after upgrade.
- `migrations/0005_delete_staff_accounts.sql`: retained soft-deletion support.
  Setting `staff.deleted_at` revokes sessions; the Worker excludes marked accounts.
  The current UI uses permanent deletion instead, but this capability is retained.
- `migrations/0006_permanent_staff_deletion.sql`: a confirmed staff deletion now
  removes the account, its sessions, its leave applications and their notifications
  atomically. The approver account is protected. Applying the migration itself
  does not purge any data.
- `database/queries.sql`: read-only current-year reporting examples after upgrade.

`staff` owns many `leave_application`, `session`, and `notification` rows. A notice
references one application. The new `decided_by` foreign key records the approver.
Passwords remain salted hashes; no SQL file introduces a plaintext password column.
`leave_application` stores only the start/end dates, not a day count. The Worker
projects a calculated `day_count` when reading records, and preserves the existing
JSON `dayCount` response field. The yearly view also calculates its own segment
length; neither value is a persisted column or mutable counter.

The current initialization files were deliberately revised so a fresh database
never stores duration, even temporarily. Existing databases are not rebuilt:
Wrangler records applied migration filenames in `d1_migrations` and does not
replay them. The preserved legacy files provide the upgrade path for older states.

Short requests use an empty reason string instead of NULL, retaining compatibility
with the original NOT NULL column. Empty decision comments are also stored as ''.

`leave_application_year` splits each request into yearly date intervals.
`leave_balance` reports entitlement, pending_days, approved_days, taken_days and
remaining for each staff/year/type. Current-year rows exist even without requests;
other years appear when a request covers them. Never manually maintain a balance
counter. Remaining = entitlement - pending_days - approved_days.

The API reads these yearly request segments through `ReadLeaveSummary` with one
captured Hong Kong reporting date, so a request crossing midnight cannot mix two
dates or years. The standalone `leave_balance` view continues to use SQLite's
current time for direct SQL reports. Annual Home usage is entitlement minus
remaining; see [the latest reporting change](../docs/QUOTA_USAGE_IMPLEMENTATION.md).

## Choosing the migration path

An empty database, or a database that already applied the original `0004`, uses
the normal command:

```bash
npm run migrate:local
```

For a remote database, use `npx wrangler d1 migrations apply leaveflowse --remote`.
These are separate databases; a local migration does not modify the remote one.

For an older database, inspect its structure and pending migrations first:

```bash
npx wrangler d1 execute leaveflowse --local --command "PRAGMA table_info(leave_application);"
npx wrangler d1 migrations list leaveflowse --local
```

If the application table still contains `day_count`, use the legacy procedure
below. A `legacy_duration_requires_upgrade` constraint failure in current `0004`
also identifies this case. Do not bypass the check or delete existing data.
Choose the legacy path before applying normal migrations: an older database
stopped at `0001` can already fail at the revised `0002` because its old duration
column is still required.

## Existing installations and legacy upgrade

1. Stop accepting writes for the upgrade and export a backup:

   ```bash
   npx wrangler d1 export leaveflowse --remote --output backup-before-staff-fixes.sql
   npx wrangler d1 execute leaveflowse --remote --file database/preflight.sql
   ```

2. Review any reported duplicate normalized emails, multiple approvers, malformed
   ranges, active overlaps or yearly overbooking. Duplicate emails/multiple approvers
   prevent the new indexes from being created. Resolve those deliberately in your
   own data before retrying. Historical overlaps/overbooking are preserved and
   reported, never silently removed or rewritten. Negative remaining balances can
   therefore appear for legacy overbooking; reject/cancel eligible reservations to
   resolve them. Existing decisions have NULL `decided_by` because their actor was
   not recorded; no actor is invented during upgrade.

3. **Only if the existing application table still has `day_count`:** finish the
   archived migrations through the original `0004` first. Create a temporary copy
   of `wrangler.toml` named `wrangler.legacy.toml` in the repository root. In that
   copy, change only the migration directory:

   ```toml
   migrations_dir = "database/legacy-migrations"
   ```

   Keep the same database name, ID, and binding. From the repository root, run:

   ```bash
   npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.legacy.toml
   ```

   For a local database use `--local --persist-to .wrangler/state` instead of
   `--remote`; if that database uses a custom persistence directory, pass that same
   directory. Wrangler uses the original migration filenames and existing ledger
   to apply only missing legacy steps. This supports older databases stopped after
   `0001`, `0002`, or `0003` without reseeding already migrated data. The archived
   `0004` removes the obsolete column and preserves all other data.

   Do not use the archived chain to create new databases. Do not commit or deploy
   the temporary legacy configuration; remove that temporary copy after this step.

4. Apply remaining normal migrations and deploy the matching application in the
   same maintenance window. Omit the temporary configuration argument:

   ```bash
   npx wrangler d1 migrations apply leaveflowse --remote
   npm run build
   npx wrangler deploy
   ```

5. Check profiles, current-year balances, history, and the pending queue. Use the
   same commands with `--local` first on a local copy. Do not point automated
   acceptance tests at production; they intentionally write fixtures.

Do not delete `.wrangler`, drop tables, rerun seed INSERTs, or alter migration
ledger rows to upgrade. Keep the archived SQL unchanged. Do not repeatedly run
migration files with `d1 execute`; let Wrangler track each applied filename.
If the schema was manually modified and no longer matches its recorded migration
history, reconcile that installation separately. Do not recreate the obsolete
column. Old Workers that still write `day_count` cannot run against the new schema;
rollback requires the matching database backup and previous Worker together.

## Atomicity and concurrency

Submission/edit triggers check overlaps and per-year quotas inside the write
statement. Two simultaneous submissions cannot both use a stale balance read.
Pending edits exclude their own old allocation from the quota calculation.
Application updates increment `revision` and include the old revision/status in
the WHERE clause. Edits and decisions use the revision supplied by the browser
from the record the user saw, not a freshly fetched version. A competing change
produces HTTP 409 instead of overwriting an edit or approving unseen changes.
D1 includes trigger writes in `meta.changes`, so only zero means no application
was updated. A decision's AFTER trigger inserts its notice; either both commit or
both roll back. The Worker must not insert a second notice.

Database constraints complement server authentication; SQL cannot identify the
browser user. Keep database credentials/bindings exclusively on the Worker and
retain its staff ownership and approver role checks.

## Local tests

Use an isolated persistence directory (no reset/deletion needed):

```bash
npm ci
npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/requirements-check
npm run build
npx wrangler dev --local --port 43219 --persist-to .wrangler/requirements-check
```

In a second terminal:

```bash
npm run test:database
npm run test:leave
npm run typecheck
npm run acceptance
```

The SQL tests use disposable in-memory SQLite databases. Acceptance tests exercise
the actual Worker and local D1. Test account names and dates are generated per run.
