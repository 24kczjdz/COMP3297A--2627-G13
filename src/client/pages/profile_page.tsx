import { FormatLongDate } from "../../shared/dates";
import type { LeaveType, Me } from "../../shared/types";
import { PageTitle } from "../components";
import { useTitle } from "../use_title";
import { GetLeaveTypeClass } from "../leave_type_label";

/**
 * Summary: Display personal information, yearly entitlements, and live balances.
 * Parameters: me is the authenticated non-null account summary from /api/me.
 * Return Value: The read-only profile with remaining balances explicitly labelled.
 * Side Effects & Constraints: Sets the document title; never modifies account data.
 */
export function Profile({ me }: { me: Me }) {
  useTitle("Profile");
  const rows: Array<[string, string, LeaveType?]> = [
    ["Email", me.email],
    ["Name", me.name],
    ["Staff ID", me.staffCode],
    ["Birthday", FormatLongDate(me.birthday)],
    ["Department", me.department],
    ["Year joined", String(me.yearJoined)],
    [`Annual leave quota (${me.quotaYear})`, `${me.quota.annual.entitlement} days`, "annual"],
    [`Annual leave remaining (${me.quotaYear})`, `${me.quota.annual.remaining} days`, "annual"],
    [`Sick leave quota (${me.quotaYear})`, `${me.quota.sick.entitlement} days`, "sick"],
    [`Sick leave remaining (${me.quotaYear})`, `${me.quota.sick.remaining} days`, "sick"],
  ];
  return (
    <div>
      <PageTitle
        title="Your profile"
        lede="These details are read-only here. The approver updates them. Your password is never shown on this page."
      />
      <dl className="max-w-xl divide-y divide-rule rounded-lg border border-rule bg-card">
        {rows.map(([label, value, leave_type]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className={`text-sm ${leave_type ? GetLeaveTypeClass(leave_type) : "text-stone-500"}`}>{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
