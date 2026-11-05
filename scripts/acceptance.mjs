// This suite creates test accounts/history. Use a disposable LOCAL Worker only.
import assert from 'node:assert/strict';
let checks = 0;
const base = process.env.BASE_URL ?? 'http://127.0.0.1:43219';
Check(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Use a disposable local Worker');
/**
 * Summary: Assert structural equality and count the successful API check.
 * Parameters: actual and expected may be any comparable JavaScript values.
 * Return Value: None; mismatches throw an AssertionError.
 * Side Effects & Constraints: Increments the suite counter after a successful check.
 */
function Equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }

/**
 * Summary: Assert a truthy condition and count the successful API check.
 * Parameters: condition is the tested value; message is optional failure context.
 * Return Value: None; a falsy condition throws an AssertionError.
 * Side Effects & Constraints: Increments the counter; does not send requests.
 */
function Check(condition, message) { assert.ok(condition, message); checks++; }

/**
 * Summary: Assert that text matches the expected regular expression.
 * Parameters: text is a string; pattern is a non-null regular expression.
 * Return Value: None; mismatches throw an AssertionError.
 * Side Effects & Constraints: Increments the successful-check counter.
 */
function Match(text, pattern) { assert.match(text, pattern); checks++; }

/**
 * Summary: Assert that two scalar values differ.
 * Parameters: actual and expected are the values that must not be equal.
 * Return Value: None; equality throws an AssertionError.
 * Side Effects & Constraints: Increments the successful-check counter.
 */
function NotEqual(actual, expected) { assert.notEqual(actual, expected); checks++; }
/**
 * Summary: Check an HTTP response status and return its decoded JSON body.
 * Parameters: response is a Client result; expected is the required HTTP status.
 * Return Value: The response data; a mismatch throws with server error details.
 * Side Effects & Constraints: Increments the successful-check counter.
 */
function Status(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.data));
  checks++;
  return response.data;
}
/**
 * Summary: Create an independent cookie-preserving HTTP test session.
 * Parameters: None; captures the validated local base URL. The returned callable
 * accepts a relative path, an HTTP method (GET by default), and optional JSON body.
 * Return Value: An async request callable returning status, JSON data, and headers;
 * network or malformed JSON failures reject its promise.
 * Side Effects & Constraints: Requests can write fixture data. Each client owns
 * its cookie; only disposable localhost Workers are permitted by this suite.
 */
function Client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const r = await fetch(base + path, { method, headers: { cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of r.headers.getSetCookie()) cookie = value.split(';')[0];
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
}
const Anon = Client(), Approver = Client();
Status(await Anon('/api/me'), 401);
Status(await Anon('/api/session', 'POST', { email: 'test@gmail.com', password: 'wrong' }), 400);
Status(await Anon('/api/session', 'POST', { email: 'mira.cheung@worksmartse.hk', password: 'wrong' }), 401);
const login = await Approver('/api/session', 'POST', { email: 'mira.cheung@worksmartse.hk', password: 'ApproverDemo-2026' });
const me = Status(login, 200);
Match(login.headers.get('set-cookie'), /HttpOnly/i);
Match(login.headers.get('set-cookie'), /SameSite=Lax/i);
Equal(Number(/Max-Age=(\d+)/i.exec(login.headers.get('set-cookie'))?.[1]), 900);
const today = me.hongKongToday, year = Number(today.slice(0, 4)), future = `${year + 1}-02-01`;
/**
 * Summary: Shift a date-only fixture by whole calendar days.
 * Parameters: date is a valid ISO date; offset is an integer, possibly negative.
 * Return Value: The resulting ISO date; invalid dates throw RangeError.
 * Side Effects & Constraints: Pure UTC arithmetic, independent of machine timezone.
 */
const Shift = (date, offset) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
/**
 * Summary: Build an annual request payload for API validation tests.
 * Parameters: start_date is an ISO date; days is an integer defaulting to one;
 * reason is optional and may intentionally contain invalid test input.
 * Return Value: An independent payload with an inclusive end date.
 * Side Effects & Constraints: Does not validate policy or send a request.
 */
const Annual = (start_date, days = 1, reason) => ({ leaveType: 'annual', startDate: start_date,
  endDate: Shift(start_date, days - 1), ...(reason === undefined ? {} : { reason }) });
/**
 * Summary: Build a sick request using the same date fixture rules as Annual.
 * Parameters: args contains start_date, optional integer days, and optional reason.
 * Return Value: A request payload with leaveType set to sick.
 * Side Effects & Constraints: Does not validate policy or send a request.
 */
const Sick = (...args) => ({ ...Annual(...args), leaveType: 'sick' });
/**
 * Summary: Calculate the part of a request that consumes the current year's quota.
 * Parameters: body has valid ordered startDate and endDate strings.
 * Return Value: Inclusive overlapping days, or zero outside the fixture year.
 * Side Effects & Constraints: Pure arithmetic using the server-reported year.
 */
const CurrentDays = (body) => {
  const start = body.startDate > `${year}-01-01` ? body.startDate : `${year}-01-01`;
  const end = body.endDate < `${year}-12-31` ? body.endDate : `${year}-12-31`;
  return end < start ? 0 : (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
};
const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/**
 * Summary: Create and sign in an ordinary employee with an isolated test identity.
 * Parameters: number is a positive integer unique within this suite invocation.
 * Return Value: The independent Request callable, profile input, and signed-in data;
 * HTTP mismatches or network errors fail the suite.
 * Side Effects & Constraints: Creates an account and session in the disposable DB.
 * Uses the authenticated Approver client and never targets production.
 */
async function Account(number) {
  const profile = { email: `test.${suffix}.${number}@worksmartse.hk`, password: 'TestStaff-2026', name: `Test ${number}`,
    birthday: '1992-04-12', department: 'Engineering', yearJoined: 2020 };
  const created = Status(await Approver('/api/approver/staff', 'POST', profile), 201);
  Match(created.staff.staffCode, /^WS-[0-9]{3,17}$/);
  profile.staffCode = created.staff.staffCode;
  Equal(created.initialPassword, profile.password);
  Equal(created.staff.role, 'staff');
  Equal('password_hash' in created.staff, false);
  const Request = Client();
  return { Request, profile, data: Status(await Request('/api/session', 'POST', profile), 200) };
}
const staff = await Account(1), other = await Account(2), quota_staff = await Account(3);
Equal(staff.data.quota.annual.remaining, 18);
Equal(staff.data.quota.sick.remaining, 14);
Equal(staff.data.quotaYear, year);
Status(await staff.Request('/api/approver/pending'), 403);
Status(await Anon('/api/approver/staff', 'POST', staff.profile), 401);
Status(await staff.Request('/api/approver/staff', 'POST', staff.profile), 403);
for (const field of ['email', 'name', 'staffCode', 'birthday', 'department', 'yearJoined']) {
  Equal(staff.data[field], staff.profile[field]);
}
Status(await Approver('/api/approver/staff', 'POST', staff.profile), 400);
Status(await Approver('/api/approver/staff', 'POST', { ...staff.profile, email: 'test@gmail.com' }), 400);
Status(await staff.Request(`/api/approver/staff/${staff.data.id}`, 'PATCH', staff.profile), 403);
Status(await Approver(`/api/approver/staff/${staff.data.id}`, 'PATCH', { ...staff.profile, department: 'Finance' }), 200);
Equal(Status(await staff.Request('/api/me'), 200).department, 'Finance');

// A duplicate email wins over unrelated field/password errors, including case variants.
const duplicate_error = Status(await Approver('/api/approver/staff', 'POST', {
  ...staff.profile, email: `  ${staff.profile.email.toUpperCase()}  `,
  name: '', birthday: 'invalid', yearJoined: 0, password: 'x', staffCode: '!',
}), 400);
Equal(duplicate_error.error, 'An account with that email already exists.');
const invalid_edit = Status(await Approver(`/api/approver/staff/${other.data.id}`, 'PATCH',
  { ...other.profile, staffCode: '!' }), 400);
Match(invalid_edit.error, /Staff ID/);
const duplicate_id = Status(await Approver(`/api/approver/staff/${other.data.id}`, 'PATCH',
  { ...other.profile, staffCode: staff.profile.staffCode }), 400);
Match(duplicate_id.error, /staff ID/i);

// New staff IDs come from the server even if a client supplies a seeded or invalid ID.
for (const [index, staff_code] of ['WS-001', '!'].entries()) {
  const generated = Status(await Approver('/api/approver/staff', 'POST', {
    ...staff.profile, email: `generated.${suffix}.${index}@worksmartse.hk`, staffCode: staff_code,
  }), 201);
  Match(generated.staff.staffCode, /^WS-[0-9]{3,17}$/);
  Equal(generated.staff.staffCode === staff_code, false);
}

// Exercise allocation through concurrent real Worker/D1 writes, not a mocked counter.
const staff_before_race = Status(await Approver('/api/approver/staff'), 200).staff;
const new_accounts = await Promise.all(Array.from({ length: 12 }, (unused_value, index) =>
  Approver('/api/approver/staff', 'POST', {
    ...staff.profile, email: `parallel.${suffix}.${index}@worksmartse.hk`,
    name: `Parallel staff ${index}`, staffCode: 'WS-001',
  })));
const concurrent_staff = new_accounts.map((response) => Status(response, 201).staff);
Equal(new Set(concurrent_staff.map((person) => person.staffCode)).size, concurrent_staff.length);
Equal(new Set(concurrent_staff.map((person) => person.id)).size, concurrent_staff.length);
const staff_after_race = Status(await Approver('/api/approver/staff'), 200).staff;
Equal(staff_after_race.length, staff_before_race.length + concurrent_staff.length);
for (const original_staff of staff_before_race) {
  Equal(staff_after_race.find((person) => person.id === original_staff.id).staffCode, original_staff.staffCode);
}
Equal(new Set(staff_after_race.map((person) => person.staffCode)).size, staff_after_race.length);
for (const person of concurrent_staff) {
  Equal(staff_after_race.find((saved_staff) => saved_staff.email === person.email).staffCode, person.staffCode);
}
const duplicate_race_email = `duplicate.${suffix}@worksmartse.hk`;
const duplicate_race = await Promise.all([duplicate_race_email, duplicate_race_email.toUpperCase()].map((email) =>
  Approver('/api/approver/staff', 'POST', { ...staff.profile, email })));
Equal(duplicate_race.filter((response) => response.status === 201).length, 1);
const refused_duplicate = duplicate_race.find((response) => response.status !== 201);
Check([400, 409].includes(refused_duplicate.status));
Equal(refused_duplicate.data.error, 'An account with that email already exists.');
Equal(Status(await Approver('/api/approver/staff'), 200).staff
  .filter((person) => person.email === duplicate_race_email).length, 1);

const body = Annual(Shift(today, 2), 2);
const created = Status(await staff.Request('/api/applications', 'POST', { ...body, dayCount: 999 }), 201);
Equal(created.reason, ''); Equal(created.dayCount, 2); Equal(created.status, 'Pending');
Equal(Status(await staff.Request('/api/me'), 200).quota.annual.remaining, 18 - CurrentDays(body));
Status(await other.Request(`/api/applications/${created.id}`), 404);
Status(await other.Request(`/api/applications/${created.id}/cancel`, 'POST'), 404);
Status(await other.Request(`/api/applications/${created.id}`, 'PATCH', { ...body, revision: created.revision }), 404);
const edited_body = Annual(Shift(today, 2), 3);
Equal(Status(await staff.Request(`/api/applications/${created.id}`, 'PATCH', { ...edited_body, revision: created.revision }), 200).revision, 1);
Equal(Status(await staff.Request('/api/me'), 200).quota.annual.remaining, 18 - CurrentDays(edited_body));
Status(await staff.Request('/api/applications', 'POST', Sick(Shift(today, 3))), 400);
Status(await staff.Request('/api/applications', 'POST', Annual(Shift(today, 3))), 400);
Status(await staff.Request(`/api/applications/${created.id}/cancel`, 'POST'), 200);
Equal(Status(await staff.Request('/api/me'), 200).quota.annual.remaining, 18);
for (const offset of [-27, -1, 0, 1]) {
  const refused = Status(await staff.Request('/api/applications', 'POST', Annual(Shift(today, offset))), 400);
  Match(refused.error, /2 calendar days/);
}
Status(await staff.Request('/api/applications', 'POST', Sick(Shift(today, -8))), 400);
Status(await staff.Request('/api/applications', 'POST', Annual(future, 5)), 400);
Status(await staff.Request('/api/applications', 'POST', { ...Annual(future), endDate: Shift(future, -1) }), 400);
for (const body of [Sick(Shift(today, -10), 4), Sick(Shift(today, -7))]) {
  const valid = Status(await staff.Request('/api/applications', 'POST', body), 201);
  Status(await staff.Request(`/api/applications/${valid.id}/cancel`, 'POST'), 200);
}

const long = Status(await staff.Request('/api/applications', 'POST', Annual(future, 5, 'Holiday')), 201);
const decision_path = `/api/approver/applications/${long.id}/decision`;
for (const decision of ['approve', 'disapprove']) Status(await Approver(decision_path, 'POST', { decision, revision: long.revision }), 400);
const race = await Promise.all([1, 2].map(() => Approver(decision_path, 'POST', { decision: 'approve', comment: 'Coverage arranged', revision: long.revision })));
Equal(race.filter((r) => r.status === 200).length, 1);
Check(race.some((r) => [400, 409].includes(r.status)));
const saved = Status(await staff.Request(`/api/applications/${long.id}`), 200);
Equal(saved.status, 'Approved'); Equal(saved.decisionComment, 'Coverage arranged'); Equal(saved.decidedBy, me.id);
Status(await staff.Request(`/api/applications/${long.id}`, 'PATCH', { ...Annual(future), revision: saved.revision }), 400);
const notices = Status(await staff.Request('/api/notifications'), 200).notifications.filter((n) => n.applicationId === long.id);
Equal(notices.length, 1); Match(notices[0].message, /Coverage arranged/);
Equal(Status(await staff.Request('/api/me'), 200).unreadNotifications, 0);
Status(await staff.Request('/api/applications', 'POST', Annual(Shift(future, 4))), 400);
Status(await staff.Request(`/api/applications/${long.id}/cancel`, 'POST'), 200);
const to_reject = Status(await staff.Request('/api/applications', 'POST', body), 201);
Status(await Approver(`/api/approver/applications/${to_reject.id}/decision`, 'POST', { decision: 'disapprove', revision: to_reject.revision }), 200);
Equal(Status(await staff.Request('/api/me'), 200).quota.annual.remaining, 18);

const today_sick = Status(await staff.Request('/api/applications', 'POST', Sick(today)), 201);
Equal(Status(await staff.Request('/api/me'), 200).quota.sick.taken, 0);
Status(await Approver(`/api/approver/applications/${today_sick.id}/decision`, 'POST', { decision: 'approve', revision: today_sick.revision }), 200);
const after_sick = Status(await staff.Request('/api/me'), 200);
Equal(after_sick.quota.sick.taken, 1); Equal(after_sick.quota.sick.remaining, 13);
Status(await staff.Request(`/api/applications/${today_sick.id}/cancel`, 'POST'), 400);

const submissions = await Promise.all([
  quota_staff.Request('/api/applications', 'POST', Annual(future, 10, 'First trip')),
  quota_staff.Request('/api/applications', 'POST', Annual(Shift(future, 15), 10, 'Second trip')),
]);
Equal(submissions.filter((r) => r.status === 201).length, 1);
const over_quota = submissions.find((r) => r.status !== 201);
Status(over_quota, 400); Match(over_quota.data.error, /balance/);
const reserved = submissions.find((r) => r.status === 201).data;
Status(await quota_staff.Request(`/api/applications/${reserved.id}`, 'PATCH', { ...Annual(reserved.startDate, 19, 'Too long'), revision: reserved.revision }), 400);
const queue = Status(await Approver('/api/approver/pending'), 200);
Equal(queue.count, queue.applications.length);
Equal(Status(await Approver('/api/me'), 200).pendingCount, queue.count);
Equal(queue.applications.map((r) => r.startDate), queue.applications.map((r) => r.startDate).toSorted());
const on_date = Status(await Approver(`/api/approver/on-date?date=${body.startDate}`), 200);
Check(on_date.applications.some((r) => r.id === to_reject.id && r.status === 'Disapproved'));
Check(Status(await staff.Request('/api/applications'), 200).applications.every((r) => r.applicantId === staff.data.id));
// Exercise short/long reasons and multi-year quotas through the real Worker.
const boundary_staff = await Account(4);
for (const reason of [undefined, null, '', '   ']) {
  const request_body = Annual(`${year + 1}-06-01`, 4, reason);
  const short_leave = Status(await boundary_staff.Request('/api/applications', 'POST', request_body), 201);
  Equal(short_leave.reason, '');
  Equal(short_leave.dayCount, 4);
  Status(await boundary_staff.Request(`/api/applications/${short_leave.id}`, 'PATCH',
    { ...Annual(request_body.startDate, 5, reason), revision: short_leave.revision }), 400);
  Equal(Status(await boundary_staff.Request(`/api/applications/${short_leave.id}`), 200).dayCount, 4);
  Status(await boundary_staff.Request(`/api/applications/${short_leave.id}/cancel`, 'POST'), 200);
}
const cross_year_start = `${year + 1}-12-30`;
const cross_year = Status(await boundary_staff.Request('/api/applications', 'POST',
  Annual(cross_year_start, 5, 'New year trip')), 201);
Equal(cross_year.dayCount, 5);
Equal(Status(await boundary_staff.Request('/api/me'), 200).quota.annual.remaining, 18);
const next_year_reservation = Status(await boundary_staff.Request('/api/applications', 'POST',
  Annual(`${year + 2}-02-01`, 15, 'Remaining next year quota')), 201);
Status(await boundary_staff.Request('/api/applications', 'POST', Annual(`${year + 2}-03-01`)), 400);
Status(await boundary_staff.Request(`/api/applications/${cross_year.id}`, 'PATCH',
  { ...Annual(cross_year_start, 6, 'One extra next year day'), revision: cross_year.revision }), 400);
Equal(Status(await boundary_staff.Request(`/api/applications/${cross_year.id}`), 200).dayCount, 5);
Status(await boundary_staff.Request(`/api/applications/${next_year_reservation.id}`, 'PATCH',
  { ...Annual(cross_year_start, 1), revision: next_year_reservation.revision }), 400);
Status(await boundary_staff.Request(`/api/applications/${cross_year.id}/cancel`, 'POST'), 200);
Status(await boundary_staff.Request(`/api/applications/${next_year_reservation.id}`, 'PATCH',
  { ...Annual(next_year_reservation.startDate, 18, 'Quota released by cancellation'), revision: next_year_reservation.revision }), 200);

// Concurrent non-overlapping requests cannot both reserve the same year's quota.
// The first spans New Year and uses 17 days of the next year; the other uses 2.
const race_staff = await Account(8);
const quota_race = await Promise.all([
  race_staff.Request('/api/applications', 'POST', Annual(`${year + 1}-12-31`, 18, 'Cross-year reservation')),
  race_staff.Request('/api/applications', 'POST', Annual(`${year + 2}-02-01`, 2)),
]);
Equal(quota_race.filter((response) => response.status === 201).length, 1);
const quota_refusal = quota_race.find((response) => response.status !== 201);
Status(quota_refusal, 400);
Match(quota_refusal.data.error, /balance/i);
const race_saved = Status(await race_staff.Request('/api/applications'), 200).applications;
Equal(race_saved.length, 1);
Equal(race_saved[0].id, quota_race.find((response) => response.status === 201).data.id);

// Browser snapshots must remain authoritative across separate HTTP requests.
// A fresh server read cannot substitute for the version the user actually saw.
const revision_staff = await Account(5);
const original = Status(await revision_staff.Request('/api/applications', 'POST',
  Annual(`${year + 1}-09-01`, 5, 'Family trip\r\nTravel arrangements')), 201);
Equal(original.reason, 'Family trip\nTravel arrangements');
const old_queue = Status(await Approver('/api/approver/pending'), 200).applications.find((r) => r.id === original.id);
const edit_path = `/api/applications/${original.id}`;
const approve_path = `/api/approver/applications/${original.id}/decision`;
const replacement = Annual(`${year + 1}-10-01`, 5, 'Updated dates\nTravel arrangements');
for (const revision of [undefined, null, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
  Status(await revision_staff.Request(edit_path, 'PATCH', { ...replacement, revision }), 400);
  Status(await Approver(approve_path, 'POST', { decision: 'approve', comment: 'Checked', revision }), 400);
}
const current = Status(await revision_staff.Request(edit_path, 'PATCH', { ...replacement, revision: original.revision }), 200);
Equal(current.revision, original.revision + 1);
Status(await revision_staff.Request(edit_path, 'PATCH', { ...original, reason: 'Stale tab overwrite' }), 409);
Equal(Status(await revision_staff.Request(edit_path), 200).reason, replacement.reason);
for (const decision of ['approve', 'disapprove']) {
  Status(await Approver(approve_path, 'POST', { decision, comment: 'Old queue', revision: old_queue.revision }), 409);
}
Equal(Status(await revision_staff.Request(edit_path), 200).status, 'Pending');
Equal(Status(await revision_staff.Request('/api/notifications'), 200).notifications.length, 0);
for (const comment of ['x'.repeat(1001), 'Invalid\u0000comment']) {
  Status(await Approver(approve_path, 'POST', { decision: 'approve', comment, revision: current.revision }), 400);
}
const refreshed_queue = Status(await Approver('/api/approver/pending'), 200).applications.find((r) => r.id === original.id);
Equal(refreshed_queue.startDate, replacement.startDate);
const multiline_comment = 'Updated dates checked\nCoverage confirmed';
const approved_revision = Status(await Approver(approve_path, 'POST', {
  decision: 'approve', comment: multiline_comment, revision: refreshed_queue.revision,
}), 200);
Equal(approved_revision.startDate, replacement.startDate);
Equal(approved_revision.decisionComment, multiline_comment);
const revision_notices = Status(await revision_staff.Request('/api/notifications'), 200).notifications;
Equal(revision_notices.length, 1);
Check(revision_notices[0].message.includes(multiline_comment));

// Destructive account actions must authenticate the acting approver, not the target.
const departing = await Account(6);
const delete_path = `/api/approver/staff/${departing.data.id}`;
const confirmation = { approverPassword: 'ApproverDemo-2026' };
const SecondSession = Client();
Status(await SecondSession('/api/session', 'POST', departing.profile), 200);
Status(await Anon(delete_path, 'DELETE', confirmation), 401);
Status(await other.Request(delete_path, 'DELETE', confirmation), 403);
Status(await Approver(delete_path, 'DELETE', {}), 400);
Status(await Approver(delete_path, 'DELETE', { approverPassword: departing.profile.password }), 403);
Status(await departing.Request('/api/me'), 200);
Status(await Approver(`/api/approver/staff/${me.id}`, 'DELETE', confirmation), 403);
const past_leave = Status(await departing.Request('/api/applications', 'POST', Sick(today)), 201);
Status(await Approver(`/api/approver/applications/${past_leave.id}/decision`, 'POST',
  { decision: 'approve', revision: past_leave.revision }), 200);
const pending_leave = Status(await departing.Request('/api/applications', 'POST', Annual(future)), 201);
const pending_before_delete = Status(await Approver('/api/approver/pending'), 200);
Check(pending_before_delete.applications.some((row) => row.id === pending_leave.id));
Status(await Approver(delete_path, 'DELETE', { approverPassword: 'Wrong-password' }), 403);
Equal(Status(await departing.Request('/api/applications'), 200).applications.length, 2);
Status(await Approver(delete_path, 'DELETE', confirmation), 200);
Status(await departing.Request('/api/me'), 401);
Status(await SecondSession('/api/me'), 401);
Status(await Client()('/api/session', 'POST', departing.profile), 401);
Status(await Approver(delete_path), 404);
Status(await Approver(delete_path, 'PATCH', departing.profile), 404);
Status(await Approver(delete_path, 'DELETE', confirmation), 404);
Check(!Status(await Approver('/api/approver/staff'), 200).staff.some((row) => row.id === departing.data.id));
const date_records = Status(await Approver(`/api/approver/on-date?date=${today}`), 200).applications;
Check(!date_records.some((row) => row.applicantId === departing.data.id));
Check(date_records.some((row) => row.id === today_sick.id && row.status === 'Approved'));
const pending_after_delete = Status(await Approver('/api/approver/pending'), 200);
Equal(pending_after_delete.count, pending_before_delete.count - 1);
Check(!pending_after_delete.applications.some((row) => row.applicantId === departing.data.id));
const new_login = Status(await Approver('/api/approver/staff', 'POST', departing.profile), 201);
NotEqual(new_login.staff.id, departing.data.id);
const ReplacementSession = Client();
Status(await ReplacementSession('/api/session', 'POST', departing.profile), 200);
Equal(Status(await ReplacementSession('/api/applications'), 200).applications.length, 0);
Status(await departing.Request('/api/me'), 401);
Status(await other.Request('/api/me'), 200);

// Reset only the selected employee after checking the acting approver's password.
const reset_staff = await Account(7);
const reset_path = `/api/approver/staff/${reset_staff.data.id}/password`;
const ResetSecondSession = Client();
Status(await ResetSecondSession('/api/session', 'POST', reset_staff.profile), 200);
const reset_leave = Status(await reset_staff.Request('/api/applications', 'POST', Annual(future)), 201);
const reset_profile = Status(await Approver(`/api/approver/staff/${reset_staff.data.id}`), 200);
const new_password = 'Reset-Employee-2026';
const reset_body = { newPassword: new_password, approverPassword: confirmation.approverPassword };
Status(await Anon(reset_path, 'POST', reset_body), 401);
Status(await other.Request(reset_path, 'POST', reset_body), 403);
for (const invalid_password of [undefined, null, '', 'short', 123, 'x'.repeat(73)]) {
  Status(await Approver(reset_path, 'POST', { ...reset_body, newPassword: invalid_password }), 400);
}
for (const invalid_confirmation of [undefined, null, '', 123, 'x'.repeat(73)]) {
  Status(await Approver(reset_path, 'POST', { ...reset_body, approverPassword: invalid_confirmation }), 400);
}
Status(await Approver(reset_path, 'POST', { ...reset_body, approverPassword: reset_staff.profile.password }), 403);
Status(await reset_staff.Request('/api/me'), 200);
Status(await ResetSecondSession('/api/me'), 200);
Status(await Client()('/api/session', 'POST', reset_staff.profile), 200);
Status(await Client()('/api/session', 'POST', { ...reset_staff.profile, password: new_password }), 401);
Status(await Approver(`/api/approver/staff/${departing.data.id}/password`, 'POST', reset_body), 404);
Status(await Approver(`/api/approver/staff/${me.id}/password`, 'POST', reset_body), 403);
Equal(Status(await Approver(reset_path, 'POST', reset_body), 200), { ok: true });
Status(await reset_staff.Request('/api/me'), 401);
Status(await ResetSecondSession('/api/me'), 401);
Status(await Client()('/api/session', 'POST', reset_staff.profile), 401);
const ResetSession = Client();
Status(await ResetSession('/api/session', 'POST', { ...reset_staff.profile, password: new_password }), 200);
Equal(Status(await ResetSession('/api/applications'), 200).applications, [reset_leave]);
Equal(Status(await Approver(`/api/approver/staff/${reset_staff.data.id}`), 200), reset_profile);
Status(await other.Request('/api/me'), 200);
Status(await Approver('/api/me'), 200);

// Archive includes every status, even pending and cancelled rows whose archived flag is false.
Status(await Anon('/api/approver/archive'), 401);
Status(await other.Request('/api/approver/archive'), 403);
const archive_records = Status(await Approver('/api/approver/archive'), 200).applications;
Equal([...new Set(archive_records.map((record) => record.status))].toSorted(),
  ['Approved', 'Cancelled', 'Disapproved', 'Pending']);
Equal(archive_records.some((record) => record.id === created.id && record.status === 'Cancelled' && !record.archived), true);
Equal(archive_records.some((record) => record.id === to_reject.id && record.status === 'Disapproved'), true);
Equal(archive_records.some((record) => record.id === today_sick.id && record.status === 'Approved'), true);
Equal(archive_records.some((record) => record.id === approved_revision.id && record.startDate === replacement.startDate), true);
Equal(archive_records.some((record) => record.id === cross_year.id && record.endDate.startsWith(String(year + 2))), true);
Equal(archive_records.some((record) => record.id === reserved.id && record.status === 'Pending' && !record.archived), true);
Equal(archive_records.some((record) => record.id === reset_leave.id && record.status === 'Pending'), true);
Equal(archive_records.some((record) => record.applicantId === departing.data.id), false);
for (const owner of [staff, boundary_staff, revision_staff, quota_staff]) {
  const own_history = Status(await owner.Request('/api/applications'), 200).applications;
  Equal(archive_records.filter((record) => record.applicantId === owner.data.id).map((record) => record.id).toSorted(),
    own_history.map((record) => record.id).toSorted());
}
const sorted_archive = archive_records.toSorted((left, right) => {
  for (const field of ['startDate', 'submittedAt', 'id']) {
    if (left[field] !== right[field]) return left[field] > right[field] ? -1 : 1;
  }
  return 0;
});
Equal(archive_records.map((record) => record.id), sorted_archive.map((record) => record.id));
Equal(Status(await Approver('/api/approver/archive'), 200).applications, archive_records);

// Date searches retain all statuses and match the inclusive leave range, not submission day.
Status(await Anon(`/api/approver/on-date?date=${future}`), 401);
Status(await other.Request(`/api/approver/on-date?date=${future}`), 403);
Status(await Approver('/api/approver/on-date?date=2026-02-30'), 400);
for (const date of [approved_revision.startDate, Shift(approved_revision.startDate, 2), approved_revision.endDate]) {
  const matches = Status(await Approver(`/api/approver/on-date?date=${date}`), 200);
  Equal(matches.date, date);
  Equal(matches.applications.some((record) => record.id === approved_revision.id), true);
}
for (const date of [Shift(approved_revision.startDate, -1), Shift(approved_revision.endDate, 1), approved_revision.submittedAt.slice(0, 10)]) {
  const matches = Status(await Approver(`/api/approver/on-date?date=${date}`), 200).applications;
  Equal(matches.some((record) => record.id === approved_revision.id), false);
}
const pending_date_matches = Status(await Approver(`/api/approver/on-date?date=${reset_leave.startDate}`), 200).applications;
Equal(pending_date_matches.some((record) => record.id === reset_leave.id && record.status === 'Pending'), true);

/**
 * Summary: Release competing asynchronous actions from one client-side gate.
 * Parameters: actions is a non-empty array of zero-argument async callables.
 * Return Value: Responses in input order; any request failure rejects the promise.
 * Side Effects & Constraints: Starts real parallel HTTP requests after every task
 * reaches the gate. Server scheduling is nondeterministic; tests accept all legal
 * serial outcomes and inspect persisted state instead of requiring a winner.
 */
async function RunTogether(actions) {
  let Release;
  const start = new Promise((Resolve) => { Release = Resolve; });
  const pending = actions.map(async (Run) => { await start; return Run(); });
  Release();
  return Promise.all(pending);
}

/**
 * Summary: Open another authenticated session for a fixture account.
 * Parameters: profile contains the account's valid email and current password.
 * Return Value: An independent Client callable; a failed login fails the suite.
 * Side Effects & Constraints: Creates one session in the disposable database.
 */
async function Session(profile) {
  const Request = Client();
  Status(await Request('/api/session', 'POST', profile), 200);
  return Request;
}

// Independent sessions race inclusive overlaps across the two leave types.
const overlapping_staff = await Account(20);
const OverlappingPeer = await Session(overlapping_staff.profile);
const overlap_start = Shift(today, 2);
const overlap_responses = await RunTogether([
  () => overlapping_staff.Request('/api/applications', 'POST', Annual(overlap_start, 2)),
  () => OverlappingPeer('/api/applications', 'POST', Sick(Shift(overlap_start, 1), 2)),
]);
Equal(overlap_responses.filter((response) => response.status === 201).length, 1);
Match(Status(overlap_responses.find((response) => response.status !== 201), 400).error, /overlap/i);
const overlap_history = Status(await overlapping_staff.Request('/api/applications'), 200).applications;
Equal(overlap_history.length, 1);
const overlap_me = Status(await overlapping_staff.Request('/api/me'), 200);
for (const leave_type of ['annual', 'sick']) {
  const allocation = overlap_history[0].leaveType === leave_type ? CurrentDays(overlap_history[0]) : 0;
  Equal(overlap_me.quota[leave_type].remaining, (leave_type === 'annual' ? 18 : 14) - allocation);
}

// Opposite decisions cannot both win and must emit exactly one matching notice.
const decisions_staff = await Account(21);
const competing_decision = Status(await decisions_staff.Request('/api/applications', 'POST', Annual(overlap_start)), 201);
const ApproverPeer = await Session({ email: 'mira.cheung@worksmartse.hk', password: 'ApproverDemo-2026' });
const competing_decision_path = `/api/approver/applications/${competing_decision.id}/decision`;
const decision_responses = await RunTogether([
  () => Approver(competing_decision_path, 'POST', { decision: 'approve', revision: competing_decision.revision }),
  () => ApproverPeer(competing_decision_path, 'POST', { decision: 'disapprove', revision: competing_decision.revision }),
]);
Equal(decision_responses.filter((response) => response.status === 200).length, 1);
Check(decision_responses.some((response) => [400, 409].includes(response.status)));
const decided_record = Status(await decisions_staff.Request(`/api/applications/${competing_decision.id}`), 200);
Check(['Approved', 'Disapproved'].includes(decided_record.status));
Equal(decided_record.revision, 1);
const decision_notices = Status(await decisions_staff.Request('/api/notifications'), 200).notifications;
Equal(decision_notices.length, 1);
Equal(decision_notices[0].kind, decided_record.status.toLowerCase());
Equal(Status(await decisions_staff.Request('/api/me'), 200).quota.annual.remaining,
  18 - (decided_record.status === 'Approved' ? CurrentDays(decided_record) : 0));

// An edit and an approval of the same browser revision cannot both succeed.
const edit_race_staff = await Account(22);
const edit_original = Status(await edit_race_staff.Request('/api/applications', 'POST', Annual(overlap_start)), 201);
const edit_replacement = Annual(Shift(overlap_start, 5), 2);
const edit_race_path = `/api/applications/${edit_original.id}`;
const edit_responses = await RunTogether([
  () => edit_race_staff.Request(edit_race_path, 'PATCH', { ...edit_replacement, revision: edit_original.revision }),
  () => ApproverPeer(`/api/approver/applications/${edit_original.id}/decision`, 'POST',
    { decision: 'approve', revision: edit_original.revision }),
]);
Equal(edit_responses.filter((response) => response.status === 200).length, 1);
Check(edit_responses.some((response) => [400, 409].includes(response.status)));
const edit_saved = Status(await edit_race_staff.Request(edit_race_path), 200);
Equal(edit_saved.revision, 1);
if (edit_responses[0].status === 200) {
  Equal(edit_saved.status, 'Pending');
  Equal(edit_saved.startDate, edit_replacement.startDate);
  Equal(edit_saved.endDate, edit_replacement.endDate);
} else {
  Equal(edit_saved.status, 'Approved');
  Equal(edit_saved.startDate, edit_original.startDate);
  Equal(edit_saved.endDate, edit_original.endDate);
}
Equal(Status(await edit_race_staff.Request('/api/me'), 200).quota.annual.remaining, 18 - CurrentDays(edit_saved));
Equal(Status(await edit_race_staff.Request('/api/notifications'), 200).notifications.length,
  edit_saved.status === 'Approved' ? 1 : 0);

// Approval followed by a valid future cancellation is a legal two-success result.
// If both writes saw Pending, their revision guard permits only one to succeed.
const cancel_race_staff = await Account(23);
const cancel_original = Status(await cancel_race_staff.Request('/api/applications', 'POST', Annual(overlap_start)), 201);
const cancel_race_path = `/api/applications/${cancel_original.id}`;
const cancel_responses = await RunTogether([
  () => ApproverPeer(`/api/approver/applications/${cancel_original.id}/decision`, 'POST',
    { decision: 'approve', revision: cancel_original.revision }),
  () => cancel_race_staff.Request(`${cancel_race_path}/cancel`, 'POST'),
]);
Check(cancel_responses.every((response) => [200, 400, 409].includes(response.status)));
Check(cancel_responses.some((response) => response.status === 200));
const cancel_saved = Status(await cancel_race_staff.Request(cancel_race_path), 200);
const approval_succeeded = cancel_responses[0].status === 200;
const cancellation_succeeded = cancel_responses[1].status === 200;
Equal(cancel_saved.status, cancellation_succeeded ? 'Cancelled' : 'Approved');
Equal(cancel_saved.revision, Number(approval_succeeded) + Number(cancellation_succeeded));
Equal(Status(await cancel_race_staff.Request('/api/notifications'), 200).notifications.length, Number(approval_succeeded));
Equal(Status(await cancel_race_staff.Request('/api/me'), 200).quota.annual.remaining,
  18 - (cancel_saved.status === 'Approved' ? CurrentDays(cancel_saved) : 0));

// Duplicate cancellation cannot restore quota twice or create extra history.
const double_cancel_staff = await Account(24);
const DoubleCancelPeer = await Session(double_cancel_staff.profile);
const double_cancel = Status(await double_cancel_staff.Request('/api/applications', 'POST', Annual(overlap_start, 2)), 201);
const double_cancel_path = `/api/applications/${double_cancel.id}/cancel`;
const double_cancel_responses = await RunTogether([
  () => double_cancel_staff.Request(double_cancel_path, 'POST'),
  () => DoubleCancelPeer(double_cancel_path, 'POST'),
]);
Equal(double_cancel_responses.filter((response) => response.status === 200).length, 1);
Check(double_cancel_responses.some((response) => [400, 409].includes(response.status)));
const double_cancel_history = Status(await double_cancel_staff.Request('/api/applications'), 200).applications;
Equal(double_cancel_history.length, 1);
Equal(double_cancel_history[0].status, 'Cancelled');
Equal(double_cancel_history[0].revision, 1);
Equal(Status(await double_cancel_staff.Request('/api/me'), 200).quota.annual.remaining, 18);
Equal(Status(await double_cancel_staff.Request('/api/notifications'), 200).notifications.length, 0);

// Independent sessions competing for 19 annual days must persist only one request.
const parallel_quota_staff = await Account(25);
const ParallelQuotaPeer = await Session(parallel_quota_staff.profile);
const parallel_quota_responses = await RunTogether([
  () => parallel_quota_staff.Request('/api/applications', 'POST', Annual(future, 10, 'First reservation')),
  () => ParallelQuotaPeer('/api/applications', 'POST', Annual(Shift(future, 20), 9, 'Second reservation')),
]);
Equal(parallel_quota_responses.filter((response) => response.status === 201).length, 1);
Match(Status(parallel_quota_responses.find((response) => response.status !== 201), 400).error, /balance/i);
const parallel_quota_history = Status(await parallel_quota_staff.Request('/api/applications'), 200).applications;
Equal(parallel_quota_history.length, 1);
const quota_winner = parallel_quota_history[0];
Status(await ParallelQuotaPeer('/api/applications', 'POST', Annual(`${year + 1}-07-01`,
  18 - quota_winner.dayCount, 'Use exact remaining quota')), 201);
Match(Status(await ParallelQuotaPeer('/api/applications', 'POST', Annual(`${year + 1}-08-01`)), 400).error, /balance/i);

// An approved leave starting tomorrow remains cancellable today, the last allowed day.
const cancellation_boundary_staff = await Account(26);
const tomorrow_sick = Status(await cancellation_boundary_staff.Request('/api/applications', 'POST', Sick(Shift(today, 1))), 201);
Status(await Approver(`/api/approver/applications/${tomorrow_sick.id}/decision`, 'POST',
  { decision: 'approve', revision: tomorrow_sick.revision }), 200);
Status(await cancellation_boundary_staff.Request(`/api/applications/${tomorrow_sick.id}/cancel`, 'POST'), 200);
Equal(Status(await cancellation_boundary_staff.Request('/api/me'), 200).quota.sick.remaining, 14);

/**
 * Summary: Check a leave type's used quota and remaining against expected reservations.
 * Parameters: profile is a successful /api/me response; leave_type is annual or
 * sick; approved_days and pending_days are nonnegative expected allocations to
 * the response's calendar year.
 * Return Value: None; any disagreement fails this acceptance run.
 * Side Effects & Constraints: Increments the assertion counter only; these future
 * fixtures must still have zero taken days even when they reserve quota.
 */
function AssertQuotaUsage(profile, leave_type, approved_days, pending_days) {
  const quota = profile.quota[leave_type];
  const entitlement = leave_type === 'annual' ? 18 : 14;
  Equal(quota.entitlement, entitlement);
  Equal(quota.spent, approved_days);
  Equal(quota.pending, pending_days);
  Equal(quota.taken, 0);
  Equal(quota.entitlement - quota.remaining, approved_days + pending_days);
  Equal(quota.spent + quota.pending + quota.remaining, entitlement);
}

// Both types reserve pending and approved future days in their own calendar year.
for (const [index, leave_type] of ['annual', 'sick'].entries()) {
  const used_quota_staff = await Account(27 + index);
  const BuildLeave = leave_type === 'annual' ? Annual : Sick;
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type, 0, 0);
  const approved_usage = Status(await used_quota_staff.Request('/api/applications', 'POST',
    BuildLeave(Shift(today, 2), 5, 'Future approved quota fixture')), 201);
  const pending_usage = Status(await used_quota_staff.Request('/api/applications', 'POST',
    BuildLeave(Shift(today, 7), 5, 'Future pending quota fixture')), 201);
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type,
    0, CurrentDays(approved_usage) + CurrentDays(pending_usage));
  Status(await Approver(`/api/approver/applications/${approved_usage.id}/decision`, 'POST',
    { decision: 'approve', revision: approved_usage.revision, comment: 'Quota remains reserved' }), 200);
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type,
    CurrentDays(approved_usage), CurrentDays(pending_usage));
  Status(await used_quota_staff.Request(`/api/applications/${approved_usage.id}/cancel`, 'POST'), 200);
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type, 0, CurrentDays(pending_usage));
  Status(await Approver(`/api/approver/applications/${pending_usage.id}/decision`, 'POST',
    { decision: 'disapprove', revision: pending_usage.revision, comment: 'Quota released' }), 200);
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type, 0, 0);
  Status(await used_quota_staff.Request('/api/applications', 'POST',
    BuildLeave(future, 5, 'Next year has a separate quota')), 201);
  AssertQuotaUsage(Status(await used_quota_staff.Request('/api/me'), 200), leave_type, 0, 0);
}

Status(await staff.Request('/api/session', 'DELETE'), 200);
Status(await staff.Request('/api/me'), 401);
console.log(`All ${checks} API acceptance checks passed against ${base}.`);
