# Group 13 user stories and acceptance criteria

The numbered sections follow `Specification_for_G13.pdf`. Dates use Hong Kong
calendar days; balances reserve both Pending and Approved requests. Later user
requests appear separately so additional features are not confused with the PDF.

## 1. Sign-in and accounts

**As a staff member, I want to sign in with my company email and password so that
I can access my own leave information.**

- Correct credentials open my dashboard; incorrect credentials do not sign me in.
- Signed-out visitors cannot read protected staff information or submit requests.
- Staff cannot access Approver-only account or decision operations by calling the API.

**As the Approver, I want to create and edit staff accounts so that employees can
use the service with accurate personal information.**

- I can create an account with an initial password through the application.
- Email addresses are unique after normalization; simultaneous duplicate creations
  cannot create two accounts for the same email.
- I can edit profile details. Staff cannot create accounts or edit another account.

## 2. Personal information

**As a staff member, I want to view my profile and entitlements so that I know
which account I am using and how much leave I receive.**

- Profile displays email, birthday, name, staff ID, department, and year joined.
- The current calendar year's annual entitlement is 18 days and sick entitlement
  is 14 days. Remaining balances reflect current application records.

## 3. Dashboard

**As a staff member, I want my leave summary and history on Home so that I can
understand my current leave position after signing in.**

- Home shows annual and sick quotas, remaining balances, and used quota, following
  the user's later clarification of both usage metrics.
- History shows my requests and their statuses, including decisions and cancellation.
- Used quota counts Pending and Approved dates in the current year, including
  future leave. This replaces the previous elapsed sick-days display.

**As the Approver, I want to see how many requests are waiting so that I can find
the pending work quickly.**

- Home additionally displays the number of Pending applications.

## 4. Applications, editing, and cancellation

**As a staff member, I want to request Annual or Sick leave for whole calendar
days so that my request and balance use the agreed rules.**

- I enter leave type, start date, end date, and an optional reason. Both endpoints,
  weekends, and holidays count; reversed ranges and invalid dates are rejected.
- Annual leave beginning today or tomorrow is rejected; beginning two days from
  today is allowed when the other rules pass.
- My request cannot overlap my own Pending or Approved request, including one of
  the other leave type. Sharing just an endpoint still overlaps.
- The request must fit the remaining balance. Crossing New Year allocates each
  date to its calendar year and checks both years independently.
- Sick leave with an end date seven days before today is permitted; eight days
  before today is rejected. The rule concerns the end date, not the start date.
- A four-day request may omit a reason. A request longer than four days requires
  a nonblank reason.
- A successful submission becomes Pending and reserves its days immediately.
- Concurrent requests cannot jointly exceed the quota or create an active overlap.

**As an applicant, I want to edit or cancel my Pending request so that I can
correct or withdraw it.**

- Only its applicant can edit/cancel it. Editing reruns every submission rule.
- Editing replaces the previous reservation; it does not charge both versions.
- Cancellation restores the reservation exactly once, including under duplicate
  concurrent cancellation attempts.
- A stale edit cannot overwrite an application that has already changed.

**As an applicant, I want to cancel future Approved leave when my plans change.**

- Cancellation is allowed through the day before the start date; it is rejected
  on or after the start date. Successful cancellation restores its reserved days.

## 5. Approval

**As the Approver, I want to review Pending requests in start-date order and
approve or disapprove them so that staff receive a recorded decision.**

- The default Pending queue is sorted by ascending start date.
- Both actions allow an optional comment for requests of up to four days and
  require a nonblank comment for longer requests.
- Approval retains the existing reservation; disapproval releases it.
- The applicant sees the new status and corresponding notice.
- A decision uses the revision displayed to the Approver. A conflicting edit or
  decision cannot be silently overwritten or produce duplicate decision notices.
- Concurrent approval/cancellation must finish in a legal state with a balance
  matching that final state. A future Approved request may validly be cancelled
  immediately after approval.

## 6. Leave records

**As the Approver, I want to select a date and see every staff member's matching
leave records so that I can inspect leave on that day.**

- A record matches when the selected date is between its start and end dates,
  inclusive. Submission date does not determine a match.
- Matching records include every status. Staff cannot access this all-staff report.

## Additional user-requested behavior

**Account management:** permanent deletion shows a confirmation dialog and requires
the Approver's own password; success removes the staff account, sessions, history,
and notices. Cancellation or an incorrect password changes nothing. Password reset
also requires the Approver's password, accepts a new 8–72-character staff password,
revokes existing staff sessions, and preserves the employee's profile/history.
The Approver's account cannot be deleted through these actions.

**Archive:** the initial list includes all statuses and all years. Date search and
See All switch the displayed records. The pie chart counts applications overlapping
the current Hong Kong year, once per application. Cancelled requests count only
when Show cancelled is checked; the checkbox never hides list records.

**Presentation:** Annual labels are teal and Sick labels purple across both roles.
Approver navigation and the emphasized pending count follow the requested order
and styling. Disabled annual dates explain the two-day rule on hover. Balance cards
omit separate Pending/Approved subtotals while history retains status badges.
Both cards show used quota rather than elapsed leave days: Pending plus
Approved dates allocated to this year, including future dates. Used plus remaining
equals the 18-day annual entitlement or the 14-day sick entitlement, respectively.

**Storage:** a fresh application table never contains a stored duration column.
Reads derive duration from dates. `0005` soft-deletion support remains available;
the current account-delete UI continues to use permanent deletion.
