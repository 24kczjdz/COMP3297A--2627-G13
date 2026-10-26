import { COMPANY_DOMAIN } from "./constants";
import { dayCount, hongKongToday, isIsoDate } from "./dates";
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

export function validateLeaveInput(
  body: unknown,
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
  const leaveType = record.leaveType;
  if (leaveType !== "annual" && leaveType !== "sick") {
    return { ok: false, error: "Choose annual or sick leave." };
  }
  const startDate = record.startDate;
  const endDate = record.endDate;
  if (typeof startDate !== "string" || typeof endDate !== "string" || !isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { ok: false, error: "Enter a start date and an end date." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "The end date is before the start date." };
  }
  const reason = cleanText(record.reason, 500);
  if (!reason) {
    return { ok: false, error: "Enter the reason for this leave, in 500 characters or fewer." };
  }
  return {
    ok: true,
    value: {
      leaveType,
      startDate,
      endDate,
      reason,
      dayCount: dayCount(startDate, endDate),
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
