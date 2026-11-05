import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FormatLongDate, IsIsoDate } from "../shared/dates";
import { ShiftDate } from "../shared/leave_rules";

export const kAnnualNoticeHint = "You have to apply 2 days in advance.";
const kWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DateLimits = {
  minimum_date: string;
  maximum_date: string;
  minimum_message: string;
  annual_notice_date?: string;
};

type LeaveDateInputProps = {
  label: string;
  value: string;
  today: string;
  limits: DateLimits;
  on_change: (date: string) => void;
};

/**
 * Summary: Explain why a calendar day cannot be selected.
 * Parameters: date and all limit dates are valid ISO dates; annual_notice_date may
 * be omitted for sick leave. minimum_message explains the remaining lower bound.
 * Return Value: A specific refusal, including the exact annual notice hint, or null.
 * Side Effects & Constraints: Pure; callers must still run submission validation.
 */
export function GetDateRestriction(date: string, limits: DateLimits): string | null {
  if (limits.annual_notice_date && date < limits.annual_notice_date) return kAnnualNoticeHint;
  if (date < limits.minimum_date) return limits.minimum_message;
  if (date > limits.maximum_date) return "This date is outside the supported date range.";
  return null;
}

/**
 * Summary: Return a month's ISO date cells, with empty cells before its first day.
 * Parameters: month is a valid ISO date within the supported years 1900 to 9998.
 * Return Value: A Sunday-first calendar containing every day of that month once.
 * Side Effects & Constraints: Pure; allocates at most 37 cells and uses UTC dates.
 */
export function GetMonthDays(month: string): (string | null)[] {
  const first_day = `${month.slice(0, 7)}-01`;
  const date = new Date(`${first_day}T00:00:00Z`);
  const cells: (string | null)[] = Array(date.getUTCDay()).fill(null);
  while (date.toISOString().slice(0, 7) === month.slice(0, 7)) {
    cells.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return cells;
}

/**
 * Summary: Render a date input with a calendar that explains unavailable days.
 * Parameters: label identifies the field; value is an ISO date or empty; today is
 * the Hong Kong ISO date; limits describes allowed dates; on_change accepts a date.
 * Return Value: The labelled input and, when open, a calendar with day-level hints.
 * Side Effects & Constraints: Updates local UI/focus and invokes OnChange only for
 * selectable calendar days. Installs an outside-pointer listener while open and
 * removes it on cleanup. Native min/max and server validation remain in force.
 */
export function LeaveDateInput({ label, value, today, limits, on_change: OnChange }: LeaveDateInputProps) {
  const input_id = useId();
  const calendar_id = `${input_id}-calendar`;
  const hint_id = `${input_id}-hint`;
  const root_ref = useRef<HTMLDivElement>(null);
  const calendar_ref = useRef<HTMLDivElement>(null);
  const trigger_ref = useRef<HTMLButtonElement>(null);
  const [open, SetOpen] = useState(false);
  const [month, SetMonth] = useState(today.slice(0, 7) + "-01");
  const [focused_date, SetFocusedDate] = useState(today);
  const [hint, SetHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    /**
     * Summary: Close the calendar when the pointer is pressed outside this field.
     * Parameters: event is a document pointer event with a possibly null target.
     * Return Value: None.
     * Side Effects & Constraints: Clears popup state; leaves outside focus unchanged.
     */
    function OnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !root_ref.current?.contains(event.target)) {
        SetOpen(false);
        SetHint(null);
      }
    }
    document.addEventListener("pointerdown", OnOutsidePointer);
    return () => document.removeEventListener("pointerdown", OnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (open) calendar_ref.current?.querySelector<HTMLButtonElement>(`[data-date="${focused_date}"]`)?.focus();
  }, [open, month, focused_date]);

  /**
   * Summary: Toggle the popup and start at the selected or first available day.
   * Parameters: None.
   * Return Value: None.
   * Side Effects & Constraints: Updates popup/month/focus state; never changes value.
   */
  function ToggleCalendar() {
    const initial_date = IsIsoDate(value) ? value : today < limits.minimum_date ? limits.minimum_date : today;
    const bounded_date = initial_date < "1900-01-01" ? "1900-01-01"
      : initial_date > limits.maximum_date ? limits.maximum_date : initial_date;
    SetMonth(bounded_date.slice(0, 7) + "-01");
    SetFocusedDate(bounded_date);
    SetHint(null);
    SetOpen(!open);
  }

  /**
   * Summary: Navigate one month in the calendar without selecting a date.
   * Parameters: offset is -1 for the previous month or 1 for the next month.
   * Return Value: None; navigation outside supported years is ignored.
   * Side Effects & Constraints: Updates the displayed month and clears the hint.
   */
  function ChangeMonth(offset: -1 | 1) {
    const next = new Date(`${month}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    const next_month = next.toISOString().slice(0, 10);
    if (next_month < "1900-01-01" || next_month > limits.maximum_date) return;
    SetMonth(next_month);
    SetHint(null);
  }

  /**
   * Summary: Choose a valid calendar day or explain why it is unavailable.
   * Parameters: date is the valid ISO date represented by a day button.
   * Return Value: None.
   * Side Effects & Constraints: Invalid days only update the hint. Valid selection
   * calls OnChange, closes the popup, and returns focus to the calendar trigger.
   */
  function SelectDate(date: string) {
    const refusal = GetDateRestriction(date, limits);
    if (refusal) {
      SetHint(refusal);
      return;
    }
    OnChange(date);
    SetOpen(false);
    SetHint(null);
    trigger_ref.current?.focus();
  }

  /**
   * Summary: Move keyboard focus between dates with the arrow keys.
   * Parameters: event is a day-button key event; date is that button's ISO date.
   * Return Value: None; unrelated keys retain their normal button behavior.
   * Side Effects & Constraints: Prevents arrow scrolling, changes month when needed,
   * and focuses unavailable dates too so keyboard users can read their explanations.
   */
  function OnDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next_date = ShiftDate(date, offset);
    if (next_date < "1900-01-01" || next_date > limits.maximum_date) return;
    SetMonth(next_date.slice(0, 7) + "-01");
    SetFocusedDate(next_date);
  }

  const month_label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}T00:00:00Z`));
  const cells = GetMonthDays(month);
  const tab_date = focused_date.startsWith(month.slice(0, 7)) ? focused_date : month;

  return (
    <div ref={root_ref} className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        SetOpen(false);
        SetHint(null);
      }
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        SetOpen(false);
        SetHint(null);
        trigger_ref.current?.focus();
      }
    }}>
      <label htmlFor={input_id} className="mb-1 block text-sm font-medium">{label}</label>
      <div className="relative">
        {/* Keep the native picker at the trailing edge, beneath the opaque custom trigger. */}
        <input id={input_id} type="date" required value={value} min={limits.minimum_date} max={limits.maximum_date}
          className="leave-date-input w-full rounded-md border border-rule bg-white px-3 py-2 text-base text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          onChange={(event) => OnChange(event.target.value)} />
        <button ref={trigger_ref} type="button" aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open} aria-controls={open ? calendar_id : undefined} aria-haspopup="dialog"
          onClick={ToggleCalendar}
          className="absolute inset-y-px right-px flex w-11 items-center justify-center rounded-r-md bg-white text-stone-600 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-forest">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        </button>
      </div>
      {open ? (
        <div ref={calendar_ref} id={calendar_id} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}
          className="absolute left-0 top-full z-20 mt-2 w-full min-w-64 rounded-lg border border-rule bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" disabled={month === "1900-01-01"}
              onClick={() => ChangeMonth(-1)} className="rounded px-2 py-1 hover:bg-paper disabled:opacity-40">‹</button>
            <span className="text-sm font-semibold" aria-live="polite">{month_label}</span>
            <button type="button" aria-label="Next month" disabled={month.slice(0, 7) === limits.maximum_date.slice(0, 7)}
              onClick={() => ChangeMonth(1)} className="rounded px-2 py-1 hover:bg-paper disabled:opacity-40">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1" aria-label={month_label}>
            {kWeekdays.map((day) => <span key={day} className="py-1 text-center text-xs text-stone-500">{day}</span>)}
            {cells.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} />;
              const refusal = GetDateRestriction(date, limits);
              return (
                <button key={date} type="button" data-date={date} aria-label={FormatLongDate(date)}
                  aria-disabled={Boolean(refusal)} aria-pressed={date === value}
                  aria-current={date === today ? "date" : undefined}
                  aria-describedby={refusal && hint === refusal ? hint_id : undefined}
                  tabIndex={date === tab_date ? 0 : -1}
                  onMouseEnter={() => SetHint(refusal)} onMouseLeave={() => SetHint(null)}
                  onFocus={() => { SetFocusedDate(date); SetHint(refusal); }} onBlur={() => SetHint(null)}
                  onKeyDown={(event) => OnDayKeyDown(event, date)} onClick={() => SelectDate(date)}
                  className={`rounded py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest ${refusal
                    ? "cursor-not-allowed text-stone-400 hover:bg-stone-100"
                    : date === value ? "bg-forest text-white" : "text-ink hover:bg-paper"}`}>
                  {Number(date.slice(8))}
                </button>
              );
            })}
          </div>
          {hint ? <div id={hint_id} role="tooltip" className="absolute bottom-full left-0 right-0 mb-2 rounded-md bg-ink px-3 py-2 text-sm text-white shadow-lg">{hint}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
