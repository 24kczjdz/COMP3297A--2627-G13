# LeaveFlowSE

LeaveFlowSE is the staff leave desk for WorkSmartSE, a Hong Kong company of about 40 people. Staff sign in with a company email, apply for annual or sick leave in whole days, and one approver decides. The approver is also a staff member and can apply for their own leave.

Dates are calendar dates in Asia/Hong_Kong. One quota day is one full day, counting every day from the start date through the end date. Each person has 18 days of annual leave and 14 days of sick leave. Days already spent are whole days of leave that is still approved.

## Stack

TypeScript, React, Vite, Tailwind CSS, and Hono on a Cloudflare Worker. Data lives in Cloudflare D1. Passwords are PBKDF2-SHA-256 hashes. Sessions are random ids in an HTTP-only cookie.

## Run locally

```bash
npm install
npx wrangler d1 migrations apply leaveflowse --local
npm run dev
```

Open [http://127.0.0.1:43219](http://127.0.0.1:43219).

`npm run dev` builds the interface, then starts Wrangler. The Worker serves the app and the JSON API under `/api`. The local D1 database is created by the migrate command. Reset it by deleting `.wrangler` and applying the migrations again.

Regenerate the demo seed, then reset the local database, with:

```bash
npm run generate-seed
rm -rf .wrangler
npx wrangler d1 migrations apply leaveflowse --local
```

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
npm run acceptance
```

`npm run acceptance` expects the local app on port 43219. The checklist it walks is also written up in [ACCEPTANCE.md](ACCEPTANCE.md).
