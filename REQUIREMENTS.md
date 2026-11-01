# Current Group 13 requirements

The six requirement groups supplied on 1 November 2026 supersede the older balance
semantics in `requirements-raw.md` and `build-prompt.md`. The project PDF supplies
the general product/coursework context; these group-specific parameters govern
this implementation.

## Accounts and profile

- Staff and Approver sign in with a unique company email and assigned password.
- Only the Approver creates accounts with an initial password or edits profiles.
- Profiles show email, birthday, name, staff ID, department, year joined, and the
  18 annual / 14 sick day entitlements for the current calendar year.
- The existing single-approver workflow is retained, including their staff role.

## Dashboard and balances

- Show current-year annual quota and remaining annual balance, sick days taken
  this year, and links to application history/status. Approver also sees pending count.
- Full calendar days count, inclusive of both endpoints; no half-days.
- Both Pending and Approved requests consume their respective year's balance.
- Rejection or cancellation releases the reservation. Approval does not charge again.
- A request crossing New Year splits its days between calendar years. There is no
  carryover or accrual. Each new year has a fresh 18/14 entitlement.
- Interpretation of "sick days taken": approved sick days dated on or before today,
  restricted to the current year. Pending and future approved days remain reserved
  but are not shown as already taken. Approved/pending totals are displayed separately.

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
- Existing historical records are preserved by migration. New submission-time rules
  are not retroactively applied to past submissions; preflight reports conflicts.
