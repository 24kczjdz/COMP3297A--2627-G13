import { kLeaveLabel } from "./constants";
import type { LeaveType } from "./types";

/**
 * Summary: Build the plain-text notification for a leave decision.
 * Parameters: leave_type is annual or sick; start_date/end_date are valid ISO dates;
 * days is a positive inclusive count; kind is approved or disapproved. None is null.
 * Return Value: A complete decision sentence with singular/plural day wording.
 * Side Effects & Constraints: Pure; does not send or persist the notification.
 */
export function DecisionMessage(
  leave_type: LeaveType,
  start_date: string,
  end_date: string,
  days: number,
  kind: "approved" | "disapproved",
): string {
  const length = days === 1 ? "1 day" : `${days} days`;
  const verb = kind === "approved" ? "approved" : "disapproved";
  return `${kLeaveLabel[leave_type]} from ${start_date} to ${end_date} (${length}) was ${verb}.`;
}
