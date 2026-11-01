import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import type { Me, QuotaSide } from "../../shared/types";
import { PageTitle } from "../components";

export function Home({ me }: { me: Me }) {
  useTitle("Home");
  return (
    <div>
      <PageTitle title={`Hello, ${me.name}`} lede={`Your ${me.quotaYear} leave balance. Pending and approved requests reserve days in each calendar year.`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaCard label="Annual leave" quota={me.quota.annual} />
        <QuotaCard label="Sick leave" quota={me.quota.sick} />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/applications/new" className="rounded-md bg-forest px-4 py-2 font-medium text-white">
          New request
        </Link>
        <Link to="/applications" className="rounded-md border border-rule bg-card px-4 py-2 font-medium">
          My leave
        </Link>
        <Link to="/notifications" className="rounded-md border border-rule bg-card px-4 py-2 font-medium">
          Notices{me.unreadNotifications > 0 ? ` (${me.unreadNotifications})` : ""}
        </Link>
      </div>
      {me.role === "approver" ? (
        <section className="mt-10 rounded-lg border border-rule bg-card p-5">
          <h2 className="font-serif text-2xl">Approver desk</h2>
          <p className="mt-1 text-sm text-stone-700">
            {me.pendingCount === 1 ? "1 application is waiting." : `${me.pendingCount ?? 0} applications are waiting.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
            <Link to="/approver/pending" className="underline">
              Review pending
            </Link>
            <Link to="/approver/staff" className="underline">
              Staff accounts
            </Link>
            <Link to="/approver/on-date" className="underline">
              Leave on a date
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QuotaCard({ label, quota }: { label: string; quota: QuotaSide }) {
  return (
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="font-serif text-2xl">{label}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-500">Entitlement</dt>
          <dd className="mt-1 font-serif text-3xl">{quota.entitlement}</dd>
          <p className="text-xs text-stone-600">whole days</p>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-500">Remaining</dt>
          <dd className="mt-1 font-serif text-3xl">{quota.remaining}</dd>
          <p className="text-xs text-stone-600">whole days</p>
        </div>
        <div><dt className="text-sm text-stone-500">Pending</dt><dd>{quota.pending} days</dd></div>
        <div><dt className="text-sm text-stone-500">Approved</dt><dd>{quota.spent} days</dd></div>
        <div className="col-span-2"><dt className="text-sm text-stone-500">Taken this year (approved days through today)</dt><dd>{quota.taken} days</dd></div>
      </dl>
    </section>
  );
}
