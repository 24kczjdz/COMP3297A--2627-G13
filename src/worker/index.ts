import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { kSessionMaxAgeSeconds } from "../shared/constants";
import { HongKongToday, IsIsoDate } from "../shared/dates";
import { AssertCanModify, CancelRefusal, Decide, NextStatusAfterCancel } from "../shared/state_machine";
import type { LeaveRecord, LeaveStatus, LeaveType, Me, Notice, Role, StaffAccount } from "../shared/types";
import {
  CompanyEmailError,
  IsCompanyEmail,
  NormalizeEmail,
  ValidateLeaveInput,
  ValidatePassword,
  ValidateProfileFields,
} from "../shared/validate";
import { BytesToHex, HashPassword, PasswordMatches, RandomBytes } from "./password";
import { ReadLeaveSummary } from "./leave_summary";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

type StaffRow = {
  id: string;
  email: string;
  password_salt: string;
  password_hash: string;
  name: string;
  staff_code: string;
  birthday: string;
  department: string;
  year_joined: number;
  role: Role;
  created_at: string;
};

type LeaveRow = {
  id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_staff_code: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  day_count: number;
  reason: string;
  status: LeaveStatus;
  archived: number;
  submitted_at: string;
  decided_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  decision_comment: string;
  decided_by: string | null;
  revision: number;
};

type NoticeRow = {
  id: string;
  application_id: string;
  kind: "approved" | "disapproved";
  message: string;
  created_at: string;
  read_at: string | null;
};

type Variables = {
  staff: StaffRow;
};

const kSessionCookie = "leaveflowse_session";
// Duration is a read-time projection, never a column written by the Worker.
const kLeaveColumns = `
  a.id, a.applicant_id, s.name AS applicant_name, s.staff_code AS applicant_staff_code,
  a.leave_type, a.start_date, a.end_date,
  CAST(julianday(a.end_date) - julianday(a.start_date) + 1 AS INTEGER) AS day_count, a.reason, a.status, a.archived,
  a.submitted_at, a.decided_at, a.cancelled_at, a.updated_at,
  a.decision_comment, a.decided_by, a.revision
`;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const api = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Summary: Translate expected database refusals into safe API responses.
 * Parameters: error is the failed request error; c is the non-null Hono context.
 * Return Value: JSON with HTTP 400/409 for known constraints or 500 otherwise.
 * Side Effects & Constraints: Logs unexpected errors server-side; does not expose
 * raw database details in the response or retry failed writes.
 */
api.onError((error, c) => {
  // Trigger errors are stable codes, not raw SQL or database internals.
  const kTriggerErrorMessages: Record<string, string> = {
    "leave:dates": "Enter valid dates and an inclusive whole-day length.",
    "leave:reason": "A reason is required for leave longer than 4 days (maximum 500 characters).",
    "leave:annual_notice": "Annual leave must start at least 2 calendar days from today.",
    "leave:sick_backdate": "The last date of sick leave cannot be more than 7 days ago.",
    "leave:overlap": "This request overlaps your pending or approved leave.",
    "leave:balance": "This request exceeds your remaining balance in at least one calendar year.",
    "leave:transition": "This request can no longer be changed or cancelled.",
    "leave:edit_pending": "Only a Pending application can be edited.",
    "leave:decision_comment": "An approver comment is required for leave longer than 4 days.",
    "staff:company_email": CompanyEmailError(),
  };
  const details = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`;
  for (const [code, message] of Object.entries(kTriggerErrorMessages)) {
    if (details.includes(code)) return c.json({ error: message }, 400);
  }
  if (details.includes("UNIQUE constraint failed: staff.email") || details.includes("idx_staff_email_normalized")) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }
  if (details.includes("UNIQUE constraint failed: staff.staff_code")) {
    return c.json({ error: "That staff ID is already in use." }, 409);
  }
  console.error(error);
  return c.json({ error: "LeaveFlowSE could not complete that action." }, 500);
});

/**
 * Summary: Return the API fallback for an unmatched route.
 * Parameters: c is a non-null Hono request context.
 * Return Value: HTTP 404 with a JSON error.
 * Side Effects & Constraints: Sends a response without database access.
 */
api.notFound((c) => c.json({ error: "Not found." }, 404));

/**
 * Summary: Authenticate API requests before protected handlers run.
 * Parameters: c is the non-null Hono context; Next invokes the remaining chain.
 * Return Value: HTTP 401 for an absent/expired session, or the downstream response.
 * Side Effects & Constraints: Reads the session/account, may remove an expired
 * session and clear its cookie, and attaches staff to the request context.
 * Login/logout remain public; database errors use the API error handler.
 */
api.use("*", async (c, Next) => {
  const path = c.req.path;
  const public_session =
    (path === "/api/session" || path === "/session") &&
    (c.req.method === "POST" || c.req.method === "DELETE");
  if (public_session) {
    await Next();
    return;
  }
  const session_id = getCookie(c, kSessionCookie);
  if (!session_id) return c.json({ error: "Sign in required." }, 401);
  const row = await c.env.DB.prepare(
    `SELECT staff.id, staff.email, staff.password_salt, staff.password_hash, staff.name, staff.staff_code,
            staff.birthday, staff.department, staff.year_joined, staff.role, staff.created_at,
            session.created_at AS session_created_at, session.expires_at
     FROM session JOIN staff ON staff.id = session.staff_id
     WHERE session.id = ? AND staff.deleted_at IS NULL`,
  )
    .bind(session_id)
    .first<StaffRow & { session_created_at: string; expires_at: string }>();
  // Cap legacy sessions too, without rewriting existing session records.
  const expires_at = row ? Math.min(
    Date.parse(row.expires_at),
    Date.parse(row.session_created_at) + kSessionMaxAgeSeconds * 1000,
  ) : NaN;
  if (!row || !Number.isFinite(expires_at) || expires_at <= Date.now()) {
    if (row) await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(session_id).run();
    deleteCookie(c, kSessionCookie, { path: "/", sameSite: "Lax", secure: IsHttps(c.req.url) });
    return c.json({ error: "Sign in required." }, 401);
  }
  c.set("staff", row);
  await Next();
});

/**
 * Summary: Sign in a company account and issue a bounded session cookie.
 * Parameters: c contains untrusted JSON with a company email and password.
 * Return Value: The profile on success; 400 for malformed input or 401 for refusal.
 * Side Effects & Constraints: Hashes the password, replaces any supplied session,
 * and inserts a new session only if credentials remain current after verification.
 * Database/crypto errors propagate to the shared handler.
 */
api.post("/session", async (c) => {
  const body = await ReadJson(c);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return c.json({ error: "Enter your company email and password." }, 400);
  }
  if (!IsCompanyEmail(body.email)) {
    return c.json({ error: CompanyEmailError() }, 400);
  }
  const email = NormalizeEmail(body.email);
  const staff = await c.env.DB.prepare(
    `SELECT id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at
     FROM staff WHERE email = ? AND deleted_at IS NULL`,
  )
    .bind(email)
    .first<StaffRow>();
  const matches = staff ? await PasswordMatches(body.password, staff.password_salt, staff.password_hash) : false;
  if (!staff || !matches) {
    return c.json({ error: "That email and password do not match a staff account." }, 401);
  }
  const existing = getCookie(c, kSessionCookie);
  if (existing) {
    await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(existing).run();
  }
  const session_id = BytesToHex(RandomBytes(32));
  const now = new Date();
  const expires = new Date(now.getTime() + kSessionMaxAgeSeconds * 1000);
  // Do not issue a session from credentials superseded by a concurrent reset.
  const issued = await c.env.DB.prepare(
    `INSERT INTO session (id, staff_id, created_at, expires_at)
     SELECT ?, id, ?, ? FROM staff
     WHERE id = ? AND deleted_at IS NULL AND password_hash = ? AND password_salt = ?`,
  )
    .bind(session_id, now.toISOString(), expires.toISOString(), staff.id, staff.password_hash, staff.password_salt)
    .run();
  if (issued.meta.changes === 0) return c.json({ error: "The account changed. Sign in again." }, 401);
  setCookie(c, kSessionCookie, session_id, CookieOptions(c.req.url, kSessionMaxAgeSeconds));
  return c.json(await BuildMe(c.env.DB, staff));
});

/**
 * Summary: Sign out the session identified by the request cookie.
 * Parameters: c is a non-null context; a cookie may be absent or already invalid.
 * Return Value: HTTP 200 with ok after successful cleanup.
 * Side Effects & Constraints: Deletes the matching session and clears the cookie;
 * database failures propagate and may prevent completion.
 */
api.delete("/session", async (c) => {
  const session_id = getCookie(c, kSessionCookie);
  if (session_id) {
    await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(session_id).run();
  }
  deleteCookie(c, kSessionCookie, { path: "/", sameSite: "Lax", secure: IsHttps(c.req.url) });
  return c.json({ ok: true });
});

/**
 * Summary: Return the authenticated staff profile and live dashboard totals.
 * Parameters: c contains the non-null authenticated staff row and D1 binding.
 * Return Value: HTTP 200 with Me; query failures use the shared error handler.
 * Side Effects & Constraints: Reads current balances, notices, and pending count.
 */
api.get("/me", async (c) => c.json(await BuildMe(c.env.DB, c.get("staff"))));

/**
 * Summary: List the authenticated applicant's complete leave history.
 * Parameters: c contains the authenticated staff row and D1 binding.
 * Return Value: Applications ordered by submission time, including an empty list.
 * Side Effects & Constraints: Reads only that applicant's records; D1 errors propagate.
 */
api.get("/applications", async (c) => {
  const staff = c.get("staff");
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     WHERE a.applicant_id = ?
     ORDER BY a.submitted_at DESC, a.id DESC`,
  )
    .bind(staff.id)
    .all<LeaveRow>();
  return c.json({ applications: (rows.results ?? []).map(ToLeave) });
});

/**
 * Summary: Retrieve one application owned by the signed-in staff member.
 * Parameters: c supplies the authenticated staff and non-null request route ID.
 * Return Value: The application or HTTP 404 if missing or owned by another person.
 * Side Effects & Constraints: Performs a parameterized read; D1 errors propagate.
 */
api.get("/applications/:id", async (c) => {
  const row = await OwnApplication(c.env.DB, c.get("staff").id, c.req.param("id"));
  if (!row) return c.json({ error: "That application is not on your record." }, 404);
  return c.json(ToLeave(row));
});

/**
 * Summary: Create a pending leave request from its dates and optional reason.
 * Parameters: c is an authenticated Hono context with untrusted JSON input.
 * Return Value: HTTP 201 with a derived duration, or HTTP 400 for invalid leave.
 * Side Effects & Constraints: Inserts one D1 row; SQL checks live overlaps and
 * yearly balances atomically. Trigger failures use the shared API error handler.
 */
api.post("/applications", async (c) => {
  const parsed = ValidateLeaveInput(await ReadJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const staff = c.get("staff");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO leave_application (
      id, applicant_id, leave_type, start_date, end_date, reason, status, archived,
      submitted_at, decided_at, cancelled_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Pending', 0, ?, NULL, NULL, ?)`,
  )
    .bind(
      id,
      staff.id,
      parsed.value.leaveType,
      parsed.value.startDate,
      parsed.value.endDate,
      parsed.value.reason,
      now,
      now,
    )
    .run();
  const row = await OwnApplication(c.env.DB, staff.id, id);
  return c.json(ToLeave(row!), 201);
});

/**
 * Summary: Replace an applicant's pending request under the same submission rules.
 * Parameters: c supplies the signed-in applicant, route ID, and untrusted JSON.
 * Return Value: The updated record, 404 for missing ownership, 400 for a refusal,
 * or 409 when the browser's displayed revision is no longer current.
 * Side Effects & Constraints: Updates dates/reason and increments revision in D1;
 * SQL excludes the old reservation and derives the replacement days from dates.
 */
api.patch("/applications/:id", async (c) => {
  const staff = c.get("staff");
  const existing = await OwnApplication(c.env.DB, staff.id, c.req.param("id"));
  if (!existing) return c.json({ error: "That application is not on your record." }, 404);
  const body = await ReadJson(c);
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return c.json({ error: "Reload the request before saving changes." }, 400);
  }
  if (revision !== existing.revision) {
    return c.json({ error: "The request changed. Reload it and try again." }, 409);
  }
  const refusal = AssertCanModify(existing.status);
  if (refusal) return c.json({ error: refusal }, 400);
  const parsed = ValidateLeaveInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE leave_application
     SET leave_type = ?, start_date = ?, end_date = ?, reason = ?, status = 'Pending', archived = 0,
         updated_at = ?, revision = revision + 1
     WHERE id = ? AND applicant_id = ? AND status = 'Pending' AND revision = ?`,
  )
    .bind(
      parsed.value.leaveType,
      parsed.value.startDate,
      parsed.value.endDate,
      parsed.value.reason,
      now,
      existing.id,
      staff.id,
      revision,
    )
    .run();
  if (result.meta.changes === 0) return c.json({ error: "The request changed. Reload it and try again." }, 409);
  const row = await OwnApplication(c.env.DB, staff.id, existing.id);
  return c.json(ToLeave(row!));
});

/**
 * Summary: Cancel an eligible application owned by the signed-in staff member.
 * Parameters: c supplies the authenticated applicant and request route ID.
 * Return Value: The updated record, 404 if absent/not owned, 400 for ineligibility,
 * or 409 if another write changed the request after the eligibility check.
 * Side Effects & Constraints: Uses a conditional status/revision update; dynamic
 * balances release the allocation after cancellation. D1 errors propagate.
 */
api.post("/applications/:id/cancel", async (c) => {
  const staff = c.get("staff");
  const existing = await OwnApplication(c.env.DB, staff.id, c.req.param("id"));
  if (!existing) return c.json({ error: "That application is not on your record." }, 404);
  const today = HongKongToday();
  const refusal = CancelRefusal(existing.status, existing.start_date, today);
  if (refusal) return c.json({ error: refusal }, 400);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE leave_application
     SET status = ?, archived = 0, cancelled_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND applicant_id = ? AND status = ? AND revision = ?`,
  )
    .bind(NextStatusAfterCancel(), now, now, existing.id, staff.id, existing.status, existing.revision)
    .run();
  if (result.meta.changes === 0) return c.json({ error: "The request changed. Reload it and try again." }, 409);
  const row = await OwnApplication(c.env.DB, staff.id, existing.id);
  return c.json(ToLeave(row!));
});

/**
 * Summary: Load the signed-in staff member's notices and mark unread ones as read.
 * Parameters: c contains the authenticated recipient and D1 binding.
 * Return Value: Notices ordered newest first, preserving their read state at query time.
 * Side Effects & Constraints: Reads notices then updates unread timestamps for that
 * recipient; the two statements are separate. D1 errors propagate.
 */
api.get("/notifications", async (c) => {
  const staff = c.get("staff");
  const rows = await c.env.DB.prepare(
    `SELECT id, application_id, kind, message, created_at, read_at
     FROM notification WHERE recipient_id = ?
     ORDER BY created_at DESC, id DESC`,
  )
    .bind(staff.id)
    .all<NoticeRow>();
  const notices = (rows.results ?? []).map(ToNotice);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE notification SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL",
  )
    .bind(now, staff.id)
    .run();
  return c.json({ notifications: notices });
});

/**
 * Summary: Restrict approver routes to the authenticated approver role.
 * Parameters: c has the authenticated staff row; Next invokes the guarded handler.
 * Return Value: HTTP 403 for staff, otherwise the downstream response.
 * Side Effects & Constraints: Checks the role in request context; performs no writes.
 */
api.use("/approver/*", async (c, Next) => {
  if (c.get("staff").role !== "approver") {
    return c.json({ error: "Only the approver can do that." }, 403);
  }
  await Next();
});

/**
 * Summary: List accounts visible to the approver.
 * Parameters: c is a non-null authenticated approver context.
 * Return Value: Public staff fields ordered by staff code, or an empty list.
 * Side Effects & Constraints: Excludes soft-deleted accounts; D1 errors propagate.
 */
api.get("/approver/staff", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role
     FROM staff WHERE deleted_at IS NULL ORDER BY staff_code`,
  ).all<StaffRow>();
  return c.json({ staff: (rows.results ?? []).map(ToAccount) });
});

/**
 * Summary: Create a staff account with an atomically assigned WS-number staff ID.
 * Parameters: c supplies the authenticated approver and untrusted account details;
 * client-supplied staff IDs are ignored. A valid duplicate email takes priority.
 * Return Value: The account and initial password, 400/409 for invalid/duplicate data,
 * or 503 if the existing 20-character staff ID range is exhausted.
 * Side Effects & Constraints: Hashes the password and inserts one account. D1 assigns
 * the next numeric WS-ID within the INSERT, so concurrent writers cannot reserve
 * the same number from separate reads. Existing unique constraints remain enforced.
 */
api.post("/approver/staff", async (c) => {
  const body = await ReadJson(c);
  if (!body) return c.json({ error: "The request body must be JSON." }, 400);
  if (typeof body.email !== "string" || !IsCompanyEmail(body.email)) {
    return c.json({ error: CompanyEmailError() }, 400);
  }
  const email_row = await c.env.DB.prepare("SELECT id FROM staff WHERE email = ?")
    .bind(NormalizeEmail(body.email)).first<{ id: string }>();
  if (email_row) return c.json({ error: "An account with that email already exists." }, 400);
  const parsed = ValidateProfileFields(body, "create");
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const password_error = ValidatePassword(body && typeof body === "object" ? (body as { password?: unknown }).password : null);
  if (password_error) return c.json({ error: password_error }, 400);
  const password = (body as { password: string }).password;
  const salt = RandomBytes(16);
  const hash = await HashPassword(password, salt);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `WITH next_staff_code AS (
       SELECT COALESCE(MAX(CAST(substr(staff_code, 4) AS INTEGER)), 0) + 1 AS number
       FROM staff
       WHERE staff_code GLOB 'WS-[0-9]*'
         AND substr(staff_code, 4) NOT GLOB '*[^0-9]*'
         AND length(staff_code) <= 20
     )
     INSERT INTO staff (
      id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at
     )
     SELECT ?, ?, ?, ?, ?, printf('WS-%03d', number), ?, ?, ?, 'staff', ?
     FROM next_staff_code WHERE number <= 99999999999999999`,
  )
    .bind(
      id,
      parsed.value.email,
      BytesToHex(salt),
      BytesToHex(hash),
      parsed.value.name,
      parsed.value.birthday,
      parsed.value.department,
      parsed.value.yearJoined,
      now,
    )
    .run();
  if (result.meta.changes === 0) {
    return c.json({ error: "No staff ID is available. Contact the administrator." }, 503);
  }
  const created = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ?`,
  )
    .bind(id)
    .first<StaffRow>();
  return c.json({ staff: ToAccount(created!), initialPassword: password }, 201);
});

/**
 * Summary: Load one account for the approver's editor.
 * Parameters: c is an authenticated approver context with a non-null target ID.
 * Return Value: Public account fields, or HTTP 404 for an absent/deleted target.
 * Side Effects & Constraints: Performs one read; credentials are not returned.
 */
api.get("/approver/staff/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(c.req.param("id"))
    .first<StaffRow>();
  if (!row) return c.json({ error: "That staff account was not found." }, 404);
  return c.json(ToAccount(row));
});

/**
 * Summary: Update validated profile fields for an existing account.
 * Parameters: c is an authenticated approver context with a target ID and untrusted
 * profile JSON; account role and credentials are not editable through this route.
 * Return Value: Updated account, 404 if absent, or 400/409 for invalid/conflicting data.
 * Side Effects & Constraints: Writes profile fields; database uniqueness constraints
 * arbitrate concurrent edits. Other D1 errors propagate.
 */
api.patch("/approver/staff/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM staff WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ id: string }>();
  if (!existing) return c.json({ error: "That staff account was not found." }, 404);
  const parsed = ValidateProfileFields(await ReadJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const taken = await ConflictMessage(c.env.DB, parsed.value.email, parsed.value.staffCode, id);
  if (taken) return c.json({ error: taken }, 400);
  const updated = await c.env.DB.prepare(
    `UPDATE staff
     SET email = ?, name = ?, staff_code = ?, birthday = ?, department = ?, year_joined = ?
     WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(
      parsed.value.email,
      parsed.value.name,
      parsed.value.staffCode,
      parsed.value.birthday,
      parsed.value.department,
      parsed.value.yearJoined,
      id,
    )
    .run();
  if (updated.meta.changes === 0) return c.json({ error: "That staff account was not found." }, 404);
  const row = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(id)
    .first<StaffRow>();
  if (!row) return c.json({ error: "That staff account was not found." }, 404);
  return c.json(ToAccount(row));
});

/**
 * Summary: Permanently delete an employee after verifying the approver's password.
 * Parameters: c supplies the authenticated actor, target route ID, and JSON
 * approverPassword containing 1-72 characters; no plaintext password is logged.
 * Return Value: HTTP 200 after deletion, 400 for malformed input, 403 for wrong
 * credentials/protected accounts, or 404 when the target is absent.
 * Side Effects & Constraints: One guarded DELETE removes the employee's records,
 * notices, and sessions through a trigger; D1 rolls back all changes on failure.
 */
api.delete("/approver/staff/:id", async (c) => {
  const actor = c.get("staff");
  const target_id = c.req.param("id");
  if (target_id === actor.id) return c.json({ error: "The approver account cannot be deleted." }, 403);
  const password = (await ReadJson(c))?.approverPassword;
  if (typeof password !== "string" || !password || password.length > 72) {
    return c.json({ error: "Enter your approver password." }, 400);
  }
  if (!(await PasswordMatches(password, actor.password_salt, actor.password_hash))) {
    return c.json({ error: "Your approver password is incorrect." }, 403);
  }
  const result = await c.env.DB.prepare(
    "DELETE FROM staff WHERE id = ? AND role = 'staff' AND deleted_at IS NULL",
  ).bind(target_id).run();
  if (result.meta.changes === 0) return c.json({ error: "That staff account was not found." }, 404);
  return c.json({ ok: true });
});

/**
 * Summary: Reset an ordinary staff password after reauthenticating the approver.
 * Parameters: c contains an authenticated approver and target ID. JSON must
 * provide newPassword (8-72 characters) and approverPassword (1-72 characters).
 * Return Value: 200 on success; 400 for invalid inputs, 403 for a wrong approver
 * password/protected account, 404 for a missing target, or 409 for a concurrent change.
 * Side Effects & Constraints: Stores a fresh salt/hash and removes all target
 * sessions in one atomic D1 batch. Plaintext passwords are never stored/returned.
 * Conditional writes prevent a stale reset from replacing newer credentials.
 */
api.post("/approver/staff/:id/password", async (c) => {
  const actor = c.get("staff");
  const target_id = c.req.param("id");
  const body = await ReadJson(c);
  const password_error = ValidatePassword(body?.newPassword);
  if (password_error) return c.json({ error: password_error }, 400);
  const approver_password = body?.approverPassword;
  if (typeof approver_password !== "string" || !approver_password || approver_password.length > 72) {
    return c.json({ error: "Enter your approver password." }, 400);
  }
  if (!(await PasswordMatches(approver_password, actor.password_salt, actor.password_hash))) {
    return c.json({ error: "Your approver password is incorrect." }, 403);
  }
  const target = await c.env.DB.prepare(
    "SELECT id, role, password_hash FROM staff WHERE id = ? AND deleted_at IS NULL",
  ).bind(target_id).first<Pick<StaffRow, "id" | "role" | "password_hash">>();
  if (!target) return c.json({ error: "That staff account was not found." }, 404);
  if (target.role !== "staff") return c.json({ error: "Password reset is available for employee accounts only." }, 403);
  const salt = RandomBytes(16);
  const password_hash = BytesToHex(await HashPassword(body!.newPassword as string, salt));
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE staff SET password_salt = ?, password_hash = ?
       WHERE id = ? AND role = 'staff' AND deleted_at IS NULL AND password_hash = ?
         AND EXISTS (SELECT 1 FROM staff WHERE id = ? AND role = 'approver'
           AND deleted_at IS NULL AND password_hash = ? AND password_salt = ?)`,
    ).bind(BytesToHex(salt), password_hash, target_id, target.password_hash,
      actor.id, actor.password_hash, actor.password_salt),
    c.env.DB.prepare(
      `DELETE FROM session WHERE staff_id = ?
       AND EXISTS (SELECT 1 FROM staff WHERE id = ? AND password_hash = ? AND deleted_at IS NULL)`,
    ).bind(target_id, target_id, password_hash),
  ]);
  if (results[0].meta.changes === 0) return c.json({ error: "The account changed. Reload it and try again." }, 409);
  return c.json({ ok: true });
});

/**
 * Summary: List all pending applications for the approver's decision queue.
 * Parameters: c is a non-null authenticated approver context.
 * Return Value: The count and records ordered by start date, submission, then ID.
 * Side Effects & Constraints: Read-only; D1 errors use the shared handler.
 */
api.get("/approver/pending", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     WHERE a.status = 'Pending'
     ORDER BY a.start_date ASC, a.submitted_at ASC, a.id ASC`,
  ).all<LeaveRow>();
  const applications = (rows.results ?? []).map(ToLeave);
  return c.json({ count: applications.length, applications });
});

/**
 * Summary: Apply an approver decision to the exact pending revision they reviewed.
 * Parameters: c supplies the authenticated approver, request ID, and JSON decision,
 * nonnegative revision, and optional comment of at most 1000 characters.
 * Return Value: Updated record; 400 for invalid input/state, 404 if absent, or 409
 * when another edit/decision changed the revision.
 * Side Effects & Constraints: One guarded update records the decision; its trigger
 * inserts a notice atomically. Requests over four days require a comment. Rejection
 * releases quota through live balance views; D1 errors propagate.
 */
api.post("/approver/applications/:id/decision", async (c) => {
  const body = await ReadJson(c);
  const decision = body && typeof body === "object" ? (body as { decision?: unknown }).decision : null;
  if (decision !== "approve" && decision !== "disapprove") {
    return c.json({ error: "Choose approve or disapprove." }, 400);
  }
  const existing = await ApplicationById(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "That application was not found." }, 404);
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return c.json({ error: "Reload the queue before deciding this request." }, 400);
  }
  if (revision !== existing.revision) {
    return c.json({ error: "The request changed. Reload the queue and review it again." }, 409);
  }
  const outcome = Decide(existing.status, decision);
  if (!outcome.ok) return c.json({ error: outcome.error }, 400);
  const raw_comment = body?.comment ?? "";
  if (typeof raw_comment !== "string" || raw_comment.trim().length > 1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw_comment)) {
    return c.json({ error: "Use a comment of 1000 characters or fewer." }, 400);
  }
  const comment = raw_comment.trim().replace(/\r\n?/g, "\n");
  if (existing.day_count > 4 && !comment) {
    return c.json({ error: "An approver comment is required for leave longer than 4 days." }, 400);
  }
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE leave_application
     SET status = ?, archived = 1, decided_at = ?, updated_at = ?, decision_comment = ?, decided_by = ?,
         revision = revision + 1
     WHERE id = ? AND status = 'Pending' AND revision = ?`,
  )
    .bind(outcome.status, now, now, comment, c.get("staff").id, existing.id, revision)
    .run();
  // D1 includes the notification trigger's insert in meta.changes.
  if (result.meta.changes === 0) return c.json({ error: "The request changed. Reload it and try again." }, 409);
  // SQL creates the notification atomically with the decision.
  const row = await ApplicationById(c.env.DB, existing.id);
  return c.json(ToLeave(row!));
});

/**
 * Summary: List every leave application, including pending and cancelled records.
 * Parameters: c is a non-null authenticated approver context; no filters apply.
 * Return Value: Applications ordered by newest start date, submission, and ID.
 * Side Effects & Constraints: Reads D1 without modifying records. Neither status
 * nor the archived flag excludes applications from any calendar year.
 * Database failures use the shared API error handler.
 */
api.get("/approver/archive", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     ORDER BY a.start_date DESC, a.submitted_at DESC, a.id DESC`,
  ).all<LeaveRow>();
  return c.json({ applications: (rows.results ?? []).map(ToLeave) });
});

/**
 * Summary: List every application covering a selected leave date.
 * Parameters: c is an authenticated approver context; query date is YYYY-MM-DD.
 * Return Value: Matching records ordered by staff name and start date, or 400 for
 * an invalid date; a valid date without records returns an empty list.
 * Side Effects & Constraints: Reads inclusive start/end coverage across all statuses,
 * independent of submission date; database errors propagate.
 */
api.get("/approver/on-date", async (c) => {
  const date = c.req.query("date") ?? "";
  if (!IsIsoDate(date)) return c.json({ error: "Choose a date to see who is away." }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     WHERE a.start_date <= ? AND a.end_date >= ?
     ORDER BY s.name ASC, a.start_date ASC`,
  )
    .bind(date, date)
    .all<LeaveRow>();
  return c.json({ date, applications: (rows.results ?? []).map(ToLeave) });
});

app.route("/api", api);

/**
 * Summary: Serve the built interface for non-API requests.
 * Parameters: c is a non-null request context with the ASSETS binding.
 * Return Value: The asset response, including configured SPA navigation fallback.
 * Side Effects & Constraints: Delegates to Cloudflare asset serving; errors propagate.
 */
app.all("*", async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

/**
 * Summary: Build session cookie settings for the current request transport.
 * Parameters: request_url is an absolute URL; max_age is a nonnegative integer
 * lifetime in seconds. Neither parameter may be null.
 * Return Value: Hono cookie options; invalid URLs throw TypeError.
 * Side Effects & Constraints: Pure; does not set a cookie itself.
 */
function CookieOptions(request_url: string, max_age: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    secure: IsHttps(request_url),
    maxAge: max_age,
  };
}

/**
 * Summary: Detect HTTPS before issuing or clearing a secure session cookie.
 * Parameters: request_url is a non-null absolute URL.
 * Return Value: True for HTTPS, false otherwise; invalid URLs throw TypeError.
 * Side Effects & Constraints: Pure; parses the supplied URL only.
 */
function IsHttps(request_url: string): boolean {
  return new URL(request_url).protocol === "https:";
}

/**
 * Summary: Read a request body as an untrusted JSON object.
 * Parameters: c is a non-null context exposing an asynchronous request JSON reader.
 * Return Value: The object, or null for parse errors, arrays, null, or primitives.
 * Side Effects & Constraints: Consumes the request body; catches JSON reader errors.
 */
async function ReadJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Summary: Assemble the signed-in profile and live current-year dashboard data.
 * Parameters: db is an available D1 binding; staff is the authenticated non-null row.
 * Return Value: The Me response; D1 failures or missing quota summaries reject.
 * Side Effects & Constraints: Reads Hong Kong time and performs up to three D1
 * queries using the captured reporting date for all quota calculations; does not
 * mutate quotas, accounts, or notification read states.
 */
async function BuildMe(db: D1Database, staff: StaffRow): Promise<Me> {
  const today = HongKongToday();
  const year = Number(today.slice(0, 4));
  const quota = await ReadLeaveSummary(db, staff.id, today);
  const unread = await db
    .prepare("SELECT COUNT(*) AS count FROM notification WHERE recipient_id = ? AND read_at IS NULL")
    .bind(staff.id)
    .first<{ count: number }>();
  let pending_count: number | null = null;
  if (staff.role === "approver") {
    const pending = await db
      .prepare("SELECT COUNT(*) AS count FROM leave_application WHERE status = 'Pending'")
      .first<{ count: number }>();
    pending_count = Number(pending?.count ?? 0);
  }
  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    staffCode: staff.staff_code,
    birthday: staff.birthday,
    department: staff.department,
    yearJoined: Number(staff.year_joined),
    role: staff.role,
    quota,
    unreadNotifications: Number(unread?.count ?? 0),
    pendingCount: pending_count,
    hongKongToday: today,
    quotaYear: year,
  };
}

/**
 * Summary: Fetch one application only when it belongs to the supplied staff ID.
 * Parameters: db is available; staff_id and id are non-null account/request IDs.
 * Return Value: A joined row with derived duration, or null when absent/not owned;
 * database errors reject the promise.
 * Side Effects & Constraints: Executes one parameterized read; does not modify data.
 */
async function OwnApplication(db: D1Database, staff_id: string, id: string): Promise<LeaveRow | null> {
  return db
    .prepare(
      `SELECT ${kLeaveColumns}
       FROM leave_application a JOIN staff s ON s.id = a.applicant_id
       WHERE a.id = ? AND a.applicant_id = ?`,
    )
    .bind(id, staff_id)
    .first<LeaveRow>();
}

/**
 * Summary: Fetch a joined application for an authorized approver operation.
 * Parameters: db is available; id is a non-null request ID.
 * Return Value: The row or null when absent; database errors reject.
 * Side Effects & Constraints: Executes one read without checking caller ownership;
 * the route must enforce the approver role before calling.
 */
async function ApplicationById(db: D1Database, id: string): Promise<LeaveRow | null> {
  return db
    .prepare(
      `SELECT ${kLeaveColumns}
       FROM leave_application a JOIN staff s ON s.id = a.applicant_id
       WHERE a.id = ?`,
    )
    .bind(id)
    .first<LeaveRow>();
}

/**
 * Summary: Find conflicting email or staff-code assignments before editing.
 * Parameters: db is available; email is normalized; staff_code is validated;
 * except_id excludes the edited account, or null excludes nothing.
 * Return Value: A conflict explanation or null; database errors reject.
 * Side Effects & Constraints: Performs up to two reads; unique constraints remain
 * authoritative if another request writes after these checks.
 */
async function ConflictMessage(db: D1Database, email: string, staff_code: string, except_id: string | null): Promise<string | null> {
  const email_row = await db
    .prepare("SELECT id FROM staff WHERE email = ? AND id != ?")
    .bind(email, except_id ?? "")
    .first<{ id: string }>();
  if (email_row) return "An account with that email already exists.";
  const code_row = await db
    .prepare("SELECT id FROM staff WHERE staff_code = ? AND id != ?")
    .bind(staff_code, except_id ?? "")
    .first<{ id: string }>();
  if (code_row) return "That staff ID is already in use.";
  return null;
}

/**
 * Summary: Convert a joined database application row to the stable API shape.
 * Parameters: row is a non-null LeaveRow, including a calculated day_count.
 * Return Value: A LeaveRecord with numeric counts/revision and a boolean archive flag.
 * Side Effects & Constraints: Pure; preserves API field names and stores no duration.
 */
function ToLeave(row: LeaveRow): LeaveRecord {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    applicantStaffCode: row.applicant_staff_code,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    dayCount: Number(row.day_count),
    reason: row.reason,
    status: row.status,
    archived: Number(row.archived) === 1,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    decisionComment: row.decision_comment,
    decidedBy: row.decided_by,
    revision: Number(row.revision),
  };
}

/**
 * Summary: Convert a database notification into its public response shape.
 * Parameters: row is a non-null NoticeRow; read_at may be null for unread notices.
 * Return Value: A Notice preserving the stable JSON field names.
 * Side Effects & Constraints: Pure; does not mark a notice as read.
 */
function ToNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/**
 * Summary: Project a staff row without exposing credential material.
 * Parameters: row is a non-null StaffRow returned by an authorized account query.
 * Return Value: Public StaffAccount fields with a numeric joining year.
 * Side Effects & Constraints: Pure; excludes salts, hashes, and session data.
 */
function ToAccount(row: StaffRow): StaffAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    staffCode: row.staff_code,
    birthday: row.birthday,
    department: row.department,
    yearJoined: Number(row.year_joined),
    role: row.role,
  };
}
