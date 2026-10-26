import { LEAVE_LABEL } from "./constants";
import type { LeaveType } from "./types";

export function decisionMessage(
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  days: number,
  kind: "approved" | "disapproved",
): string {
  const length = days === 1 ? "1 day" : `${days} days`;
  const verb = kind === "approved" ? "approved" : "disapproved";
  return `${LEAVE_LABEL[leaveType]} from ${startDate} to ${endDate} (${length}) was ${verb}.`;
}
