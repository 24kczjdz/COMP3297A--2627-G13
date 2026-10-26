import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { dayCount, isIsoDate } from "../../shared/dates";
import { LEAVE_LABEL } from "../../shared/constants";
import type { LeaveType } from "../../shared/types";
import { ApiError, createApplication, getApplication, updateApplication } from "../api";
import { ErrorNote, Field, LoadingNote, PageTitle, PrimaryButton, SelectInput, TextArea, TextInput } from "../components";
import { useTitle } from "../useTitle";

export function ApplicationForm({ mode }: { mode: "new" | "edit" }) {
  useTitle(mode === "new" ? "New request" : "Edit request");
  const { id } = useParams();
  const navigate = useNavigate();
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let active = true;
    getApplication(id)
      .then((record) => {
        if (!active) return;
        setLeaveType(record.leaveType);
        setStartDate(record.startDate);
        setEndDate(record.endDate);
        setReason(record.reason);
        if (record.status !== "Pending") {
          setLocked(`This request is ${record.status}. It can be changed only while it is Pending.`);
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : "That request could not be opened.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, id]);

  const preview = useMemo(() => previewDays(startDate, endDate), [startDate, endDate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body = { leaveType, startDate, endDate, reason };
    try {
      if (mode === "edit" && id) await updateApplication(id, body);
      else await createApplication(body);
      navigate("/applications");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The request could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageTitle
        title={mode === "new" ? "New request" : "Edit request"}
        lede="Leave is taken in whole days. The length is every calendar day from the start date through the end date."
      />
      {loading ? <LoadingNote label="Loading the request…" /> : null}
      {error ? <div className="mb-4"><ErrorNote message={error} /></div> : null}
      {locked ? <div className="mb-4"><ErrorNote message={locked} /></div> : null}
      {!loading && !locked ? (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-rule bg-card p-5">
          <Field label="Leave type">
            <SelectInput value={leaveType} onChange={(event) => setLeaveType(event.target.value as LeaveType)}>
              <option value="annual">{LEAVE_LABEL.annual}</option>
              <option value="sick">{LEAVE_LABEL.sick}</option>
            </SelectInput>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <TextInput type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="End date">
              <TextInput type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          </div>
          <p className="rounded-md bg-paper px-3 py-2 text-sm">{preview}</p>
          <Field label="Reason">
            <TextArea required value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex items-center gap-4">
            <PrimaryButton type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "new" ? "Submit request" : "Save changes"}
            </PrimaryButton>
            <Link to="/applications" className="text-sm underline">
              Back to my leave
            </Link>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function previewDays(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return "Enter the start and end dates to see how many days this request covers.";
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return "Use a real calendar date.";
  if (endDate < startDate) return "The end date is before the start date.";
  const days = dayCount(startDate, endDate);
  return days === 1 ? "1 day" : `${days} days`;
}
