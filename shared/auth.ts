import { z } from "zod";
import { verifierPattern } from "./oauth-contract";

export const oauthConfigSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.url(),
  installUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.origin === "https://github.com" &&
      /^\/apps\/[^/]+\/installations\/new$/.test(url.pathname)
    );
  }),
});

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().positive(),
  mailboxRepository: z.string().optional(),
  installer: z.boolean().optional(),
});
export type GitHubSession = z.infer<typeof sessionSchema>;

export const exchangeSchema = z
  .object({
    code: z.string().min(1).max(512),
    verifier: z.string().regex(verifierPattern),
  })
  .strict();

export const pendingOAuthSchema = z.object({
  state: z.string().min(32),
  verifier: z.string().min(43),
  createdAt: z.number(),
});
