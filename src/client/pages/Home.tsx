import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../useTitle";
import type { LeaveRecord, Me, QuotaSide } from "../../shared/types";
import { EmptyNote, ErrorNote, LeaveList, LoadingNote, PageTitle } from "../components";
import { ApiError, getApplications } from "../api";

/**
 * Summary: Show current-year quotas, remaining balances, taken days, and history.
 * Parameters: me is the authenticated, non-null profile refreshed by the app frame.
 * Return Value: The staff dashboard with an additional pending count for approvers.
 * Side Effects & Constraints: Sets the document title; LeaveHistory loads own records.
 */
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
      <LeaveHistory key={me.id} today={me.hongKongToday} />
    </div>
  );
}

/**
 * Summary: Display the applicant's complete leave history and corresponding statuses.
 * Parameters: today is the current Hong Kong ISO date, never null.
 * Return Value: Existing leave cards, or an explicit loading, empty, or retry state.
 * Side Effects & Constraints: Fetches only /api/applications (server ownership scoped).
 * A cleanup guard prevents stale responses from updating an unmounted dashboard.
 */
function LeaveHistory({ today }: { today: string }) {
  const [records, SetRecords] = useState<LeaveRecord[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [reload_index, SetReloadIndex] = useState(0);
  const Retry = useCallback(() => SetReloadIndex((index) => index + 1), []);

  useEffect(() => {
    let active = true;
    SetError(null);
    getApplications()
      .then((result) => { if (active) SetRecords(result.applications); })
      .catch((caught: unknown) => {
        if (active) SetError(caught instanceof ApiError ? caught.message : "Your leave history could not be loaded.");
      });
    return () => { active = false; };
  }, [reload_index]);

  return (
    <section className="mt-8" aria-label="Leave history">
      <h2 className="mb-4 font-serif text-2xl">Leave history</h2>
      {error ? <ErrorNote message={error} onRetry={Retry} /> : null}
      {records === null && !error ? <LoadingNote label="Loading your leave history…" /> : null}
      {records?.length === 0 ? <EmptyNote title="No requests yet" body="Your leave requests and their statuses will appear here." /> : null}
      {records && records.length > 0 ? <LeaveList records={records} today={today} /> : null}
    </section>
  );
}

/**
 * Summary: Display entitlement and remaining days as distinct quota values.
 * Parameters: label names the leave type; quota is the non-null current-year SQL summary.
 * Return Value: A quota card including approved days taken through today.
 * Side Effects & Constraints: Render-only; does not calculate or mutate balances.
 */
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
        <div className="col-span-2"><dt className="text-sm text-stone-500">Taken this year (approved days through today)</dt><dd>{quota.taken} days</dd></div>
      </dl>
    </section>
  );
}
