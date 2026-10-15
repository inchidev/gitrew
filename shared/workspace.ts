import { z } from "zod";

export const repositoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[a-z\d_.-]+$/i,
    "Use letters, numbers, dots, underscores or hyphens.",
  )
  .refine(
    (value) =>
      ![".", ".."].includes(value) && !value.toLowerCase().endsWith(".git"),
    "Choose a repository name without a .git suffix.",
  )
  .transform((value) => value.toLowerCase());

export const workspaceRepositoryNamesSchema = z
  .object({
    repositoryName: repositoryNameSchema,
    vaultName: repositoryNameSchema,
  })
  .refine((value) => value.repositoryName !== value.vaultName, {
    message: "Chat and vault must use different repository names.",
    path: ["vaultName"],
  });
