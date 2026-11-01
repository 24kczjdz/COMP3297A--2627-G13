# Database management

## Files and data model

- `migrations/0001_schema.sql`: original four tables; immutable migration history.
- `migrations/0002_seed.sql`: original demo fixtures; immutable migration history.
- `migrations/0003_calendar_year_leave_rules.sql`: data-preserving upgrade adding
  decision metadata, a revision number, indexes, views, and rule-enforcing triggers.
- `database/preflight.sql`: read-only checks against the old schema before upgrade.
- `database/queries.sql`: read-only current-year reporting examples after upgrade.

`staff` owns many `leave_application`, `session`, and `notification` rows. A notice
references one application. The new `decided_by` foreign key records the approver.
Passwords remain salted hashes; no SQL file introduces a plaintext password column.
Short requests use an empty reason string instead of NULL, retaining compatibility
with the original NOT NULL column. Empty decision comments are also stored as ''.

`leave_application_year` splits each request into yearly date intervals.
`leave_balance` reports entitlement, pending_days, approved_days, taken_days and
remaining for each staff/year/type. Current-year rows exist even without requests;
other years appear when a request covers them. Never manually maintain a balance
counter. Remaining = entitlement - pending_days - approved_days.

## Existing installations

1. Stop accepting writes for the upgrade and export a backup:

   ```bash
   npx wrangler d1 export leaveflowse --remote --output backup-before-0003.sql
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

3. Apply the pending migrations and deploy the updated application in the same
   maintenance window:

   ```bash
   npx wrangler d1 migrations apply leaveflowse --remote
   npm run build
   npx wrangler deploy
   ```

4. Check profiles, current-year balances, history, and the pending queue. Use the
   same commands with `--local` first on a local copy. Do not point automated
   acceptance tests at production; they intentionally write fixtures.

Do not delete `.wrangler`, drop tables, rerun seed INSERTs, or rewrite already
applied migrations to upgrade. Do not apply `0003` repeatedly with `d1 execute`;
Wrangler's migration tracking applies it once. The original Worker cannot write
to the upgraded schema correctly, so rolling back just the Worker is unsupported.
Rollback requires the matching database backup and previous Worker together.

## Atomicity and concurrency

Submission/edit triggers check overlaps and per-year quotas inside the write
statement. Two simultaneous submissions cannot both use a stale balance read.
Pending edits exclude their own old allocation from the quota calculation.
Application updates increment `revision` and include the old revision/status in
the WHERE clause. A competing change produces HTTP 409 instead of overwriting it.
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
python scripts/test-database.py
npm run typecheck
npm run acceptance
```

The SQL tests use disposable in-memory SQLite databases. Acceptance tests exercise
the actual Worker and local D1. Test account names and dates are generated per run.
