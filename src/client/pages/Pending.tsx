import { useCallback, useEffect, useState } from "react";
import { formatLongDate } from "../../shared/dates";
import type { LeaveRecord } from "../../shared/types";
import { ApiError, decideApplication, getPending } from "../api";
import { daysLabel, EmptyNote, ErrorNote, leaveLabel, LoadingNote, PageTitle, PrimaryButton, DangerButton, StatusBadge } from "../components";
import { useTitle } from "../useTitle";

export function Pending() {
  useTitle("Pending");
  const [count, setCount] = useState<number | null>(null);
  const [records, setRecords] = useState<LeaveRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getPending();
      setCount(result.count);
      setRecords(result.applications);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Pending applications could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "disapprove") {
    setBusyId(id);
    setError(null);
    try {
      await decideApplication(id, decision);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That decision could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageTitle
        title="Pending applications"
        lede="Approve or disapprove only requests that are still pending. Each decision is archived and posted to the applicant."
      />
      {count !== null ? (
        <p className="mb-4 text-lg text-stone-700">
          <span className="font-serif text-4xl text-ink">{count}</span>{" "}
          {count === 1 ? "application is waiting" : "applications are waiting"}
        </p>
      ) : null}
      {error ? <div className="mb-4"><ErrorNote message={error} onRetry={() => void load()} /></div> : null}
      {records === null && !error ? <LoadingNote label="Loading the queue…" /> : null}
      {records && records.length === 0 ? (
        <EmptyNote title="The queue is clear" body="Nothing is waiting for a decision." />
      ) : null}
      <ul className="space-y-3">
        {records?.map((record) => (
          <li key={record.id} className="rounded-lg border border-rule bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {record.applicantName} <span className="font-normal text-stone-500">{record.applicantStaffCode}</span>
                </p>
                <p className="mt-1 text-sm">
                  {leaveLabel(record.leaveType)} · {daysLabel(record.dayCount)}
                </p>
                <p className="text-sm text-stone-700">
                  {formatLongDate(record.startDate)} – {formatLongDate(record.endDate)}
                </p>
              </div>
              <StatusBadge status={record.status} />
            </div>
            <p className="mt-3 text-sm">{record.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton type="button" disabled={busyId === record.id} onClick={() => void decide(record.id, "approve")}>
                Approve
              </PrimaryButton>
              <DangerButton type="button" disabled={busyId === record.id} onClick={() => void decide(record.id, "disapprove")}>
                Disapprove
              </DangerButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
