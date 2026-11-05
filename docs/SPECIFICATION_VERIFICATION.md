# Final specification verification — 5 November 2026

This report records the final acceptance run after the code-style refactor,
reporting-date fix, and both quota-card clarifications. The confirmed annual and
sick usage values include Pending plus Approved days, with used + remaining = 18
and 14 respectively. This later user instruction takes precedence over the PDF's
original sick-days-taken wording. See [QUOTA_USAGE_IMPLEMENTATION.md](QUOTA_USAGE_IMPLEMENTATION.md)
for the implementation history.

The functional requirements in `Specification_for_G13.pdf` were checked against
the shared rules, real SQL schema, local Worker/D1 API, and browser interface.
`01_Project_Specification-3.pdf` was also reviewed for delivery requirements; the
repository-name mismatch and unverified administrative items are listed below.

This is local validation of the tested application, not a claim that the remote
deployment has passed the same functional suite or that every coursework
deliverable has passed. The two source PDFs were
provided in the parent project folder. Later user requests are recorded in
[USER_STORIES.md](USER_STORIES.md) and [REQUIREMENTS.md](../REQUIREMENTS.md).

## Results and test environment

| Check | Observed result |
| --- | --- |
| TypeScript client, shared code, and Worker | `npm run typecheck` passes. |
| Database suite | 40 tests pass in disposable SQLite databases. |
| Shared rules, rendered UI, and actual summary query suite | 42 tests pass, including fixed-clock midnight/New Year cases. |
| Real Worker/D1 API acceptance | All 659 checks pass against a fresh database. The counter includes checks over existing records, so historical runs against reused fixtures can have different totals. |
| Real browser interaction | 193 assertions pass in headless Chrome 156, including actual account and request lifecycle actions. |
| Production frontend build | `npm run build` passes. |
| Worker deployment packaging | `wrangler deploy --dry-run` passes; nothing published. |
| Fresh D1 initialization | All six migrations apply independently to API and browser databases; reapplying reports no pending migrations. |
| Post-API data integrity | Foreign keys valid; every annual/sick row satisfies Pending + Approved + remaining = entitlement, with no overbooking. |
| Style review | TypeScript AST and Python AST function-name/comment checks pass after documented interface exceptions; source/script filenames conform. |
| Whitespace / patch integrity | `git diff --check` passes. |

Environment: macOS, Node 22.16.0, Python 3.14.2, Wrangler 4.153.0. The API
Worker used `/tmp/leaveflow-final-acceptance.NPQluC/api-d1` on port 54331; the browser
Worker used a separate `ui-d1` directory on port 54332. Each started with 40 demo
accounts and eight requests. API and browser fixtures cannot interfere with one
another. No existing development database or remote database was modified, and
the user's normal service on port 43219 remained running.

The two source PDFs were extracted again and matched the specification text used
for coverage review. The tested source-file hashes and command logs were recorded
under the same temporary acceptance directory. No product-code change was needed
during this final acceptance run.

## Group 13 functional traceability

In the table, **DB** means `scripts/test_database.py`, **Rules/UI** means
`scripts/test_leave.tsx`, **API** means `scripts/acceptance.mjs`, and **Browser**
means the observed Chrome interaction run. All paths are relative to the project
root. A pass covers the stated checks, not every possible input or scheduling order.

| PDF section | Requirement and boundary cases | Evidence / result |
| --- | --- | --- |
| 1 | Company-email/password sign-in, Staff/Approver separation, incorrect credentials and anonymous access | API + Browser: pass. |
| 1 | Approver-only account creation with initial password and profile editing | API + Browser editor: pass; staff/anonymous creation rejected. |
| 1 | One account per normalized email | DB + API: pass, including competing email variants. |
| 2 | Email, birthday, name, staff ID, department, year joined | API exact fields + Rules/UI render + Browser: pass. |
| 2 | Annual 18 and Sick 14 calendar-year quotas visible on Profile | DB + Rules/UI + Browser: pass. |
| 3 + later user clarification | Home annual/sick quotas, used quota, and remaining balances | DB + API + Rules/UI + Browser: used counts Pending + Approved, including future dates in this year; used + remaining equals 18/14. The elapsed API field remains separately tested. |
| 3 | Own history/status and additional Approver pending count | API + Rules/UI + Browser: pass; all four statuses displayed and count matches queue. |
| 4 | Annual/Sick types; valid dates; full inclusive calendar days | Rules/UI + DB + API: pass, including weekends, holidays, leap days, invalid/reversed ranges, and date-time rejection. |
| 4(a) | Annual notice of at least two days | Rules/UI + DB + API: past/today/tomorrow rejected, exactly two days accepted; Browser hover explains restriction. |
| 4(b) | No overlap with own Pending/Approved leave | Rules/UI + DB + API: pass across types and inclusive endpoints; cancelled/rejected dates reusable. |
| 4(c) | Remaining balance limits | Rules/UI + DB + API: pass for both leave types, exact limit, overbooking, cross-year allocations, edits, and concurrent submissions. |
| 4(d) | Sick leave last date may be up to seven days before today | Rules/UI + DB + API: exactly seven accepted, eight rejected; start date is not incorrectly used as the cutoff. |
| 4(e) | Optional short reason; mandatory above four days | Rules/UI + DB + API + Browser: absent/blank reason accepted through four days, rejected at five; real one-day blank-reason submission succeeds. |
| 4 after submission (a) | Reserve balance on submission | DB + API + Browser summary: pass; Pending reservations count immediately. |
| 4 after submission (b) | Applicant edits Pending with all rules, or cancels/restores | DB + Rules/UI + API + Browser: pass; non-owner denied, old reservation replaced, invalid/stale edits rejected. |
| 4 after submission (c) | Future Approved cancellation through day before start | DB + API + Browser: pass; tomorrow's approved sick leave can be cancelled today, started leave cannot. |
| 5 | Pending review sorted by start date | API + Browser: pass for default ascending order. |
| 5 | Approve/reject; short optional comment, long required comment | DB + API + Browser: pass for both decisions; approval does not deduct twice, rejection restores balance. |
| 6 | All staff records on a selected leave date | API + Browser: start/middle/end match inclusively, submission date ignored, all statuses included, staff report access denied. |

## Concurrency coverage

`RunTogether` releases asynchronous HTTP calls through one client-side gate.
Independent sessions are used for competing actors. Each case reads the persisted
record, balance, revision, or notices afterward; response codes alone are not the
success criterion. Existing `Promise.all` account/decision/quota races remain.

| Competing actions | Invariant verified |
| --- | --- |
| Twelve account creations | Generated staff IDs remain unique and existing IDs are unchanged. |
| Same email with different casing | Exactly one account is created. |
| Same approval twice | Exactly one decision succeeds and no duplicate notice appears. |
| Two requests exceeding one year's quota, including a cross-year case | Only a valid allocation is stored; no overbooking. |
| Overlapping Annual and Sick submissions | Exactly one active request is stored; balance matches its type/dates. |
| Approval versus disapproval | One decision wins; one corresponding notice and correct final balance. |
| Edit versus approval using the same revision | One succeeds; dates/status match that winner, with no approval of unseen edits. |
| Approval versus cancellation | Final status, revision, notice count, and balance match a legal sequence. Both may succeed if approval finishes before a valid future cancellation. |
| Duplicate cancellation | Restoration occurs once; no extra revision or decision notice. |
| Parallel requests competing for remaining quota | Only a fitting reservation succeeds; the exact remaining allowance can then be used, and one extra day is refused. |

This API run exercised actual overlapping requests in local workerd/D1.
They are regression tests, not an exhaustive proof of every production interleaving
or a load/capacity benchmark.

## Additional requested behavior

- Fresh-schema tests verify that `day_count` is absent after every migration.
  Legacy prefixes 0001/0002/0003 upgrade without losing other data; fresh/legacy
  schemas and balances agree. `0005` still revokes sessions while retaining history.
  The summary query also handles captured application time differing from SQL time
  at Hong Kong midnight, New Year, and leap days.
- Permanent deletion and password reset require the Approver's password. API tests
  check successful operations, denial, protected Approver account, session
  revocation, and the appropriate history preservation/deletion. Browser checks
  verify dialogs, wrong-password feedback, successful reset, old-password refusal,
  new-password sign-in, and permanent deletion of the account and its history.
- Browser quota checks independently sum request dates and statuses. The mixed
  fixture shows annual used 4 + remaining 14 = 18 and sick used 4 + remaining
  10 = 14, even though only one sick day has elapsed. Future Pending/Approved
  dates count; cross-year requests contribute only this year's dates. Editing,
  approval, rejection, and both cancellation paths preserve these invariants.
- Archive tests cover all statuses, inclusive date search, See All, exact current-year
  Annual/Sick application counts, and Show cancelled affecting the chart only.
- Browser checks verify the requested navigation grouping, emphasized pending
  count, consistent leave-type colors, exact date-search tooltip, annual-date hover
  text, and one visible calendar icon per date field.
- Desktop (1280 × 900) and mobile-viewport (390 × 844) screenshots were inspected.
  No horizontal page overflow or uncaught JavaScript error was observed. Eight
  expected HTTP 400/401/403 console messages came from authentication checks,
  deliberate incorrect passwords, and a missing required decision comment; there
  were no unexpected console errors. Twelve screenshots and `results.json` record
  the browser evidence.

Browser evidence and the one-off Playwright harness were saved under
`/tmp/leaveflow-final-acceptance.NPQluC/browser/` during this run. They are temporary local
artifacts, not a new required project dependency. Safari, Firefox, physical mobile
devices, and the live Cloudflare deployment were not tested in this run.

## General project PDF: deliverable review and outstanding items

After the local acceptance run, the owner deployed
[LeaveFlowSE](https://leaveflowse.liumingyao-comp3297.workers.dev) and supplied
successful Wrangler output for version `5fba4b58-87de-4162-9b76-5490e85fde85`.
A subsequent read-only HTTPS request returned HTTP 200 for the application page.
The cloud database and authenticated workflows were not exercised by this
read-only check; the automated functional results above remain local results.

| Requirement | Status / action |
| --- | --- |
| Runnable web application with a permitted deployment option | Local build, Worker/D1 operation, and deployment dry-run pass. The owner subsequently deployed the app; its public page returns HTTP 200. |
| README with full deployment instructions | README includes local setup, Cloudflare authentication, personal configuration, D1 initialization, deployment, and verification, with [extended instructions](CLOUDFLARE_DEPLOYMENT.md). |
| Deployed product link if cloud-hosted | README links to the current deployment at `https://leaveflowse.liumingyao-comp3297.workers.dev`. |
| User stories and acceptance criteria covering requirements | [USER_STORIES.md](USER_STORIES.md) now maps all six functional groups and later requests. |
| Test report | This report records methods, outcomes, boundaries, and concurrency cases. |
| Exact GitHub repository name | **Mismatch:** origin points to `24kczjdz/COMP3297A--2627-G13`; the PDF requires `COMP3297A-2627-G13`. The repository owner must correct the remote repository name and then the local origin URL. Nothing was renamed on GitHub. |
| Private repository and required collaborators | Not verified from local Git metadata. Confirm privacy and access for `hkuleoycy` and `WorkSmartSE-2026` on GitHub. |
| Individual contributions, commits, meetings, AI reports, deadlines | Administrative evidence cannot be established by running this application. Team members must complete/confirm these themselves; a project commit alone does not establish individual participation. |
| Secure operational use | Functional authorization checks pass. Previously deferred rate limiting/session-storage hardening and replacement of public demo credentials remain outstanding; this report is not a security certification. |

## Reproduce the automated checks

Use the isolated two-terminal setup in the deployment guide, then run:

```bash
npm run typecheck
npm run test:database
npm run test:leave
BASE_URL=http://127.0.0.1:43220 npm run acceptance
npm run build
npx wrangler deploy --dry-run
```

The API suite intentionally creates uniquely named fixtures and refuses non-local
hosts. Do not point it at an existing development database you want to keep clean.
