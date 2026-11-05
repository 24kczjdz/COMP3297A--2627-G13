import { useCallback, useEffect, useState } from "react";
import { formatLongDate } from "../../shared/dates";
import type { LeaveRecord } from "../../shared/types";
import { ApiError, decideApplication, getPending } from "../api";
import { daysLabel, EmptyNote, ErrorNote, Field, leaveLabel, LoadingNote, PageTitle, PrimaryButton, DangerButton, StatusBadge, TextArea } from "../components";
import { useTitle } from "../useTitle";
import { useAuth } from "../auth";

export function Pending() {
  useTitle("Pending");
  const { refresh } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [records, setRecords] = useState<LeaveRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

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

  async function decide(record: LeaveRecord, decision: "approve" | "disapprove") {
    setBusyId(record.id);
    setError(null);
    try {
      await decideApplication(record.id, record.revision, decision, comments[record.id] ?? "");
      await Promise.all([load(), refresh()]);
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
        lede="Requests are sorted by start date. A comment is required for leave longer than 4 days. Each decision is posted to the applicant."
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
            <p className="mt-3 whitespace-pre-wrap text-sm">{record.reason}</p>
            <div className="mt-3">
              <Field label={`Comment (${record.dayCount > 4 ? "required" : "optional"})`}>
                <TextArea maxLength={1000} value={comments[record.id] ?? ""}
                  onChange={(event) => setComments((previous) => ({ ...previous, [record.id]: event.target.value }))} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton type="button" disabled={busyId === record.id} onClick={() => void decide(record, "approve")}>
                Approve
              </PrimaryButton>
              <DangerButton type="button" disabled={busyId === record.id} onClick={() => void decide(record, "disapprove")}>
                Disapprove
              </DangerButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
