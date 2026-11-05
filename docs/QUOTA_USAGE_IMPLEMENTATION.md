# Annual and sick quota usage with consistent reporting dates

Both Home cards now show how much of this year's quota is reserved, rather
than how many approved leave dates have elapsed. Used quota equals entitlement
minus remaining, and is independently verified against Pending plus Approved days.

## Agreed meaning

For annual leave, `used + remaining = 18`; for sick leave, `used + remaining = 14`.
Pending and Approved days count in the
calendar year containing each leave date, including future dates in that year.
Disapproved and Cancelled requests do not count. Approval keeps a reservation;
rejection or cancellation releases it. Cross-year requests allocate their days to
their respective years.

The reported Oscar example, checked on 5 November 2026, had five approved annual
days on 7–11 November and five pending annual days on 12–16 November. Therefore
used quota is 10 and remaining is 8. The earlier zero represented approved leave
dates elapsed through today; it was the wrong statistic for the newly confirmed
annual-card requirement, not a missing balance deduction.

Both labels are **Quota used this year (pending and approved)**. The user first
clarified the annual figure, then explicitly requested the same definition for
sick leave. The sick card therefore also replaces the elapsed-date statistic.
The API's separate `taken` field remains available with its original meaning;
the cards do not use it. The PDF itself does not spell out the detailed meaning
of “taken”; these display rules are the user's subsequent clarification.

## Implementation

| File / function | Change |
| --- | --- |
| `src/client/pages/home_page.tsx` — `QuotaCard` | Both annual and sick displayed days are `quota.entitlement - quota.remaining`, with the same label. No per-type display branch, stored counter, or new API field. |
| `src/shared/types.ts` — `QuotaSide` | Documents each field precisely. The historical API field `spent` remains all Approved days in the reporting year, including future dates. |
| `src/worker/leave_summary.ts` — `ReadLeaveSummary` | Reads both leave types in one query using one supplied reporting date. Reuses the real `leave_application_year` date segments and returns the existing quota shape. |
| `src/worker/index.ts` — `BuildMe` | Captures Hong Kong today once and passes it to the summary query; response year/date and all quota statistics use that same date. |
| `scripts/test_database.py` | Adds a fixed-clock SQLite fixture and an independent day-enumeration oracle. Tests Oscar's case, 48 type/status/date combinations, midnight/New Year, leap days, and irrelevant decision/archive metadata. |
| `scripts/test_balance_summary.ts` | Executes the actual Worker summary query through a SQLite-backed D1 adapter. Five focused tests compare results with a separate daily oracle. |
| `scripts/test_leave.tsx` | Imports the summary tests and verifies both cards against mixed Pending/Approved records and the used-plus-remaining invariant across reservation changes. |
| `scripts/acceptance.mjs` | Verifies API quota fields through submission, approval, cancellation, and rejection of future leave. Approved future leave reserves quota while elapsed taken days remain zero. |

No migration SQL, duration storage, or real account/history data was changed.

## Separate midnight defect found during the audit

Previously `BuildMe` captured a JavaScript reporting date, then read a view using
SQLite's independent current time. If the request crossed Hong Kong midnight,
the view could include the next day's taken dates. At New Year, an employee with
no historical requests could even lack the old-year row being queried.

The new read query binds the captured date and creates its two entitlement rows
independently of SQLite's current year. Both defects are reproduced in fixed-clock
tests before asserting that the new query returns the correct result. Database
views continue to support live SQL reporting and write validation; the API's
reporting date is now explicit and consistent within each response.

## Initial annual-change verification — 5 November 2026

- Independent read-only audit of the default local database: 40 accounts,
  17 requests, 86 balance rows, and 18 request-year segments; no disagreement
  with day-by-day arithmetic at the captured audit date.
- `npm run test:database`: 40 tests pass, including used + remaining = entitlement.
- `npm run test:leave`: 42 tests pass, including five real-query clock tests.
- `npm run typecheck` and `npm run build`: pass.
- API acceptance against isolated local D1: all 590 checks pass, including the
  existing concurrency cases and new quota-usage lifecycle checks.
- Real Chrome browser against a disposable account: approved five + pending five
  displays used 10, remaining 8, and entitlement 18. The annual elapsed label is
  absent and the separate sick label is preserved.
- `git diff --check`: pass.

The query tests use Node's built-in SQLite module; the tested minimum is now
Node 22.16.0, recorded in package metadata and the deployment guide. There is no
new third-party dependency. Its experimental SQLite warning is expected on Node22.

All fixture writes used `/tmp/leaveflow-used-quota.YfMu4d/d1`, separate from the
user's database. The normal local application is rebuilt/restarted for manual
checking. No remote deployment, Git commit, push, or staging was performed.

## Sick-card follow-up

`QuotaCard` now applies the same formula to both leave types. The sick test data
deliberately gives Pending, Approved, elapsed Taken, and total Used different
values so using the wrong field fails visibly. API lifecycle checks cover both
annual and sick submission, approval, cancellation, and rejection; the existing
database and summary tests already verify both entitlements and cross-year splits.
This follow-up changes the display and its tests/documentation, with no migration
or backend accounting change.

Follow-up verification passed: 42 shared/UI/reporting tests, type checking,
production build, and 691 API acceptance checks on the isolated database. Chrome
also verified a sick fixture with five Approved plus five Pending future days:
used 10 + remaining 4 = 14, while the API's elapsed `taken` value is still zero.
The former elapsed-days label is absent from the sick card.
