import { writeFileSync } from "node:fs";

const kIterations = 100_000;
const kStaffPassword = "StaffDemo-2026";
const kApproverPassword = "ApproverDemo-2026";

const kPeople = [
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

const kApplications = [
  Application("app-oscar-pending", "staff-02", "annual", "2026-12-02", "2026-12-04", "Family trip to Macau.", "Pending", "2026-10-20T01:15:00.000Z", null),
  Application("app-oscar-approved-future", "staff-02", "annual", "2027-03-16", "2027-03-18", "Year-end leave held for March.", "Approved", "2026-10-02T02:00:00.000Z", "2026-10-02T09:10:00.000Z"),
  Application("app-oscar-approved-past", "staff-02", "sick", "2026-06-08", "2026-06-09", "Clinic visit and a day of rest.", "Approved", "2026-06-07T01:00:00.000Z", "2026-06-07T04:20:00.000Z"),
  Application("app-natalie-pending", "staff-03", "sick", "2027-03-17", "2027-03-17", "Dental appointment.", "Pending", "2026-10-18T03:40:00.000Z", null),
  Application("app-natalie-disapproved", "staff-03", "annual", "2026-11-05", "2026-11-06", "Short break during a filing week.", "Disapproved", "2026-10-01T02:30:00.000Z", "2026-10-01T11:00:00.000Z"),
  Application("app-natalie-cancelled", "staff-03", "annual", "2026-10-20", "2026-10-21", "Plans changed.", "Cancelled", "2026-09-12T06:00:00.000Z", "2026-09-15T06:00:00.000Z"),
  Application("app-mira-pending", "staff-01", "annual", "2026-12-22", "2026-12-22", "Clear the desk before the holiday.", "Pending", "2026-10-21T02:05:00.000Z", null),
  Application("app-chloe-pending", "staff-05", "sick", "2027-01-08", "2027-01-09", "Medical follow-up.", "Pending", "2026-10-19T08:00:00.000Z", null),
];

/**
 * Summary: Build a historical demonstration leave request.
 * Parameters: id and applicant are non-empty IDs; leave_type is annual or sick; start/end are ordered ISO dates; reason is text; status is a supported state; submitted is an ISO timestamp; decided_or_cancelled is an ISO timestamp or null.
 * Return Value: An independent fixture object with the supplied fields.
 * Side Effects & Constraints: Pure construction; historical fixtures are not new submissions and are seeded before policy triggers.
 */
function Application(id, applicant, leave_type, start, end, reason, status, submitted, decided_or_cancelled) {
  return { id, applicant, leave_type, start, end, reason, status, submitted, decided_or_cancelled };
}

/**
 * Summary: Calculate inclusive calendar-day duration for notification text.
 * Parameters: start and end are valid ordered ISO dates.
 * Return Value: A positive integer; invalid dates produce NaN.
 * Side Effects & Constraints: Pure UTC arithmetic; the result is never inserted as a table column.
 */
function DayCount(start, end) {
  const start_ms = Date.parse(`${start}T00:00:00Z`);
  const end_ms = Date.parse(`${end}T00:00:00Z`);
  return Math.round((end_ms - start_ms) / 86_400_000) + 1;
}

/**
 * Summary: Format the notice for a historical approval or rejection.
 * Parameters: leave_type is annual or sick; start/end are ISO dates; days is a positive integer; kind is approved or disapproved.
 * Return Value: The English notice text using singular or plural days.
 * Side Effects & Constraints: Pure formatting; does not persist or deliver a notification.
 */
function DecisionMessage(leave_type, start, end, days, kind) {
  const label = leave_type === "annual" ? "Annual leave" : "Sick leave";
  const length = days === 1 ? "1 day" : `${days} days`;
  const verb = kind === "approved" ? "approved" : "disapproved";
  return `${label} from ${start} to ${end} (${length}) was ${verb}.`;
}

/**
 * Summary: Escape a fixture value as an SQL string literal or NULL.
 * Parameters: value is a trusted fixture scalar or null.
 * Return Value: SQL NULL for null; otherwise a single-quoted string with escaped quotes.
 * Side Effects & Constraints: Pure conversion; use bound parameters for runtime application input.
 */
function Sql(value) {
  if (value === null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Summary: Produce a deterministic salt for reproducible demonstration fixtures.
 * Parameters: index is a positive staff fixture number.
 * Return Value: A new 16-byte Uint8Array containing the reproducible salt.
 * Side Effects & Constraints: Allocates bytes; only demo generation may use deterministic salts. Runtime accounts use cryptographic randomness.
 */
function SaltFor(index) {
  const salt = new Uint8Array(16);
  for (let byte = 0; byte < 16; byte += 1) salt[byte] = (index * 17 + byte * 13) & 255;
  return salt;
}

/**
 * Summary: Encode bytes as lowercase hexadecimal.
 * Parameters: bytes is a non-null Uint8Array, including an empty array.
 * Return Value: Two hexadecimal characters per byte, or an empty string.
 * Side Effects & Constraints: Allocates a string; does not mutate the input.
 */
function BytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Summary: Derive the demonstration password hash with PBKDF2-SHA-256.
 * Parameters: password is non-null demo text; salt is a non-null 16-byte Uint8Array.
 * Return Value: A promise for 32 hash bytes; Web Crypto failures reject.
 * Side Effects & Constraints: Performs kIterations hash iterations and allocates key/output buffers; plaintext passwords are not persisted by this function.
 */
async function HashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: kIterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

const lines = [
  "-- Demo seed for LeaveFlowSE.",
  "-- Passwords are stored as PBKDF2-SHA-256 hashes. Plaintext demo passwords are documented in the README.",
  `-- Approver password: ${kApproverPassword}`,
  `-- Staff password: ${kStaffPassword}`,
];

for (let index = 0; index < kPeople.length; index += 1) {
  const [first, last, department, role] = kPeople[index];
  const id = `staff-${String(index + 1).padStart(2, "0")}`;
  const email = `${first}.${last}@worksmartse.hk`.toLowerCase();
  const staff_code = `WS-${String(index + 1).padStart(3, "0")}`;
  const month = String((index % 12) + 1).padStart(2, "0");
  const birthday = `${1978 + (index % 18)}-${month}-15`;
  const year_joined = 2012 + (index % 12);
  const password = role === "approver" ? kApproverPassword : kStaffPassword;
  const salt = SaltFor(index + 1);
  const hash = await HashPassword(password, salt);
  lines.push(
    `INSERT INTO staff (id, email, password_salt, password_hash, name, staff_code, birthday, department, year_joined, role, created_at) VALUES (${Sql(id)}, ${Sql(email)}, ${Sql(BytesToHex(salt))}, ${Sql(BytesToHex(hash))}, ${Sql(`${first} ${last}`)}, ${Sql(staff_code)}, ${Sql(birthday)}, ${Sql(department)}, ${year_joined}, ${Sql(role)}, '2024-04-01T00:00:00.000Z');`,
  );
}

for (const item of kApplications) {
  const days = DayCount(item.start, item.end);
  const archived = item.status === "Approved" || item.status === "Disapproved" ? 1 : 0;
  const decided_at = item.status === "Approved" || item.status === "Disapproved" ? item.decided_or_cancelled : null;
  const cancelled_at = item.status === "Cancelled" ? item.decided_or_cancelled : null;
  const updated_at = decided_at ?? cancelled_at ?? item.submitted;
  lines.push(
    `INSERT INTO leave_application (id, applicant_id, leave_type, start_date, end_date, reason, status, archived, submitted_at, decided_at, cancelled_at, updated_at) VALUES (${Sql(item.id)}, ${Sql(item.applicant)}, ${Sql(item.leave_type)}, ${Sql(item.start)}, ${Sql(item.end)}, ${Sql(item.reason)}, ${Sql(item.status)}, ${archived}, ${Sql(item.submitted)}, ${Sql(decided_at)}, ${Sql(cancelled_at)}, ${Sql(updated_at)});`,
  );
  if (item.status === "Approved" || item.status === "Disapproved") {
    const kind = item.status === "Approved" ? "approved" : "disapproved";
    lines.push(
      `INSERT INTO notification (id, recipient_id, application_id, kind, message, created_at, read_at) VALUES (${Sql(`notice-${item.id}`)}, ${Sql(item.applicant)}, ${Sql(item.id)}, ${Sql(kind)}, ${Sql(DecisionMessage(item.leave_type, item.start, item.end, days, kind))}, ${Sql(decided_at)}, NULL);`,
    );
  }
}

writeFileSync(new URL("../migrations/0002_seed.sql", import.meta.url), `${lines.join("\n")}\n`);
console.log(`Wrote ${kPeople.length} staff and ${kApplications.length} applications.`);
