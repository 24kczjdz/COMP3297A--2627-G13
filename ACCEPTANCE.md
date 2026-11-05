# Validation report - Group 13 database upgrade

This report records the earlier database-upgrade baseline. For the latest staff-side
fixes and verification results, see [STAFF_BUGFIX_IMPLEMENTATION.md](STAFF_BUGFIX_IMPLEMENTATION.md).
For initialization without a stored duration column, see [FRESH_DATABASE_IMPLEMENTATION.md](FRESH_DATABASE_IMPLEMENTATION.md). The original migration files tested by this historical report are preserved under `database/legacy-migrations`.

Validated locally on 1 November 2026 against base commit
`1db7c0dac08e74433010a148184db806504791e8` and the changes in this package.
The remote Cloudflare database and deployed application were not modified.

## Automated checks

| Check | Outcome | Scope |
| --- | --- | --- |
| `python scripts/test_database.py` | 25 tests pass | Actual migrations applied to fresh in-memory SQLite databases with foreign keys enabled |
| `npm run typecheck` | Pass | Client, Worker and shared TypeScript |
| `npm run build` | Pass | Vite production client build |
| Wrangler local D1 migrations | Pass | All three migrations execute successfully in local D1 |
| `npm run acceptance` | 90 counted assertions pass | HTTP API against the local Worker/D1; additional assertions check cookies, notices, ownership and reports |

Verification used Node 24, Python 3, Vite 6.4.5 and Wrangler 4.156.0.
The environment provided pnpm; `pnpm import` / frozen install confirmed the existing
`package-lock.json` resolutions, with no dependency manifest/lockfile changes.
Standard npm commands above are their repository equivalents.

## Requirement coverage

1. Accounts: company-domain restriction, incorrect-password refusal, unique email,
   approver-only creation/profile edits, assigned initial password, staff role on
   creation, hidden password fields, session invalidation on logout.
2. Profile/dashboard: personal fields, current-year 18/14 entitlements, pending
   reservations, remaining balances, elapsed approved sick days, pending count.
3. Applications: inclusive whole days, optional short-request reasons, >4-day
   reasons, 2-day annual notice, 7-day sick end-date backdating, pending/approved
   overlap prevention across types, same rules on edits, and yearly quota limits.
4. Lifecycle: edits replace their old reservation; pending cancellation and
   rejection restore balance; approval does not deduct twice; approved future
   cancellation restores balance; started approved leave cannot be cancelled.
5. Decisions: both outcomes require a comment for >4 days, store actor/comment,
   create one notice, and preserve final decisions. Injected notification failure
   rolls back the decision in the database test.
6. Reports: queue sorted by start date; date search includes all statuses based on
   leave dates; ordinary staff cannot open another staff member's application.
7. Calendar boundaries: cross-year requests allocate days to both years and must
   fit both balances; no future days are counted as taken; same-day leave is one day.
8. Concurrency: two simultaneous 10-day nonoverlapping annual requests cannot both
   reserve a quota of 18. Two concurrent decisions yield one success and one
   refusal/conflict, with exactly one notification. Stale revisions cannot overwrite.
9. Upgrade: original 40 staff, eight requests and three notices survive migration;
   foreign keys remain valid; maintenance/report SQL is read-only.

## Reproduce and limits

Follow [database/README.md](database/README.md) to create an isolated local D1
directory and start the Worker. API tests create uniquely named staff and history;
they refuse non-local hosts. They do not depend on fixed sample request counts.

The PDF provides general project context; [REQUIREMENTS.md](REQUIREMENTS.md) records
the user's current six requirement groups and the cross-year/taken-day interpretations.
Existing historical data is not rewritten to satisfy new submission-time rules.
Use `database/preflight.sql` on the real database and review conflicts before upgrade.

This is local automated validation, not a production migration or a full browser/
accessibility audit. No claim is made about the current remote dataset's integrity.
