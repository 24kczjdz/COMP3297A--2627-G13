# Build prompt — LeaveFlowSE

Copy everything below the line into a coding agent. Build only what it asks for.

---

You are building **LeaveFlowSE**, a small web application for WorkSmartSE, a Hong Kong company of about 40 staff. It replaces paper leave forms and WhatsApp. One approver checks every application. Staff apply for leave, the approver decides, and leave records can be looked up by the day someone is away.

Implement the requirements below exactly. Do not add email, WhatsApp, SMS, SSO, self-registration, a public sign-up page, half-day leave, holiday calendars, or a “leave completed” state. The source leaves “leave completed?” unspecified, so Approved is a final decision until the applicant cancels it under the rule below.

Use **Cancelled** (not “Canceled”) and **Disapproved** (this is the course spec’s “reject”).

The approver is a staff member. Every staff function also works for the approver, including applying for their own leave and deciding that application.

Allowed sign-in addresses are company addresses on `@worksmartse.hk` only. Put that domain in one config constant.

Dates are calendar dates in `YYYY-MM-DD`, interpreted in **Asia/Hong_Kong**. One quota unit is one full day. The length of a request is the number of calendar days from the start date through the end date, inclusive. Do not skip weekends or public holidays. A same-day request is 1 day.

**Quota already spent** means whole days of **Approved** leave that is still approved. Pending, Disapproved, and Cancelled requests do not count as spent. Cancelling an Approved request returns those days to the unspent balance. Show the 18-day and 14-day entitlements separately from days already spent, for annual leave and sick leave.

## Techniques

Use these techniques. Do not swap the stack.

- **Story-driven build.** Implement each user story below and treat its acceptance criteria as the test list. Ship the staff stories and the approver stories in one application.
- **Domain state machine.** A leave application has exactly four states: Pending, Approved, Disapproved, Cancelled. Encode the transitions in one module and call that module from the write paths.
  - Submit creates Pending.
  - The applicant may edit leave type, start date, end date, and reason only while Pending. The status stays Pending.
  - The applicant may cancel a Pending application at any time.
  - The applicant may cancel an Approved application only while today in Hong Kong is on or before the day before the start date. From the start date onward, cancellation is refused.
  - The approver may approve or disapprove only a Pending application.
  - Approved and Disapproved applications are archived: they stay in history and in the date search, and they leave the pending queue.
  - Disapproved and Cancelled applications cannot be edited or decided again.
- **Role-based access control.** Two roles: `staff` and `approver`. There is exactly one approver. The approver inherits staff rights. Enforce every rule on the server. Hiding a button is not authorization.
- **Session authentication.** Email and password sign-in. Hash passwords with **PBKDF2-SHA-256** via the Web Crypto API (at least 100,000 iterations) and a unique salt per account. Store only the salt and hash. Never return a password from the API, and never render a password on the profile page. The create-account form may echo the password the approver just typed, on that response only, so they can hand it to the staff member.
- **Session cookie.** After sign-in, set an HTTP-only, SameSite=Lax cookie holding a random session id stored server-side. Sign-out deletes the session. All leave and profile routes require a live session.
- **Server-side validation.** Check the company domain, required fields, date order (end date on or after start date), whole-day dates, leave type (`annual` or `sick`), and the state-machine guards. Return a clear error the UI can show.
- **Parameterized SQL.** All database access goes through prepared statements. No string-built SQL.
- **Inclusive date query.** The approver’s date search selects applications where `start_date <= chosen date <= end_date`. Filter on the leave dates, not on the submission timestamp.
- **In-app notification as a derived feature.** When the approver approves or disapproves, insert one notification for the applicant. The applicant reads notifications inside the app after sign-in. Do not send them anywhere else.
- **Component UI with explicit states.** Each screen handles loading, empty, and error. Layout works on a desktop width and on a phone width.
- **Seeded demo data.** Migrations create the schema and seed about 40 staff accounts, one of whom is the approver, plus a few applications in each status so the history, pending queue, balance, and date search are demonstrable.
- **Acceptance check before deploy.** Walk every acceptance criterion in this prompt against the running app. Fix failures before deploying.

## Stack

- **Language:** TypeScript.
- **UI:** React and Vite, with React Router and Tailwind CSS. Real interface copy. No placeholder lorem text.
- **API:** Hono running on a Cloudflare Worker. The Worker serves the built SPA and the JSON API under `/api`.
- **Database:** Cloudflare D1 (SQLite). Schema and seed live in versioned SQL migrations.
- **Local dev:** Wrangler, with a local D1 database.
- **Config:** `wrangler.toml` declares the Worker and the D1 binding. The company domain and the quota numbers (18 annual, 14 sick) live in one shared constants module used by client and server.

Do not add a second database, an ORM that hides the SQL, Redis, or an external auth provider.

## Data to store

**Staff account**

- id, email, password salt, password hash
- name, staff ID, birthday, department, year joined
- role: `staff` or `approver`
- created at

**Leave application**

- id, applicant id
- leave type: `annual` or `sick`
- start date, end date, day count
- reason
- status: `Pending`, `Approved`, `Disapproved`, or `Cancelled`
- archived flag, true for Approved and Disapproved
- submitted at, decided at, cancelled at, updated at

**Notification**

- id, recipient id, application id
- kind: `approved` or `disapproved`
- message, created at, read at

**Session**

- id, staff id, created at, expires at

## Pages

1. **Sign in.** Email and password. Errors stay on this page. No registration link.
2. **Home, after sign in.** The signed-in person’s name, total quota, and quota already spent for annual and sick leave, in whole days. Links to profile, history, a new application, and notifications. Approver also sees links to pending decisions, staff accounts, and leave-by-date.
3. **Profile.** Read-only for the signed-in user: email, name, staff ID, birthday, department, year joined. No password field.
4. **New application.** Leave type, start date, end date, reason. Show the computed whole-day count before submit. On success the new row is Pending and listed in history.
5. **My applications.** That user’s rows only, with type, start, end, reason, day count, and status. Pending rows can be edited and cancelled. Approved rows can be cancelled only while Hong Kong today is still before the start date. Other rows show their status with no edit or cancel action.
6. **Edit pending application.** Same fields as the form. Saving keeps the status Pending.
7. **Notifications.** List of in-app decision notices for the signed-in user. Opening the list marks them read.
8. **Approver: staff accounts.** Create a staff account (company email, initial password, name, staff ID, birthday, department, year joined). Edit those profile fields later. Refuse a second approver and refuse an external email.
9. **Approver: pending.** Show the count, then each pending application with the staff member’s name and staff ID, leave type, start, end, day count, and reason. Approve and Disapprove buttons act only on Pending rows and write the notification.
10. **Approver: leave on a date.** A date picker. Results are every staff application whose leave period covers that date, with staff name, staff ID, type, start, end, reason, and status.

## Acceptance criteria to satisfy

**Sign in**

- Sign-in succeeds when the email and password match an account the approver created.
- The email is a `@worksmartse.hk` address. Any other domain is refused, and there is no self-registration.
- After sign-in, a staff member reaches their own profile, quota, balance, and applications. The approver signs in the same way and also reaches the approver screens.

**Profile**

- The profile shows email, name, staff ID, birthday, department, and year joined.
- The signed-in person sees their own profile.
- The approver sees their own profile through that same screen.

**Quota**

- Each person has 18 days of annual leave and 14 days of sick leave.
- Totals and spent amounts are whole days.
- The entitlement and the days already spent are both visible, separately, for each leave type.
- The approver sees the same balance figures on their own staff home.

**History**

- History lists only applications submitted by the signed-in person.
- Each entry shows leave type, start date, end date, reason, and status.
- Status is one of Pending, Approved, Disapproved, Cancelled.

**Submit**

- The form takes leave type (annual or sick), start date, end date, and reason.
- The stored length is the inclusive calendar-day count, and one quota unit is one day.
- The new application is Pending and appears in the applicant’s history.

**Modify**

- While Pending, the applicant can change type, start date, end date, and reason.
- After the change the status is still Pending and the history shows the new content.
- Modification is offered only while the status is Pending.

**Cancel**

- The applicant can cancel a Pending application at any time. The status becomes Cancelled.
- The applicant can cancel an Approved application on any Hong Kong date up to and including the day before the start date. The status becomes Cancelled.
- The history then shows Cancelled.

**Notification (derived)**

- Approving writes an in-system notification for the applicant.
- Disapproving writes an in-system notification for the applicant.
- The applicant can read it after signing in.

**Create account**

- The approver sets the email and the initial password.
- An email outside `@worksmartse.hk` is refused.
- The new person can sign in with that email and password.

**Edit profile**

- The approver can update email, name, staff ID, birthday, department, and year joined.
- The staff member sees those updated details on their own profile.
- A staff role has no way to edit a profile.

**Pending queue**

- The screen shows the number of Pending applications.
- Each row shows the staff member, leave type, start date, end date, and reason.
- The queue is the applications the approver has not yet decided and the applicant has not cancelled.

**Decide**

- Approve and Disapprove are available on Pending applications.
- Approve sets Approved. Disapprove sets Disapproved.
- Those two outcomes are archived. The approver can decide their own Pending application.

**Leave on a date**

- A chosen date returns applications from all staff whose start-to-end period covers that date.
- The submission day does not select the row.
- Each row shows the staff member, leave type, start date, end date, reason, and status.

## Repository expectations

- README with: what the app is, local setup (`npm install`, D1 migrate, `wrangler dev`), the seeded approver email and initial password, the staff demo password pattern, and the production URL once deployed.
- A short `ACCEPTANCE.md` checklist copied from the criteria above, each box marked after you have exercised it.
- No secrets in client-side source. The demo seed password may live in the SQL seed because this is a coursework demo; say so in the README.

## Deploy to Cloudflare

Deploy the finished app to Cloudflare’s free tier. Do this last, after the acceptance walk-through passes locally.

1. Confirm the Worker serves the SPA and `/api` locally with `wrangler dev`, against a local D1 database loaded with the migrations and seed.
2. Create a remote D1 database and put its name and id in `wrangler.toml`.
3. Apply the same migrations to the remote database with Wrangler so the schema and the demo seed exist in production.
4. Set the production cookie to `Secure` when the request is HTTPS.
5. Deploy the Worker with Wrangler (`wrangler deploy`). The static UI is built first and served by that Worker.
6. Open the `*.workers.dev` URL. Sign in as the seeded approver, sign in as a seeded staff member, submit a one-day annual request, approve it, and confirm the applicant’s notification, spent quota, and the leave-date search.
7. Put the live URL in the README.

The deployment target is Cloudflare. Do not deploy this project to another host.
