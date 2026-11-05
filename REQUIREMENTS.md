# Current Group 13 requirements

The six requirement groups in `Specification_for_G13.pdf` supersede the older balance
semantics in `requirements-raw.md` and `build-prompt.md`. The project PDF supplies
the general product/coursework context; these group-specific parameters govern
this implementation.

## Accounts and profile

- Staff and Approver sign in with a unique company email and assigned password.
- Only the Approver creates accounts with an initial password or edits profiles.
- Additional account-management requirement: the Approver may permanently delete
  an ordinary staff account and its complete leave history. A confirmation dialog
  identifies the employee and requires the Approver's own password. Cancellation
  or an incorrect password leaves all records unchanged. Success removes the
  employee's notifications and sessions as well; the Approver cannot delete themself.
- Additional account-management requirement: while editing an ordinary staff
  account, the Approver can set a new 8-72-character password after confirming
  their own current password. A successful reset revokes all employee sessions,
  preserves profile/history data, and never returns the password. Incorrect
  confirmation or invalid input changes nothing.
- Profiles show email, birthday, name, staff ID, department, year joined, and the
  18 annual / 14 sick day entitlements for the current calendar year.
- The existing single-approver workflow is retained, including their staff role.

## Dashboard and balances

- Show current-year annual/sick quotas, remaining balances, and quota used,
  with application history/status. Approver also sees pending count. The user's
  later clarification defines both usage figures as reserved quota, replacing
  the earlier elapsed sick-days display.
- Emphasize the approver's waiting count with large colored text. Approver navigation
  places Home, My leave, New request, Pending, Staff and Archive on the left, with
  Profile and Notices on the right; ordinary staff navigation stays unchanged.
- Annual leave labels use teal and sick leave labels use purple consistently in
  both roles' pages. This presentation does not change leave rules or balances.
- Full calendar days count, inclusive of both endpoints; no half-days.
- Both Pending and Approved requests consume their respective year's balance.
- Both Home cards show "Quota used this year (pending and approved)":
  entitlement minus remaining, equal to the year's Pending plus Approved days.
  Used plus remaining equals 18 for annual leave and 14 for sick leave; future
  approved dates in the current year count immediately. Cancelled/Disapproved
  dates do not count.
- Rejection or cancellation releases the reservation. Approval does not charge again.
- A request crossing New Year splits its days between calendar years. There is no
  carryover or accrual. Each new year has a fresh 18/14 entitlement.
- The API retains a separate elapsed `taken` value for approved dates through today;
  Home displays quota used instead. Cards omit separate Pending and Approved
  subtotals; individual history records still show their status.

## Application and editing

- Types: Annual / Sick; fields: type, start, end, optional reason.
- Annual start date must be at least Hong Kong today + 2 calendar days.
- Sick end date must be on or after Hong Kong today - 7 calendar days. This rule
  tests the last date, not the start date; the specification sets no future-date ban.
- No overlap with the applicant's Pending or Approved requests, even across types.
- The request must fit each affected year's remaining balance for its leave type.
- More than 4 days requires a reason, up to 500 characters. Exactly 4 does not.
- Pending edits use all submission rules again and replace their own reservation.
- Pending applications may be cancelled at any time. Approved applications may
  be cancelled only while Hong Kong today is before the start date.

## Decisions and records

- Pending requests are sorted by start date, with submission time/ID as tie-breakers.
- Approver may approve or reject with a comment (up to 1000 characters).
- Both approval and rejection of a request longer than 4 days require a comment.
- The decision stores the approver ID, comment and timestamp and atomically creates
  an in-system notification. `Disapproved` remains the stored name for rejection.
- Date search returns every staff member's applications covering the chosen leave
  date, including Pending, Approved, Disapproved and Cancelled records.
- Archive initially lists all Pending, Approved, Disapproved and Cancelled applications
  across years. A top-right date search retains the existing inclusive date-search
  behavior; See All clears the filter and restores the initial archive. Hovering
  or focusing the date field explains that leave dates, not submission dates, match.
- A left-hand pie chart shows annual/sick application counts and percentages for
  the currently displayed report, restricted to leave dates overlapping the current
  Hong Kong calendar year. Cross-year applications count once if any leave day
  falls in the year; submission dates do not determine inclusion. The chart displays
  the year. Counts represent applications, not leave days; the record list retains
  applications from every year.
- The chart's Show cancelled checkbox is unchecked on entry: Pending, Approved
  and Disapproved count by default; checking it also includes Cancelled. The
  checkbox does not filter the record list and retains its choice across searches
  and See All while the Archive page remains open.
- Existing historical records are preserved by migration. New submission-time rules
  are not retroactively applied to past submissions; preflight reports conflicts.
