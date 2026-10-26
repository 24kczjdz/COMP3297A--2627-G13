import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import type { Me } from "../../shared/types";
import { PageTitle } from "../components";

export function Home({ me }: { me: Me }) {
  useTitle("Home");
  return (
    <div>
      <PageTitle title={`Hello, ${me.name}`} lede="Your entitlement stays fixed. Days already spent count only leave that is still approved." />
      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaCard label="Annual leave" entitlement={me.quota.annual.entitlement} spent={me.quota.annual.spent} />
        <QuotaCard label="Sick leave" entitlement={me.quota.sick.entitlement} spent={me.quota.sick.spent} />
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

function QuotaCard({ label, entitlement, spent }: { label: string; entitlement: number; spent: number }) {
  return (
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="font-serif text-2xl">{label}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-500">Entitlement</dt>
          <dd className="mt-1 font-serif text-3xl">{entitlement}</dd>
          <p className="text-xs text-stone-600">whole days</p>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-stone-500">Already spent</dt>
          <dd className="mt-1 font-serif text-3xl">{spent}</dd>
          <p className="text-xs text-stone-600">whole days</p>
        </div>
      </dl>
    </section>
  );
}
