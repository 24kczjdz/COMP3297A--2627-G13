# Code-style consolidation and specification validation

The project now uses one short naming/comment contract, with callers updated
together whenever an internal name changes. Existing UI behavior, API payloads,
and database rules are preserved, while regression tests exercise the specified
rules and competing requests against a disposable Worker/D1 instance.

## Convention and compatibility

[CODE_STYLE.md](../CODE_STYLE.md) records PascalCase types/functions,
lower_snake_case variables/parameters/internal fields, trailing underscores on
class data members, and `kCamelCase` policy constants. Named functions have English
Summary, Parameters, Return Value, and Side Effects & Constraints contracts.

React hooks, imported library symbols, DOM attributes, framework configuration,
existing JSON fields, unittest discovery hooks, and the D1 stub interface keep
their required names. For example, `LeaveRecord.startDate` remains an API field,
while a local `start_date` follows the project's internal convention. These are
compatibility boundaries, not duplicate implementations or alias layers.

## Files and responsibilities

| Files | Responsibility and changes |
| --- | --- |
| `src/client/app_routes.tsx`, `main.tsx` | Routing/bootstrap imports follow renamed modules; route components have explicit contracts. |
| `src/client/auth.tsx`, `use_title.ts` | Session context and browser-title lifecycle; normalized internal callbacks/setters and documented state/network effects. |
| `src/client/api.ts` | HTTP helpers now use PascalCase (`Api`, `GetMe`, `CreateApplication`, etc.); error status is the class member `status_`; request/response keys remain compatible. |
| `src/client/components.tsx` | Shared fields, buttons, navigation, history, badges, and labels; component contracts and internal props follow the convention. |
| `src/client/leave_date_input.tsx` | Existing date picker behavior; `on_change` is an internal prop aliased to the local `OnChange` callback. |
| `src/client/leave_type_label.tsx`, `leave_type_chart.tsx` | Shared leave colors and chart rendering; naming/comments standardized without chart or styling changes. |
| `src/client/reset_password_form.tsx` | Password-confirmation form; handler/state names and function contracts standardized. |
| `src/client/pages/sign_in_page.tsx`, `home_page.tsx`, `profile_page.tsx` | Sign-in, summary/history, and profile views; consistent filenames, local names, and component contracts. |
| `src/client/pages/application_form_page.tsx`, `applications_page.tsx` | Request/edit and own-history workflows; imports/handlers/setters renamed, validation behavior preserved. |
| `src/client/pages/pending_page.tsx`, `archive_page.tsx` | Approver decisions/report UI; internal names and documentation aligned. |
| `src/client/pages/staff_admin_page.tsx`, `notifications_page.tsx` | Account administration and notices; callbacks/fields follow the style, including `on_cancel`/`on_deleted`. |
| `src/shared/constants.ts`, `types.ts` | Policy constants use `kCamelCase`; public JSON types explicitly document the compatibility exception. |
| `src/shared/dates.ts`, `messages.ts` | Date and notice helpers renamed, e.g. `DayCount`, `HongKongToday`, `DecisionMessage`; behavior unchanged. |
| `src/shared/leave_rules.ts`, `state_machine.ts`, `validate.ts` | Shared validation/lifecycle rules; PascalCase function exports and four-part contracts, with all callers updated. |
| `src/worker/index.ts`, `password.ts` | HTTP handlers, persistence/auth helpers, and password routines; internal names and route/function contracts standardized. SQL and payload semantics remain unchanged. |
| `scripts/test_database.py` | Existing 35 database tests retained; helpers use PascalCase and connection member `db_`; all 45 Python functions have contracts. |
| `scripts/test_leave.tsx`, `test_leave.mjs` | Rule/render tests and their runner; renamed imports, clearer fixture names, expanded profile/calendar checks within the 35 tests. |
| `scripts/acceptance.mjs` | Existing API checks plus additional authorization/boundary cases and six gated concurrency scenarios; helper names/contracts normalized. |
| `scripts/generate_seed.mjs` | Demo-data generator renamed and documented; output remains byte-identical to the current seed. |
| `package.json`, `package-lock.json` | npm script paths follow renamed scripts; Node 22 minimum reflects installed Wrangler. Dependency versions are unchanged. |

Page modules use a `_page.tsx` suffix and the route entry is `app_routes.tsx`.
These explicit name changes avoid case-only renames that Git may miss on macOS,
which could otherwise leave Linux builds importing a different filename casing.
No Git index manipulation or staging was needed.

All migration SQL, including `0005` and the archived legacy chain, remains
byte-for-byte unchanged from the start of this style task. There is no new
database migration. Existing generated/vendor files and tool-required filenames
were not restyled.

## Verification additions

`RunTogether` in the API suite releases competing requests from a shared gate;
`Session` creates independent browser-equivalent sessions. The new races cover
overlapping leave types, opposite decisions, edit/approve, approve/cancel,
duplicate cancellation, and remaining-quota competition. Assertions inspect
final saved state, revisions, balances, and notices, allowing every legal outcome.
Existing concurrent account creation, email uniqueness, decision, and cross-year
quota tests remain.

The full validation results, source requirement mapping, browser checks, and
unresolved coursework items are recorded in
[SPECIFICATION_VERIFICATION.md](SPECIFICATION_VERIFICATION.md). Type checks,
35 database tests, 35 rule/UI tests, three API runs, 95 browser checks, the build,
and deployment dry-run passed. Runtime literal/object-key comparisons and
independent review checked that internal renames preserved behavior.

## Documentation changes

- `CODE_STYLE.md`: compact convention for future changes.
- `README.md`: current script paths, links to the new documentation, and an honest
  distinction between the old recorded deployment URL and this locally tested code.
- `REQUIREMENTS.md`: identifies the group-specific source and corrects the stale
  statement that balance cards display Pending/Approved subtotals.
- Existing implementation/database reports: source/script paths updated after renames.
- `docs/USER_STORIES.md`: requirement-oriented user stories and acceptance criteria.
- `docs/CLOUDFLARE_DEPLOYMENT.md`: step-by-step installation, local checks, account
  selection, D1 setup/upgrade, deployment, verification, logs, and recovery guidance.

No real staff data was changed, no security feature previously deferred by the
user was introduced, and no deployment, Git commit, push, or staging was performed.
