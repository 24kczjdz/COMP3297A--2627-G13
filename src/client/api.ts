import type { LeaveRecord, Me, Notice, StaffAccount } from "../shared/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export const getMe = () => api<Me>("/api/me");
export const signIn = (email: string, password: string) =>
  api<Me>("/api/session", { method: "POST", body: JSON.stringify({ email, password }) });
export const signOut = () => api<{ ok: true }>("/api/session", { method: "DELETE" });

export const getApplications = () => api<{ applications: LeaveRecord[] }>("/api/applications");
export const getApplication = (id: string) => api<LeaveRecord>(`/api/applications/${id}`);
export const createApplication = (body: unknown) =>
  api<LeaveRecord>("/api/applications", { method: "POST", body: JSON.stringify(body) });
export const updateApplication = (id: string, body: unknown) =>
  api<LeaveRecord>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const cancelApplication = (id: string) =>
  api<LeaveRecord>(`/api/applications/${id}/cancel`, { method: "POST" });

export const getNotifications = () => api<{ notifications: Notice[] }>("/api/notifications");

export const getStaff = () => api<{ staff: StaffAccount[] }>("/api/approver/staff");
export const getStaffMember = (id: string) => api<StaffAccount>(`/api/approver/staff/${id}`);
export const createStaff = (body: unknown) =>
  api<{ staff: StaffAccount; initialPassword: string }>("/api/approver/staff", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateStaff = (id: string, body: unknown) =>
  api<StaffAccount>(`/api/approver/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const getPending = () =>
  api<{ count: number; applications: LeaveRecord[] }>("/api/approver/pending");
export const decideApplication = (id: string, decision: "approve" | "disapprove") =>
  api<LeaveRecord>(`/api/approver/applications/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
export const getOnDate = (date: string) =>
  api<{ date: string; applications: LeaveRecord[] }>(`/api/approver/on-date?date=${encodeURIComponent(date)}`);
