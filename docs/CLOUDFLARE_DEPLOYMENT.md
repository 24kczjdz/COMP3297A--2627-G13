# Deploy LeaveFlowSE to Cloudflare

This guide deploys the React interface and Hono API together as one Cloudflare
Worker, connected to a persistent Cloudflare D1 database. Your computer can be
turned off after deployment; the website and remote database remain on Cloudflare.

The deployed coursework website is
[https://leaveflowse.liumingyao-comp3297.workers.dev](https://leaveflowse.liumingyao-comp3297.workers.dev).
The maintainer reported successful deployment on 5 November 2026, with Worker
version `5fba4b58-87de-4162-9b76-5490e85fde85`. This records deployment success;
the local acceptance report does not claim a complete cloud acceptance run.
Cloudflare command references were checked on 5 November 2026.

The live deployment uses an ignored `wrangler.personal.toml` configuration. The
checked-in `wrangler.toml` still identifies the previous deployment's database.
Use the personal configuration explicitly for every remote operation below.

## 1. Prepare the project and account

Use the Cloudflare account your team will keep. You need permission to deploy
Workers and manage D1 in that account. To reuse another person's Cloudflare
account, its owner must invite your Cloudflare email as a member and grant those
permissions. Access to the GitHub repository does not grant Cloudflare database
access. You can instead create a deployment in your own account; it receives its
own website address and database. The previous website can remain available.

Install Node.js 22.16 or newer, npm, and Python 3. The reporting regression tests
use Node's built-in SQLite support, verified with Node 22.16; Python is used for
the separate database-rule tests. Open a terminal:

```bash
cd COMP3297A--2627-G13
node --version
npm --version
python3 --version
npm ci
```

`cd` selects your existing checkout from its parent directory; substitute its
actual path if necessary. Version commands check the tools. `npm ci` installs the
locked dependency versions. On Windows, use `python` if Python 3 is installed
under that command.

Git commits and pushes save/share source code; they do not deploy this project
unless you separately configure automatic Cloudflare builds. The manual procedure
below deploys the files currently on your computer.

## 2. Validate locally using a separate test database

Run the code checks:

```bash
npm run typecheck
npm run test:database
npm run test:leave
npm run build
```

If Windows provides `python` but not `python3`, replace `npm run test:database`
with `python scripts/test_database.py`; the other commands are unchanged.

Create a separate local test database and start the application against it:

```bash
npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/release-check
npx wrangler dev --local --ip 127.0.0.1 --port 43220 --persist-to .wrangler/release-check
```

Leave that terminal running. In a second terminal in the same project directory:

```bash
BASE_URL=http://127.0.0.1:43220 npm run acceptance
```

PowerShell equivalent for the last command:

```powershell
$env:BASE_URL = "http://127.0.0.1:43220"
npm run acceptance
```

All checks should pass. Open `http://127.0.0.1:43220` for a browser check, then stop
the test server with Ctrl+C. Acceptance creates test accounts and requests, so use
this separate persistence directory; do not target your ordinary development
database or the live website. See [SPECIFICATION_VERIFICATION.md](SPECIFICATION_VERIFICATION.md)
for coverage and remaining manual checks.

## 3. Sign in and prepare a deployment configuration

```bash
npx wrangler login
npx wrangler whoami
```

`login` opens the browser authorization flow. `whoami` identifies the authenticated
account and lists its Account ID. If the wrong person is signed in, run
`npx wrangler logout`, then log in with your own account. See the official
[Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/).

For a new checkout, copy the project configuration once:

```bash
cp wrangler.toml wrangler.personal.toml
```

PowerShell also supports `Copy-Item wrangler.toml wrangler.personal.toml`.
If you already have a working personal configuration, retain it instead of
replacing it. Add the intended Account ID at the top of the personal file, before
any `[section]` or `[[section]]` header:

```toml
name = "leaveflowse"
account_id = "REPLACE_WITH_YOUR_ACCOUNT_ID"
main = "src/worker/index.ts"
```

Keep the other settings. `wrangler.personal.toml` is excluded from Git, so every
new checkout must create its own copy. Do not edit the shared `wrangler.toml` just
to point it at a personal account. The `account_id` and D1 `database_id` are
identifiers, not passwords; API tokens and passwords must never be copied into
source files.

## 4. Create or select the remote database

First list databases in the selected account:

```bash
npx wrangler d1 list --config wrangler.personal.toml
```

If this account already contains the intended `leaveflowse` database, reuse its
ID and proceed to configuration. If this is a new installation, create it once:

```bash
npx wrangler d1 create leaveflowse --location apac --config wrangler.personal.toml --update-config=false
```

The command creates the remote database and prints its ID. The location is a
placement hint. `--update-config=false` leaves the file unchanged so you can
replace the old ID deliberately. Record the new ID in the existing D1 section of
`wrangler.personal.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "leaveflowse"
database_id = "REPLACE_WITH_YOUR_ACTUAL_DATABASE_ID"
migrations_dir = "migrations"
```

Replace the placeholder with the real value. Edit the existing section, rather
than appending a second binding. Keep `binding = "DB"` because the Worker uses
that exact binding name. Keep the existing Worker `main`, asset settings, and
compatibility date. Cloudflare documents this association in
[D1 setup](https://developers.cloudflare.com/d1/get-started/).

## 5. Initialize or upgrade the remote database

For a newly created empty database, run:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
```

Review and confirm the listed migrations. This creates the tables, inserts the
coursework demo accounts, and installs the rules. The new application table has
no stored `day_count` from its initial creation. On a fresh database, all six
migrations run and create 40 demo accounts and eight requests. Check the account
count with this read-only query:

```bash
npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --command "SELECT COUNT(*) AS staff_count FROM staff;"
```

The expected fresh result is `staff_count = 40`, including the Approver. This
checks initialization, not every application behavior. Your local test accounts
and requests are not uploaded by migrations or deployment.

For an **existing database**, first export a backup outside the repository and
inspect its schema and pending migrations:

```bash
mkdir -p ../leaveflow-backups
backup_stamp=$(date +%Y%m%d-%H%M%S)
npx wrangler d1 export leaveflowse --remote --config wrangler.personal.toml --output "../leaveflow-backups/before-deploy-$backup_stamp.sql"
npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --command "PRAGMA table_info(leave_application);"
npx wrangler d1 migrations list leaveflowse --remote --config wrangler.personal.toml
npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --file database/preflight.sql
```

The backup commands above use macOS/Linux shell syntax. On Windows choose a unique
backup filename manually. Backups contain account hashes and staff data; store
them privately. Review any preflight results before upgrading.

If `day_count` is still a stored column, follow the checks in the explicit
[legacy upgrade procedure](../database/README.md#existing-installations-and-legacy-upgrade)
first. For this deployment, create its temporary legacy configuration from
**`wrangler.personal.toml`**, so it keeps the correct account and database:

```bash
cp wrangler.personal.toml wrangler.legacy.toml
```

In the temporary copy, change only `migrations_dir` to
`"database/legacy-migrations"`, then run:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.legacy.toml
```

Remove that temporary copy after completing the archived upgrade; do not commit
or deploy it. Return to the personal configuration to apply remaining migrations:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
```

If `day_count` is already absent, use this final command directly after the
backup and checks. When following the database guide, keep passing the personal
configuration for normal remote commands; its examples without a configuration
flag would select the shared file. Use a maintenance window
when a database change and matching application version must become active
together. Do not reset the database, replay seed INSERTs, or edit migration ledger
rows to resolve errors.

`--local` changes only the local database; `--remote` changes the Cloudflare
database. Migration commands apply only missing files; `deploy` does not run
migrations or upload your local database. See
[D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## 6. Build and publish

```bash
npm run build
npx wrangler deploy --dry-run --config wrangler.personal.toml
npx wrangler deploy --config wrangler.personal.toml
```

`build` creates the browser files in `dist/client`. `--dry-run` checks Worker
packaging without publishing. `deploy` uploads the Worker and configured static
assets. This project uses Workers with static assets; uploading only the frontend
folder would omit the API. See
[Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

On a first deployment, Wrangler may ask you to establish a `workers.dev`
subdomain. The successful output contains a URL shaped like
`https://leaveflowse.YOUR-SUBDOMAIN.workers.dev`. Use the actual printed URL, not
this placeholder. See the official
[deployment walkthrough](https://developers.cloudflare.com/workers/get-started/guide/).

## 7. Verify the deployed website

Open the printed HTTPS URL in a fresh browser session. For the coursework demo,
the seed credentials listed in the README work only if that database contains
the unchanged demo seed.

1. Sign in as a staff member; inspect Profile, Home, and leave history.
2. Using an agreed test account, submit a future annual request with valid dates
   and confirm that the displayed remaining balance falls.
3. Sign in as the Approver in another browser profile; check Pending, decide the
   request, and search its leave date in Archive.
4. Confirm the staff member sees the decision and notice. Cancel a future approved
   test request and verify balance restoration.
5. Refresh a nested page such as Profile to verify SPA routing, then sign out.

These are manual checks that intentionally create a small amount of test data;
use designated test accounts. Do not run the fixture-writing acceptance suite on
the remote database. Add the confirmed deployment URL to the README before
submitting the coursework.

This version retains public demo credentials and the previously deferred session
storage/rate-limit hardening. A successful deployment and passing functional tests
do not establish readiness for real employee data. Complete those protections
before using it as an operational company service.

## 8. Later updates, logs, and recovery

For code-only updates, rerun the local checks, then:

```bash
npm run build
npx wrangler deploy --config wrangler.personal.toml
```

For updates with new migrations, back up and inspect the remote database, apply pending migrations,
then deploy the matching application. Applying an already completed migration
chain does not reseed staff or requests. Keep `0005` and the legacy upgrade files.

To inspect live Worker errors while reproducing a problem:

```bash
npx wrangler tail --config wrangler.personal.toml
```

Stop log streaming with Ctrl+C. Avoid logging passwords or session cookies.

| Symptom | Check |
| --- | --- |
| Database missing / permission denied | `whoami`, the chosen account, and the database ID/binding. |
| Missing table or `deleted_at` | Whether remote migrations were applied to that same database. |
| `legacy_duration_requires_upgrade` | Use the documented legacy upgrade; do not bypass the guard. |
| Old page or API after deployment | Rebuild, deploy the matching client/Worker, then reload the browser. |
| Local data absent online | Local and remote databases are separate; deployment does not transfer records. |
| Build rejects Node version | Use Node 22.16+ and run `npm ci` again. |
| Resource-limit errors | Check Cloudflare's [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). |

A Worker rollback does not undo database migrations. Recover code and database
together if their schemas are incompatible; preserve the backup and follow the
[database recovery notes](../database/README.md). Do not import a full backup over
an occupied live database as an improvised rollback.

## Optional: use your own domain

The `workers.dev` URL is sufficient for the initial coursework demo. To use a
domain in an active Cloudflare zone, open Workers & Pages, select the Worker, and
choose Settings → Domains & Routes → Add → Custom Domain. Cloudflare manages the
DNS record and certificate for this configuration. A corresponding
`[[routes]]` entry with `custom_domain = true` in `wrangler.personal.toml` can keep
the setting in your deployment configuration.
See [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Optional: connect GitHub automatic deployment

The steps above publish files from the current local checkout. They do not
require a Git commit or push and do not change the previous account's GitHub
connection. An existing Cloudflare check on GitHub may belong to that previous
account.

To set up automatic deployment later, open the intended Worker in Cloudflare,
then Settings → Builds. Confirm its connected repository and production branch,
use `npm run build` as the build command, and configure a deploy command for the
correct account and D1 binding. Cloudflare builds do not have your ignored local
`wrangler.personal.toml`; establish an intentional team deployment configuration
before enabling them. Apply required database migrations separately before
publishing matching application code.

If a Worker already has automatic deployment enabled, a later push to its
production branch can replace a version published manually. Review that existing
connection before changing it. See [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
for setup and disconnection instructions.
