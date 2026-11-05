import { kCompanyDomain } from "./constants";
import { DayCount, HongKongToday, IsIsoDate } from "./dates";
import { kLongLeaveThreshold, ValidateLeaveDates } from "./leave_rules";
import type { LeaveType } from "./types";

/**
 * Summary: Normalize an email for account lookup and uniqueness checks.
 * Parameters: email is a non-null string; whitespace at either end is allowed.
 * Return Value: Trimmed lowercase text, including an empty string for blank input.
 * Side Effects & Constraints: Pure; does not validate the address or query accounts.
 */
export function NormalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Summary: Check the normalized address against the company domain policy.
 * Parameters: email is a non-null string; leading/trailing whitespace is accepted.
 * Return Value: True for a supported company email, false otherwise.
 * Side Effects & Constraints: Pure; does not check whether an account exists.
 */
export function IsCompanyEmail(email: string): boolean {
  const normalized = NormalizeEmail(email);
  const escaped = kCompanyDomain.replace(/\./g, "\\.");
  return new RegExp(`^[a-z0-9._%+-]+@${escaped}$`).test(normalized);
}

/**
 * Summary: Explain the required company email domain.
 * Parameters: None.
 * Return Value: A user-facing validation message.
 * Side Effects & Constraints: Pure; uses the shared domain constant.
 */
export function CompanyEmailError(): string {
  return `Use a company email ending in @${kCompanyDomain}.`;
}

/**
 * Summary: Normalize and validate a bounded single-line profile field.
 * Parameters: value is untrusted input including null; max is a positive maximum
 * length after trimming and whitespace normalization.
 * Return Value: Clean text, or null for a non-string, blank, long, or control input.
 * Side Effects & Constraints: Pure; does not modify the supplied value.
 */
function CleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > max) return null;
  if (/[\u0000-\u001F]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Summary: Normalize a request and enforce date and conditional-reason rules.
 * Parameters: body is untrusted JSON (including null); today is a valid Hong Kong
 * ISO date, defaulting to the current date. Reasons may be absent, null, or blank
 * for up to four days; nonblank reasons must contain at most 500 characters.
 * Tabs and line breaks are accepted; CRLF/CR line endings become LF.
 * Return Value: Normalized API fields with a derived dayCount, or a validation error.
 * Side Effects & Constraints: Does not mutate input or persist duration. Reads the
 * clock only for the default date; overlap/balance checks require separate data.
 */
export function ValidateLeaveInput(
  body: unknown,
  today: string = HongKongToday(),
):
  | {
      ok: true;
      value: { leaveType: LeaveType; startDate: string; endDate: string; reason: string; dayCount: number };
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "The request body must be JSON." };
  }
  const record = body as Record<string, unknown>;
  const leave_type = record.leaveType;
  if (leave_type !== "annual" && leave_type !== "sick") {
    return { ok: false, error: "Choose annual or sick leave." };
  }
  const start_date = record.startDate;
  const end_date = record.endDate;
  if (typeof start_date !== "string" || typeof end_date !== "string" || !IsIsoDate(start_date) || !IsIsoDate(end_date)) {
    return { ok: false, error: "Enter a start date and an end date." };
  }
  const date_error = ValidateLeaveDates({ leave_type, start_date, end_date }, today);
  if (date_error) return { ok: false, error: date_error };
  const raw_reason = record.reason ?? "";
  if (typeof raw_reason !== "string" || raw_reason.trim().length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw_reason)) {
    return { ok: false, error: "Use a reason of 500 characters or fewer." };
  }
  const reason = raw_reason.trim().replace(/\r\n?/g, "\n");
  const days = DayCount(start_date, end_date);
  if (days > kLongLeaveThreshold && !reason) {
    return { ok: false, error: "A reason is required for leave longer than 4 days." };
  }
  return {
    ok: true,
    value: {
      leaveType: leave_type,
      startDate: start_date,
      endDate: end_date,
      reason,
      dayCount: days,
    },
  };
}

/**
 * Summary: Enforce the supported password length at account boundaries.
 * Parameters: password is untrusted input, including absent or null values.
 * Return Value: Null for a string of 8-72 characters, otherwise a refusal.
 * Side Effects & Constraints: Pure; neither hashes nor stores the password.
 */
export function ValidatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return "Use a password between 8 and 72 characters.";
  }
  return null;
}

type ProfileFields = {
  email: string;
  name: string;
  birthday: string;
  department: string;
  yearJoined: number;
};

type ProfileValidation<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Summary: Validate account details for creation or profile editing.
 * Parameters: body is untrusted JSON, including null; account_mode selects creation
 * or editing. Create mode ignores any supplied staffCode,
 * while edit mode (the default) requires a valid manually maintained staff ID.
 * Return Value: Normalized fields, or the first field error. Creation omits staffCode.
 * Side Effects & Constraints: Reads the Hong Kong date for age/year limits; does not
 * query uniqueness or allocate IDs. The Worker assigns new IDs inside its INSERT.
 */
export function ValidateProfileFields(body: unknown, account_mode: "create"): ProfileValidation<ProfileFields>;
/**
 * Summary: Describe the profile-editing overload with a required staff code.
 * Parameters: body is untrusted JSON; account_mode is edit or omitted.
 * Return Value: Validated editing fields or a validation error.
 * Side Effects & Constraints: Delegates to the shared validation implementation.
 */
export function ValidateProfileFields(body: unknown, account_mode?: "edit"): ProfileValidation<ProfileFields & { staffCode: string }>;
/**
 * Summary: Implement shared account creation/editing field validation.
 * Parameters: body is untrusted JSON including null; account_mode is create or
 * edit, defaulting to edit. Creation omits the caller-supplied staff code.
 * Return Value: Normalized fields or the first field error.
 * Side Effects & Constraints: Reads Hong Kong time; does not check uniqueness,
 * assign IDs, or persist any values.
 */
export function ValidateProfileFields(
  body: unknown, account_mode: "create" | "edit" = "edit",
): ProfileValidation<ProfileFields & { staffCode?: string }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "The request body must be JSON." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.email !== "string" || !IsCompanyEmail(record.email)) {
    return { ok: false, error: CompanyEmailError() };
  }
  const name = CleanText(record.name, 80);
  if (!name) return { ok: false, error: "Enter the staff member's name." };
  let staff_code: string | undefined;
  if (account_mode === "edit") {
    if (typeof record.staffCode !== "string") {
      return { ok: false, error: "Enter a staff ID such as WS-041." };
    }
    staff_code = record.staffCode.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(staff_code)) {
      return { ok: false, error: "Staff ID uses 2 to 20 letters, numbers, or hyphens." };
    }
  }
  if (typeof record.birthday !== "string" || !IsIsoDate(record.birthday)) {
    return { ok: false, error: "Enter a valid birthday." };
  }
  const today = HongKongToday();
  if (record.birthday > today || record.birthday < "1940-01-01") {
    return { ok: false, error: "Enter a valid birthday." };
  }
  const department = CleanText(record.department, 60);
  if (!department) return { ok: false, error: "Enter a department." };
  const year_joined = AsYear(record.yearJoined);
  const current_year = Number(today.slice(0, 4));
  if (year_joined === null || year_joined < 1980 || year_joined > current_year) {
    return { ok: false, error: "Enter the year joined." };
  }
  return {
    ok: true,
    value: {
      email: NormalizeEmail(record.email),
      name,
      ...(staff_code === undefined ? {} : { staffCode: staff_code }),
      birthday: record.birthday,
      department,
      yearJoined: year_joined,
    },
  };
}

/**
 * Summary: Read an integer year from untrusted numeric or string input.
 * Parameters: value may be any value, including null; strings require four digits.
 * Return Value: The integer, or null for unsupported input; range is checked later.
 * Side Effects & Constraints: Pure; does not consult the clock.
 */
function AsYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{4}$/.test(value)) return Number(value);
  return null;
}
