import { useState, type FormEvent } from "react";
import { formatLongDate } from "../../shared/dates";
import type { LeaveRecord } from "../../shared/types";
import { ApiError, getOnDate } from "../api";
import { daysLabel, EmptyNote, ErrorNote, leaveLabel, PageTitle, PrimaryButton, StatusBadge, TextInput } from "../components";
import { useTitle } from "../useTitle";

export function OnDate() {
  useTitle("Leave on a date");
  const [date, setDate] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [records, setRecords] = useState<LeaveRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await getOnDate(date);
      setSearched(result.date);
      setRecords(result.applications);
    } catch (caught) {
      setRecords(null);
      setError(caught instanceof ApiError ? caught.message : "That date could not be searched.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageTitle
        title="Leave on a date"
        lede="The search matches the days a person is away, from the start date through the end date. The day they submitted the form is ignored."
      />
      <form onSubmit={onSubmit} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <TextInput type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Searching…" : "Show who is away"}
        </PrimaryButton>
      </form>
      {error ? <ErrorNote message={error} /> : null}
      {!searched && !error ? (
        <EmptyNote title="Choose a date" body="You will see every staff application whose leave covers that day, with its status." />
      ) : null}
      {searched && records && records.length === 0 ? (
        <EmptyNote title="No leave covers this date" body={`Nothing on record includes ${formatLongDate(searched)}.`} />
      ) : null}
      {records && records.length > 0 ? (
        <ul className="space-y-3">
          {records.map((record) => (
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
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
