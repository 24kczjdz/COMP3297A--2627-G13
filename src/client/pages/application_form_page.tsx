import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DayCount, HongKongToday, IsIsoDate } from "../../shared/dates";
import { kLeaveLabel } from "../../shared/constants";
import { GetBalancePreview, kAnnualNoticeDays, kLongLeaveThreshold, kSickBackdateDays, ShiftDate, ValidateLeaveAvailability } from "../../shared/leave_rules";
import { ValidateLeaveInput } from "../../shared/validate";
import type { LeaveRecord, LeaveType } from "../../shared/types";
import { ApiError, CreateApplication, GetApplication, GetApplications, UpdateApplication } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, Field, LoadingNote, PageTitle, PrimaryButton, SelectInput, TextArea } from "../components";
import { LeaveDateInput } from "../leave_date_input";
import { useTitle } from "../use_title";
import { GetLeaveTypeClass, LeaveTypeLabel } from "../leave_type_label";

/**
 * Summary: Render and validate a new request or a pending request replacement.
 * Parameters: mode is "new" or "edit"; edit mode requires a route application ID.
 * Return Value: The existing form layout with date limits and yearly balance previews.
 * Side Effects & Constraints: Loads the applicant's history, saves through the API,
 * refreshes account balances, and navigates after success. SQL enforces live rules;
 * load/save failures stay visible and never cause an edit to become a new request.
 */
export function ApplicationForm({ mode }: { mode: "new" | "edit" }) {
  useTitle(mode === "new" ? "New request" : "Edit request");
  const { id } = useParams();
  const Navigate = useNavigate();
  const { refresh: Refresh } = useAuth();
  const [leave_type, SetLeaveType] = useState<LeaveType>("annual");
  const [start_date, SetStartDate] = useState("");
  const [end_date, SetEndDate] = useState("");
  const [reason, SetReason] = useState("");
  const [revision, SetRevision] = useState<number | null>(null);
  const [conflicted, SetConflicted] = useState(false);
  const [records, SetRecords] = useState<LeaveRecord[] | null>(null);
  const [error, SetError] = useState<string | null>(null);
  const [locked, SetLocked] = useState<string | null>(null);
  const [loading, SetLoading] = useState(true);
  const [pending, SetPending] = useState(false);
  const [reload_index, SetReloadIndex] = useState(0);

  useEffect(() => {
    let active = true;
    SetLoading(true);
    SetError(null);
    SetLocked(null);
    SetRecords(null);
    SetLeaveType("annual");
    SetStartDate("");
    SetEndDate("");
    SetReason("");
    SetRevision(null);
    SetConflicted(false);
    const existing_request = mode === "edit"
      ? (id ? GetApplication(id) : Promise.reject(new Error("Missing request ID.")))
      : Promise.resolve(null);
    Promise.all([GetApplications(), existing_request])
      .then(([history, record]) => {
        if (!active) return;
        SetRecords(history.applications);
        if (!record) return;
        SetLeaveType(record.leaveType);
        SetStartDate(record.startDate);
        SetEndDate(record.endDate);
        SetReason(record.reason);
        SetRevision(record.revision);
        if (record.status !== "Pending") {
          SetLocked(`This request is ${record.status}. It can be changed only while it is Pending.`);
        }
      })
      .catch((caught: unknown) => {
        if (active) SetError(caught instanceof ApiError ? caught.message : "The request and your balance could not be loaded.");
      })
      .finally(() => {
        if (active) SetLoading(false);
      });
    return () => { active = false; };
  }, [mode, id, reload_index]);

  const today = HongKongToday();
  const minimum_start = leave_type === "annual" ? ShiftDate(today, kAnnualNoticeDays) : "1900-01-01";
  const minimum_end = leave_type === "annual" ? minimum_start : ShiftDate(today, -kSickBackdateDays);
  const period = { leave_type, start_date, end_date };
  const excluded_id = mode === "edit" ? id ?? null : null;
  const balances = records ? GetBalancePreview(period, records, excluded_id) : [];
  const needs_reason = IsIsoDate(start_date) && IsIsoDate(end_date) && DayCount(start_date, end_date) > kLongLeaveThreshold;

  /**
   * Summary: Save a request after checking its input and the latest own history.
   * Parameters: event is the non-null React form submission event.
   * Return Value: Resolves after saving/navigation or displaying a refusal.
   * Side Effects & Constraints: Prevents default submission, reads/writes the API,
   * and updates React/auth state. Catches network errors; SQL handles concurrent writes.
   */
  async function OnSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || loading || locked || conflicted || !records) return;
    SetError(null);
    const body = { leaveType: leave_type, startDate: start_date, endDate: end_date, reason };
    const parsed = ValidateLeaveInput(body);
    if (!parsed.ok) {
      SetError(parsed.error);
      return;
    }
    SetPending(true);
    try {
      const history = await GetApplications();
      SetRecords(history.applications);
      const refusal = ValidateLeaveAvailability(period, history.applications, excluded_id);
      if (refusal) {
        SetError(refusal);
        return;
      }
      if (mode === "edit") {
        if (!id || revision === null) throw new Error("Missing request ID or revision.");
        await UpdateApplication(id, { ...body, revision });
      } else {
        await CreateApplication(body);
      }
      await Refresh();
      Navigate("/applications");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status_ === 409) SetConflicted(true);
      SetError(caught instanceof ApiError ? caught.message : "The request could not be saved.");
    } finally {
      SetPending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageTitle
        title={mode === "new" ? "New request" : "Edit request"}
        lede="Leave is taken in whole days. The length is every calendar day from the start date through the end date."
      />
      {loading ? <LoadingNote label="Loading the request and your balance…" /> : null}
      {error ? <div className="mb-4"><ErrorNote message={error} on_retry={records === null ? () => SetReloadIndex((index) => index + 1) : undefined} /></div> : null}
      {conflicted ? (
        <div className="mb-4 text-sm">
          <p>Reloading replaces your unsaved changes with the latest request.</p>
          <button type="button" className="mt-2 underline" onClick={() => SetReloadIndex((index) => index + 1)}>
            Reload latest request
          </button>
        </div>
      ) : null}
      {locked ? <div className="mb-4"><ErrorNote message={locked} /></div> : null}
      {!loading && !locked && records !== null ? (
        <form onSubmit={OnSubmit} className="space-y-4 rounded-lg border border-rule bg-card p-5">
          <Field label="Leave type">
            <SelectInput className={`${GetLeaveTypeClass(leave_type)} font-medium`} value={leave_type} onChange={(event) => SetLeaveType(event.target.value as LeaveType)}>
              <option className={GetLeaveTypeClass("annual")} value="annual">{kLeaveLabel.annual}</option>
              <option className={GetLeaveTypeClass("sick")} value="sick">{kLeaveLabel.sick}</option>
            </SelectInput>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <LeaveDateInput label="Start date" value={start_date} today={today} on_change={SetStartDate}
              limits={{ minimum_date: minimum_start, maximum_date: "9998-12-31",
                annual_notice_date: leave_type === "annual" ? minimum_start : undefined,
                minimum_message: "This date is outside the supported date range." }} />
            <LeaveDateInput label="End date" value={end_date} today={today} on_change={SetEndDate}
              limits={{ minimum_date: start_date > minimum_end ? start_date : minimum_end, maximum_date: "9998-12-31",
                annual_notice_date: leave_type === "annual" ? minimum_start : undefined,
                minimum_message: start_date > minimum_end
                  ? "The end date cannot be before the start date."
                  : "The last date of sick leave cannot be more than 7 days ago." }} />
          </div>
          <div className="rounded-md bg-paper px-3 py-2 text-sm" aria-live="polite">
            <p>{PreviewDays(start_date, end_date)}</p>
            {balances.map((balance) => (
              <p key={balance.year} className="mt-1">
                {balance.year}: {balance.available} days available − {balance.days} requested = {balance.remaining} days remaining after saving.
              </p>
            ))}
            {mode === "edit" && balances.length > 0 ? <p className="mt-1">Available days include this request's existing reservation.</p> : null}
          </div>
          <p className="text-sm text-stone-600"><LeaveTypeLabel leave_type="annual" /> needs 2 days' notice. <LeaveTypeLabel leave_type="sick" /> may end up to 7 days ago. Pending and approved leave reserve your yearly balance.</p>
          <Field label={needs_reason ? "Reason (required for more than 4 days)" : "Reason (optional for up to 4 days)"}>
            <TextArea required={needs_reason} maxLength={500} value={reason} onChange={(event) => SetReason(event.target.value)} />
          </Field>
          <div className="flex items-center gap-4">
            <PrimaryButton type="submit" disabled={pending || conflicted}>
              {pending ? "Saving…" : mode === "new" ? "Submit request" : "Save changes"}
            </PrimaryButton>
            <Link to="/applications" className="text-sm underline">Back to my leave</Link>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Summary: Describe the inclusive duration shown next to the date inputs.
 * Parameters: start_date and end_date are non-null input strings, possibly empty.
 * Return Value: A whole-day label, an entry hint, or an invalid-range explanation.
 * Side Effects & Constraints: Pure; never persists the calculated duration.
 */
function PreviewDays(start_date: string, end_date: string): string {
  if (!start_date || !end_date) return "Enter the start and end dates to see how many days this request covers.";
  if (!IsIsoDate(start_date) || !IsIsoDate(end_date)) return "Use a real calendar date.";
  if (end_date < start_date) return "The end date is before the start date.";
  const days = DayCount(start_date, end_date);
  return days === 1 ? "1 day" : `${days} days`;
}
