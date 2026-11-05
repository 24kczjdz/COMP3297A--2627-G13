import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_DAYS } from "../shared/constants";
import { hongKongToday, isIsoDate } from "../shared/dates";
import { assertCanModify, cancelRefusal, decide, nextStatusAfterCancel } from "../shared/stateMachine";
import type { LeaveRecord, LeaveStatus, LeaveType, Me, Notice, Role, StaffAccount } from "../shared/types";
import {
  companyEmailError,
  isCompanyEmail,
  normalizeEmail,
  ValidateLeaveInput,
  validatePassword,
  validateProfileFields,
} from "../shared/validate";
import { bytesToHex, hashPassword, passwordMatches, randomBytes } from "./password";

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

const COOKIE = "leaveflowse_session";
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

api.onError((error, c) => {
  // Trigger errors are stable codes, not raw SQL or database internals.
  const messages: Record<string, string> = {
    "leave:dates": "Enter valid dates and an inclusive whole-day length.",
    "leave:reason": "A reason is required for leave longer than 4 days (maximum 500 characters).",
    "leave:annual_notice": "Annual leave must start at least 2 calendar days from today.",
    "leave:sick_backdate": "The last date of sick leave cannot be more than 7 days ago.",
    "leave:overlap": "This request overlaps your pending or approved leave.",
    "leave:balance": "This request exceeds your remaining balance in at least one calendar year.",
    "leave:transition": "This request can no longer be changed or cancelled.",
    "leave:edit_pending": "Only a Pending application can be edited.",
    "leave:decision_comment": "An approver comment is required for leave longer than 4 days.",
    "staff:company_email": companyEmailError(),
  };
  const details = `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`;
  for (const [code, message] of Object.entries(messages)) {
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

api.notFound((c) => c.json({ error: "Not found." }, 404));

api.use("*", async (c, next) => {
  const path = c.req.path;
  const publicSession =
    (path === "/api/session" || path === "/session") &&
    (c.req.method === "POST" || c.req.method === "DELETE");
  if (publicSession) {
    await next();
    return;
  }
  const sessionId = getCookie(c, COOKIE);
  if (!sessionId) return c.json({ error: "Sign in required." }, 401);
  const row = await c.env.DB.prepare(
    `SELECT staff.id, staff.email, staff.password_salt, staff.password_hash, staff.name, staff.staff_code,
            staff.birthday, staff.department, staff.year_joined, staff.role, staff.created_at,
            session.expires_at
     FROM session JOIN staff ON staff.id = session.staff_id
     WHERE session.id = ?`,
  )
    .bind(sessionId)
    .first<StaffRow & { expires_at: string }>();
  if (!row || row.expires_at < new Date().toISOString()) {
    if (row) await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(sessionId).run();
    deleteCookie(c, COOKIE, { path: "/", sameSite: "Lax", secure: isHttps(c.req.url) });
    return c.json({ error: "Sign in required." }, 401);
  }
  c.set("staff", row);
  await next();
});

api.post("/session", async (c) => {
  const body = await readJson(c);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return c.json({ error: "Enter your company email and password." }, 400);
  }
  if (!isCompanyEmail(body.email)) {
    return c.json({ error: companyEmailError() }, 400);
  }
  const email = normalizeEmail(body.email);
  const staff = await c.env.DB.prepare(
    `SELECT id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at
     FROM staff WHERE email = ?`,
  )
    .bind(email)
    .first<StaffRow>();
  const matches = staff ? await passwordMatches(body.password, staff.password_salt, staff.password_hash) : false;
  if (!staff || !matches) {
    return c.json({ error: "That email and password do not match a staff account." }, 401);
  }
  const existing = getCookie(c, COOKIE);
  if (existing) {
    await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(existing).run();
  }
  const sessionId = bytesToHex(randomBytes(32));
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await c.env.DB.prepare(
    "INSERT INTO session (id, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(sessionId, staff.id, now.toISOString(), expires.toISOString())
    .run();
  setCookie(c, COOKIE, sessionId, cookieOptions(c.req.url, SESSION_DAYS * 86_400));
  return c.json(await buildMe(c.env.DB, staff));
});

api.delete("/session", async (c) => {
  const sessionId = getCookie(c, COOKIE);
  if (sessionId) {
    await c.env.DB.prepare("DELETE FROM session WHERE id = ?").bind(sessionId).run();
  }
  deleteCookie(c, COOKIE, { path: "/", sameSite: "Lax", secure: isHttps(c.req.url) });
  return c.json({ ok: true });
});

api.get("/me", async (c) => c.json(await buildMe(c.env.DB, c.get("staff"))));

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
  return c.json({ applications: (rows.results ?? []).map(toLeave) });
});

api.get("/applications/:id", async (c) => {
  const row = await ownApplication(c.env.DB, c.get("staff").id, c.req.param("id"));
  if (!row) return c.json({ error: "That application is not on your record." }, 404);
  return c.json(toLeave(row));
});

/**
 * Summary: Create a pending leave request from its dates and optional reason.
 * Parameters: c is an authenticated Hono context with untrusted JSON input.
 * Return Value: HTTP 201 with a derived duration, or HTTP 400 for invalid leave.
 * Side Effects & Constraints: Inserts one D1 row; SQL checks live overlaps and
 * yearly balances atomically. Trigger failures use the shared API error handler.
 */
api.post("/applications", async (c) => {
  const parsed = ValidateLeaveInput(await readJson(c));
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
  const row = await ownApplication(c.env.DB, staff.id, id);
  return c.json(toLeave(row!), 201);
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
  const existing = await ownApplication(c.env.DB, staff.id, c.req.param("id"));
  if (!existing) return c.json({ error: "That application is not on your record." }, 404);
  const body = await readJson(c);
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return c.json({ error: "Reload the request before saving changes." }, 400);
  }
  if (revision !== existing.revision) {
    return c.json({ error: "The request changed. Reload it and try again." }, 409);
  }
  const refusal = assertCanModify(existing.status);
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
  const row = await ownApplication(c.env.DB, staff.id, existing.id);
  return c.json(toLeave(row!));
});

api.post("/applications/:id/cancel", async (c) => {
  const staff = c.get("staff");
  const existing = await ownApplication(c.env.DB, staff.id, c.req.param("id"));
  if (!existing) return c.json({ error: "That application is not on your record." }, 404);
  const today = hongKongToday();
  const refusal = cancelRefusal(existing.status, existing.start_date, today);
  if (refusal) return c.json({ error: refusal }, 400);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE leave_application
     SET status = ?, archived = 0, cancelled_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND applicant_id = ? AND status = ? AND revision = ?`,
  )
    .bind(nextStatusAfterCancel(), now, now, existing.id, staff.id, existing.status, existing.revision)
    .run();
  if (result.meta.changes === 0) return c.json({ error: "The request changed. Reload it and try again." }, 409);
  const row = await ownApplication(c.env.DB, staff.id, existing.id);
  return c.json(toLeave(row!));
});

api.get("/notifications", async (c) => {
  const staff = c.get("staff");
  const rows = await c.env.DB.prepare(
    `SELECT id, application_id, kind, message, created_at, read_at
     FROM notification WHERE recipient_id = ?
     ORDER BY created_at DESC, id DESC`,
  )
    .bind(staff.id)
    .all<NoticeRow>();
  const notices = (rows.results ?? []).map(toNotice);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE notification SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL",
  )
    .bind(now, staff.id)
    .run();
  return c.json({ notifications: notices });
});

api.use("/approver/*", async (c, next) => {
  if (c.get("staff").role !== "approver") {
    return c.json({ error: "Only the approver can do that." }, 403);
  }
  await next();
});

api.get("/approver/staff", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role
     FROM staff ORDER BY staff_code`,
  ).all<StaffRow>();
  return c.json({ staff: (rows.results ?? []).map(toAccount) });
});

api.post("/approver/staff", async (c) => {
  const body = await readJson(c);
  const parsed = validateProfileFields(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const passwordError = validatePassword(body && typeof body === "object" ? (body as { password?: unknown }).password : null);
  if (passwordError) return c.json({ error: passwordError }, 400);
  const password = (body as { password: string }).password;
  const taken = await conflictMessage(c.env.DB, parsed.value.email, parsed.value.staffCode, null);
  if (taken) return c.json({ error: taken }, 400);
  const salt = randomBytes(16);
  const hash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO staff (
      id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staff', ?)`,
  )
    .bind(
      id,
      parsed.value.email,
      bytesToHex(salt),
      bytesToHex(hash),
      parsed.value.name,
      parsed.value.staffCode,
      parsed.value.birthday,
      parsed.value.department,
      parsed.value.yearJoined,
      now,
    )
    .run();
  const created = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ?`,
  )
    .bind(id)
    .first<StaffRow>();
  return c.json({ staff: toAccount(created!), initialPassword: password }, 201);
});

api.get("/approver/staff/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .first<StaffRow>();
  if (!row) return c.json({ error: "That staff account was not found." }, 404);
  return c.json(toAccount(row));
});

api.patch("/approver/staff/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id, role FROM staff WHERE id = ?").bind(id).first<{ id: string; role: Role }>();
  if (!existing) return c.json({ error: "That staff account was not found." }, 404);
  const parsed = validateProfileFields(await readJson(c));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const taken = await conflictMessage(c.env.DB, parsed.value.email, parsed.value.staffCode, id);
  if (taken) return c.json({ error: taken }, 400);
  await c.env.DB.prepare(
    `UPDATE staff
     SET email = ?, name = ?, staff_code = ?, birthday = ?, department = ?, year_joined = ?
     WHERE id = ?`,
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
  const row = await c.env.DB.prepare(
    `SELECT id, email, name, staff_code, birthday, department, year_joined, role, created_at,
            password_salt, password_hash
     FROM staff WHERE id = ?`,
  )
    .bind(id)
    .first<StaffRow>();
  return c.json(toAccount(row!));
});

api.get("/approver/pending", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     WHERE a.status = 'Pending'
     ORDER BY a.start_date ASC, a.submitted_at ASC, a.id ASC`,
  ).all<LeaveRow>();
  const applications = (rows.results ?? []).map(toLeave);
  return c.json({ count: applications.length, applications });
});

api.post("/approver/applications/:id/decision", async (c) => {
  const body = await readJson(c);
  const decision = body && typeof body === "object" ? (body as { decision?: unknown }).decision : null;
  if (decision !== "approve" && decision !== "disapprove") {
    return c.json({ error: "Choose approve or disapprove." }, 400);
  }
  const existing = await applicationById(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "That application was not found." }, 404);
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return c.json({ error: "Reload the queue before deciding this request." }, 400);
  }
  if (revision !== existing.revision) {
    return c.json({ error: "The request changed. Reload the queue and review it again." }, 409);
  }
  const outcome = decide(existing.status, decision);
  if (!outcome.ok) return c.json({ error: outcome.error }, 400);
  const rawComment = body?.comment ?? "";
  if (typeof rawComment !== "string" || rawComment.trim().length > 1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rawComment)) {
    return c.json({ error: "Use a comment of 1000 characters or fewer." }, 400);
  }
  const comment = rawComment.trim().replace(/\r\n?/g, "\n");
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
  const row = await applicationById(c.env.DB, existing.id);
  return c.json(toLeave(row!));
});

api.get("/approver/on-date", async (c) => {
  const date = c.req.query("date") ?? "";
  if (!isIsoDate(date)) return c.json({ error: "Choose a date to see who is away." }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT ${kLeaveColumns}
     FROM leave_application a JOIN staff s ON s.id = a.applicant_id
     WHERE a.start_date <= ? AND a.end_date >= ?
     ORDER BY s.name ASC, a.start_date ASC`,
  )
    .bind(date, date)
    .all<LeaveRow>();
  return c.json({ date, applications: (rows.results ?? []).map(toLeave) });
});

app.route("/api", api);

app.all("*", async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

function cookieOptions(requestUrl: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    secure: isHttps(requestUrl),
    maxAge,
  };
}

function isHttps(requestUrl: string): boolean {
  return new URL(requestUrl).protocol === "https:";
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function buildMe(db: D1Database, staff: StaffRow): Promise<Me> {
  const today = hongKongToday();
  const year = Number(today.slice(0, 4));
  const balances = await db
    .prepare(
      `SELECT leave_type, entitlement, pending_days, approved_days, taken_days, remaining
       FROM leave_balance WHERE staff_id = ? AND calendar_year = ?`,
    )
    .bind(staff.id, year)
    .all<{ leave_type: LeaveType; entitlement: number; pending_days: number; approved_days: number; taken_days: number; remaining: number }>();
  const side = (type: LeaveType) => {
    const row = balances.results.find((item) => item.leave_type === type);
    if (!row) throw new Error("Missing calendar-year leave balance; apply database migrations.");
    return { entitlement: row.entitlement, spent: row.approved_days, pending: row.pending_days,
      taken: row.taken_days, remaining: row.remaining };
  };
  const unread = await db
    .prepare("SELECT COUNT(*) AS count FROM notification WHERE recipient_id = ? AND read_at IS NULL")
    .bind(staff.id)
    .first<{ count: number }>();
  let pendingCount: number | null = null;
  if (staff.role === "approver") {
    const pending = await db
      .prepare("SELECT COUNT(*) AS count FROM leave_application WHERE status = 'Pending'")
      .first<{ count: number }>();
    pendingCount = Number(pending?.count ?? 0);
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
    quota: {
      annual: side("annual"),
      sick: side("sick"),
    },
    unreadNotifications: Number(unread?.count ?? 0),
    pendingCount,
    hongKongToday: today,
    quotaYear: year,
  };
}

async function ownApplication(db: D1Database, staffId: string, id: string): Promise<LeaveRow | null> {
  return db
    .prepare(
      `SELECT ${kLeaveColumns}
       FROM leave_application a JOIN staff s ON s.id = a.applicant_id
       WHERE a.id = ? AND a.applicant_id = ?`,
    )
    .bind(id, staffId)
    .first<LeaveRow>();
}

async function applicationById(db: D1Database, id: string): Promise<LeaveRow | null> {
  return db
    .prepare(
      `SELECT ${kLeaveColumns}
       FROM leave_application a JOIN staff s ON s.id = a.applicant_id
       WHERE a.id = ?`,
    )
    .bind(id)
    .first<LeaveRow>();
}

async function conflictMessage(db: D1Database, email: string, staffCode: string, exceptId: string | null): Promise<string | null> {
  const emailRow = await db
    .prepare("SELECT id FROM staff WHERE email = ? AND id != ?")
    .bind(email, exceptId ?? "")
    .first<{ id: string }>();
  if (emailRow) return "An account with that email already exists.";
  const codeRow = await db
    .prepare("SELECT id FROM staff WHERE staff_code = ? AND id != ?")
    .bind(staffCode, exceptId ?? "")
    .first<{ id: string }>();
  if (codeRow) return "That staff ID is already in use.";
  return null;
}

function toLeave(row: LeaveRow): LeaveRecord {
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

function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function toAccount(row: StaffRow): StaffAccount {
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
