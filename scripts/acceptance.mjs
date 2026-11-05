// This suite creates test accounts/history. Use a disposable LOCAL Worker only.
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:43219';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Use a disposable local Worker');
let checks = 0;
function equal(a, b) { assert.deepEqual(a, b); checks++; }
function status(r, expected) { assert.equal(r.status, expected, JSON.stringify(r.data)); checks++; return r.data; }
function client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const r = await fetch(base + path, { method, headers: { cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of r.headers.getSetCookie()) cookie = value.split(';')[0];
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
}
const anon = client(), approver = client();
status(await anon('/api/me'), 401);
status(await anon('/api/session', 'POST', { email: 'test@gmail.com', password: 'wrong' }), 400);
status(await anon('/api/session', 'POST', { email: 'mira.cheung@worksmartse.hk', password: 'wrong' }), 401);
const login = await approver('/api/session', 'POST', { email: 'mira.cheung@worksmartse.hk', password: 'ApproverDemo-2026' });
const me = status(login, 200);
assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
const today = me.hongKongToday, year = Number(today.slice(0, 4)), future = `${year + 1}-02-01`;
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const annual = (startDate, days = 1, reason) => ({ leaveType: 'annual', startDate,
  endDate: shift(startDate, days - 1), ...(reason === undefined ? {} : { reason }) });
const sick = (...args) => ({ ...annual(...args), leaveType: 'sick' });
const currentDays = (b) => {
  const start = b.startDate > `${year}-01-01` ? b.startDate : `${year}-01-01`;
  const end = b.endDate < `${year}-12-31` ? b.endDate : `${year}-12-31`;
  return end < start ? 0 : (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
};
const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function account(n) {
  const profile = { email: `test.${suffix}.${n}@worksmartse.hk`, password: 'TestStaff-2026', name: `Test ${n}`,
    staffCode: `T-${suffix}-${n}`, birthday: '1992-04-12', department: 'Engineering', yearJoined: 2020 };
  const created = status(await approver('/api/approver/staff', 'POST', profile), 201);
  equal(created.initialPassword, profile.password);
  equal(created.staff.role, 'staff');
  equal('password_hash' in created.staff, false);
  const request = client();
  return { request, profile, data: status(await request('/api/session', 'POST', profile), 200) };
}
const staff = await account(1), other = await account(2), quotaStaff = await account(3);
equal(staff.data.quota.annual.remaining, 18);
equal(staff.data.quota.sick.remaining, 14);
equal(staff.data.quotaYear, year);
status(await staff.request('/api/approver/pending'), 403);
status(await approver('/api/approver/staff', 'POST', staff.profile), 400);
status(await approver('/api/approver/staff', 'POST', { ...staff.profile, email: 'test@gmail.com' }), 400);
status(await staff.request(`/api/approver/staff/${staff.data.id}`, 'PATCH', staff.profile), 403);
status(await approver(`/api/approver/staff/${staff.data.id}`, 'PATCH', { ...staff.profile, department: 'Finance' }), 200);
equal(status(await staff.request('/api/me'), 200).department, 'Finance');

const body = annual(shift(today, 2), 2);
const created = status(await staff.request('/api/applications', 'POST', { ...body, dayCount: 999 }), 201);
equal(created.reason, ''); equal(created.dayCount, 2); equal(created.status, 'Pending');
equal(status(await staff.request('/api/me'), 200).quota.annual.remaining, 18 - currentDays(body));
status(await other.request(`/api/applications/${created.id}`), 404);
status(await other.request(`/api/applications/${created.id}/cancel`, 'POST'), 404);
const editedBody = annual(shift(today, 2), 3);
equal(status(await staff.request(`/api/applications/${created.id}`, 'PATCH', { ...editedBody, revision: created.revision }), 200).revision, 1);
equal(status(await staff.request('/api/me'), 200).quota.annual.remaining, 18 - currentDays(editedBody));
status(await staff.request('/api/applications', 'POST', sick(shift(today, 3))), 400);
status(await staff.request('/api/applications', 'POST', annual(shift(today, 3))), 400);
status(await staff.request(`/api/applications/${created.id}/cancel`, 'POST'), 200);
equal(status(await staff.request('/api/me'), 200).quota.annual.remaining, 18);
for (const offset of [-27, -1, 0, 1]) {
  const refused = status(await staff.request('/api/applications', 'POST', annual(shift(today, offset))), 400);
  assert.match(refused.error, /2 calendar days/);
}
status(await staff.request('/api/applications', 'POST', sick(shift(today, -8))), 400);
status(await staff.request('/api/applications', 'POST', annual(future, 5)), 400);
status(await staff.request('/api/applications', 'POST', { ...annual(future), endDate: shift(future, -1) }), 400);
for (const body of [sick(shift(today, -10), 4), sick(shift(today, -7))]) {
  const valid = status(await staff.request('/api/applications', 'POST', body), 201);
  status(await staff.request(`/api/applications/${valid.id}/cancel`, 'POST'), 200);
}

const long = status(await staff.request('/api/applications', 'POST', annual(future, 5, 'Holiday')), 201);
const decisionPath = `/api/approver/applications/${long.id}/decision`;
for (const decision of ['approve', 'disapprove']) status(await approver(decisionPath, 'POST', { decision, revision: long.revision }), 400);
const race = await Promise.all([1, 2].map(() => approver(decisionPath, 'POST', { decision: 'approve', comment: 'Coverage arranged', revision: long.revision })));
equal(race.filter((r) => r.status === 200).length, 1);
assert.ok(race.some((r) => [400, 409].includes(r.status)));
const saved = status(await staff.request(`/api/applications/${long.id}`), 200);
equal(saved.status, 'Approved'); equal(saved.decisionComment, 'Coverage arranged'); equal(saved.decidedBy, me.id);
status(await staff.request(`/api/applications/${long.id}`, 'PATCH', { ...annual(future), revision: saved.revision }), 400);
const notices = status(await staff.request('/api/notifications'), 200).notifications.filter((n) => n.applicationId === long.id);
equal(notices.length, 1); assert.match(notices[0].message, /Coverage arranged/);
equal(status(await staff.request('/api/me'), 200).unreadNotifications, 0);
status(await staff.request('/api/applications', 'POST', annual(shift(future, 4))), 400);
status(await staff.request(`/api/applications/${long.id}/cancel`, 'POST'), 200);
const toReject = status(await staff.request('/api/applications', 'POST', body), 201);
status(await approver(`/api/approver/applications/${toReject.id}/decision`, 'POST', { decision: 'disapprove', revision: toReject.revision }), 200);
equal(status(await staff.request('/api/me'), 200).quota.annual.remaining, 18);

const todaySick = status(await staff.request('/api/applications', 'POST', sick(today)), 201);
equal(status(await staff.request('/api/me'), 200).quota.sick.taken, 0);
status(await approver(`/api/approver/applications/${todaySick.id}/decision`, 'POST', { decision: 'approve', revision: todaySick.revision }), 200);
const afterSick = status(await staff.request('/api/me'), 200);
equal(afterSick.quota.sick.taken, 1); equal(afterSick.quota.sick.remaining, 13);
status(await staff.request(`/api/applications/${todaySick.id}/cancel`, 'POST'), 400);

const submissions = await Promise.all([
  quotaStaff.request('/api/applications', 'POST', annual(future, 10, 'First trip')),
  quotaStaff.request('/api/applications', 'POST', annual(shift(future, 15), 10, 'Second trip')),
]);
equal(submissions.filter((r) => r.status === 201).length, 1);
const overQuota = submissions.find((r) => r.status !== 201);
status(overQuota, 400); assert.match(overQuota.data.error, /balance/);
const reserved = submissions.find((r) => r.status === 201).data;
status(await quotaStaff.request(`/api/applications/${reserved.id}`, 'PATCH', { ...annual(reserved.startDate, 19, 'Too long'), revision: reserved.revision }), 400);
const queue = status(await approver('/api/approver/pending'), 200);
equal(queue.count, queue.applications.length);
equal(queue.applications.map((r) => r.startDate), queue.applications.map((r) => r.startDate).toSorted());
const onDate = status(await approver(`/api/approver/on-date?date=${body.startDate}`), 200);
assert.ok(onDate.applications.some((r) => r.id === toReject.id && r.status === 'Disapproved'));
assert.ok(status(await staff.request('/api/applications'), 200).applications.every((r) => r.applicantId === staff.data.id));
// Exercise short/long reasons and multi-year quotas through the real Worker.
const boundary_staff = await account(4);
for (const reason of [undefined, null, '', '   ']) {
  const request_body = annual(`${year + 1}-06-01`, 4, reason);
  const short_leave = status(await boundary_staff.request('/api/applications', 'POST', request_body), 201);
  equal(short_leave.reason, '');
  equal(short_leave.dayCount, 4);
  status(await boundary_staff.request(`/api/applications/${short_leave.id}`, 'PATCH',
    { ...annual(request_body.startDate, 5, reason), revision: short_leave.revision }), 400);
  equal(status(await boundary_staff.request(`/api/applications/${short_leave.id}`), 200).dayCount, 4);
  status(await boundary_staff.request(`/api/applications/${short_leave.id}/cancel`, 'POST'), 200);
}
const cross_year_start = `${year + 1}-12-30`;
const cross_year = status(await boundary_staff.request('/api/applications', 'POST',
  annual(cross_year_start, 5, 'New year trip')), 201);
equal(cross_year.dayCount, 5);
equal(status(await boundary_staff.request('/api/me'), 200).quota.annual.remaining, 18);
const next_year_reservation = status(await boundary_staff.request('/api/applications', 'POST',
  annual(`${year + 2}-02-01`, 15, 'Remaining next year quota')), 201);
status(await boundary_staff.request('/api/applications', 'POST', annual(`${year + 2}-03-01`)), 400);
status(await boundary_staff.request(`/api/applications/${cross_year.id}`, 'PATCH',
  { ...annual(cross_year_start, 6, 'One extra next year day'), revision: cross_year.revision }), 400);
equal(status(await boundary_staff.request(`/api/applications/${cross_year.id}`), 200).dayCount, 5);
status(await boundary_staff.request(`/api/applications/${next_year_reservation.id}`, 'PATCH',
  { ...annual(cross_year_start, 1), revision: next_year_reservation.revision }), 400);
status(await boundary_staff.request(`/api/applications/${cross_year.id}/cancel`, 'POST'), 200);
status(await boundary_staff.request(`/api/applications/${next_year_reservation.id}`, 'PATCH',
  { ...annual(next_year_reservation.startDate, 18, 'Quota released by cancellation'), revision: next_year_reservation.revision }), 200);

// Browser snapshots must remain authoritative across separate HTTP requests.
// A fresh server read cannot substitute for the version the user actually saw.
const revision_staff = await account(5);
const original = status(await revision_staff.request('/api/applications', 'POST',
  annual(`${year + 1}-09-01`, 5, 'Family trip\r\nTravel arrangements')), 201);
equal(original.reason, 'Family trip\nTravel arrangements');
const old_queue = status(await approver('/api/approver/pending'), 200).applications.find((r) => r.id === original.id);
const edit_path = `/api/applications/${original.id}`;
const approve_path = `/api/approver/applications/${original.id}/decision`;
const replacement = annual(`${year + 1}-10-01`, 5, 'Updated dates\nTravel arrangements');
for (const revision of [undefined, null, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
  status(await revision_staff.request(edit_path, 'PATCH', { ...replacement, revision }), 400);
  status(await approver(approve_path, 'POST', { decision: 'approve', comment: 'Checked', revision }), 400);
}
const current = status(await revision_staff.request(edit_path, 'PATCH', { ...replacement, revision: original.revision }), 200);
equal(current.revision, original.revision + 1);
status(await revision_staff.request(edit_path, 'PATCH', { ...original, reason: 'Stale tab overwrite' }), 409);
equal(status(await revision_staff.request(edit_path), 200).reason, replacement.reason);
for (const decision of ['approve', 'disapprove']) {
  status(await approver(approve_path, 'POST', { decision, comment: 'Old queue', revision: old_queue.revision }), 409);
}
equal(status(await revision_staff.request(edit_path), 200).status, 'Pending');
equal(status(await revision_staff.request('/api/notifications'), 200).notifications.length, 0);
for (const comment of ['x'.repeat(1001), 'Invalid\u0000comment']) {
  status(await approver(approve_path, 'POST', { decision: 'approve', comment, revision: current.revision }), 400);
}
const refreshed_queue = status(await approver('/api/approver/pending'), 200).applications.find((r) => r.id === original.id);
equal(refreshed_queue.startDate, replacement.startDate);
const multiline_comment = 'Updated dates checked\nCoverage confirmed';
const approved_revision = status(await approver(approve_path, 'POST', {
  decision: 'approve', comment: multiline_comment, revision: refreshed_queue.revision,
}), 200);
equal(approved_revision.startDate, replacement.startDate);
equal(approved_revision.decisionComment, multiline_comment);
const revision_notices = status(await revision_staff.request('/api/notifications'), 200).notifications;
equal(revision_notices.length, 1);
assert.ok(revision_notices[0].message.includes(multiline_comment));

status(await staff.request('/api/session', 'DELETE'), 200);
status(await staff.request('/api/me'), 401);
console.log(`All ${checks} API acceptance assertions passed against ${base}.`);
