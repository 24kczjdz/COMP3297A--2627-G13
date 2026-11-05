import { DayBefore } from "./dates";
import type { LeaveStatus } from "./types";

/**
 * Leave application transitions.
 * Approved stays a final decision until the applicant cancels it under the
 * day-before rule. "Leave completed" is unspecified and is not a state.
 */

/**
 * Summary: Check whether an application is still editable.
 * Parameters: status is a non-null supported leave status.
 * Return Value: Null for Pending, otherwise a user-facing refusal.
 * Side Effects & Constraints: Pure; the database must recheck status during writes.
 */
export function AssertCanModify(status: LeaveStatus): string | null {
  if (status !== "Pending") {
    return "This application can only be changed while it is Pending.";
  }
  return null;
}

/**
 * Summary: Check cancellation eligibility for a request and current date.
 * Parameters: status is supported; start_date and today are non-null valid ISO
 * dates, with today interpreted in Hong Kong.
 * Return Value: True for Pending or Approved leave that has not started.
 * Side Effects & Constraints: Pure; does not reserve or restore any balance.
 */
export function CanCancel(status: LeaveStatus, start_date: string, today: string): boolean {
  if (status === "Pending") return true;
  if (status === "Approved") return today <= DayBefore(start_date);
  return false;
}

/**
 * Summary: Explain why an application cannot be cancelled.
 * Parameters: status is supported; start_date/today are non-null ISO dates.
 * Return Value: Null if cancellation is allowed; otherwise a user-facing refusal.
 * Side Effects & Constraints: Pure; delegates eligibility to CanCancel.
 */
export function CancelRefusal(status: LeaveStatus, start_date: string, today: string): string | null {
  if (CanCancel(status, start_date, today)) return null;
  if (status === "Approved") {
    return "Approved leave can be cancelled only up to the day before it starts.";
  }
  return "This application can no longer be cancelled.";
}

/**
 * Summary: Provide the status written after a permitted cancellation.
 * Parameters: None; the caller must check cancellation eligibility separately.
 * Return Value: The literal Cancelled status.
 * Side Effects & Constraints: Pure; does not persist a transition.
 */
export function NextStatusAfterCancel(): "Cancelled" {
  return "Cancelled";
}

/**
 * Summary: Resolve a pending application to its requested final decision.
 * Parameters: status is a supported status; decision is approve or disapprove.
 * Return Value: Decision metadata when Pending, otherwise an error result.
 * Side Effects & Constraints: Pure; persistence and revision checks belong to the caller.
 */
export function Decide(
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
