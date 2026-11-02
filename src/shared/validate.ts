import { COMPANY_DOMAIN } from "./constants";
import { dayCount, hongKongToday, isIsoDate } from "./dates";
import { kLongLeaveThreshold, ValidateLeaveDates } from "./leaveRules";
import type { LeaveType } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const escaped = COMPANY_DOMAIN.replace(/\./g, "\\.");
  return new RegExp(`^[a-z0-9._%+-]+@${escaped}$`).test(normalized);
}

export function companyEmailError(): string {
  return `Use a company email ending in @${COMPANY_DOMAIN}.`;
}

function cleanText(value: unknown, max: number): string | null {
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
 * Return Value: Normalized API fields with a derived dayCount, or a validation error.
 * Side Effects & Constraints: Does not mutate input or persist duration. Reads the
 * clock only for the default date; overlap/balance checks require separate data.
 */
export function ValidateLeaveInput(
  body: unknown,
  today: string = hongKongToday(),
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
  if (typeof start_date !== "string" || typeof end_date !== "string" || !isIsoDate(start_date) || !isIsoDate(end_date)) {
    return { ok: false, error: "Enter a start date and an end date." };
  }
  const date_error = ValidateLeaveDates({ leave_type, start_date, end_date }, today);
  if (date_error) return { ok: false, error: date_error };
  const raw_reason = record.reason ?? "";
  if (typeof raw_reason !== "string" || raw_reason.trim().length > 500 || /[\u0000-\u001F]/.test(raw_reason)) {
    return { ok: false, error: "Use a reason of 500 characters or fewer." };
  }
  const reason = raw_reason.trim().replace(/\s+/g, " ");
  const days = dayCount(start_date, end_date);
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

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return "Use a password between 8 and 72 characters.";
  }
  return null;
}

export function validateProfileFields(body: unknown):
  | {
      ok: true;
      value: {
        email: string;
        name: string;
        staffCode: string;
        birthday: string;
        department: string;
        yearJoined: number;
      };
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "The request body must be JSON." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.email !== "string" || !isCompanyEmail(record.email)) {
    return { ok: false, error: companyEmailError() };
  }
  const name = cleanText(record.name, 80);
  if (!name) return { ok: false, error: "Enter the staff member's name." };
  if (typeof record.staffCode !== "string") {
    return { ok: false, error: "Enter a staff ID such as WS-041." };
  }
  const staffCode = record.staffCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(staffCode)) {
    return { ok: false, error: "Staff ID uses 2 to 20 letters, numbers, or hyphens." };
  }
  if (typeof record.birthday !== "string" || !isIsoDate(record.birthday)) {
    return { ok: false, error: "Enter a valid birthday." };
  }
  const today = hongKongToday();
  if (record.birthday > today || record.birthday < "1940-01-01") {
    return { ok: false, error: "Enter a valid birthday." };
  }
  const department = cleanText(record.department, 60);
  if (!department) return { ok: false, error: "Enter a department." };
  const yearJoined = asYear(record.yearJoined);
  const currentYear = Number(today.slice(0, 4));
  if (yearJoined === null || yearJoined < 1980 || yearJoined > currentYear) {
    return { ok: false, error: "Enter the year joined." };
  }
  return {
    ok: true,
    value: {
      email: normalizeEmail(record.email),
      name,
      staffCode,
      birthday: record.birthday,
      department,
      yearJoined,
    },
  };
}

function asYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{4}$/.test(value)) return Number(value);
  return null;
}
