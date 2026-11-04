# LeaveFlowSE

LeaveFlowSE is the staff leave desk for WorkSmartSE, a Hong Kong company of about 40 people. Staff sign in with a company email, apply for annual or sick leave in whole days, and one approver decides. The approver is also a staff member and can apply for their own leave.

Dates are calendar dates in Asia/Hong_Kong. Every calendar day in a request counts, including weekends and holidays. Each person has 18 annual and 14 sick days per calendar year. Pending and Approved applications reserve days immediately; rejection or cancellation releases them. Requests crossing New Year charge each day to its own year. The dashboard shows the current year's balances and approved sick days through today. See [REQUIREMENTS.md](REQUIREMENTS.md) for the current rules.

## Stack

TypeScript, React, Vite, Tailwind CSS, and Hono on a Cloudflare Worker. Data lives in Cloudflare D1. Passwords are PBKDF2-SHA-256 hashes. Sessions are random ids in an HTTP-only cookie.

## Run locally

```bash
npm install
npx wrangler d1 migrations apply leaveflowse --local
npm run dev
```

Open [http://127.0.0.1:43219](http://127.0.0.1:43219).

`npm run dev` builds the interface, then starts Wrangler. The Worker serves the app and the JSON API under `/api`. The local D1 database is created by the migration command. Keep `.wrangler` to preserve local data. Local and remote databases are separate.

## Upgrade an existing database

Read [database/README.md](database/README.md) first. Migrations `0001` and `0002` remain unchanged because they may already be applied. `0003_calendar_year_leave_rules.sql` adds calendar-year rules. `0004_derive_leave_duration.sql` removes the redundant stored duration while preserving the other data and existing balance views. Apply all pending migrations together with this version of the Worker: older Workers still write the removed `day_count` column.

The database enforces date/length validity, notice and backdating rules, required long-leave reasons/comments, overlap prevention, and per-year quota limits. SQL views calculate balances from application records; no mutable balance counter or yearly reset job is needed. Decision notifications are inserted by a trigger within the decision's write statement.

The original seed and `generate-seed` helper are historical bootstrap fixtures. Do not regenerate or edit a migration that has already been applied. Fresh development databases still include the original 40 demo staff and eight requests; the acceptance suite creates its own date-relative test data.

## Demo accounts

The SQL seed stores password hashes only. These plaintext passwords are for the coursework demo:

| Who | Email | Password |
| --- | --- | --- |
| Approver (Mira Cheung) | mira.cheung@worksmartse.hk | ApproverDemo-2026 |
| Any other seeded staff member, for example Oscar Lam | oscar.lam@worksmartse.hk | StaffDemo-2026 |

Company addresses are `@worksmartse.hk`. There is no self-registration.

A useful date for the approver’s leave search is **17 Mar 2027** (`2027-03-17`). It covers an approved request and a pending request.

## Deploy to Cloudflare

Deploy only after `npm run acceptance` passes against the local Worker.

For an existing deployment, export a backup and run the preflight queries before applying migrations. Use a maintenance window and deploy the updated Worker with the migration. The demo credentials below are public coursework fixtures; replace them before using the application for real staff data.

```bash
npx wrangler login
npx wrangler d1 create leaveflowse
```

Put the database id that `d1 create` prints into `database_id` in `wrangler.toml`. Then:

```bash
npx wrangler d1 migrations apply leaveflowse --remote
npm run build
npx wrangler deploy
```

The production session cookie is marked `Secure` on HTTPS.

The app is deployed at [https://leaveflowse.slender-gray.workers.dev](https://leaveflowse.slender-gray.workers.dev). The D1 database id in `wrangler.toml` is the remote database `leaveflowse` in region APAC. That deployment uses a temporary Cloudflare preview account. Claim it from the Cloudflare dashboard before it expires, or sign in with `npx wrangler login` and deploy again into your own account. Opening the site in a browser may show Cloudflare’s “Just a moment” check before the sign-in page.

## Checks

```bash
npm run typecheck
npm run test:database
npm run test:leave
npm run acceptance
npm run build
```

`test-database.py` needs only Python 3's standard library. `npm run acceptance` expects a disposable local app on port 43219 and writes uniquely named test staff and leave records; it refuses remote hosts. See [ACCEPTANCE.md](ACCEPTANCE.md) for coverage and the isolated test setup. The previously documented cloud URL is not updated by these local changes.

Editing and approving/rejecting an application require the `revision` from the record displayed to the user. `PATCH /api/applications/:id` and `POST /api/approver/applications/:id/decision` reject missing/invalid revisions with HTTP 400 and stale revisions with HTTP 409. Reload and review the latest record before retrying; do not silently fetch a newer revision and resubmit an old edit or decision. Deploy the matching client and Worker together and reload any already-open pages. No additional database migration is required for this change.

See [STAFF_BUGFIX_IMPLEMENTATION.md](STAFF_BUGFIX_IMPLEMENTATION.md) for the staff-side fixes, functions involved, migration notes, and regression results.
