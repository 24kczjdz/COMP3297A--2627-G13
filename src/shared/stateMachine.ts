import { dayBefore } from "./dates";
import type { LeaveStatus } from "./types";

/**
 * Leave application transitions.
 * Approved stays a final decision until the applicant cancels it under the
 * day-before rule. "Leave completed" is unspecified and is not a state.
 */

export function assertCanModify(status: LeaveStatus): string | null {
  if (status !== "Pending") {
    return "This application can only be changed while it is Pending.";
  }
  return null;
}

export function canCancel(status: LeaveStatus, startDate: string, today: string): boolean {
  if (status === "Pending") return true;
  if (status === "Approved") return today <= dayBefore(startDate);
  return false;
}

export function cancelRefusal(status: LeaveStatus, startDate: string, today: string): string | null {
  if (canCancel(status, startDate, today)) return null;
  if (status === "Approved") {
    return "Approved leave can be cancelled only up to the day before it starts.";
  }
  return "This application can no longer be cancelled.";
}

export function nextStatusAfterCancel(): "Cancelled" {
  return "Cancelled";
}

export function decide(
  status: LeaveStatus,
  decision: "approve" | "disapprove",
):
  | { ok: true; status: "Approved" | "Disapproved"; archived: true; kind: "approved" | "disapproved" }
  | { ok: false; error: string } {
  if (status !== "Pending") {
    return { ok: false, error: "Only a Pending application can be decided." };
  }
  if (decision === "approve") {
    return { ok: true, status: "Approved", archived: true, kind: "approved" };
  }
  return { ok: true, status: "Disapproved", archived: true, kind: "disapproved" };
}
