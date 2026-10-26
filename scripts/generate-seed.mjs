import { writeFileSync } from "node:fs";

const ITERATIONS = 100_000;
const STAFF_PASSWORD = "StaffDemo-2026";
const APPROVER_PASSWORD = "ApproverDemo-2026";

const people = [
  ["Mira", "Cheung", "People", "approver"],
  ["Oscar", "Lam", "Engineering", "staff"],
  ["Natalie", "Ip", "Finance", "staff"],
  ["Derek", "Wong", "Operations", "staff"],
  ["Chloe", "Tsang", "Sales", "staff"],
  ["Ethan", "Ho", "Engineering", "staff"],
  ["Beatrice", "Ng", "Client Services", "staff"],
  ["Hugo", "Chan", "Finance", "staff"],
  ["Iris", "Lau", "People", "staff"],
  ["Jason", "Mak", "Operations", "staff"],
  ["Karen", "Yip", "Sales", "staff"],
  ["Leo", "Poon", "Engineering", "staff"],
  ["Megan", "Siu", "Finance", "staff"],
  ["Nathan", "Kwok", "Operations", "staff"],
  ["Olivia", "Fung", "Client Services", "staff"],
  ["Patrick", "Tse", "Engineering", "staff"],
  ["Quinn", "Au", "People", "staff"],
  ["Rachel", "Cheng", "Sales", "staff"],
  ["Samuel", "Lui", "Finance", "staff"],
  ["Tiffany", "Or", "Operations", "staff"],
  ["Victor", "Tam", "Engineering", "staff"],
  ["Wendy", "So", "Client Services", "staff"],
  ["Xavier", "Fong", "Sales", "staff"],
  ["Yvonne", "Lai", "People", "staff"],
  ["Adrian", "Chu", "Finance", "staff"],
  ["Bonnie", "Shum", "Operations", "staff"],
  ["Calvin", "Yeung", "Engineering", "staff"],
  ["Diana", "Ko", "Client Services", "staff"],
  ["Eric", "Ma", "Sales", "staff"],
  ["Fiona", "To", "Finance", "staff"],
  ["Gordon", "Wan", "Operations", "staff"],
  ["Helen", "Szeto", "People", "staff"],
  ["Ivan", "Pang", "Engineering", "staff"],
  ["Joyce", "Leung", "Client Services", "staff"],
  ["Kevin", "Chow", "Sales", "staff"],
  ["Lily", "Woo", "Finance", "staff"],
  ["Marcus", "Hui", "Operations", "staff"],
  ["Nora", "Chung", "People", "staff"],
  ["Owen", "Yue", "Engineering", "staff"],
  ["Paula", "Seto", "Client Services", "staff"],
];

const applications = [
  app("app-oscar-pending", "staff-02", "annual", "2026-12-02", "2026-12-04", "Family trip to Macau.", "Pending", "2026-10-20T01:15:00.000Z", null),
  app("app-oscar-approved-future", "staff-02", "annual", "2027-03-16", "2027-03-18", "Year-end leave held for March.", "Approved", "2026-10-02T02:00:00.000Z", "2026-10-02T09:10:00.000Z"),
  app("app-oscar-approved-past", "staff-02", "sick", "2026-06-08", "2026-06-09", "Clinic visit and a day of rest.", "Approved", "2026-06-07T01:00:00.000Z", "2026-06-07T04:20:00.000Z"),
  app("app-natalie-pending", "staff-03", "sick", "2027-03-17", "2027-03-17", "Dental appointment.", "Pending", "2026-10-18T03:40:00.000Z", null),
  app("app-natalie-disapproved", "staff-03", "annual", "2026-11-05", "2026-11-06", "Short break during a filing week.", "Disapproved", "2026-10-01T02:30:00.000Z", "2026-10-01T11:00:00.000Z"),
  app("app-natalie-cancelled", "staff-03", "annual", "2026-10-20", "2026-10-21", "Plans changed.", "Cancelled", "2026-09-12T06:00:00.000Z", "2026-09-15T06:00:00.000Z"),
  app("app-mira-pending", "staff-01", "annual", "2026-12-22", "2026-12-22", "Clear the desk before the holiday.", "Pending", "2026-10-21T02:05:00.000Z", null),
  app("app-chloe-pending", "staff-05", "sick", "2027-01-08", "2027-01-09", "Medical follow-up.", "Pending", "2026-10-19T08:00:00.000Z", null),
];

function app(id, applicant, leaveType, start, end, reason, status, submitted, decidedOrCancelled) {
  return { id, applicant, leaveType, start, end, reason, status, submitted, decidedOrCancelled };
}

function dayCount(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function decisionMessage(leaveType, start, end, days, kind) {
  const label = leaveType === "annual" ? "Annual leave" : "Sick leave";
  const length = days === 1 ? "1 day" : `${days} days`;
  const verb = kind === "approved" ? "approved" : "disapproved";
  return `${label} from ${start} to ${end} (${length}) was ${verb}.`;
}

function sql(value) {
  if (value === null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function saltFor(index) {
  const salt = new Uint8Array(16);
  for (let byte = 0; byte < 16; byte += 1) salt[byte] = (index * 17 + byte * 13) & 255;
  return salt;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

const lines = [
  "-- Demo seed for LeaveFlowSE.",
  "-- Passwords are stored as PBKDF2-SHA-256 hashes. Plaintext demo passwords are documented in the README.",
  `-- Approver password: ${APPROVER_PASSWORD}`,
  `-- Staff password: ${STAFF_PASSWORD}`,
];

for (let index = 0; index < people.length; index += 1) {
  const [first, last, department, role] = people[index];
  const id = `staff-${String(index + 1).padStart(2, "0")}`;
  const email = `${first}.${last}@worksmartse.hk`.toLowerCase();
  const staffCode = `WS-${String(index + 1).padStart(3, "0")}`;
  const month = String((index % 12) + 1).padStart(2, "0");
  const birthday = `${1978 + (index % 18)}-${month}-15`;
  const yearJoined = 2012 + (index % 12);
  const password = role === "approver" ? APPROVER_PASSWORD : STAFF_PASSWORD;
  const salt = saltFor(index + 1);
  const hash = await hashPassword(password, salt);
  lines.push(
    `INSERT INTO staff (id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at) VALUES (${sql(id)}, ${sql(email)}, ${sql(bytesToHex(salt))}, ${sql(bytesToHex(hash))}, ${sql(`${first} ${last}`)}, ${sql(staffCode)}, ${sql(birthday)}, ${sql(department)}, ${yearJoined}, ${sql(role)}, '2024-04-01T00:00:00.000Z');`,
  );
}

for (const item of applications) {
  const days = dayCount(item.start, item.end);
  const archived = item.status === "Approved" || item.status === "Disapproved" ? 1 : 0;
  const decidedAt = item.status === "Approved" || item.status === "Disapproved" ? item.decidedOrCancelled : null;
  const cancelledAt = item.status === "Cancelled" ? item.decidedOrCancelled : null;
  const updatedAt = decidedAt ?? cancelledAt ?? item.submitted;
  lines.push(
    `INSERT INTO leave_application (id, applicant_id, leave_type, start_date, end_date, day_count, reason, status, archived, submitted_at, decided_at, cancelled_at, updated_at) VALUES (${sql(item.id)}, ${sql(item.applicant)}, ${sql(item.leaveType)}, ${sql(item.start)}, ${sql(item.end)}, ${days}, ${sql(item.reason)}, ${sql(item.status)}, ${archived}, ${sql(item.submitted)}, ${sql(decidedAt)}, ${sql(cancelledAt)}, ${sql(updatedAt)});`,
  );
  if (item.status === "Approved" || item.status === "Disapproved") {
    const kind = item.status === "Approved" ? "approved" : "disapproved";
    lines.push(
      `INSERT INTO notification (id, recipient_id, application_id, kind, message, created_at, read_at) VALUES (${sql(`notice-${item.id}`)}, ${sql(item.applicant)}, ${sql(item.id)}, ${sql(kind)}, ${sql(decisionMessage(item.leaveType, item.start, item.end, days, kind))}, ${sql(decidedAt)}, NULL);`,
    );
  }
}

writeFileSync(new URL("../migrations/0002_seed.sql", import.meta.url), `${lines.join("\n")}\n`);
console.log(`Wrote ${people.length} staff and ${applications.length} applications.`);
