# Full deployment instructions — LeaveFlowSE

This document is the complete, self-contained procedure for deploying
LeaveFlowSE (Group 13, COMP3297A) to Cloudflare, from a fresh checkout to a
working public website. It also covers local validation, later updates, log
inspection, rollback, troubleshooting, and two optional extensions (a custom
domain and GitHub automatic deployment).

LeaveFlowSE is a single Cloudflare Worker that serves both the React browser
interface (built static assets) and the Hono API, backed by a Cloudflare D1
(SQLite) database. Publishing the Worker and initializing the database are
separate operations; this guide keeps them explicit so that neither step is
mistaken for the other.

**Reference deployment:** [https://leaveflowse.liumingyao-comp3297.workers.dev](https://leaveflowse.liumingyao-comp3297.workers.dev).
The maintainer reported a successful deployment on 5 November 2026 with Worker
version `5fba4b58-87de-4162-9b76-5490e85fde85`. The command syntax below was
checked on 6 November 2026 against Wrangler 4.153.0 and the project's declared
minimum of Node.js 22.16. This guide records a verified procedure; it does not
claim that an automated acceptance run was performed against the live site.

## 0. At a glance

Run every command from the project root (the directory that contains
`package.json` and `wrangler.toml`).

| Stage | Command | Changes the cloud? |
| --- | --- | --- |
| 1. Install dependencies | `npm ci` | No |
| 2. Validate locally | `npm run typecheck`, `npm run test:database`, `npm run test:leave`, `npm run build` | No |
| 3. Authenticate Wrangler | `npx wrangler login`, `npx wrangler whoami` | Account session only |
| 4. Create personal configuration | `cp wrangler.toml wrangler.personal.toml`, then add `account_id` | No |
| 5. Create or select the D1 database | `npx wrangler d1 list` / `npx wrangler d1 create` | Yes, creates a database |
| 6. Initialize the schema | `npx wrangler d1 migrations apply ... --remote` | Yes, writes tables and seed |
| 7. Build and publish | `npm run build`, `npx wrangler deploy` | Yes, publishes the Worker |
| 8. Verify | Manual browser checks (section 10) | Creates demo records only |

After stage 4, pass `--config wrangler.personal.toml` to every remote Wrangler
command. The checked-in `wrangler.toml` still contains the previous
deployment's database ID, so using it by accident would target the wrong
account or fail with a permission error.

## 1. Deployment checklist

Copy this list into the pull request or coursework report and tick each line as
it is completed.

- [ ] Node.js 22.16 or newer, npm, and Git available (`node --version`, `npm --version`, `git --version`).
- [ ] Cloudflare account with permission to deploy Workers and manage D1.
- [ ] `npm ci` completed without errors.
- [ ] `npm run typecheck`, `npm run test:database`, `npm run test:leave`, `npm run build` pass.
- [ ] Local database migrated and the application opens at `http://127.0.0.1:43219`.
- [ ] `npx wrangler whoami` shows the intended account; its Account ID recorded.
- [ ] `wrangler.personal.toml` created, `account_id` filled in, and confirmed ignored by Git.
- [ ] Cloud D1 database exists and its `database_id` is in the personal configuration.
- [ ] `npx wrangler d1 migrations apply leaveflowse --remote` reports all six migrations.
- [ ] Remote staff count is 40 (`SELECT COUNT(*) FROM staff;`).
- [ ] `npm run build` and `npx wrangler deploy --dry-run` succeed.
- [ ] `npx wrangler deploy` prints the public `workers.dev` URL.
- [ ] Staff and Approver sign-in, submission, approval, archive search, cancellation, and SPA refresh verified.
- [ ] Deployment URL added to the README submission notes.
- [ ] No secret, API token, or password committed to Git.

## 2. Prerequisites

| Requirement | Minimum | Why |
| --- | --- | --- |
| Node.js | 22.16.0 (declared in `package.json`) | Build tooling, Wrangler, and the Node-based test scripts. Verified with 26.13.0 as well. |
| npm | Bundled with Node.js | `npm ci` installs the locked dependency versions. |
| Git | Any current version | Clone the repository and record changes. |
| Python 3 | 3.x, standard library only | `test_database.py` rule tests. Optional if you skip that check. |
| Cloudflare account | Free plan is sufficient for coursework | Workers, static assets, and D1. |

Install Node.js from <https://nodejs.org> (choose the LTS release, 22.16 or
newer); the installer includes npm. Verify the result with `node --version` in
section 3.

Windows note: the repository's scripts use `python3`. If your installation only
provides `python`, run `python scripts/test_database.py` instead of
`npm run test:database`. The other commands are unchanged.

Cloudflare permissions: to deploy into an account you do not own, its owner must
invite your Cloudflare email as a member and grant permission to manage both
Workers and D1. Access to the GitHub repository does not grant access to
Cloudflare resources. If you cannot obtain that access, deploy into your own
account; you will get your own database and website address, and the existing
deployment can remain online.

## 3. Get the project and install dependencies

```bash
git clone git@github.com:<owner>/COMP3297A--2627-G13.git
cd COMP3297A--2627-G13
node --version
npm --version
npm ci
```

`git clone` copies the repository; substitute the URL you were given if it
differs (the HTTPS and SSH forms both work). `node --version` must be 22.16.0 or
newer. `npm ci` installs exactly the versions in `package-lock.json` and is
preferred over `npm install` because it cannot silently upgrade a dependency.
A successful run ends with an `added … packages` line; an `ERESOLVE` error means
the lockfile and `package.json` disagree, and a network error means the registry
was unreachable. Retry before changing anything.

On Windows, if `npm` or `npx` stops with a message that a `.ps1` file cannot be
loaded because running scripts is disabled, that is the PowerShell execution
policy rather than a project fault. Apply the one-time fix in Appendix B and
rerun the same command.

If npm reports that install scripts were blocked (npm 11 and newer apply an
allow-list), the build can still work because esbuild and workerd ship
prebuilt binaries. If a build fails with a missing binary, approve the two
packages once:

```bash
npm install-scripts approve workerd esbuild
npm ci
```

Git commits and pushes save and share source code; they do not deploy this
project unless you separately enable Cloudflare's GitHub build integration
(section 14). The manual procedure in this document deploys the files currently
on your computer.

## 4. Validate locally before touching the cloud

Run the checks in this order. Each command must exit with status 0.

```bash
npm run typecheck
npm run test:database
npm run test:leave
npm run build
```

- `typecheck` runs `tsc` twice, once for the browser code and once for the
  Worker code.
- `test:database` executes `scripts/test_database.py`, which builds disposable
  in-memory SQLite databases and checks the schema, triggers, and rule queries.
- `test:leave` executes `scripts/test_leave.mjs`, which covers the shared leave
  rules used by both the client and the Worker.
- `build` runs Vite and writes the browser bundle to `dist/client`.

What each command looks like when it passes:

- `npm run typecheck` prints nothing and returns to the prompt. Any
  `error TS…` line naming a file and position is a real type error; fix it
  before deploying.
- `npm run test:database` and `npm run test:leave` print their pass summary and
  return exit code 0; a failed assertion prints the mismatch and a non-zero
  code.
- `npm run build` ends with Vite's `✓ … modules transformed` and
  `built in … ms` lines, and creates or refreshes `dist/client`. A compile
  error names the file it could not build.

All four must exit 0 before you continue.

Windows alternative for the second command:

```bash
python scripts/test_database.py
```

### 4.1 Run the application against a local database

```bash
npm run migrate:local
npm run dev
```

`migrate:local` applies migrations `0001` to `0006` to the local D1 database
stored under `.wrangler/state`. `npm run dev` builds the client and starts
Wrangler on `http://127.0.0.1:43219`; the port and IP come from the `dev` script
in `package.json` (`--port 43219 --ip 0.0.0.0`), which overrides the `[dev]`
section of `wrangler.toml`. `wrangler dev` runs in local mode by default, so it
reads only the local copy under `.wrangler/state` and never contacts the cloud
database. A successful start prints a `Ready on http://127.0.0.1:43219` line;
leave the terminal running and open that address in a browser.

Demo accounts created by the seed migration:

| Role | Email | Password |
| --- | --- | --- |
| Approver | `mira.cheung@worksmartse.hk` | `ApproverDemo-2026` |
| Staff | `oscar.lam@worksmartse.hk` | `StaffDemo-2026` |

The seed creates 40 staff accounts in total (the Approver plus 39 staff) and
eight leave records. If the login page appears but sign-in fails, the local
database was probably not migrated; rerun `npm run migrate:local`.

### 4.2 Optional: full acceptance run on a disposable database

The acceptance suite writes test accounts and requests, so it must run against
a throwaway persistence directory, never against the cloud database. In the
first terminal:

```bash
npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/release-check
npx wrangler dev --local --ip 127.0.0.1 --port 43220 --persist-to .wrangler/release-check
```

In a second terminal, from the same directory:

```bash
BASE_URL=http://127.0.0.1:43220 npm run acceptance
```

PowerShell equivalent:

```powershell
$env:BASE_URL = "http://127.0.0.1:43220"
npm run acceptance
```

Stop the server with Ctrl+C when the suite finishes. The script refuses remote
hosts by design.

## 5. Authenticate Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

`login` opens a browser window and asks you to authorize Wrangler for a
Cloudflare account. `whoami` prints the authenticated email, the account name,
and the **Account ID**. Record that ID; stage 6 needs it.

- If the browser shows the wrong person, run `npx wrangler logout` and sign in
  again with the intended account.
- If the machine is headless or the browser flow is blocked, create an API
  token with the **Edit Cloudflare Workers** template plus D1 edit permission
  and set it only in your shell environment (`CLOUDFLARE_API_TOKEN`). Never
  write a token into a committed file.
- `whoami` failing with an authentication error means the login did not
  complete; rerun `npx wrangler login`.

## 6. Create the personal deployment configuration

The repository tracks a shared `wrangler.toml` whose `database_id` belongs to a
previous deployment. Do not edit it for your own account. Instead create an
ignored personal copy:

```bash
cp wrangler.toml wrangler.personal.toml
```

PowerShell:

```powershell
Copy-Item wrangler.toml wrangler.personal.toml
```

Add your Account ID at the top of `wrangler.personal.toml`, before any
`[section]` header:

```toml
name = "leaveflowse"
account_id = "YOUR_ACCOUNT_ID_FROM_WHOAMI"
main = "src/worker/index.ts"
compatibility_date = "2026-10-01"
workers_dev = true
```

`account_id` is the 32-character hexadecimal string printed by `whoami` (for
example `a1b2c3d4e5f6…`). It is **not** the D1 `database_id`, which is a UUID
such as `1234abcd-12ab-34cd-56ef-1234567890ab`. Pasting the database UUID into
`account_id` is a common mistake and produces an authentication error.

What each remaining block does, and what you must not change:

| Setting | Purpose | Change it? |
| --- | --- | --- |
| `name` | Worker name, also the `workers.dev` subdomain prefix | Optional; keep `leaveflowse` for consistency |
| `main` | Worker entry point | No |
| `compatibility_date` | Cloudflare runtime behaviour | No, unless you have tested a change |
| `workers_dev = true` | Publishes a `*.workers.dev` address | No |
| `[assets] directory = "./dist/client"` | Static frontend produced by `npm run build` | No |
| `[assets] binding = "ASSETS"` | Binding name used by the Worker | No |
| `[assets] not_found_handling` | Serves the SPA for client-side routes | No |
| `[assets] run_worker_first = true` | Lets the API handle `/api/*` before assets | No |
| `[dev] port / ip` | Local development address | Optional |
| `[[d1_databases]] binding = "DB"` | Name the Worker uses for the database | No |
| `[[d1_databases]] database_name` | D1 database name in your account | Yes, if you chose another name |
| `[[d1_databases]] database_id` | The UUID printed by `d1 create` | Yes, replace with yours |
| `[[d1_databases]] migrations_dir = "migrations"` | Where Wrangler finds SQL files | No |

`wrangler.personal.toml` is listed in `.gitignore`. Confirm with
`git status --short` after creating it: the file must not appear. The Account ID
and database ID are identifiers, not passwords; API tokens, cookies, and
passwords must never be committed. If you later add an API token to a shell
session, keep it out of the repository and out of screenshots.

## 7. Create or select the D1 database

List the databases already present in the authenticated account:

```bash
npx wrangler d1 list --config wrangler.personal.toml
```

If the output is an empty list, the account has no databases yet; use the
create step below. If it fails with an authentication error, return to
section 5.

- **Existing `leaveflowse` database:** reuse its `database_id` in
  `wrangler.personal.toml` and skip to section 8.2, because the database may
  already contain data that must not be reseeded.
- **New installation:** create a database once:

```bash
npx wrangler d1 create leaveflowse --location apac --config wrangler.personal.toml --update-config=false
```

The command prints the new database's UUID. `--location apac` is an
Asia-Pacific placement hint; `--update-config=false` stops Wrangler from
rewriting the configuration so that you can replace the old ID deliberately.

Success prints a block containing `database_name`, `database_id = "…"` and a
`created_at` timestamp; copy only the `database_id` value. If it fails because
the name is already in use, the account already has a database by that name: run
`d1 list` and either reuse it (section 8.2) or create one under a different name
and use that name in every later `wrangler d1` command. A permission error means
the account lacks D1 edit access (section 2).

Copy the UUID into the existing `[[d1_databases]]` block (do not add a second
block):

```toml
[[d1_databases]]
binding = "DB"
database_name = "leaveflowse"
database_id = "YOUR_NEW_DATABASE_ID"
migrations_dir = "migrations"
```

`binding = "DB"` must stay exactly as written because the Worker reads that
binding name.

## 8. Initialize or upgrade the remote database

Deploying code does not create tables or upload local records. Schema changes are
applied separately.

### 8.1 Fresh database: apply all migrations

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
```

`migrations apply` lists each file it applied and ends without an error, or
prints `No migrations to apply!` when everything is current.

Review the list and confirm the prompt. The six migrations do the following:

| File | Effect |
| --- | --- |
| `0001_schema.sql` | Creates `staff`, `leave_application`, `session`, `notification` |
| `0002_seed.sql` | Inserts 40 demo accounts and eight leave records/notices |
| `0003_calendar_year_leave_rules.sql` | Adds decision metadata, `revision`, indexes, views, and rule triggers (data-preserving) |
| `0004_derive_leave_duration.sql` | Keeps the migration ledger compatible; creates no duration column |
| `0005_delete_staff_accounts.sql` | Retains soft-deletion support (session revocation) |
| `0006_permanent_staff_deletion.sql` | Enables atomic permanent deletion of a staff account and its records |

Verify the seed with a read-only query:

```bash
npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --command "SELECT COUNT(*) AS staff_count FROM staff;"
```

A fresh database reports `staff_count = 40` (the Approver plus 39 staff). If it
reports `0`, the seed migration did not run against this database; confirm that
`migrations apply` and this query used the same `--config` and `--remote` flags.

If you applied the migrations to the wrong empty database, correct `database_id`
first, then delete the unused database and create it again; an empty database
loses nothing. Delete it from the dashboard or with `npx wrangler d1 delete
<name> --config wrangler.personal.toml`. Never delete a database that holds real
records.

### 8.2 Existing database: back up, check, then upgrade

Never point a new installation at a database that already holds data without a
backup. Take one first:

```bash
npx wrangler d1 export leaveflowse --remote --config wrangler.personal.toml --output backup-before-upgrade.sql
```

Keep that file outside the repository (it contains staff records). A successful
export writes the named `.sql` file; a permission error means the account lacks
D1 read access. Optionally run the read-only checks in `database/preflight.sql`
before and after the upgrade:

```bash
npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --file database/preflight.sql
```

Then apply only the pending migrations:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
```

Wrangler records each applied filename in `d1_migrations` and applies only
missing files, so completed migrations are never replayed and the seed is not
duplicated.

**Legacy schema:** a database created before the calendar-year refactor may
still contain the obsolete `day_count` column. That state needs the archived
migration chain, not the normal one:

```bash
cp wrangler.personal.toml wrangler.legacy.toml
```

Change only `migrations_dir` in the temporary copy to
`"database/legacy-migrations"`, then:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.legacy.toml
```

Delete `wrangler.legacy.toml` afterwards, do not commit it, and return to the
personal configuration:

```bash
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
```

If the column is already absent, skip the legacy step. Do not delete
`.wrangler`, drop tables, rerun seed `INSERT` statements, or edit
`d1_migrations` rows to force an upgrade; those actions corrupt the ledger.
[database/README.md](../database/README.md) documents the full decision tree.

## 9. Build and publish the Worker

```bash
npm run build
npx wrangler deploy --dry-run --config wrangler.personal.toml
npx wrangler deploy --config wrangler.personal.toml
```

- `npm run build` regenerates `dist/client`. Deploy uploads this directory, so
  always rebuild after changing client code; an old bundle otherwise serves the
  previous interface.
- `--dry-run` packages the Worker and assets without publishing. Use it to
  catch configuration or import errors for free.
- `deploy` uploads both the Worker and the static assets. Publishing only the
  frontend folder would omit the API; publishing only the Worker would omit the
  built browser files.

Expected output:

- `npm run build` ends with Vite's `built in … ms` line and refreshes
  `dist/client`.
- `--dry-run` prints the Worker and asset sizes and finishes with a dry-run
  message **without** publishing, so the live site does not change. A
  configuration or import error stops it before any upload.
- `deploy` prints upload progress and a `Current Version ID: …` line, then the
  public URL. A permission error or rate limit is covered in section 12.

On the first deployment Wrangler may ask you to register a `workers.dev`
subdomain. The successful output prints a URL shaped like
`https://leaveflowse.YOUR-SUBDOMAIN.workers.dev`; use the actual printed value.
Record that URL for the coursework report and add it to the README's deployment
note.

## 10. Verify the deployed website

Open the printed HTTPS URL in a fresh browser session (or a private window, so
no stale local session interferes).

1. Sign in as `oscar.lam@worksmartse.hk` with `StaffDemo-2026`. Inspect Home,
   Profile, and leave history; balances should show the current year's
   entitlement minus Pending and Approved dates.
2. Submit an Annual leave request that starts at least two days from today
   (annual leave cannot begin today or tomorrow). Confirm it appears as Pending
   and that the displayed remaining balance falls immediately.
3. In a second browser profile, sign in as `mira.cheung@worksmartse.hk` with
   `ApproverDemo-2026`. Check the Pending queue, approve the request, and find
   it in Archive by its leave date.
4. Return to the staff profile and confirm the decision and notice are visible.
   Cancel a future Approved request and verify the reservation is restored
   exactly once.
5. Refresh a nested page such as `/profile` to confirm SPA routing, then sign
   out.

These checks intentionally create demo records. Use the seeded demo accounts or
other designated test accounts, and do not run `npm run acceptance` against the
live site: that suite writes fixtures and refuses remote hosts for this reason.

Operational notes for this version:

- The production session cookie is marked `Secure` and only works over HTTPS.
- Sign-in sessions expire 15 minutes after login; ordinary requests do not
  extend the deadline, so a long idle period requires signing in again.
- The seeded credentials are public coursework fixtures. Session storage and
  rate limiting remain simplified. A successful deployment and passing
  functional tests do not make this build suitable for real employee data.

## 11. Day-2 operations: updates, logs, and recovery

### 11.1 Code-only update (no schema change)

```bash
npm run typecheck
npm run test:leave
npm run build
npx wrangler deploy --config wrangler.personal.toml
```

The database is untouched. Reload open pages after deploying so the browser
does not keep running the previous bundle.

### 11.2 Update that includes a new migration

Run this in a maintenance window so the schema and the matching Worker version
become active together:

```bash
npx wrangler d1 export leaveflowse --remote --config wrangler.personal.toml --output backup-before-update.sql
npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml
npm run build
npx wrangler deploy --config wrangler.personal.toml
```

Deploy the code that matches the new schema. An older Worker version may write
columns or expect tables the new schema no longer has.

### 11.3 Inspect live logs

```bash
npx wrangler tail --config wrangler.personal.toml
```

`tail` streams live Worker requests and errors; stop it with Ctrl+C. Use it
while reproducing a problem on the deployed site. Do not add logging of
passwords, session cookies, or full request bodies containing credentials.

### 11.4 Versions and rollback

```bash
npx wrangler deployments list --config wrangler.personal.toml
npx wrangler rollback --config wrangler.personal.toml
```

`rollback` without an argument returns to the version immediately before the
current one. To return to a specific older version, copy its ID from the
`deployments list` output and pass it:
`npx wrangler rollback <version-id> --config wrangler.personal.toml`. Wrangler
may ask you to confirm first.

Rollback restores a previous Worker version, not the database. If the previous
version used an older schema, restore the matching database backup as well;
recovering code and data together is the only safe option when they are
incompatible. Never import a full backup over an occupied live database as an
improvised rollback, and never hand-edit `d1_migrations` to make a version look
compatible.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Authentication error` / `not logged in` | Login did not complete, or the token expired | `npx wrangler logout`, then `npx wrangler login`, then `npx wrangler whoami` |
| `Couldn't find a database with the name or binding` | `database_id` is missing, stale, or belongs to another account | Run `npx wrangler d1 list --config wrangler.personal.toml` and correct the personal configuration |
| `Authentication error [code: 10000]` or permission denied | `account_id` is wrong, or the account membership lacks Workers/D1 permission | Recheck `whoami`; ask the account owner to grant Workers and D1 access |
| `no such table: staff` | Migrations were not applied to the database the Worker uses | Apply migrations with the same `--config` and `--remote` |
| `legacy_duration_requires_upgrade` | The database still has the obsolete `day_count` column | Follow the archived legacy chain in section 8.2; do not bypass the guard |
| Login page loads but API calls return 404 | Assets were published without the Worker, or the Worker without assets | Rebuild, then run `npx wrangler deploy --config wrangler.personal.toml` once |
| Old interface after deployment | Browser cache, or deploy ran before the build | Rerun `npm run build` then deploy; hard-reload the page |
| Local records are missing online | Local and remote D1 databases are separate | Expected: deployment does not upload local data. Seed data comes from `0002` |
| `The engine "node" is incompatible` / build rejects Node | Node older than 22.16 | Install Node 22.16+ and rerun `npm ci` |
| Build fails with a missing `esbuild`/`workerd` binary | npm blocked install scripts | `npm install-scripts approve workerd esbuild` then `npm ci` |
| PowerShell: `npx.ps1 cannot be loaded because running scripts is disabled` | Execution policy blocks npm/npx shims | Use `npx.cmd`/`npm.cmd`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once |
| `python3` not found | Windows installs the command as `python` | `python scripts/test_database.py` |
| Port 43219 already in use | Another dev server is still running | Stop it, or pass `--port 43221` to `wrangler dev` |
| `Too many requests` / `429` while deploying | Cloudflare API rate limit | Wait and retry; avoid parallel deploy commands |
| Resource-limit error at runtime | Worker or D1 limit exceeded | Review the [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Session ends after 15 minutes | Intended expiry; requests do not renew it | Sign in again; document this behaviour rather than changing it for the demo |

## 13. Optional: use a custom domain

The `workers.dev` address is sufficient for the coursework demo. A custom
domain additionally requires a domain whose DNS zone is active in the same
Cloudflare account.

Dashboard method: Workers & Pages → select the Worker → Settings → Domains &
Routes → Add → Custom Domain, then enter the hostname. Cloudflare creates the
DNS record and certificate.

Configuration method: add the route to `wrangler.personal.toml`:

```toml
[[routes]]
pattern = "leaveflow.example.com"
custom_domain = true
```

Then redeploy. Certificate issuance and DNS propagation can take a few minutes.
Keep `workers_dev = true` as a fallback address while testing the domain, and
verify HTTPS, sign-in, and one API call on the new hostname before announcing
it. To remove the domain later, delete the `[[routes]]` entry and redeploy, or
use Custom Domain → Remove in the dashboard; the `workers.dev` address keeps
working throughout.

## 14. Optional: GitHub automatic deployment

The manual procedure above publishes the files in your checkout and does not
need a commit or push. Automatic deployment is a separate Cloudflare feature
and is **not** enabled by this repository by itself.

To enable it later: Cloudflare dashboard → Workers & Pages → your Worker →
Settings → Builds → connect the repository and production branch, set the build
command to `npm run build`, and provide a deploy command for the correct
account and D1 binding. Verify the configuration before relying on it:

- Cloudflare builds do not see your ignored `wrangler.personal.toml`. Supply
  the account and database through the build settings or an intentional
  team-wide configuration; never commit API tokens.
- Builds publish code but do not apply database migrations. Apply pending
  migrations first, then let the build publish matching code.
- If a Worker already has automatic deployment from a previous owner, a push to
  that production branch can replace a manually published version. Review the
  existing connection before changing it.
- Secrets belong in Cloudflare's encrypted variables/secrets, not in Git. This
  project needs no application secret for the demo (the Worker reads only the
  `DB` binding); if one is added later, set it with
  `npx wrangler secret put NAME --config wrangler.personal.toml`. `.dev.vars`
  is only for local secrets, is listed in `.gitignore`, and must never be
  committed.

## 15. Handover record, security, and limits

Record the deployment so the group can reproduce or audit it. Copy this table
into the coursework report:

| Item | Value |
| --- | --- |
| Deployment date | |
| Operator | |
| Cloudflare account (name / ID) | |
| Worker name and version | |
| D1 database name / ID | |
| Migrations applied | |
| Public URL | |
| Local checks executed | |
| Known limitations or follow-ups | |

Security rules for anyone repeating this procedure:

- Never commit `wrangler.personal.toml`, `.dev.vars`, API tokens, cookies,
  password hashes, or database backups. `.gitignore` covers the first two and
  build/test artefacts; run `git status --short` before every commit.
- `wrangler.legacy.toml` is **not** ignored by Git. Delete it after the legacy
  upgrade and confirm it is absent from `git status`.
- D1 exports contain staff rows and password hashes. Store them outside the
  repository, restrict access, and delete them when they are no longer needed.
- Do not publish screenshots that show tokens, cookies, or real personal data.

Functional limits of this build, which must be stated honestly in the report:

- Demo credentials are public and the seed data is synthetic.
- Sessions are stored in D1 and expire 15 minutes after sign-in; ordinary
  requests do not extend them.
- Session-storage and rate-limit hardening remain simplified.
- A passing deployment and passing tests do not make this build suitable for
  real employee records.

## Appendix A. Command cheat sheet

| Task | Command |
| --- | --- |
| Install locked dependencies | `npm ci` |
| Type-check client and Worker | `npm run typecheck` |
| Shared leave-rule tests | `npm run test:leave` |
| Database-rule tests | `npm run test:database` (or `python scripts/test_database.py`) |
| Build the browser bundle | `npm run build` |
| Apply migrations locally | `npm run migrate:local` |
| Start local development | `npm run dev` → `http://127.0.0.1:43219` |
| Prepare a disposable acceptance database | `npx wrangler d1 migrations apply leaveflowse --local --persist-to .wrangler/release-check` |
| Start the acceptance server | `npx wrangler dev --local --ip 127.0.0.1 --port 43220 --persist-to .wrangler/release-check` |
| Run the acceptance suite | `$env:BASE_URL = "http://127.0.0.1:43220"; npm run acceptance` |
| Authorize Wrangler | `npx wrangler login` |
| Show the active account | `npx wrangler whoami` |
| List D1 databases | `npx wrangler d1 list --config wrangler.personal.toml` |
| Create a D1 database | `npx wrangler d1 create leaveflowse --location apac --config wrangler.personal.toml --update-config=false` |
| Apply remote migrations | `npx wrangler d1 migrations apply leaveflowse --remote --config wrangler.personal.toml` |
| Run a read-only query | `npx wrangler d1 execute leaveflowse --remote --config wrangler.personal.toml --command "SELECT COUNT(*) AS staff_count FROM staff;"` |
| Back up the remote database | `npx wrangler d1 export leaveflowse --remote --config wrangler.personal.toml --output backup.sql` |
| Check packaging without publishing | `npx wrangler deploy --dry-run --config wrangler.personal.toml` |
| Publish the Worker and assets | `npx wrangler deploy --config wrangler.personal.toml` |
| Stream live logs | `npx wrangler tail --config wrangler.personal.toml` |
| List recent deployments | `npx wrangler deployments list --config wrangler.personal.toml` |
| Roll back the Worker version | `npx wrangler rollback --config wrangler.personal.toml` |

## Appendix B. Windows and PowerShell notes

1. **Python command.** The npm script uses `python3`. If that command is not
   found, run `python scripts/test_database.py` directly.
2. **Blocked npm/npx scripts.** If PowerShell reports
   `npx.ps1 cannot be loaded because running scripts is disabled on this system`,
   either call the command shims (`npx.cmd`, `npm.cmd`) or allow locally signed
   scripts once:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
   This changes only your user profile and does not require administrator
   rights. The `npx.ps1` error is a Windows policy issue, not a project error.
3. **Copy commands.** `cp` is available in Git Bash; in PowerShell use
   `Copy-Item wrangler.toml wrangler.personal.toml`.
4. **Environment variables.** Use `$env:BASE_URL = "http://127.0.0.1:43220"`
   for one session. Do not create a permanent machine-wide variable for a test
   URL.
5. **Paths.** Run commands from the directory containing `package.json`.
   Wrangler resolves `main`, `[assets]`, and `migrations_dir` relative to it.

## Appendix C. Repository map for deployers

| Path | Role |
| --- | --- |
| `src/client/` | React interface |
| `src/worker/index.ts` | Hono API, session handling, asset serving |
| `src/shared/` | Leave rules shared by client and Worker |
| `migrations/0001`–`0006` | Normal schema, seed, rules, and account-deletion chain |
| `database/legacy-migrations/` | Archived chain for databases with the obsolete column |
| `database/preflight.sql` | Read-only consistency checks |
| `database/queries.sql` | Reporting examples |
| `scripts/test_database.py` | Disposable SQLite rule tests |
| `scripts/test_leave.mjs` | Shared rule tests |
| `scripts/acceptance.mjs` | API acceptance suite; writes fixtures, local hosts only |
| `scripts/generate_seed.mjs` | Regenerates seed hashes/rows |
| `wrangler.toml` | Shared configuration; its `database_id` is the previous deployment's |
| `wrangler.personal.toml` | Your ignored account-specific copy |
| `dist/client/` | Build output; ignored by Git |
| `.wrangler/` | Local D1 state and Wrangler scratch data; ignored by Git |

## Appendix D. Related documents and references

Project documents:

- [README.md](../README.md) — overview, quick deploy summary, checks, demo accounts.
- [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md) — extended narrative version of this procedure.
- [database/README.md](../database/README.md) — migration paths, legacy upgrade, concurrency guarantees.
- [SPECIFICATION_VERIFICATION.md](SPECIFICATION_VERIFICATION.md) — executed test scope and limitations.
- [USER_STORIES.md](USER_STORIES.md) — requirements and acceptance criteria.
- [CODE_STYLE.md](../CODE_STYLE.md) — naming and comment conventions.

Official Cloudflare references (checked 6 November 2026):

- [Workers get started](https://developers.cloudflare.com/workers/get-started/guide/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/general/)
- [D1 get started](https://developers.cloudflare.com/d1/get-started/)
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## Appendix E. Revision history

| Date | Change |
| --- | --- |
| 6 November 2026 | Initial version. Commands verified against Wrangler 4.153.0, the locked `package-lock.json`, and a local run of `npm ci`, `npm run typecheck`, `npm run build`, local migrations, and the seeded demo accounts. |






