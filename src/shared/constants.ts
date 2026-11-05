/** Authentication constants. Leave entitlements are defined by SQL views/rules. */
export const kCompanyDomain = "worksmartse.hk";
export const kPbkdf2Iterations = 100_000;
export const kSessionMaxAgeSeconds = 15 * 60;

export const kLeaveLabel = {
  annual: "Annual leave",
  sick: "Sick leave",
} as const;
