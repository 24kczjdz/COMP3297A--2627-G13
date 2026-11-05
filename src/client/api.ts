import type { LeaveRecord, Me, Notice, StaffAccount } from "../shared/types";

export class ApiError extends Error {
  status_: number;

  /**
   * Summary: Create an API failure carrying its HTTP status.
   * Parameters: message is the non-null user-facing error; status is the HTTP status integer.
   * Return Value: A new ApiError; message and stack retain standard Error behavior.
   * Side Effects & Constraints: Allocates an error object; does not make a request.
   */
  constructor(message: string, status: number) {
    super(message);
    this.status_ = status;
  }
}

/**
 * Summary: Send an authenticated JSON request and decode its response.
 * Parameters: path is a non-empty API URL; init is optional standard fetch options; T is the
 * expected response shape.
 * Return Value: Resolves with the decoded response; rejects with ApiError for HTTP failures or
 * propagates network/JSON errors.
 * Side Effects & Constraints: Sends session cookies and the supplied body; adds JSON Content-Type
 * when needed.
 */
export async function Api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: string }) : {};
  if (!response.ok) {
    throw new ApiError(data.error || "LeaveFlowSE could not complete that action.", response.status);
  }
  return data as T;
}

/**
 * Summary: Read the current account and live quota.
 * Parameters: None; the session identifies the account.
 * Return Value: Resolves with the profile and quota; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Sends one authenticated GET; does not modify leave records.
 */
export const GetMe = () => Api<Me>("/api/me");
/**
 * Summary: Authenticate an account using its company email and password.
 * Parameters: email and password are non-null strings; the server validates their values.
 * Return Value: Resolves with the signed-in profile; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Posts credentials in the request body and receives the session
 * cookie.
 */
export const SignIn = (email: string, password: string) =>
  Api<Me>("/api/session", { method: "POST", body: JSON.stringify({ email, password }) });
/**
 * Summary: End the current browser session.
 * Parameters: None; the browser supplies its session cookie.
 * Return Value: Resolves with the success response; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Deletes the server session and clears its cookie.
 */
export const SignOut = () => Api<{ ok: true }>("/api/session", { method: "DELETE" });

/**
 * Summary: Read the signed-in applicant's leave history.
 * Parameters: None; the session identifies the account.
 * Return Value: Resolves with an applications array, possibly empty; rejects with API/network/JSON
 * errors.
 * Side Effects & Constraints: Sends one authenticated GET; does not modify records.
 */
export const GetApplications = () => Api<{ applications: LeaveRecord[] }>("/api/applications");
/**
 * Summary: Read one application owned by the signed-in account.
 * Parameters: id is the non-empty application identifier.
 * Return Value: Resolves with the request; rejects for missing/inaccessible records or
 * API/network/JSON errors.
 * Side Effects & Constraints: Sends one authenticated GET without changing the application.
 */
export const GetApplication = (id: string) => Api<LeaveRecord>(`/api/applications/${id}`);
/**
 * Summary: Submit a new leave request for the signed-in account.
 * Parameters: body contains the leave type, ISO start/end dates, and optional reason; the server
 * validates its shape.
 * Return Value: Resolves with the pending request; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Creates a request and reserves quota atomically on the server.
 */
export const CreateApplication = (body: unknown) =>
  Api<LeaveRecord>("/api/applications", { method: "POST", body: JSON.stringify(body) });
/**
 * Summary: Replace an existing pending request using its displayed revision.
 * Parameters: id is non-empty; body contains valid leave fields and the nonnegative revision last
 * read.
 * Return Value: Resolves with the updated request; rejects for conflicts or API/network/JSON
 * errors.
 * Side Effects & Constraints: Updates dates/reason and live quota through the server's atomic
 * rules.
 */
export const UpdateApplication = (id: string, body: Pick<LeaveRecord, "leaveType" | "startDate" | "endDate" | "reason" | "revision">) =>
  Api<LeaveRecord>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
/**
 * Summary: Cancel the signed-in account's eligible leave request.
 * Parameters: id is the non-empty request identifier.
 * Return Value: Resolves with the cancelled request; rejects if ineligible or on API/network/JSON
 * errors.
 * Side Effects & Constraints: Releases the reservation; the server rechecks status and dates.
 */
export const CancelApplication = (id: string) =>
  Api<LeaveRecord>(`/api/applications/${id}/cancel`, { method: "POST" });

/**
 * Summary: Read the signed-in account's decision notices.
 * Parameters: None; the session identifies the account.
 * Return Value: Resolves with a notifications array, possibly empty; rejects with API/network/JSON
 * errors.
 * Side Effects & Constraints: Sends one authenticated GET; marks unread notices as read on the
 * server.
 */
export const GetNotifications = () => Api<{ notifications: Notice[] }>("/api/notifications");

/**
 * Summary: Read all staff accounts visible to the approver.
 * Parameters: None; the session identifies the account.
 * Return Value: Resolves with a staff array, possibly empty; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Sends one authenticated GET; requires the approver role.
 */
export const GetStaff = () => Api<{ staff: StaffAccount[] }>("/api/approver/staff");
/**
 * Summary: Read one account for the approver's editor.
 * Parameters: id is the non-empty staff identifier.
 * Return Value: Resolves with the profile; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Sends one authenticated GET requiring the approver role.
 */
export const GetStaffMember = (id: string) => Api<StaffAccount>(`/api/approver/staff/${id}`);
/**
 * Summary: Create an ordinary staff account with its initial password.
 * Parameters: body contains the non-null profile and initial-password fields validated by the
 * server.
 * Return Value: Resolves with the staff profile and issued password; rejects with API/network/JSON
 * errors.
 * Side Effects & Constraints: Posts account data; requires the approver role and a unique company
 * email.
 */
export const CreateStaff = (body: unknown) =>
  Api<{ staff: StaffAccount; initialPassword: string }>("/api/approver/staff", {
    method: "POST",
    body: JSON.stringify(body),
  });
/**
 * Summary: Save an account's editable profile fields.
 * Parameters: id is non-empty; body contains the profile fields validated by the server.
 * Return Value: Resolves with the updated profile; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Patches account data; does not reset its password or change its role.
 */
export const UpdateStaff = (id: string, body: unknown) =>
  Api<StaffAccount>(`/api/approver/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) });

/**
 * Summary: Permanently delete a staff account after reauthenticating the approver.
 * Parameters: id and approver_password are non-empty strings; the password is at
 * most 72 characters and belongs to the currently signed-in approver.
 * Return Value: Resolves on success; rejects with API/network/JSON errors.
 * Side Effects & Constraints: Removes the account and its history through the API;
 * sends the password only in the request body.
 */
export async function DeleteStaffAccount(id: string, approver_password: string): Promise<void> {
  await Api(`/api/approver/staff/${encodeURIComponent(id)}`, {
    method: "DELETE", body: JSON.stringify({ approverPassword: approver_password }),
  });
}

/**
 * Summary: Reset a staff password using the signed-in approver's confirmation.
 * Parameters: id is a non-empty staff ID; new_password is 8-72 characters;
 * approver_password is the approver's current password (1-72 characters).
 * None may be null.
 * Return Value: Resolves on success; rejects with an API or network error.
 * Side Effects & Constraints: Sends passwords in the request body only.
 */
export async function ResetStaffPassword(
  id: string, new_password: string, approver_password: string,
): Promise<void> {
  await Api(`/api/approver/staff/${encodeURIComponent(id)}/password`, {
    method: "POST", body: JSON.stringify({ newPassword: new_password, approverPassword: approver_password }),
  });
}

/**
 * Summary: Read the approver's pending queue and count.
 * Parameters: None; the session identifies the account.
 * Return Value: Resolves with the count and applications sorted by start date; rejects with
 * API/network/JSON errors.
 * Side Effects & Constraints: Sends one authenticated GET; requires the approver role.
 */
export const GetPending = () =>
  Api<{ count: number; applications: LeaveRecord[] }>("/api/approver/pending");
/**
 * Summary: Approve or disapprove the pending application revision shown to the approver.
 * Parameters: id is non-empty; revision is nonnegative; decision is approve/disapprove; comment
 * defaults to empty and is required beyond four days.
 * Return Value: Resolves with the decided request; rejects for conflicts or API/network/JSON
 * errors.
 * Side Effects & Constraints: Writes the decision and notice atomically; rejection releases
 * reserved quota.
 */
export const DecideApplication = (id: string, revision: number, decision: "approve" | "disapprove", comment = "") =>
  Api<LeaveRecord>(`/api/approver/applications/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, comment, revision }),
  });
/**
 * Summary: Load the approver's complete archive across all application statuses.
 * Parameters: None; the existing session identifies the signed-in approver.
 * Return Value: All pending, approved, cancelled, and disapproved records, or an API error.
 * Side Effects & Constraints: Sends one authenticated GET; does not change records.
 */
export function GetArchive() {
  return Api<{ applications: LeaveRecord[] }>("/api/approver/archive");
}

/**
 * Summary: Read all staff leave records covering one calendar date.
 * Parameters: date is a valid ISO YYYY-MM-DD leave date.
 * Return Value: Resolves with the date and matching applications, possibly empty; rejects with
 * API/network/JSON errors.
 * Side Effects & Constraints: Sends an approver-only GET; filters inclusive leave dates, not
 * submission dates.
 */
export const GetOnDate = (date: string) =>
  Api<{ date: string; applications: LeaveRecord[] }>(`/api/approver/on-date?date=${encodeURIComponent(date)}`);
