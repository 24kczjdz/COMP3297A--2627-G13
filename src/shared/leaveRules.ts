import { dayCount, isIsoDate } from "./dates";
import type { LeaveRecord, LeaveType } from "./types";

export const kLeaveEntitlements = { annual: 18, sick: 14 } as const;
export const kLongLeaveThreshold = 4;
export const kAnnualNoticeDays = 2;
export const kSickBackdateDays = 7;

export type LeavePeriod = { leave_type: LeaveType; start_date: string; end_date: string };
export type YearAllocation = { year: number; days: number };
export type BalancePreview = YearAllocation & { available: number; remaining: number };

/**
 * Summary: Shift a calendar date without depending on the machine's timezone.
 * Parameters: iso_date is a valid ISO date; days is a signed integer offset.
 * Return Value: The shifted ISO date; an unrepresentable result throws RangeError.
 * Side Effects & Constraints: Allocates a Date; does not mutate inputs or state.
 */
export function ShiftDate(iso_date: string, days: number): string {
  const date = new Date(`${iso_date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Summary: Validate a leave period and its submission-time date restrictions.
 * Parameters: period contains ISO dates and a supported type; today is a valid
 * Hong Kong ISO date supplied by the caller. No parameter may be null.
 * Return Value: A user-facing refusal, or null when all date rules pass.
 * Side Effects & Constraints: Pure; server/database checks remain authoritative.
 */
export function ValidateLeaveDates(period: LeavePeriod, today: string): string | null {
  const { leave_type, start_date, end_date } = period;
  if (!isIsoDate(start_date) || !isIsoDate(end_date) || start_date < "1900-01-01" || end_date > "9998-12-31") {
    return "Enter valid start and end dates between 1900 and 9998.";
  }
  if (end_date < start_date) return "The end date is before the start date.";
  if (leave_type === "annual" && start_date < ShiftDate(today, kAnnualNoticeDays)) {
    return "Annual leave must start at least 2 calendar days from today.";
  }
  if (leave_type === "sick" && end_date < ShiftDate(today, -kSickBackdateDays)) {
    return "The last date of sick leave cannot be more than 7 days ago.";
  }
  return null;
}

/**
 * Summary: Split an inclusive leave period into the days charged to each year.
 * Parameters: start_date and end_date are non-null ISO date strings.
 * Return Value: Ascending yearly allocations, or an empty array for invalid dates.
 * Side Effects & Constraints: Pure; allocates one entry per spanned year, bounded
 * to years 1900 through 9998 to match the database's supported range.
 */
export function GetYearAllocations(start_date: string, end_date: string): YearAllocation[] {
  if (!isIsoDate(start_date) || !isIsoDate(end_date) || end_date < start_date ||
      start_date < "1900-01-01" || end_date > "9998-12-31") return [];
  const allocations: YearAllocation[] = [];
  for (let year = Number(start_date.slice(0, 4)); year <= Number(end_date.slice(0, 4)); year++) {
    const segment_start = start_date > `${year}-01-01` ? start_date : `${year}-01-01`;
    const segment_end = end_date < `${year}-12-31` ? end_date : `${year}-12-31`;
    allocations.push({ year, days: dayCount(segment_start, segment_end) });
  }
  return allocations;
}

/**
 * Summary: Preview yearly balances after replacing or adding a pending request.
 * Parameters: period is the proposed range/type; records contains only the signed-in
 * applicant's history; excluded_id is the edited request ID, or null for new leave.
 * Return Value: Requested, available, and resulting days for each affected year;
 * invalid ranges return []; negative remaining values indicate overbooking.
 * Side Effects & Constraints: Pure; work scales with the sum of request year spans,
 * with one map entry per reserved year. SQL rechecks current balances atomically.
 */
export function GetBalancePreview(
  period: LeavePeriod, records: readonly LeaveRecord[], excluded_id: string | null = null,
): BalancePreview[] {
  const reserved = new Map<number, number>();
  for (const record of records) {
    if (record.id === excluded_id || record.leaveType !== period.leave_type ||
        (record.status !== "Pending" && record.status !== "Approved")) continue;
    for (const allocation of GetYearAllocations(record.startDate, record.endDate)) {
      reserved.set(allocation.year, (reserved.get(allocation.year) ?? 0) + allocation.days);
    }
  }
  return GetYearAllocations(period.start_date, period.end_date).map((allocation) => {
    const available = kLeaveEntitlements[period.leave_type] - (reserved.get(allocation.year) ?? 0);
    return { ...allocation, available, remaining: available - allocation.days };
  });
}

/**
 * Summary: Check the applicant's active overlaps and yearly balance before saving.
 * Parameters: period has validated dates; records is the applicant's non-null
 * history; excluded_id is the edited request ID, or null for a new request.
 * Return Value: A refusal for any inclusive overlap or overdrawn year; otherwise null.
 * Side Effects & Constraints: Pure; pending and approved leave reserve quota.
 * Cancelled/disapproved leave is ignored; SQL repeats checks against live data.
 */
export function ValidateLeaveAvailability(
  period: LeavePeriod, records: readonly LeaveRecord[], excluded_id: string | null = null,
): string | null {
  if (records.some((record) => record.id !== excluded_id &&
      (record.status === "Pending" || record.status === "Approved") &&
      record.startDate <= period.end_date && record.endDate >= period.start_date)) {
    return "This request overlaps your pending or approved leave.";
  }
  if (GetBalancePreview(period, records, excluded_id).some((allocation) => allocation.remaining < 0)) {
    return "This request exceeds your remaining balance in at least one calendar year.";
  }
  return null;
}
