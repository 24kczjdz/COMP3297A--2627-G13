/** Single source for the company domain and leave entitlements. */
export const COMPANY_DOMAIN = "worksmartse.hk";
export const ANNUAL_QUOTA = 18;
export const SICK_QUOTA = 14;
export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_DAYS = 7;

export const LEAVE_LABEL = {
  annual: "Annual leave",
  sick: "Sick leave",
} as const;
