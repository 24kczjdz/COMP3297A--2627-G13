import { formatLongDate } from "../../shared/dates";
import type { Me } from "../../shared/types";
import { PageTitle } from "../components";
import { useTitle } from "../useTitle";

export function Profile({ me }: { me: Me }) {
  useTitle("Profile");
  const rows = [
    ["Email", me.email],
    ["Name", me.name],
    ["Staff ID", me.staffCode],
    ["Birthday", formatLongDate(me.birthday)],
    ["Department", me.department],
    ["Year joined", String(me.yearJoined)],
  ];
  return (
    <div>
      <PageTitle
        title="Your profile"
        lede="These details are read-only here. The approver updates them. Your password is never shown on this page."
      />
      <dl className="max-w-xl divide-y divide-rule rounded-lg border border-rule bg-card">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-stone-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
