import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from "react";
import { Link, NavLink } from "react-router-dom";
import { LEAVE_LABEL } from "../shared/constants";
import { canCancel } from "../shared/stateMachine";
import type { LeaveRecord, LeaveStatus, LeaveType, Me } from "../shared/types";
import { formatLongDate } from "../shared/dates";

const inputClass =
  "w-full rounded-md border border-rule bg-white px-3 py-2 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

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

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-28`} />;
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md bg-forest px-4 py-2 font-medium text-white hover:bg-forestdeep disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

export function QuietButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-rule bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-rose-950">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-rule bg-card px-4 py-8 text-center">
      <p className="font-serif text-xl">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-700">{body}</p>
    </div>
  );
}

export function LoadingNote({ label }: { label: string }) {
  return <p className="text-sm text-stone-600">{label}</p>;
}

const statusClass: Record<LeaveStatus, string> = {
  Pending: "bg-amber-100 text-amber-950",
  Approved: "bg-emerald-100 text-emerald-950",
  Disapproved: "bg-rose-100 text-rose-950",
  Cancelled: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[status]}`}>
      {status}
    </span>
  );
}

export function PageTitle({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
      {lede ? <p className="mt-2 max-w-2xl text-stone-700">{lede}</p> : null}
    </header>
  );
}

export function leaveLabel(type: LeaveType): string {
  return LEAVE_LABEL[type];
}

export function daysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function LeaveList({
  records,
  today,
  onCancel,
  cancellingId,
}: {
  records: LeaveRecord[];
  today: string;
  onCancel?: (id: string) => void;
  cancellingId?: string | null;
}) {
  return (
    <ul className="space-y-3">
      {records.map((record) => {
        const allowCancel = onCancel ? canCancel(record.status, record.startDate, today) : false;
        return (
          <li key={record.id} className="rounded-lg border border-rule bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {leaveLabel(record.leaveType)}
                  <span className="ml-2 font-normal text-stone-600">{daysLabel(record.dayCount)}</span>
                </p>
                <p className="mt-1 text-sm text-stone-700">
                  {formatLongDate(record.startDate)} – {formatLongDate(record.endDate)}
                </p>
                {record.applicantName ? (
                  <p className="mt-1 text-sm text-stone-600">
                    {record.applicantName} · {record.applicantStaffCode}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={record.status} />
            </div>
            <p className="mt-3 text-sm">{record.reason}</p>
            {record.archived ? <p className="mt-2 text-xs uppercase tracking-wide text-stone-500">Archived</p> : null}
            {onCancel && (record.status === "Pending" || allowCancel) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {record.status === "Pending" ? (
                  <Link
                    to={`/applications/${record.id}/edit`}
                    className="rounded-md border border-rule bg-white px-3 py-2 text-sm font-medium"
                  >
                    Edit
                  </Link>
                ) : null}
                {allowCancel ? (
                  <DangerButton
                    type="button"
                    disabled={cancellingId === record.id}
                    onClick={() => onCancel(record.id)}
                  >
                    {cancellingId === record.id ? "Cancelling…" : "Cancel request"}
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

export function Shell({
  me,
  onSignOut,
  children,
}: {
  me: Me;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const links = [
    ["/profile", "Profile"],
    ["/applications", "My leave"],
    ["/applications/new", "New request"],
    ["/notifications", me.unreadNotifications > 0 ? `Notices (${me.unreadNotifications})` : "Notices"],
  ];
  if (me.role === "approver") {
    links.push(
      ["/approver/pending", me.pendingCount ? `Pending (${me.pendingCount})` : "Pending"],
      ["/approver/staff", "Staff"],
      ["/approver/on-date", "On a date"],
    );
  }
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
            <button type="button" onClick={onSignOut} className="font-medium text-forest underline">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3 py-1 text-sm ${isActive ? "bg-ink text-paper" : "bg-white text-ink"}`
            }
          >
            Home
          </NavLink>
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1 text-sm ${isActive ? "bg-ink text-paper" : "bg-white text-ink"}`
              }
            >
              {label}
            </NavLink>
          ))}
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
