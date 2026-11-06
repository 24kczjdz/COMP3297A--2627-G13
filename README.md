# LeaveFlowSE

**COMP3297A · 2026–2027 · Group 13**

**Live Cloudflare application:**
[https://leaveflowse.liumingyao-comp3297.workers.dev](https://leaveflowse.liumingyao-comp3297.workers.dev)

Open the link and use the [demo accounts](#demo-accounts) below. The application
and its persistent D1 database run on Cloudflare; no local server is needed to use
the deployed product. Local setup and complete deployment instructions follow.

LeaveFlowSE is the staff leave desk for WorkSmartSE, a Hong Kong company of about 40 people. Staff sign in with a company email, apply for annual or sick leave in whole days, and one approver decides. The approver is also a staff member and can apply for their own leave.

Dates are calendar dates in Asia/Hong_Kong. Every calendar day in a request counts, including weekends and holidays. Each person has 18 annual and 14 sick days per calendar year. Pending and Approved applications reserve days immediately; rejection or cancellation releases them. Requests crossing New Year charge each day to its own year. The dashboard shows the current year's balances and used quota for both leave types. See [REQUIREMENTS.md](REQUIREMENTS.md) for the current rules.

Both Home cards show **Quota used this year (pending and approved)**:
used plus remaining equals 18 for annual leave and 14 for sick leave. It includes future leave dates allocated to the
current year. See [the quota-usage implementation](docs/QUOTA_USAGE_IMPLEMENTATION.md)
for the metric clarification, reporting-date fix, and regression results.

## Stack

TypeScript, React, Vite, Tailwind CSS, and Hono on a Cloudflare Worker. Data lives in Cloudflare D1. Passwords are PBKDF2-SHA-256 hashes. Sessions are random ids in an HTTP-only cookie.

## Run locally

Install Node.js **22.16 or newer**, npm, and Git. Python 3 is needed only for the
database test suite. The application runs locally on macOS, Windows, and Linux.
For a new checkout, use an account with access to the private repository:

```bash
git clone https://github.com/24kczjdz/COMP3297A--2627-G13.git
cd COMP3297A--2627-G13
```

Until `add_feature/achive_and_code_review` is merged, run
`git switch add_feature/achive_and_code_review` after cloning to use the version
documented here. After the merge, use the updated `main` branch.

If you already have the checkout, open a terminal in its root directory instead.

For an existing database that still has a stored `day_count` column, follow the
[legacy upgrade procedure](database/README.md#existing-installations-and-legacy-upgrade)
before running these commands. Empty databases and databases already upgraded
through the original `0004` use the commands below directly.

```bash
npm ci
npx wrangler d1 migrations apply leaveflowse --local
npm run dev
```

Open [http://127.0.0.1:43219](http://127.0.0.1:43219).

`npm run dev` builds the interface, then starts Wrangler. The Worker serves the app and the JSON API under `/api`. The local D1 database is created by the migration command. Keep `.wrangler` to preserve local data. Local and remote databases are separate.

After updating the code, complete the legacy upgrade first if the database still
stores `day_count`. Stop an existing development server with **Ctrl+C**, then
run `npm run migrate:local`, then `npm run dev`, and refresh the browser. The migration
command applies only pending migrations; it does not reseed an existing database.
A browser refresh alone cannot recover a failed Worker hot reload. If a new action
returns HTTP 405, the running Worker may still lack that endpoint. A database error
about `deleted_at` means the account-management migrations have not been applied.

## Upgrade an existing database

Read [database/README.md](database/README.md) first. The current `0001` creates the application table without a stored `day_count`; `0002` seeds dates only, and `0003` installs rules that derive duration from those dates. Current `0004` only verifies that the obsolete column is absent. New databases never create and then remove that column.

Databases that already applied the original `0004` can continue with the normal migration command. Databases still using the old stored column must first finish the archived upgrade through `0004` in `database/legacy-migrations`, following the database guide. The original migration files are preserved there for that purpose. `0005` soft-deletion support and `0006` permanent deletion are retained unchanged. Existing records do not need to be reset. See [FRESH_DATABASE_IMPLEMENTATION.md](FRESH_DATABASE_IMPLEMENTATION.md) for the implementation and checks.

The database enforces date/length validity, notice and backdating rules, required long-leave reasons/comments, overlap prevention, and per-year quota limits. SQL views calculate balances from application records; no mutable balance counter or yearly reset job is needed. Decision notifications are inserted by a trigger within the decision's write statement.

The seed and `generate-seed` helper produce the coursework demo data for the current initial schema, without storing application duration. Regenerating a seed file does not update an existing database; do not use it as an upgrade or reset command. Fresh development databases include 40 demo staff and eight requests; the acceptance suite creates its own date-relative test data. Keep archived migration files unchanged.

## Demo accounts

The SQL seed stores password hashes only. These plaintext passwords are for the coursework demo:

| Who | Email | Password |
| --- | --- | --- |
| Approver (Mira Cheung) | mira.cheung@worksmartse.hk | ApproverDemo-2026 |
| Any other seeded staff member, for example Oscar Lam | oscar.lam@worksmartse.hk | StaffDemo-2026 |

Company addresses are `@worksmartse.hk`. There is no self-registration.

**Deleting a staff account:** In **Staff accounts**, choose **Delete account** beside
the employee, check their name and email, then enter **your own approver password**
in the confirmation dialog. Cancel or Escape leaves the account unchanged. Only
the approver can delete an ordinary staff account; the approver account is protected.
Deletion permanently removes the employee's account, all their leave requests
regardless of status, their notifications, and all their sessions. Their requests
disappear from the approval queue and date reports. Creating another account with
the same email starts a new history.

Apply migrations through `0006_permanent_staff_deletion.sql` before using this feature. The
`DeleteAccountDialog` component calls `DeleteStaffAccount()`; the Worker's DELETE
handler verifies the signed-in approver's password and deletes the selected staff row.
The database trigger removes dependent records in the same operation; a failure
leaves the account and all of its records intact.

**Resetting an employee password:** Open **Staff accounts -> Edit profile** for an
ordinary staff account. In **Reset employee password**, enter a new password
(8-72 characters) and **your own approver password**, then choose **Reset password**.
Profile changes use the separate **Save profile** button. A wrong confirmation
password leaves the employee's password and sessions unchanged. A successful reset
signs the employee out everywhere; their profile and leave history stay intact.

`ResetPasswordForm` calls `ResetStaffPassword()` and the authenticated
`POST /api/approver/staff/:id/password` handler. The server verifies the approver,
creates a fresh salt and PBKDF2 hash, then updates credentials and revokes sessions
in one atomic D1 batch. Login also checks that credentials have not changed before
issuing a session. Password reset adds no migration beyond the existing
account-management migrations through `0006`, which this Worker still requires.

Creating an account assigns a Staff ID such as `WS-041` on the server; callers do
not choose it. Allocation and insertion run in one SQL statement, so concurrent
creations receive distinct IDs under the existing unique constraint. Existing IDs
are preserved. Profile editing retains its staff-ID format and uniqueness checks.
The creation form defaults Year joined to the current Hong Kong year. A duplicate
company email is reported before other server-side profile/password errors.

The Pending page defaults to earliest start date first and provides a latest-first
choice. Sorting changes only the display; each decision still uses the revision
of the displayed record. These account and sorting changes need no new migration.

**Archive:** The approver's Archive opens with all pending, approved, disapproved
and cancelled applications. Use the top-right date field and **Search date** to
find applications covering a leave date; this retains all statuses, including
Pending. **See All** returns to the complete archive. The left pie chart counts
annual and sick applications in the displayed result whose leave dates overlap
the current Hong Kong calendar year. It displays that year; cross-year requests
count once when any leave day falls in the year. Submission dates do not determine
the chart year, and the record list still includes every year. Its **Show cancelled**
checkbox starts unchecked: only pending, approved and disapproved applications
count until it is checked. This affects the chart only; cancelled records stay in
the list. The choice is retained across date searches and See All until leaving
the page. The chart uses the same teal/purple colors as leave labels throughout
the app. Hover or focus the date field for the
matching rule. A useful seeded search date is **17 Mar 2027** (`2027-03-17`), which
covers an approved request and a pending request. See
[ARCHIVE_UI_IMPLEMENTATION.md](ARCHIVE_UI_IMPLEMENTATION.md) for functions,
file responsibilities and verification. This update adds no migration.

## Deploy to Cloudflare

The current deployed product is
[LeaveFlowSE on Cloudflare](https://leaveflowse.liumingyao-comp3297.workers.dev).
The project deploys its React frontend and Hono API as one Worker with static
assets, connected to a Cloudflare D1 database. The following procedure creates a
new installation in an account you control. A `workers.dev` address is sufficient;
no custom domain is required.

The checked-in `wrangler.toml` contains the previous deployment's database ID.
The current deployment uses an ignored `wrangler.personal.toml`. Each deployer
must supply their own account and database IDs; repository access does not grant
access to another person's Cloudflare resources. To reuse a team's account,
its owner must grant you permission to manage both Workers and D1.

The complete, self-contained procedure — including local validation, database
creation and upgrade, publishing, verification, rollback, and troubleshooting —
is in [docs/FULL_DEPLOYMENT_INSTRUCTIONS.md](docs/FULL_DEPLOYMENT_INSTRUCTIONS.md).
The numbered steps below are the short version of the same flow.

1. **Prepare and authenticate.** From the project root, install the locked
   dependencies if needed, then authorize Wrangler in your browser:

   ```bash
   npm ci
   npx wrangler login
   npx wrangler whoami
   ```

   Confirm the intended account and record its Account ID. Local checks and
   concurrency coverage are documented in [Checks](#checks) and the
   [verification report](docs/SPECIFICATION_VERIFICATION.md).

2. **Create a personal deployment configuration once.** Copy the file only if you
   do not already have your configured personal copy:

   ```bash
   cp wrangler.toml wrangler.personal.toml
   ```

   PowerShell users can use `Copy-Item wrangler.toml wrangler.personal.toml`.
   Add the account ID near the top of the copied file, before any `[section]`:

   ```toml
   name = "leaveflowse"
   account_id = "YOUR_ACCOUNT_ID_FROM_WHOAMI"
   ```

   Replace the placeholder, keep the other settings, and use this copy for every
   remote operation below. Git ignores the personal configuration.

3. **Create an empty cloud database once:**

   ```bash
   npx wrangler d1 create leaveflowse --location apac --config wrangler.personal.toml --update-config=false
   ```

   Copy the returned database ID into the existing D1 section of the personal
   configuration. Do not add a duplicate section:

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "leaveflowse"
   database_id = "YOUR_NEW_DATABASE_ID"
   migrations_dir = "migrations"
   ```

   `DB` is the binding used by the Worker. The location option is an Asia-Pacific
   placement hint. If you intend to reuse an existing database, follow the
   [backup and upgrade procedure](docs/CLOUDFLARE_DEPLOYMENT.md#5-initialize-or-upgrade-the-remote-database)
   instead of recreating it.

4. **Initialize the new cloud database:**

   ```bash
   npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
   npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --command "SELECT COUNT(*) AS staff_count FROM staff;"
   ```

   Confirm the intended database before accepting the migration prompt. All six
   migrations create the schema, demo accounts, requests, and database rules.
   The read-only count should initially report 40 staff accounts, including the
   Approver. `--remote` changes the cloud database; `--local` changes a separate
   local database. Deploying code does not upload your local records.

5. **Build, check packaging, and publish:**

   ```bash
   npm run build
   npx wrangler deploy --dry-run --config wrangler.personal.toml
   npx wrangler deploy --config wrangler.personal.toml
   ```

   The dry run does not publish. The final command uploads the Worker and browser
   files and prints the deployed HTTPS URL. If prompted on first deployment,
   choose a `workers.dev` subdomain. This manual process publishes the saved local
   files; committing or pushing to GitHub is not required for the command.

6. **Verify the deployed app.** Open the printed URL and sign in with a demo staff
   account. Check Profile and Home, submit a valid future annual request, and
   confirm that remaining quota falls. In another browser profile, sign in as
   the Approver, approve the request, and find it in Archive by a covered date.
   Confirm the staff notice, cancel the future approved request, and check that
   quota is restored. Refresh a nested page to check routing, then sign out.
   These checks intentionally create demo records. Use designated test accounts;
   do not run the fixture-writing automated API suite against the live site.

For later code-only updates, run `npm run build` and
`npx wrangler deploy --config wrangler.personal.toml`. If new migration files are
added, back up the remote database, apply pending migrations to that same database,
and deploy the matching code. Reapplying completed migrations does not reseed data.
To inspect live errors, run `npx wrangler tail --config wrangler.personal.toml`.
The [extended deployment guide](docs/CLOUDFLARE_DEPLOYMENT.md) covers backups,
legacy schemas, GitHub integration, troubleshooting, and recovery.

The production session cookie is marked `Secure` on HTTPS. Login cookies and
server sessions expire 15 minutes after sign-in; ordinary requests do not renew
the deadline. Previously deferred session-storage and rate-limit hardening remains
outside this refactor. Public demo credentials are intended for coursework fixtures.

## Checks

```bash
npm run typecheck
npm run test:database
npm run test:leave
npm run build
```

`test_database.py` needs only Python 3's standard library. On Windows, if Python is
available as `python`, use `python scripts/test_database.py`. The API suite writes
test accounts and requests, so start a disposable local database in terminal 1:

```bash
npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/release-check
npx wrangler dev --local --ip 127.0.0.1 --port 43220 --persist-to .wrangler/release-check
```

In terminal 2, from the same project root:

```bash
BASE_URL=http://127.0.0.1:43220 npm run acceptance
```

PowerShell equivalent:

```powershell
$env:BASE_URL = "http://127.0.0.1:43220"
npm run acceptance
```

Stop the disposable server with Ctrl+C. The suite refuses remote hosts. The final
local acceptance passed 40 database tests, 42 rule/UI/summary-query tests, 659 API
checks including concurrent operations, and 193 browser assertions. See
[SPECIFICATION_VERIFICATION.md](docs/SPECIFICATION_VERIFICATION.md) for the tested
scope and limitations; [ACCEPTANCE.md](ACCEPTANCE.md) is a historical report.

Editing and approving/rejecting an application require the `revision` from the record displayed to the user. `PATCH /api/applications/:id` and `POST /api/approver/applications/:id/decision` reject missing/invalid revisions with HTTP 400 and stale revisions with HTTP 409. Reload and review the latest record before retrying; do not silently fetch a newer revision and resubmit an old edit or decision. Deploy the matching client and Worker together and reload any already-open pages. No additional database migration is required for this change.

See [STAFF_BUGFIX_IMPLEMENTATION.md](STAFF_BUGFIX_IMPLEMENTATION.md) for the staff-side fixes, functions involved, migration notes, and regression results.

## Project conventions and acceptance criteria

[CODE_STYLE.md](CODE_STYLE.md) defines the short naming/comment contract and its
framework/API compatibility exceptions. [USER_STORIES.md](docs/USER_STORIES.md) maps
the Group 13 requirements to user stories and acceptance criteria.
[STYLE_REFACTOR_IMPLEMENTATION.md](docs/STYLE_REFACTOR_IMPLEMENTATION.md) explains the
style changes and validation performed in this update.
