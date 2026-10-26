const base = process.env.BASE_URL ?? "http://127.0.0.1:43219";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function client() {
  const cookies = new Map();
  return {
    async request(path, { method = "GET", body } = {}) {
      const headers = {};
      if (cookies.size) headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
      for (const line of setCookies) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (/max-age=0/i.test(line)) cookies.delete(name);
        else cookies.set(name, value);
      }
      const text = await response.text();
      let data = null;
      if (text) data = JSON.parse(text);
      return { status: response.status, data, setCookies };
    },
  };
}

const ada = {
  email: "ada.poon@worksmartse.hk",
  password: "NewStaff-2026",
  name: "Ada Poon",
  staffCode: "WS-099",
  birthday: "1992-04-12",
  department: "Engineering",
  yearJoined: 2020,
};

async function main() {
  const anon = client();
  const signedOut = await anon.request("/api/me");
  assert(signedOut.status === 401, "signed-out /api/me should be 401");

  const external = await anon.request("/api/session", {
    method: "POST",
    body: { email: "mira.cheung@gmail.com", password: "ApproverDemo-2026" },
  });
  assert(external.status === 400, "external email should be refused");

  const wrong = await anon.request("/api/session", {
    method: "POST",
    body: { email: "mira.cheung@worksmartse.hk", password: "not-the-password" },
  });
  assert(wrong.status === 401, "wrong password should be 401");

  const approver = client();
  const login = await approver.request("/api/session", {
    method: "POST",
    body: { email: "mira.cheung@worksmartse.hk", password: "ApproverDemo-2026" },
  });
  assert(login.status === 200, `approver sign-in failed: ${login.status} ${JSON.stringify(login.data)}`);
  assert(login.data.role === "approver", "approver role");
  assert(login.data.email === "mira.cheung@worksmartse.hk", "approver email");
  assert(login.data.name === "Mira Cheung", "approver name");
  assert(login.data.staffCode === "WS-001", "approver staff id");
  assert(login.data.department === "People", "approver department");
  assert(login.data.quota.annual.entitlement === 18, "annual entitlement");
  assert(login.data.quota.sick.entitlement === 14, "sick entitlement");
  assert(login.data.quota.annual.spent === 0, "approver annual spent starts at 0");
  assert(!("password" in login.data), "password must not be returned");
  const cookie = login.setCookies[0] ?? "";
  assert(/httponly/i.test(cookie), "session cookie is HttpOnly");
  assert(/samesite=lax/i.test(cookie), "session cookie is SameSite=Lax");
  assert(!/;\s*secure/i.test(cookie), "local http cookie is not Secure");

  const pending = await approver.request("/api/approver/pending");
  assert(pending.status === 200, "pending list");
  assert(pending.data.count === pending.data.applications.length, "pending count matches rows");
  assert(pending.data.count === 4, `expected 4 pending, got ${pending.data.count}`);
  for (const row of pending.data.applications) {
    assert(row.applicantName && row.applicantStaffCode, "pending row names the staff member");
    assert(row.leaveType && row.startDate && row.endDate && row.reason, "pending row has content");
    assert(row.status === "Pending", "pending queue is only Pending");
  }

  const onDate = await approver.request("/api/approver/on-date?date=2027-03-17");
  assert(onDate.status === 200, "date search");
  const ids = onDate.data.applications.map((row) => row.id).sort();
  assert(ids.includes("app-oscar-approved-future"), "date search includes leave covering the date");
  assert(ids.includes("app-natalie-pending"), "date search includes pending leave on that date");
  assert(!ids.includes("app-oscar-approved-past"), "past leave outside the date is excluded");
  for (const row of onDate.data.applications) {
    assert(row.startDate <= "2027-03-17" && row.endDate >= "2027-03-17", "row covers the chosen date");
    assert(row.status && row.reason && row.applicantName, "date row shows status and content");
  }
  const submittedDay = await approver.request("/api/approver/on-date?date=2026-10-02");
  assert(
    !submittedDay.data.applications.some((row) => row.id === "app-oscar-approved-future"),
    "submission day does not select the record",
  );
  const disapprovedDay = await approver.request("/api/approver/on-date?date=2026-11-05");
  const disapproved = disapprovedDay.data.applications.find((row) => row.id === "app-natalie-disapproved");
  assert(disapproved?.status === "Disapproved", "disapproved leave is visible on its leave date");

  const badEmail = await approver.request("/api/approver/staff", {
    method: "POST",
    body: { ...ada, email: "ada.poon@gmail.com" },
  });
  assert(badEmail.status === 400, "external email cannot be created");

  const created = await approver.request("/api/approver/staff", { method: "POST", body: ada });
  assert(created.status === 201, `create staff failed: ${created.status} ${JSON.stringify(created.data)}`);
  assert(created.data.initialPassword === ada.password, "initial password is echoed once");
  assert(created.data.staff.role === "staff", "new accounts are staff, not a second approver");
  assert(!("password" in created.data.staff), "staff payload has no password");
  const directory = await approver.request("/api/approver/staff");
  assert(directory.data.staff.every((person) => !("password" in person) && !("passwordHash" in person)), "directory hides passwords");

  const ownDecision = await approver.request("/api/approver/applications/app-mira-pending/decision", {
    method: "POST",
    body: { decision: "approve" },
  });
  assert(ownDecision.status === 200, "approver can decide their own leave");
  assert(ownDecision.data.status === "Approved" && ownDecision.data.archived === true, "approved applications are archived");
  const mira = await approver.request("/api/me");
  assert(mira.data.quota.annual.spent === 1, "approved day counts as spent");
  const miraNotes = await approver.request("/api/notifications");
  assert(
    miraNotes.data.notifications.some((notice) => notice.kind === "approved" && notice.message.includes("was approved")),
    "approval writes an in-system notification",
  );

  const chloeBefore = client();
  await chloeBefore.request("/api/session", {
    method: "POST",
    body: { email: "chloe.tsang@worksmartse.hk", password: "StaffDemo-2026" },
  });
  const chloeMe = await chloeBefore.request("/api/me");
  assert(chloeMe.data.quota.sick.spent === 0, "chloe has no spent sick leave");
  const rejected = await approver.request("/api/approver/applications/app-chloe-pending/decision", {
    method: "POST",
    body: { decision: "disapprove" },
  });
  assert(rejected.data.status === "Disapproved" && rejected.data.archived === true, "disapproved applications are archived");
  const again = await approver.request("/api/approver/applications/app-chloe-pending/decision", {
    method: "POST",
    body: { decision: "approve" },
  });
  assert(again.status === 400, "a decided application cannot be decided again");
  const chloeAfter = await chloeBefore.request("/api/me");
  assert(chloeAfter.data.quota.sick.spent === 0, "disapproved leave is not spent");
  assert(chloeAfter.data.unreadNotifications >= 1, "applicant has an unread notice");
  const chloeNotes = await chloeBefore.request("/api/notifications");
  assert(
    chloeNotes.data.notifications.some((notice) => notice.kind === "disapproved"),
    "disapproval writes an in-system notification",
  );
  const chloeRead = await chloeBefore.request("/api/me");
  assert(chloeRead.data.unreadNotifications === 0, "opening notices marks them read");

  const adaClient = client();
  const adaLogin = await adaClient.request("/api/session", {
    method: "POST",
    body: { email: ada.email, password: ada.password },
  });
  assert(adaLogin.status === 200, "new staff can sign in with the issued password");
  assert(adaLogin.data.name === "Ada Poon", "new staff sees their profile");
  const forbidden = await adaClient.request("/api/approver/pending");
  assert(forbidden.status === 403, "staff cannot open the approver queue");
  const forbiddenWrite = await adaClient.request("/api/approver/staff/staff-02", {
    method: "PATCH",
    body: { ...ada, name: "Hacked" },
  });
  assert(forbiddenWrite.status === 403, "staff cannot edit a profile");

  const edited = await approver.request(`/api/approver/staff/${created.data.staff.id}`, {
    method: "PATCH",
    body: {
      email: "ada.poon@worksmartse.hk",
      name: "Ada Poon-Yip",
      staffCode: "WS-099A",
      birthday: "1992-04-12",
      department: "Finance",
      yearJoined: 2021,
    },
  });
  assert(edited.status === 200, `edit profile failed: ${edited.status} ${JSON.stringify(edited.data)}`);
  const adaSeen = await adaClient.request("/api/me");
  assert(adaSeen.data.name === "Ada Poon-Yip", "staff sees the updated name");
  assert(adaSeen.data.department === "Finance", "staff sees the updated department");
  assert(adaSeen.data.staffCode === "WS-099A", "staff sees the updated staff ID");
  assert(adaSeen.data.yearJoined === 2021, "staff sees the updated year");

  const oscar = client();
  const oscarLogin = await oscar.request("/api/session", {
    method: "POST",
    body: { email: "oscar.lam@worksmartse.hk", password: "StaffDemo-2026" },
  });
  assert(oscarLogin.status === 200, "staff sign-in");
  assert(oscarLogin.data.quota.annual.entitlement === 18 && oscarLogin.data.quota.sick.entitlement === 14, "staff quota totals");
  assert(oscarLogin.data.quota.annual.spent === 3, `oscar annual spent, got ${oscarLogin.data.quota.annual.spent}`);
  assert(oscarLogin.data.quota.sick.spent === 2, "oscar sick spent");
  assert(oscarLogin.data.unreadNotifications === 2, "seeded decisions are unread");
  const history = await oscar.request("/api/applications");
  assert(history.data.applications.every((row) => row.applicantId === oscarLogin.data.id), "history is only this staff member");
  assert(history.data.applications.length === 3, "oscar starts with three applications");
  for (const row of history.data.applications) {
    assert(["Pending", "Approved", "Disapproved", "Cancelled"].includes(row.status), "status is one of the four");
    assert(row.leaveType && row.startDate && row.endDate && row.reason, "history shows the form fields");
  }
  const hidden = await oscar.request("/api/applications/app-natalie-pending");
  assert(hidden.status === 404, "a staff member cannot open someone else's application");
  const notes = await oscar.request("/api/notifications");
  assert(notes.data.notifications.length === 2, "applicant can read decision notices");

  const createdLeave = await oscar.request("/api/applications", {
    method: "POST",
    body: { leaveType: "annual", startDate: "2027-04-01", endDate: "2027-04-01", reason: "Same-day appointment." },
  });
  assert(createdLeave.status === 201, "submit application");
  assert(createdLeave.data.status === "Pending", "new application is Pending");
  assert(createdLeave.data.dayCount === 1, "same-day request is 1 day");
  const afterSubmit = await oscar.request("/api/applications");
  assert(afterSubmit.data.applications.some((row) => row.id === createdLeave.data.id), "new request appears in history");

  const badRange = await oscar.request("/api/applications", {
    method: "POST",
    body: { leaveType: "annual", startDate: "2027-05-02", endDate: "2027-05-01", reason: "Backwards." },
  });
  assert(badRange.status === 400, "end date before start date is refused");

  const updated = await oscar.request(`/api/applications/${createdLeave.data.id}`, {
    method: "PATCH",
    body: { leaveType: "sick", startDate: "2027-04-01", endDate: "2027-04-02", reason: "Extended by a day." },
  });
  assert(updated.status === 200, "pending application can be modified");
  assert(updated.data.status === "Pending", "modification keeps Pending");
  assert(updated.data.dayCount === 2, "inclusive day count");
  assert(updated.data.leaveType === "sick" && updated.data.reason === "Extended by a day.", "history shows the updated content");

  const cancelled = await oscar.request(`/api/applications/${createdLeave.data.id}/cancel`, { method: "POST" });
  assert(cancelled.data.status === "Cancelled", "pending cancel sets Cancelled");
  const editCancelled = await oscar.request(`/api/applications/${createdLeave.data.id}`, {
    method: "PATCH",
    body: { leaveType: "annual", startDate: "2027-04-01", endDate: "2027-04-01", reason: "Too late." },
  });
  assert(editCancelled.status === 400, "cancelled applications cannot be modified");

  const cancelFuture = await oscar.request("/api/applications/app-oscar-approved-future/cancel", { method: "POST" });
  assert(cancelFuture.data.status === "Cancelled", "approved leave can be cancelled before it starts");
  const spentAfter = await oscar.request("/api/me");
  assert(spentAfter.data.quota.annual.spent === 0, "cancelling approved leave returns the days");
  const cancelPast = await oscar.request("/api/applications/app-oscar-approved-past/cancel", { method: "POST" });
  assert(cancelPast.status === 400, "approved leave cannot be cancelled once it has started");
  assert(spentAfter.data.quota.sick.spent === 2, "past approved sick leave stays spent");

  const signedOutOscar = await oscar.request("/api/session", { method: "DELETE" });
  assert(signedOutOscar.status === 200, "sign out");
  const afterOut = await oscar.request("/api/me");
  assert(afterOut.status === 401, "signed-out session cannot read leave");

  console.log("All acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
