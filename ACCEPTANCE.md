# LeaveFlowSE acceptance checklist

Checked against the local Worker on http://127.0.0.1:43219 by `npm run acceptance` (scripts/acceptance.mjs), then walked in the browser as Oscar Lam and as Mira Cheung, including a phone-width layout. The local database was reset to the demo seed after those runs, so the app you open still has the original sample requests.

- [x] Sign-in succeeds when the email and password match an account the approver created.
- [x] The email is a @worksmartse.hk address. Any other domain is refused, and there is no self-registration.
- [x] After sign-in, a staff member reaches their own profile, quota, balance, and applications. The approver signs in the same way and also reaches the approver screens.
- [x] The profile shows email, name, staff ID, birthday, department, and year joined.
- [x] The signed-in person sees their own profile.
- [x] The approver sees their own profile through that same screen.
- [x] Each person has 18 days of annual leave and 14 days of sick leave.
- [x] Totals and spent amounts are whole days.
- [x] The entitlement and the days already spent are both visible, separately, for each leave type.
- [x] The approver sees the same balance figures on their own staff home.
- [x] History lists only applications submitted by the signed-in person.
- [x] Each entry shows leave type, start date, end date, reason, and status.
- [x] Status is one of Pending, Approved, Disapproved, Cancelled.
- [x] The form takes leave type (annual or sick), start date, end date, and reason.
- [x] The stored length is the inclusive calendar-day count, and one quota unit is one day. A same-day request is 1 day.
- [x] The new application is Pending and appears in the applicant’s history.
- [x] While Pending, the applicant can change type, start date, end date, and reason.
- [x] After the change the status is still Pending and the history shows the updated content.
- [x] Modification is available only while the status is Pending.
- [x] The applicant can cancel a Pending application at any time. The status becomes Cancelled.
- [x] The applicant can cancel an Approved application on any Hong Kong date up to and including the day before the start date. The status becomes Cancelled, and those days leave the spent balance.
- [x] Approved leave whose start date is already today or earlier cannot be cancelled.
- [x] Approving writes an in-system notification for the applicant.
- [x] Disapproving writes an in-system notification for the applicant.
- [x] The applicant can read that notification after signing in. Opening the list marks it read.
- [x] The approver sets the email and the initial password. The password is returned once and is not on the profile.
- [x] An email outside @worksmartse.hk is refused.
- [x] The new person can sign in with that email and password. New accounts are staff, so there is still one approver.
- [x] The approver can update email, name, staff ID, birthday, department, and year joined.
- [x] The staff member sees those updated details on their own profile.
- [x] A staff role has no way to edit a profile. The approver routes respond with a refusal.
- [x] The pending screen shows the number of Pending applications.
- [x] Each row shows the staff member, leave type, start date, end date, and reason.
- [x] The queue is the applications the approver has not yet decided.
- [x] Approve and Disapprove are available on Pending applications.
- [x] Approve sets Approved. Disapprove sets Disapproved.
- [x] Those two outcomes are archived. The approver can decide their own Pending application.
- [x] A chosen date returns applications from all staff whose start-to-end period covers that date.
- [x] The submission day does not select the row.
- [x] Each row shows the staff member, leave type, start date, end date, reason, and status.
- [x] On HTTP, the session cookie is HttpOnly and SameSite=Lax, and it is not marked Secure. The Worker sets Secure when the request URL is HTTPS.

Production deploy was not completed in this environment: `wrangler whoami` reported that Wrangler is not authenticated, and there was no Cloudflare API token to create the remote D1 database.
