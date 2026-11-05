import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from "react";
import { Link, NavLink } from "react-router-dom";
import { kLeaveLabel } from "../shared/constants";
import { CanCancel } from "../shared/state_machine";
import type { LeaveRecord, LeaveStatus, LeaveType, Me } from "../shared/types";
import { FormatLongDate } from "../shared/dates";
import { LeaveTypeLabel } from "./leave_type_label";

const kInputClass =
  "w-full rounded-md border border-rule bg-white px-3 py-2 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

/**
 * Summary: Render a labelled form field and optional hint.
 * Parameters: label is non-null text; hint may be omitted; children contains the field control.
 * Return Value: A label containing the control and any hint.
 * Side Effects & Constraints: Render-only; callers supply control state and handlers.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-stone-600">{hint}</span> : null}
    </label>
  );
}

/**
 * Summary: Render a consistently styled input control.
 * Parameters: props contains standard React input attributes and optional event handlers.
 * Return Value: The styled input element.
 * Side Effects & Constraints: Forwards native behavior and handlers; does not own field state.
 */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={kInputClass} />;
}

/**
 * Summary: Render a consistently styled select control.
 * Parameters: props contains standard React select attributes and optional event handlers.
 * Return Value: The styled select element.
 * Side Effects & Constraints: Forwards native behavior and handlers; does not own field state.
 */
export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${kInputClass} ${props.className ?? ""}`} />;
}

/**
 * Summary: Render a consistently styled textarea control.
 * Parameters: props contains standard React textarea attributes and optional event handlers.
 * Return Value: The styled textarea element.
 * Side Effects & Constraints: Forwards native behavior and handlers; does not own field state.
 */
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${kInputClass} min-h-28`} />;
}

/**
 * Summary: Render a primary action button.
 * Parameters: props contains standard React button attributes and optional children/handlers.
 * Return Value: The styled button element.
 * Side Effects & Constraints: Forwards handlers and disabled state; the caller controls the action.
 */
export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md bg-forest px-4 py-2 font-medium text-white hover:bg-forestdeep disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

/**
 * Summary: Render a secondary action button.
 * Parameters: props contains standard React button attributes and optional children/handlers.
 * Return Value: The styled button element.
 * Side Effects & Constraints: Forwards handlers and disabled state; the caller controls the action.
 */
export function QuietButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-rule bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

/**
 * Summary: Render a destructive action button.
 * Parameters: props contains standard React button attributes and optional children/handlers.
 * Return Value: The styled button element.
 * Side Effects & Constraints: Forwards handlers and disabled state; the caller controls the action.
 */
export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

/**
 * Summary: Display an error with an optional retry action.
 * Parameters: message is non-null display text; on_retry may be omitted and is called without
 * arguments.
 * Return Value: An accessible alert and optional retry button.
 * Side Effects & Constraints: Invokes the supplied retry callback only after user activation.
 */
export function ErrorNote({ message, on_retry: OnRetry }: { message: string; on_retry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-rose-950">
      <p>{message}</p>
      {OnRetry ? (
        <button type="button" onClick={OnRetry} className="mt-2 text-sm font-medium underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Summary: Display an explanatory empty state.
 * Parameters: title and body are non-null display strings.
 * Return Value: The empty-state card.
 * Side Effects & Constraints: Render-only; no state or network changes.
 */
export function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-rule bg-card px-4 py-8 text-center">
      <p className="font-serif text-xl">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-700">{body}</p>
    </div>
  );
}

/**
 * Summary: Display a loading message.
 * Parameters: label is non-null display text.
 * Return Value: A loading paragraph.
 * Side Effects & Constraints: Render-only; loading completion is controlled by the caller.
 */
export function LoadingNote({ label }: { label: string }) {
  return <p className="text-sm text-stone-600">{label}</p>;
}

const kStatusClass: Record<LeaveStatus, string> = {
  Pending: "bg-amber-100 text-amber-950",
  Approved: "bg-emerald-100 text-emerald-950",
  Disapproved: "bg-rose-100 text-rose-950",
  Cancelled: "bg-stone-200 text-stone-700",
};

/**
 * Summary: Display a leave request's status using its existing badge style.
 * Parameters: status is one of the four supported LeaveStatus values.
 * Return Value: A labelled status badge.
 * Side Effects & Constraints: Render-only; does not change lifecycle state.
 */
export function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${kStatusClass[status]}`}>
      {status}
    </span>
  );
}

/**
 * Summary: Render a page heading with optional introductory text.
 * Parameters: title is non-null text; lede may be omitted.
 * Return Value: The page header.
 * Side Effects & Constraints: Render-only; browser document titles are handled separately.
 */
export function PageTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
      {lede ? <p className="mt-2 max-w-2xl text-stone-700">{lede}</p> : null}
    </header>
  );
}

/**
 * Summary: Look up the display label for a leave type.
 * Parameters: type is annual or sick.
 * Return Value: The corresponding non-empty label.
 * Side Effects & Constraints: Pure lookup; does not change data.
 */
export function LeaveLabel(type: LeaveType): string {
  return kLeaveLabel[type];
}

/**
 * Summary: Format a whole-day count with the appropriate singular or plural.
 * Parameters: days is a finite whole-day count from a validated request or balance.
 * Return Value: A count followed by day or days.
 * Side Effects & Constraints: Pure formatting; does not validate or alter the count.
 */
export function DaysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Summary: Render request history with eligible edit/cancel actions.
 * Parameters: records is a non-null array; today is an ISO date; on_cancel is optional;
 * cancelling_id is optional/null or the active request ID.
 * Return Value: A list of request cards, empty when records is empty.
 * Side Effects & Constraints: Invokes cancellation callbacks and renders edit links; the server
 * rechecks eligibility.
 */
export function LeaveList({
  records,
  today,
  on_cancel: OnCancel,
  cancelling_id,
}: {
  records: LeaveRecord[];
  today: string;
  on_cancel?: (id: string) => void;
  cancelling_id?: string | null;
}) {
  return (
    <ul className="space-y-3">
      {records.map((record) => {
        const allow_cancel = OnCancel ? CanCancel(record.status, record.startDate, today) : false;
        return (
          <li key={record.id} className="rounded-lg border border-rule bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <LeaveTypeLabel leave_type={record.leaveType} />
                  <span className="ml-2 font-normal text-stone-600">{DaysLabel(record.dayCount)}</span>
                </p>
                <p className="mt-1 text-sm text-stone-700">
                  {FormatLongDate(record.startDate)} – {FormatLongDate(record.endDate)}
                </p>
                {record.applicantName ? (
                  <p className="mt-1 text-sm text-stone-600">
                    {record.applicantName} · {record.applicantStaffCode}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={record.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{record.reason}</p>
            {record.decisionComment ? <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">Approver comment: {record.decisionComment}</p> : null}
            {record.archived ? <p className="mt-2 text-xs uppercase tracking-wide text-stone-500">Archived</p> : null}
            {OnCancel && (record.status === "Pending" || allow_cancel) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {record.status === "Pending" ? (
                  <Link
                    to={`/applications/${record.id}/edit`}
                    className="rounded-md border border-rule bg-white px-3 py-2 text-sm font-medium"
                  >
                    Edit
                  </Link>
                ) : null}
                {allow_cancel ? (
                  <DangerButton
                    type="button"
                    disabled={cancelling_id === record.id}
                    onClick={() => OnCancel(record.id)}
                  >
                    {cancelling_id === record.id ? "Cancelling…" : "Cancel request"}
                  </DangerButton>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Summary: Render the signed-in header, role-specific navigation, and page content.
 * Parameters: me is a non-null account; on_sign_out is the required sign-out callback; children is
 * the page content.
 * Return Value: The shared application layout.
 * Side Effects & Constraints: Invokes sign-out on user activation; router links change the current
 * page.
 */
export function Shell({
  me,
  on_sign_out: OnSignOut,
  children,
}: {
  me: Me;
  on_sign_out: () => void;
  children: ReactNode;
}) {
  const links = me.role === "approver" ? [
    ["/applications", "My leave"],
    ["/applications/new", "New request"],
    ["/approver/pending", me.pendingCount ? `Pending (${me.pendingCount})` : "Pending"],
    ["/approver/staff", "Staff"],
    ["/approver/archive", "Archive"],
  ] : [
    ["/profile", "Profile"],
    ["/applications", "My leave"],
    ["/applications/new", "New request"],
    ["/notifications", me.unreadNotifications > 0 ? `Notices (${me.unreadNotifications})` : "Notices"],
  ];
  return (
    <div className="min-h-screen bg-paper text-ink">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-rule bg-[#fbf8f3]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-serif text-2xl tracking-tight">
            LeaveFlowSE
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline">{me.name}</span>
            <button type="button" onClick={OnSignOut} className="font-medium text-forest underline">
              Sign out
            </button>
          </div>
        </div>
        <nav className={`mx-auto flex max-w-5xl gap-2 px-4 pb-3 ${me.role === "approver" ? "flex-wrap items-center justify-between" : "overflow-x-auto"}`}>
          <div className={me.role === "approver" ? "flex flex-wrap gap-2" : "contents"}>
            <NavLink
              to="/"
              end
              className={({ isActive: is_active }) =>
                `shrink-0 rounded-full px-3 py-1 text-sm ${is_active ? "bg-ink text-paper" : "bg-white text-ink"}`
              }
            >
              Home
            </NavLink>
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive: is_active }) =>
                  `shrink-0 rounded-full px-3 py-1 text-sm ${is_active ? "bg-ink text-paper" : "bg-white text-ink"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
          {me.role === "approver" ? (
            <div className="ml-auto flex gap-2">
              {[
                ["/profile", "Profile"],
                ["/notifications", me.unreadNotifications > 0 ? `Notices (${me.unreadNotifications})` : "Notices"],
              ].map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive: is_active }) =>
                  `shrink-0 rounded-full px-3 py-1 text-sm ${is_active ? "bg-ink text-paper" : "bg-white text-ink"}`
                }>{label}</NavLink>
              ))}
            </div>
          ) : null}
        </nav>
      </header>
      <main id="content" className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-stone-500">
        WorkSmartSE leave desk · dates in Asia/Hong_Kong · one quota day is one full calendar day
      </footer>
    </div>
  );
}
