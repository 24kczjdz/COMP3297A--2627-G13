import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../use_title";
import type { LeaveRecord, LeaveType, Me, QuotaSide } from "../../shared/types";
import { EmptyNote, ErrorNote, LeaveList, LoadingNote, PageTitle } from "../components";
import { ApiError, GetApplications } from "../api";
import { LeaveTypeLabel } from "../leave_type_label";

/**
 * Summary: Show current-year annual/sick quotas, usage, remaining days, and history.
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
        <QuotaCard leave_type="annual" quota={me.quota.annual} />
        <QuotaCard leave_type="sick" quota={me.quota.sick} />
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
          <p className="mt-3 flex flex-wrap items-baseline gap-3 text-lg text-stone-700"
            aria-label={me.pendingCount === 1 ? "1 application is waiting." : `${me.pendingCount ?? 0} applications are waiting.`}>
            <span className="font-serif text-5xl font-bold leading-none text-amber-700">{me.pendingCount ?? 0}</span>{" "}
            <span>{me.pendingCount === 1 ? "application is waiting." : "applications are waiting."}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
            <Link to="/approver/pending" className="underline">
              Review pending
            </Link>
            <Link to="/approver/staff" className="underline">
              Staff accounts
            </Link>
            <Link to="/approver/archive" className="underline">
              Archive
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
  /**
   * Summary: Retry loading the dashboard history.
   * Parameters: None.
   * Return Value: None.
   * Side Effects & Constraints: Increments the reload counter, causing the history effect to request
   * fresh records.
   */
  const Retry = useCallback(() => SetReloadIndex((index) => index + 1), []);

  useEffect(() => {
    let active = true;
    SetError(null);
    GetApplications()
      .then((result) => { if (active) SetRecords(result.applications); })
      .catch((caught: unknown) => {
        if (active) SetError(caught instanceof ApiError ? caught.message : "Your leave history could not be loaded.");
      });
    return () => { active = false; };
  }, [reload_index]);

  return (
    <section className="mt-8" aria-label="Leave history">
      <h2 className="mb-4 font-serif text-2xl">Leave history</h2>
      {error ? <ErrorNote message={error} on_retry={Retry} /> : null}
      {records === null && !error ? <LoadingNote label="Loading your leave history…" /> : null}
      {records?.length === 0 ? <EmptyNote title="No requests yet" body="Your leave requests and their statuses will appear here." /> : null}
      {records && records.length > 0 ? <LeaveList records={records} today={today} /> : null}
    </section>
  );
}

/**
 * Summary: Display a leave type's entitlement, remaining balance, and used quota.
 * Parameters: leave_type is "annual" or "sick"; quota is the non-null current-year SQL summary.
 * Return Value: A quota card whose usage includes pending and approved dates in the year,
 * including future dates. Used plus remaining equals that type's entitlement.
 * Side Effects & Constraints: Render-only; usage is derived from entitlement minus
 * remaining from the same summary. Does not mutate balances or persist a usage counter.
 */
function QuotaCard({ leave_type, quota }: { leave_type: LeaveType; quota: QuotaSide }) {
  const displayed_days = quota.entitlement - quota.remaining;
  return (
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="font-serif text-2xl"><LeaveTypeLabel leave_type={leave_type} /></h2>
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
        <div className="col-span-2">
          <dt className="text-sm text-stone-500">
            Quota used this year (pending and approved)
          </dt>
          <dd>{displayed_days} days</dd>
        </div>
      </dl>
    </section>
  );
}
