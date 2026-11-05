import { kLeaveEntitlements } from "../shared/leave_rules";
import type { LeaveType, Me, QuotaSide } from "../shared/types";

type LeaveSummaryRow = {
  leave_type: LeaveType;
  entitlement: number;
  pending_days: number;
  approved_days: number;
  taken_days: number;
  remaining: number;
};

// Use the request's reporting date throughout, including when SQL runs after midnight.
// The two entitlement rows exist independently of the database clock and history.
const kLeaveSummarySql = `
  WITH report AS (SELECT ? AS staff_id, ? AS today),
  types AS (
    SELECT 'annual' AS leave_type, ? AS entitlement
    UNION ALL SELECT 'sick', ?
  )
  SELECT t.leave_type, t.entitlement,
    COALESCE(SUM(CASE WHEN a.status = 'Pending' THEN a.day_count ELSE 0 END), 0) AS pending_days,
    COALESCE(SUM(CASE WHEN a.status = 'Approved' THEN a.day_count ELSE 0 END), 0) AS approved_days,
    COALESCE(SUM(CASE WHEN a.status = 'Approved' AND a.segment_start <= r.today THEN
      CAST(julianday(min(a.segment_end, r.today)) - julianday(a.segment_start) + 1 AS INTEGER)
      ELSE 0 END), 0) AS taken_days,
    t.entitlement - COALESCE(SUM(CASE WHEN a.status IN ('Pending', 'Approved')
      THEN a.day_count ELSE 0 END), 0) AS remaining
  FROM report r CROSS JOIN types t
  LEFT JOIN leave_application_year a ON a.applicant_id = r.staff_id
    AND a.calendar_year = CAST(substr(r.today, 1, 4) AS INTEGER)
    AND a.leave_type = t.leave_type
  GROUP BY t.leave_type, t.entitlement
`;

/**
 * Summary: Read annual and sick quota summaries for one captured reporting date.
 * Parameters: db is a non-null D1 binding; staff_id identifies the authenticated
 * account; today is its trusted Hong Kong YYYY-MM-DD date. None may be null.
 * Return Value: Current-year quota fields in the existing API shape; D1 errors
 * propagate, and missing summary rows throw rather than inventing balances.
 * Side Effects & Constraints: One read-only query over derived yearly intervals;
 * no stored counters change. Pending/Approved days reserve quota for the whole
 * year, while taken days include only Approved dates through today, inclusive.
 */
export async function ReadLeaveSummary(db: D1Database, staff_id: string, today: string): Promise<Me["quota"]> {
  const summary = await db.prepare(kLeaveSummarySql)
    .bind(staff_id, today, kLeaveEntitlements.annual, kLeaveEntitlements.sick)
    .all<LeaveSummaryRow>();

  /**
   * Summary: Project one summary row into the established public quota fields.
   * Parameters: leave_type is annual or sick and must have one returned row.
   * Return Value: Its quota fields; a missing row throws Error.
   * Side Effects & Constraints: Reads the enclosing result without further I/O.
   */
  function BuildQuotaSide(leave_type: LeaveType): QuotaSide {
    const row = summary.results.find((item) => item.leave_type === leave_type);
    if (!row) throw new Error("Missing leave summary; apply database migrations.");
    return {
      entitlement: row.entitlement,
      spent: row.approved_days,
      pending: row.pending_days,
      taken: row.taken_days,
      remaining: row.remaining,
    };
  }

  return { annual: BuildQuotaSide("annual"), sick: BuildQuotaSide("sick") };
}
