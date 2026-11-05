import { useCallback, useEffect, useState } from "react";
import { FormatLongDate } from "../../shared/dates";
import type { LeaveRecord } from "../../shared/types";
import { ApiError, DecideApplication, GetPending } from "../api";
import { DaysLabel, EmptyNote, ErrorNote, Field, LoadingNote, PageTitle, PrimaryButton, DangerButton, SelectInput, StatusBadge, TextArea } from "../components";
import { useTitle } from "../use_title";
import { useAuth } from "../auth";
import { LeaveTypeLabel } from "../leave_type_label";

/**
 * Summary: Display the approver queue and decision controls.
 * Parameters: None; requires the approver route and authentication provider.
 * Return Value: The pending count, sortable list, and loading/error feedback.
 * Side Effects & Constraints: Loads pending requests, stores draft comments, and submits
 * user-selected decisions.
 */
export function Pending() {
  useTitle("Pending");
  const { refresh: Refresh } = useAuth();
  const [count, SetCount] = useState<number | null>(null);
  const [records, SetRecords] = useState<LeaveRecord[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [busy_id, SetBusyId] = useState<string | null>(null);
  const [comments, SetComments] = useState<Record<string, string>>({});
  const [sort_order, SetSortOrder] = useState<"asc" | "desc">("asc");

  const sorted_records = records?.slice().sort((left, right) => {
    const date_order = left.startDate.localeCompare(right.startDate);
    if (date_order !== 0) return sort_order === "asc" ? date_order : -date_order;
    return left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id);
  });

  /**
   * Summary: Refresh the pending request list and waiting count.
   * Parameters: None.
   * Return Value: Resolves after replacing the queue or displaying an error.
   * Side Effects & Constraints: Sends an approver-only GET and updates local queue/count/error state.
   */
  const Load = useCallback(async () => {
    SetError(null);
    try {
      const result = await GetPending();
      SetCount(result.count);
      SetRecords(result.applications);
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "Pending applications could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void Load();
  }, [Load]);

  /**
   * Summary: Submit a decision for the displayed request revision.
   * Parameters: record is the non-null displayed request; decision is approve or disapprove.
   * Return Value: Resolves after refreshing the queue/profile or displaying an error.
   * Side Effects & Constraints: Writes the decision with its draft comment; the server rejects stale
   * revisions.
   */
  async function Decide(record: LeaveRecord, decision: "approve" | "disapprove") {
    SetBusyId(record.id);
    SetError(null);
    try {
      await DecideApplication(record.id, record.revision, decision, comments[record.id] ?? "");
      await Promise.all([Load(), Refresh()]);
    } catch (caught) {
      SetError(caught instanceof ApiError ? caught.message : "That decision could not be saved.");
    } finally {
      SetBusyId(null);
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
          <span className="font-serif text-5xl font-bold text-amber-700">{count}</span>{" "}
          {count === 1 ? "application is waiting" : "applications are waiting"}
        </p>
      ) : null}
      <div className="mb-4 max-w-xs">
        <Field label="Sort by start date">
          <SelectInput value={sort_order} onChange={(event) => SetSortOrder(event.target.value === "desc" ? "desc" : "asc")}>
            <option value="asc">Earliest start first</option>
            <option value="desc">Latest start first</option>
          </SelectInput>
        </Field>
      </div>
      {error ? <div className="mb-4"><ErrorNote message={error} on_retry={() => void Load()} /></div> : null}
      {records === null && !error ? <LoadingNote label="Loading the queue…" /> : null}
      {records && records.length === 0 ? (
        <EmptyNote title="The queue is clear" body="Nothing is waiting for a decision." />
      ) : null}
      <ul className="space-y-3">
        {sorted_records?.map((record) => (
          <li key={record.id} className="rounded-lg border border-rule bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {record.applicantName} <span className="font-normal text-stone-500">{record.applicantStaffCode}</span>
                </p>
                <p className="mt-1 text-sm">
                  <LeaveTypeLabel leave_type={record.leaveType} className="font-semibold" /> · {DaysLabel(record.dayCount)}
                </p>
                <p className="text-sm text-stone-700">
                  {FormatLongDate(record.startDate)} – {FormatLongDate(record.endDate)}
                </p>
              </div>
              <StatusBadge status={record.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{record.reason}</p>
            <div className="mt-3">
              <Field label={`Comment (${record.dayCount > 4 ? "required" : "optional"})`}>
                <TextArea maxLength={1000} value={comments[record.id] ?? ""}
                  onChange={(event) => SetComments((previous) => ({ ...previous, [record.id]: event.target.value }))} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PrimaryButton type="button" disabled={busy_id === record.id} onClick={() => void Decide(record, "approve")}>
                Approve
              </PrimaryButton>
              <DangerButton type="button" disabled={busy_id === record.id} onClick={() => void Decide(record, "disapprove")}>
                Disapprove
              </DangerButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
