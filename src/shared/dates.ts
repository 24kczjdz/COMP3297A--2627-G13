/**
 * Summary: Check that a string represents an actual calendar date in ISO form.
 * Parameters: value is a non-null string expected to use YYYY-MM-DD.
 * Return Value: True for a round-tripping calendar date; false for malformed dates.
 * Side Effects & Constraints: Pure; uses UTC to avoid local timezone changes.
 */
export function IsIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Summary: Calculate the inclusive number of calendar days between two dates.
 * Parameters: start and end are non-null ISO dates; callers validate their order.
 * Return Value: Inclusive day count; invalid inputs produce NaN, reversed dates
 * may produce zero or negative counts.
 * Side Effects & Constraints: Pure; parses midnight UTC and stores no duration.
 */
export function DayCount(start: string, end: string): number {
  const start_ms = Date.parse(`${start}T00:00:00Z`);
  const end_ms = Date.parse(`${end}T00:00:00Z`);
  return Math.round((end_ms - start_ms) / 86_400_000) + 1;
}

/**
 * Summary: Find the calendar date immediately before an ISO date.
 * Parameters: iso_date is a non-null, valid YYYY-MM-DD date.
 * Return Value: The preceding ISO date; invalid or unrepresentable dates may throw.
 * Side Effects & Constraints: Uses an internally owned Date without changing input.
 */
export function DayBefore(iso_date: string): string {
  const [year, month, day] = iso_date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Summary: Resolve the Hong Kong calendar date for an instant.
 * Parameters: now is a valid Date; omitted means the current instant.
 * Return Value: YYYY-MM-DD in Asia/Hong_Kong; an invalid Date throws RangeError.
 * Side Effects & Constraints: Reads the clock only when now is omitted; no writes.
 */
export function HongKongToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  /**
   * Summary: Read one formatted Hong Kong date part.
   * Parameters: type is a supported Intl date-part name.
   * Return Value: The matching text, or an empty string if missing.
   * Side Effects & Constraints: Reads the enclosing parts array without mutation.
   */
  const Read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${Read("year")}-${Read("month")}-${Read("day")}`;
}

/**
 * Summary: Format a leave date for display without timezone rollover.
 * Parameters: iso_date is a non-null valid ISO calendar date.
 * Return Value: An English day/month/year label; invalid dates may throw RangeError.
 * Side Effects & Constraints: Pure; formats UTC because the input is date-only.
 */
export function FormatLongDate(iso_date: string): string {
  const [year, month, day] = iso_date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Summary: Display an event timestamp on its Hong Kong calendar date.
 * Parameters: timestamp is a valid ISO timestamp including its UTC offset.
 * Return Value: A day/month/year label, including the local midnight rollover.
 * Side Effects & Constraints: Pure; leave date-only strings use FormatLongDate.
 */
export function FormatHongKongTimestampDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp));
}
