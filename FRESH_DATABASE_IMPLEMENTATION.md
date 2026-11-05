# Fresh database initialization without stored duration

New databases create leave applications with start and end dates only; duration
is calculated when needed, so there is no duration column to remove afterward.
The former column-removal migration is preserved separately for older databases
that already contain that column.

## Current initialization

| File | Responsibility and change |
| --- | --- |
| `migrations/0001_schema.sql` | Creates `leave_application` without `day_count` from the first CREATE TABLE. All other initial fields and relationships are retained. |
| `migrations/0002_seed.sql` | Inserts the same demo requests without a duration column or duration values. Dates and other data are preserved. |
| `migrations/0003_calendar_year_leave_rules.sql` | Installs date-derived validation, state-transition, and notification triggers directly. It no longer expects a stored duration. Existing yearly views and quota policies are retained. |
| `migrations/0004_derive_leave_duration.sql` | Checks that the obsolete column is absent. It neither adds nor removes that column. Its filename remains compatible with existing migration ledgers. |
| `scripts/generate_seed.mjs` | Generates request INSERTs matching the current schema, so regenerating demo fixtures does not reintroduce duration storage. |

The four affected triggers in `0003` are `leave_update_state`,
`leave_validate_insert`, `leave_validate_edit`, and `leave_decision_notification`.
Their date-derived implementations were previously installed by the original
`0004`; this change installs those rules directly instead of replacing older
trigger definitions later.

The current `0004` creates a short-lived check table, inserts the number of stored
`day_count` columns, and requires that number to be zero. A successful migration
removes the check table. Wrangler executes it transactionally: a failure leaves
the schema, application data, and migration ledger unchanged. Its named error,
`legacy_duration_requires_upgrade`, directs older installations to the separate
upgrade path. Older databases stopped at `0001` must choose that path before
running normal migrations because the revised seed can fail before this check.

## Calculated values still used by the application

`leave_application` stores dates, not the calculated number of days. Existing
read-time calculations remain in place:

- `kLeaveColumns` in `src/worker/index.ts` calculates the inclusive length from
  `start_date` and `end_date`, then exposes it through the existing `dayCount`
  response field.
- The `leave_application_year` SQL view splits cross-year requests into yearly
  date intervals and calculates each interval's length.
- The `leave_balance` SQL view subtracts Pending and Approved allocations from
  each year's entitlement. Approval does not deduct the same reservation again.

The name `day_count` can therefore still appear as a calculated query/view result.
It is not a stored column in the application table. No client or Worker function
needed changing for this initialization update.

## Existing databases and retained account support

`database/legacy-migrations/` preserves the original `0001` through `0004`
byte-for-byte. These files are outside the normal migration directory. Their
purpose is to finish upgrading an old database that still contains `day_count`,
without resetting accounts, requests, notices, or sessions.

Wrangler tracks applied migration filenames. An installation that already applied
the original `0004` skips the revised `0001` through `0004`; it does not rerun
table creation or seed INSERTs. An older installation uses a temporary Wrangler
configuration pointing at the archived directory, applies its missing steps,
then returns to the normal configuration for remaining migrations. Full commands
are in [the database guide](database/README.md).

`0005_delete_staff_accounts.sql` is retained unchanged for possible future use:
setting `staff.deleted_at` revokes that account's sessions while retaining its
history. `0006_permanent_staff_deletion.sql` is also unchanged and continues to
support the current permanent-delete action. Applying either migration installs
supporting schema/rules; it does not itself delete employee accounts.

## Tests and documentation

`scripts/test_database.py` adds regression coverage for absence of stored duration
after every fresh migration, equivalent fresh/legacy schemas and data, safe
checkpoint failure, preservation of non-duration fields, and retained soft-delete
behavior. Legacy equivalence covers databases stopped after `0001`, `0002`, or
`0003`, applying only their missing steps. `ReadSchema` compares schema contracts independently of SQL comments
and whitespace. New function documentation is in English and describes summary,
parameters, return value, and side effects/constraints. Existing unittest method
names follow the framework's discovery convention.

`README.md` and `database/README.md` explain which initialization/upgrade path to
use. `STAFF_BUGFIX_IMPLEMENTATION.md` and `ACCEPTANCE.md` distinguish the historical
upgrade reports from this newer initialization change.

Validated on 5 November 2026:

| Check | Result |
| --- | --- |
| `npm run test:database` | 35 tests pass using disposable SQLite databases. |
| `npm run test:leave` | 35 tests pass. |
| `npm run typecheck` | Pass. |
| `npm run build` | Pass. |
| Fresh local D1 | All six migrations apply; repeating the command reports no pending migrations. |
| Checkpoint against old local D1 | Expected rejection; schema, records, and migration ledger unchanged. |
| Explicit legacy upgrade in local D1 | Archived `0004`, followed by normal `0005`/`0006`, succeeds; all non-duration fields are preserved and foreign keys remain valid. |
| API acceptance on fresh local D1 | All 396 assertions pass. |
| Seed regeneration in a temporary directory | Matches the current checked-in seed. |
| `git diff --check` | Pass. |

All D1 write checks used isolated temporary persistence directories. The existing
development database was inspected read-only and already had all six migrations
applied with no stored duration column, so it required no reset or data migration
for this change. No remote database, deployment, Git commit, or push was performed.
