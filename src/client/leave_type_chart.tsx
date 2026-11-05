import type { LeaveRecord } from "../shared/types";
import { LeaveTypeLabel } from "./leave_type_label";

/**
 * Summary: Display the current year's annual/sick split, optionally including cancellations.
 * Parameters: records is a non-null report array; scope is its non-null date label.
 * current_year is the current Hong Kong calendar year as a four-digit integer.
 * show_cancelled includes cancelled records when true; on_show_cancelled_change
 * is a non-null callback receiving the checkbox's next boolean value.
 * Return Value: An accessible pie chart with exact counts, percentages and total.
 * Side Effects & Constraints: Invokes the callback on input; never changes records
 * or the list. O(n); counts each application overlapping the year once, including
 * cross-year leave, regardless of submission date. An empty included set renders
 * zero counts without pie slices.
 */
export function LeaveTypeChart({ records, scope, current_year, show_cancelled, on_show_cancelled_change: OnShowCancelledChange }: {
  records: LeaveRecord[];
  scope: string;
  current_year: number;
  show_cancelled: boolean;
  on_show_cancelled_change: (checked: boolean) => void;
}) {
  const year_start = `${current_year}-01-01`;
  const year_end = `${current_year}-12-31`;
  const included_records = records.filter((record) =>
    record.startDate <= year_end && record.endDate >= year_start &&
    (show_cancelled || record.status !== "Cancelled"));
  const annual_count = included_records.filter((record) => record.leaveType === "annual").length;
  const total = included_records.length;
  const sick_count = total - annual_count;
  const annual_percent = total === 0 ? 0 : annual_count / total * 100;
  const sick_percent = total === 0 ? 0 : 100 - annual_percent;
  const angle = annual_percent / 100 * Math.PI * 2;
  const end_x = 100 + 80 * Math.sin(angle);
  const end_y = 100 - 80 * Math.cos(angle);
  const annual_slice = `M 100 100 L 100 20 A 80 80 0 ${annual_percent > 50 ? 1 : 0} 1 ${end_x} ${end_y} Z`;
  const annual_label = `${annual_count} ${annual_count === 1 ? "application" : "applications"}`;
  const sick_label = `${sick_count} ${sick_count === 1 ? "application" : "applications"}`;
  const description = `${scope}, leave dates overlapping ${current_year}, cancelled applications ${show_cancelled ? "included" : "excluded"}: Annual leave ${annual_label} (${annual_percent.toFixed(1)}%), Sick leave ${sick_label} (${sick_percent.toFixed(1)}%).`;

  return (
    <figure className="rounded-lg border border-rule bg-card p-5" aria-label="Leave type breakdown">
      <figcaption className="font-serif text-xl">Leave types</figcaption>
      <p className="mt-1 text-xs text-stone-600">Applications in {current_year}</p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-forest" checked={show_cancelled}
          onChange={(event) => OnShowCancelledChange(event.target.checked)} />
        Show cancelled
      </label>
      <svg viewBox="0 0 200 200" className="mx-auto my-2 w-full max-w-52" role="img" aria-label={description}>
        <title>{description}</title>
        <circle cx="100" cy="100" r="80"
          fill={total === 0 ? "#e7e5e4" : annual_count === total ? "var(--leave-annual-color)" : "var(--leave-sick-color)"} />
        {annual_count > 0 && sick_count > 0 ? <path d={annual_slice} fill="var(--leave-annual-color)" /> : null}
        {total === 0 ? <text x="100" y="105" textAnchor="middle" fill="#57534e" fontSize="16">No records</text> : null}
      </svg>
      <dl className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <dt><LeaveTypeLabel leave_type="annual" /></dt>
          <dd className="text-right"><strong>{annual_count}</strong><span className="block text-xs text-stone-600">{annual_percent.toFixed(1)}%</span></dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt><LeaveTypeLabel leave_type="sick" /></dt>
          <dd className="text-right"><strong>{sick_count}</strong><span className="block text-xs text-stone-600">{sick_percent.toFixed(1)}%</span></dd>
        </div>
        <div className="flex justify-between border-t border-rule pt-3"><dt>Total</dt><dd className="font-semibold">{total}</dd></div>
      </dl>
    </figure>
  );
}
