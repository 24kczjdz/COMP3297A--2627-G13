import { kLeaveLabel } from "../shared/constants";
import type { LeaveType } from "../shared/types";

/**
 * Summary: Return the shared presentation class for a leave type.
 * Parameters: leave_type must be the non-null "annual" or "sick" value.
 * Return Value: A class using the corresponding application-wide color token.
 * Side Effects & Constraints: Pure; does not change leave rules or stored values.
 */
export function GetLeaveTypeClass(leave_type: LeaveType): string {
  return leave_type === "annual" ? "leave-type-annual" : "leave-type-sick";
}

/**
 * Summary: Display a leave type's existing label in its shared identifying color.
 * Parameters: leave_type is "annual" or "sick"; className optionally adds styling.
 * Return Value: A text span that retains the readable label as well as its color.
 * Side Effects & Constraints: Render-only; does not alter application data or rules.
 */
export function LeaveTypeLabel({ leave_type, className: class_name = "" }: { leave_type: LeaveType; className?: string }) {
  return <span className={`${GetLeaveTypeClass(leave_type)} ${class_name}`}>{kLeaveLabel[leave_type]}</span>;
}

/**
 * Summary: Color leave-type labels within existing notification text.
 * Parameters: text is the complete, non-null message and may contain no labels.
 * Return Value: The unchanged text content with recognized labels wrapped in spans.
 * Side Effects & Constraints: Render-only; never parses HTML or changes stored messages.
 */
export function LeaveTypeText({ text }: { text: string }) {
  return <>{text.split(/(Annual leave|Sick leave)/g).map((part, index) => {
    if (part === kLeaveLabel.annual || part === kLeaveLabel.sick) {
      return <LeaveTypeLabel key={index} leave_type={part === kLeaveLabel.annual ? "annual" : "sick"} />;
    }
    return part;
  })}</>;
}
