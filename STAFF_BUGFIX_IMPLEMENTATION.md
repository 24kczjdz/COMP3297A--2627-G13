# Staff leave fixes and implementation

Leave balances are calculated from the dates of the employee's Pending and Approved requests, with each day charged to its own calendar year. The form previews and validates the proposed change, the database enforces the same rules atomically, and the dashboard displays the resulting balance and request history.

The original staff fix upgraded an existing table through migration `0004`. The later [fresh-database change](FRESH_DATABASE_IMPLEMENTATION.md) makes the initial table date-only from `0001`; the original upgrade files now live in `database/legacy-migrations`. Historical verification counts below describe their stated test dates.

## Starting point and scope

The checked-out repository already contained migration `0003`, which implements calendar-year balance views, atomic overlap/quota checks, and lifecycle rules. Short-leave reasons were already optional in its validator and form. Those correct rules were retained and regression-tested instead of being replaced with mutable balance counters.

However, the checked-in schema and Worker still stored and wrote `leave_application.day_count`; Home had no leave-history section; Profile did not expose remaining balances; and the form lacked date limits, balance previews, and client-side date/availability validation. This change completes those paths while retaining the existing cards, navigation, authentication, account management, and approval/cancellation policies.

## 1. Deduction and remaining balance

Submitting a request reserves its Pending days immediately; approving it does not deduct the same days again. Editing replaces its previous reservation, while cancellation or disapproval releases the reservation automatically because only Pending and Approved records contribute to the balance.

For year Y:

```text
annual remaining(Y) = 18 - pending annual days(Y) - approved annual days(Y)
sick remaining(Y)   = 14 - pending sick days(Y)   - approved sick days(Y)
```

A request from 30 December to 3 January charges two days to the first year and three to the next. It must fit both years' balances, even if the current dashboard year has no days in that request.

Involved code:

- Existing SQL views `leave_application_year` and `leave_balance`: authoritative live allocations and balances; retained unchanged.
- `GetYearAllocations()` in `src/shared/leave_rules.ts`: splits inclusive dates for the form preview, including leap days.
- `GetBalancePreview()`: derives reservations from the applicant's history, ignores Cancelled/Disapproved records, and excludes the edited request by ID. It does not trust the response's `dayCount` field to calculate balances.
- `ApplicationForm()` and its `OnSubmit()`: show each year's available/requested/resulting days, reload history before checking availability, save, then refresh the authenticated profile.
- `Applications.OnCancel()`: refreshes the profile and history after cancellation.
- Existing `buildMe()` in `src/worker/index.ts`: reads the current Hong Kong year's SQL summary; no application-side balance counter was added.

The preview is advisory. Another submission can change availability after a browser read, so SQL checks the live records inside the write statement.

## 2. Duration is derived, never stored

Only the start and end dates are saved. Duration is calculated whenever a rule, API response, or notification needs it, so editing dates cannot leave a stale stored length behind.

Involved code:

- Current `migrations/0001_schema.sql` omits the stored `day_count` column from the first table creation. Current `0002` seeds dates only, and `0003` installs date-derived rules. Current `0004` is a schema check; it does not remove a column from new databases.
- The original `database/legacy-migrations/0004_derive_leave_duration.sql` still removes the obsolete column from older databases and recreates the four affected triggers. Other request fields, IDs, relationships, indexes, notices, and yearly views are preserved.
- `kLeaveColumns` in `src/worker/index.ts`: projects `CAST(julianday(end_date) - julianday(start_date) + 1 AS INTEGER) AS day_count` on reads.
- `POST /api/applications` and `PATCH /api/applications/:id`: no longer insert or update a duration.
- Existing `toLeave()`: retains the JSON `dayCount` field so the existing history and approver UI continue to work. It receives a calculated query result, not a stored column.
- `leave_update_state` and `leave_decision_notification`: calculate the long-leave threshold and notification length directly from dates.

The original `0001` through `0004` are preserved unchanged under `database/legacy-migrations` for existing databases. Fresh installations use the revised initialization files under `migrations`; see the fresh-database report for tests of both paths.

## 3. Optional reasons and the four-day threshold

A reason is optional for one through four calendar days, and required from five days onward. The form updates the label and native `required` attribute as dates change; shared validation also rejects a whitespace-only long-leave reason.

Involved code:

- `kLongLeaveThreshold` in `src/shared/leave_rules.ts`: the shared four-day boundary.
- `ApplicationForm()`: conditional reason label and `required` attribute.
- `ValidateLeaveInput()` in `src/shared/validate.ts`: preserves optional short reasons, normalizes absent/null/blank reasons to an empty string, and enforces the 500-character limit and long-leave rule.
- SQL triggers `leave_validate_insert` and `leave_validate_edit`: repeat the long-leave check using the date-derived duration.

This applies to both Annual and Sick leave and to both creation and editing. Existing long-leave approver-comment requirements remain intact.

## 4. Annual notice and sick backdating

Annual leave starts no earlier than the Hong Kong date plus two calendar days. Sick leave is checked against its end date, allowing exactly seven days of backdating even when the period starts earlier.

Involved code:

- `ShiftDate()`: UTC calendar arithmetic, avoiding the browser's local timezone for day offsets.
- `ValidateLeaveDates()`: validates real, ordered dates and the notice/backdating boundaries.
- `ValidateLeaveInput()`: calls the same date validation on both client submission and Worker requests.
- `ApplicationForm()`: annual start-date minimum, end-date minimum, and the database's supported date bounds.
- `LeaveDateInput()` in `src/client/leave_date_input.tsx`: preserves native date entry and min/max validation while providing a custom calendar popup. Individual days blocked by the annual notice rule show **"You have to apply 2 days in advance."** on mouse hover, keyboard focus, or click. Those days use `aria-disabled` and an explicit selection guard, so they can explain the restriction without becoming selectable.
- The custom calendar trigger has an opaque, fixed-width background over the input's trailing edge. Removing the extra right padding keeps Firefox's native picker underneath that trigger, so each field shows one calendar icon even when the browser ignores the WebKit picker-hiding rule. Native date entry, validation, and popup behavior are preserved.
- `GetDateRestriction()`: distinguishes the annual notice rule from an end date before the start date and sick-leave backdating. Sick leave never receives the annual notice message.
- `GetMonthDays()`: builds UTC calendar cells, including leap days. The popup supports month navigation, arrow-key date navigation, Escape, and closing when focus/pointer moves outside. The tooltip sits above the calendar so it does not move the day cells under the pointer.
- SQL notice/backdating checks in current `0003` and archived `0004`: use `date('now', '+8 hours', ...)` as the authoritative clock.

The browser clock helps with early feedback; the Worker/database date determines whether a request is accepted. Tests include today, yesterday, 27 days ago, tomorrow, exactly two days ahead, Hong Kong midnight, and New Year.

## 5. Overlaps and insufficient balance

A new or edited request cannot share any calendar day with the applicant's Pending or Approved leave, regardless of leave type. Its allocation must also fit the remaining balance of every affected year.

Involved code:

- `ValidateLeaveAvailability()` in `src/shared/leave_rules.ts`: detects inclusive overlaps and any negative projected yearly balance; it ignores the edited request's own old range.
- `ApplicationForm.OnSubmit()`: checks the latest own history before attempting a write and displays a specific refusal.
- SQL triggers `leave_validate_insert` and `leave_validate_edit`: enforce overlap and per-year limits atomically, including clients that bypass browser validation.
- Existing Worker ownership checks and revision checks: retained to prevent changing another employee's record or overwriting a concurrent update.

Adjacent periods with no shared day are allowed. Cancelled/Disapproved dates can be reused. Changing a request's leave type releases its old type's reservation and checks the replacement type's quota.

## 6. Home and Profile

Home now includes the employee's leave history and its corresponding statuses alongside the existing annual quota, remaining balance, and approved sick days taken this year. Profile keeps the fixed entitlements and adds explicitly labelled remaining balances, so quota, used days, and remaining days cannot be confused.

Involved code:

- `Home()` and existing `QuotaCard()` in `src/client/pages/home_page.tsx`: retain entitlement, remaining balance, and taken-day values. The separate Pending/Approved day totals are omitted from both quota cards because specification section 3 does not require that breakdown. Leave-history status badges and the approver's pending application count remain visible as required.
- New `LeaveHistory()`: loads the authenticated employee's complete history, with loading, empty, error, and retry states. Cleanup ignores late responses after unmount.
- Existing `LeaveList()` and `StatusBadge()`: reused without changing their layout or status logic.
- `Profile()` in `src/client/pages/profile_page.tsx`: displays separate annual/sick quota and remaining rows.
- Existing `buildMe()` and `leave_balance.taken_days`: only approved days from this year through today count as taken; pending and future days are excluded.

The approver's dashboard retains the count of all applications awaiting approval. History requests remain scoped by the server to the signed-in applicant.

## Naming and documentation

New or substantially changed application functions use PascalCase, new local variables use lower_snake_case, types use UpperCamelCase, and policy constants use `k` plus CamelCase. Existing JSON field names, React hook names, framework callbacks, and otherwise-correct unrelated functions are retained for compatibility and to avoid a broad refactor. No application class members were introduced.

Function comments are in English and state their summary, parameter requirements, return values, and side effects/constraints. The new migration also documents its schema prerequisite and maintenance constraint.

## Validation performed

All checks below passed locally on 2 November 2026. Tests used an isolated D1 persistence directory, `.wrangler/staff-bugfix-check`; the deployed site and remote database were not changed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Client, Worker, and shared code pass |
| `npm run build` | Production client build passes |
| `npm run test:database` | 27 tests pass against actual migrations in SQLite |
| `npm run test:leave` | 18 shared-rule, calendar, and rendered-UI regression tests pass |
| Wrangler local D1 migrations | All four migrations apply successfully |
| `npm run acceptance` | 139 counted API assertions pass, plus additional direct assertions |
| Browser smoke test | Short leave submits without a reason; pending overlap is refused; five-day edit requires a reason; balance changes from 15 to 14 and returns to 15 after cancellation; profile and dashboard history reflect the result |

Database/API coverage includes cancellation/rejection restoration, no double deduction on approval, cross-year overbooking, editing without self-overlap, forged client durations, concurrent quota consumption, concurrent decisions, and atomic notification rollback. UI rendering tests verify quotas, distinct remaining values, sick days taken, approver count, and all four history statuses. Calendar browser checks also verify the annual hover message, refused disabled-date clicks, keyboard movement to the first valid day, and valid selection. Browser checks are a focused desktop smoke test, not an exhaustive accessibility or device audit.

To reproduce against an isolated local database:

```bash
npm ci
npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/staff-bugfix-check
npm run typecheck
npm run test:database
npm run test:leave
npm run build
npx wrangler dev --local --ip 127.0.0.1 --port 43219 --persist-to .wrangler/staff-bugfix-check
# In another terminal:
npm run acceptance
```

### Firefox calendar rendering follow-up (5 November 2026)

`npm run typecheck`, `npm run build`, and `git diff --check` passed after the calendar trigger layout adjustment. An isolated headless Firefox render of the actual `LeaveDateInput` component confirmed one visible icon in both an empty and a populated date field. This follow-up checked rendering; it did not repeat the earlier interactive calendar smoke test.

## Applying the change to an existing installation

Run pending migrations and deploy the matching Worker together. Existing databases that already applied the original `0004` continue normally. Databases still storing `day_count` must first use the archived upgrade path; do not apply the archived column-removal script to a date-only table. See `database/README.md` for backup, preflight, and upgrade steps.

No remote migration, deployment, or Git commit was performed for this change.

Suggested commit message:

```text
fix: complete staff leave validation, balances, and dashboard history
```
