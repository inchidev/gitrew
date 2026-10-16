import { z } from "zod";

export const accessCheckSchema = z.object({
  id: z.enum(["organization", "team", "chat", "membership"]),
  label: z.string(),
  status: z.enum([
    "passed",
    "missing",
    "unknown",
    "not_required",
    "not_checked",
  ]),
  detail: z.string(),
});
export const accessReportSchema = z.object({
  viewer: z.object({ id: z.number(), login: z.string() }),
  displayName: z.string(),
  organization: z.string(),
  checkedAt: z.string(),
  canEnter: z.boolean(),
  isAdmin: z.boolean(),
  checks: z.array(accessCheckSchema),
});
export type AccessReport = z.infer<typeof accessReportSchema>;
export type AccessCheck = z.infer<typeof accessCheckSchema>;
export const workspaceSettingsSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();
