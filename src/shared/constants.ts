/** Authentication constants. Leave entitlements are defined by SQL views/rules. */
export const COMPANY_DOMAIN = "worksmartse.hk";
export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_DAYS = 7;

export const LEAVE_LABEL = {
  annual: "Annual leave",
  sick: "Sick leave",
} as const;
