import { useEffect, useState, type FormEvent } from "react";
import { FormatLongDate, HongKongToday } from "../../shared/dates";
import type { LeaveRecord } from "../../shared/types";
import { ApiError, GetArchive, GetOnDate } from "../api";
import { EmptyNote, ErrorNote, LeaveList, LoadingNote, PageTitle, PrimaryButton, QuietButton, TextInput } from "../components";
import { LeaveTypeChart } from "../leave_type_chart";
import { useTitle } from "../use_title";

export const kDateSearchHint = "The search matches the days a person is away, from the start date through the end date. The day they submitted the form is ignored.";

/**
 * Summary: Browse the complete archive or applications covering a selected date.
 * Parameters: None; this page is mounted inside the authenticated approver route.
 * Return Value: A date search, a current-year type chart, and read-only records.
 * Side Effects & Constraints: Fetches reports and sets the document title. Cleanup
 * ignores stale responses; selecting a date alone never changes the current report.
 */
export function Archive() {
  useTitle("Archive");
  const [input_date, SetInputDate] = useState("");
  const [query, SetQuery] = useState<{ date: string | null; revision: number }>({ date: null, revision: 0 });
  const [records, SetRecords] = useState<LeaveRecord[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [loading, SetLoading] = useState(true);
  const [show_cancelled, SetShowCancelled] = useState(false);

  useEffect(() => {
    let active = true;
    const request = query.date === null ? GetArchive() : GetOnDate(query.date);
    request.then((result) => {
      if (active) SetRecords(result.applications);
    }).catch((caught: unknown) => {
      if (active) SetError(caught instanceof ApiError ? caught.message : "The leave records could not be loaded.");
    }).finally(() => {
      if (active) SetLoading(false);
    });
    return () => { active = false; };
  }, [query]);

  /**
   * Summary: Select or retry a report and clear the previous report while loading.
   * Parameters: date is a valid ISO date for a date search, or null for See All.
   * Return Value: None; the query effect obtains both the list and chart data.
   * Side Effects & Constraints: Updates local state only; it never edits applications.
   */
  function ShowReport(date: string | null) {
    SetRecords(null);
    SetError(null);
    SetLoading(true);
    SetQuery((previous) => ({ date, revision: previous.revision + 1 }));
  }

  /**
   * Summary: Search the submitted leave date after native required-date validation.
   * Parameters: event is the non-null form submission event.
   * Return Value: None; the result is displayed asynchronously by the query effect.
   * Side Effects & Constraints: Prevents browser navigation; the server validates dates.
   */
  function OnSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ShowReport(input_date);
  }

  const today = HongKongToday();
  const current_year = Number(today.slice(0, 4));
  const scope = query.date === null ? "All applications" : `Leave on ${FormatLongDate(query.date)}`;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageTitle title="Archive" />
        <form onSubmit={OnSearch} className="flex flex-wrap items-end gap-2">
          <div className="group relative min-w-44 flex-1 sm:flex-none">
            <label htmlFor="archive-date" className="mb-1 block text-sm font-medium">Leave on a date</label>
            <TextInput id="archive-date" type="date" required value={input_date}
              title={kDateSearchHint} aria-describedby="archive-date-hint"
              onChange={(event) => SetInputDate(event.target.value)} />
            <p id="archive-date-hint" role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-md bg-ink px-3 py-2 text-sm text-white shadow-lg group-hover:block group-focus-within:block">
              {kDateSearchHint}
            </p>
          </div>
          <PrimaryButton type="submit" disabled={loading}>Search date</PrimaryButton>
          <QuietButton type="button" onClick={() => { SetInputDate(""); ShowReport(null); }}>See All</QuietButton>
        </form>
      </div>
      <div className="mb-5" aria-live="polite">
        <h2 className="font-serif text-2xl">{scope}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {query.date === null
            ? "Pending, approved, disapproved and cancelled applications across all dates."
            : "Applications covering this date, including pending requests."}
        </p>
      </div>
      {error ? <ErrorNote message={error} on_retry={() => ShowReport(query.date)} /> : null}
      {loading ? <LoadingNote label="Loading leave records…" /> : null}
      {records !== null ? (
        <div className="grid items-start gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
          <LeaveTypeChart records={records} scope={scope} current_year={current_year} show_cancelled={show_cancelled}
            on_show_cancelled_change={SetShowCancelled} />
          <section aria-label="Leave records" className="min-w-0">
            <p className="mb-3 text-sm text-stone-600" role="status">
              {records.length} {records.length === 1 ? "application" : "applications"}
            </p>
            {records.length === 0 ? (
              <EmptyNote title={query.date === null ? "No applications" : "No leave covers this date"}
                body={query.date === null ? "Leave requests in every status will appear here." : `Nothing on record includes ${FormatLongDate(query.date)}.`} />
            ) : <LeaveList records={records} today={today} />}
          </section>
        </div>
      ) : null}
    </div>
  );
}
