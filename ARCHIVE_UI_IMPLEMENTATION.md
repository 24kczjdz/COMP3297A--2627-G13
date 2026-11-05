# Archive and leave-type presentation

The approver's Archive opens with applications in every status, and a date search replaces that report with applications covering the selected leave date. The pie chart counts only applications whose leave dates overlap the current Hong Kong calendar year; it excludes cancellations unless Show cancelled is checked, without changing the list.

## Archive and date search

- `src/client/pages/archive_page.tsx`: `Archive()` loads the default report on entry. `OnSearch()` submits the selected date; editing the date input alone does not change the report. `ShowReport()` handles searches, retries and See All, clearing previous results while loading. Effect cleanup ignores obsolete responses after a new query or navigation.
- `src/client/api.ts`: `GetArchive()` loads `/api/approver/archive`. Existing `getOnDate()` continues to load `/api/approver/on-date?date=YYYY-MM-DD`.
- `src/worker/index.ts`: the archive GET handler selects all records across all years, ordered by start date, submission time and ID descending. Neither status nor the `archived` column filters the list. Existing approver authorization also protects this endpoint.
- The date endpoint preserves the existing specification: `start_date <= date <= end_date`, including both endpoints and all statuses. Submission time does not affect the match. Both date searches and See All include Pending applications.
- The top-right date input exposes the requested explanation on hover and keyboard focus. Search date submits the filter. See All clears the date and reloads the complete archive.
- `src/client/app_routes.tsx`: `/approver/archive` is the new route. The old `/approver/on-date` page URL redirects to it for existing bookmarks.

## Pie chart

`src/client/leave_type_chart.tsx` provides `LeaveTypeChart()`. Each included application contributes one count to its leave type; these are not leave-day totals or unique-person counts. Within the current year, the Show cancelled checkbox starts unchecked and excludes Cancelled. Checking it includes all four statuses within that year. Counts, percentages, total and the accessible chart description update together; the record list and source records remain unchanged.

`Archive()` derives `current_year` from `hongKongToday()` and passes it to the chart.
The chart includes a record only when `startDate <= December 31` and
`endDate >= January 1` of that year. Cross-year requests therefore count once if
they cover any part of the year; submission time is ignored. The year appears
below Leave types and in its accessible description. Date searches still select
the report first, after which the same year and cancellation filters apply to the
chart. See All restores all years in the list but keeps the chart restricted to
the current year; checking Show cancelled never includes leave outside that year.

`Archive()` owns `show_cancelled` and passes it with `SetShowCancelled` to the chart. This keeps the checkbox choice across date searches, retries and See All, even when loading temporarily unmounts the chart. Reopening the page starts unchecked again. Empty results, including a cancelled-only result with the checkbox off, show zero counts. A single included leave type uses the entire circle. The chart remains above the list on narrow screens.

## Shared presentation

- `src/client/leave_type_label.tsx`: `LeaveTypeLabel()` and `GetLeaveTypeClass()` apply annual teal (`#0f766e`) and sick purple (`#7c3aed`). `LeaveTypeText()` colors existing notice labels without changing the message text.
- `src/client/index.css`: `--leave-annual-color` and `--leave-sick-color` provide the same colors to labels and the pie chart.
- `src/client/components.tsx`: `LeaveList()` uses colored type labels; `SelectInput()` accepts a presentation class. `Shell()` places Home, My leave, New request, Pending, Staff and Archive on the approver's left, with Profile and Notices on the right. Ordinary staff navigation retains its existing order and layout.
- `src/client/pages/home_page.tsx`: the approver's waiting count is large, bold and amber; quota headings use the shared type colors and the old date-report link becomes Archive.
- `src/client/pages/pending_page.tsx`: type labels use the shared colors, and the waiting count receives the same emphasis. Sorting and decision behavior are preserved.
- `src/client/pages/profile_page.tsx`, `application_form_page.tsx` and `notifications_page.tsx`: leave-type text uses the shared colors. Form values, validation, balances, decisions and stored notifications retain their existing behavior. Native dropdown option rendering may depend on the operating system; the selected value is colored in the page.

## Verification

- `scripts/acceptance.mjs` checks archive permissions, all four statuses, cancelled records without an archive flag, cross-year records, ordering, deleted employees, and inclusive leave-date matching independent of submission date.
- `scripts/test_leave.tsx` checks chart application counts, empty reports, single-type reports, current-year boundaries, cross-year requests, submission-date independence, cancellation inclusion/exclusion, unchanged source records, and the existing leave-rule/dashboard regressions.
- Browser checks cover initial loading, date search, See All, tooltip visibility, report/chart agreement, error recovery, responsive layout, role-specific navigation and consistent colors.

Validated on 5 November 2026: TypeScript and the production build passed, all 35
rule/render tests passed, and the latest API run passed 408 assertions against an
isolated local D1 database. Browser checks cover mouse/keyboard checkbox changes,
unchanged lists, retained choices across date searches and See All, cancelled-only
results, and the unchecked default when reopening Archive. Current-year browser
checks also verify the displayed year, exclusion of future-only leave, date search,
See All and unchanged application records. The initial layout
checks also passed at desktop and 375-pixel mobile widths.
The regular local server was also checked to confirm that the new archive endpoint
was available; no existing application records were changed by these checks.

No database schema change or migration is required for this update. Restart `npm run dev` after stopping the old development server to rebuild the client and load the new API route. No commits are created automatically.
