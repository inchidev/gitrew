import { z } from "zod";
import {
  newMailboxKey,
  seal,
  unseal,
  requestBody,
  REQUEST_PREFIX,
  VAULT_PREFIX,
  REPLY_PREFIX,
  type MailboxConfig,
  type MailboxReply,
  type MailboxRequest,
} from "../../shared/mailbox";
import type { VaultOperation } from "../../shared/vault";

const repositoryPattern = /^[\w-]+\/gitrew-auth$/;
export const mailboxConfigSchema = z.object({
  version: z.literal(1),
  repository: z.string().regex(repositoryPattern),
  clientId: z.string().min(1),
  appSlug: z.string().regex(/^[\w-]+$/),
  publicKey: z.string().regex(/^[\w-]{87}$/),
  vault: z.string().optional(),
  appId: z.string().optional(),
  creatorClientId: z.string().optional(),
  creatorAppSlug: z.string().optional(),
  openRegistration: z.boolean().optional(),
  memberPrivateChannels: z.boolean().optional(),
});
export interface PendingMailbox {
  config: MailboxConfig;
  request: MailboxRequest;
  privateKey: JsonWebKey;
  issue?: number;
  lastReply?: number;
}
export async function mailboxConfig(
  repository: string,
  signal?: AbortSignal,
): Promise<MailboxConfig> {
  if (!repositoryPattern.test(repository))
    throw new Error("Use organization/gitrew-auth.");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/gitrew-auth.json`,
    {
      headers: { Accept: "application/vnd.github.raw+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok)
    throw new Error("This GitHub-only sign-in mailbox is unavailable.");
  const config = mailboxConfigSchema.parse(await response.json());
  if (config.repository.toLowerCase() !== repository.toLowerCase())
    throw new Error("Mailbox configuration does not match its repository.");
  return config;
}
export async function prepareMailbox(
  config: MailboxConfig,
  operation?: VaultOperation,
  creator = false,
): Promise<PendingMailbox> {
  const key = await newMailboxKey();
  const request: MailboxRequest = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    kind: operation ? "vault" : "device",
    publicKey: key.publicKey,
    ...(creator ? { app: "creator" as const } : {}),
  };
  if (operation)
    request.payload = await seal(
      key.privateKey,
      key.publicKey,
      config.publicKey,
      request.id,
      operation,
    );
  return { config, request, privateKey: key.privateKey };
}
export function mailboxIssueUrl(pending: PendingMailbox) {
  const url = new URL(
    `https://github.com/${pending.config.repository}/issues/new`,
  );
  url.searchParams.set("title", REQUEST_PREFIX + pending.request.id);
  url.searchParams.set("body", requestBody(pending.request));
  return url.href;
}
export async function mailboxReplies(
  pending: PendingMailbox,
  token = "",
  signal?: AbortSignal,
): Promise<MailboxReply[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const get = async (path: string) => {
    const response = await fetch(
      `https://api.github.com/repos/${pending.config.repository}/${path}`,
      {
        headers,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal,
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 403 || response.status === 429
          ? "GitHub API limit reached. Wait before retrying sign-in."
          : "Could not read the GitHub mailbox.",
      );
    return response.json();
  };
  if (!pending.issue) {
    const issues: { number: number; title: string; pull_request?: unknown }[] =
      await get(
        `issues?state=all&sort=created&direction=desc&per_page=100&since=${encodeURIComponent(new Date(pending.request.createdAt - 60_000).toISOString())}`,
      );
    pending.issue = issues.find(
      (issue) =>
        !issue.pull_request &&
        issue.title === REQUEST_PREFIX + pending.request.id,
    )?.number;
    if (!pending.issue) return [];
  }
  const replies: MailboxReply[] = [];
  for (let page = 1; ; page++) {
    const comments: { body: string; id: number }[] = await get(
      `issues/${pending.issue}/comments?per_page=100&page=${page}`,
    );
    for (const comment of comments) {
      if (!comment.body.startsWith(REPLY_PREFIX)) continue;
      try {
        const value = (await unseal(
          pending.privateKey,
          pending.config.publicKey,
          pending.request.id,
          JSON.parse(comment.body.slice(REPLY_PREFIX.length)),
        )) as MailboxReply;
        if (value.id === pending.request.id) replies.push(value);
      } catch {
        /* Public commenters cannot authenticate forged replies or interrupt sign-in. */
      }
    }
    if (comments.length < 100) break;
  }
  return replies;
}
const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
export async function waitForSession(
  pending: PendingMailbox,
  onDevice: (value: Extract<MailboxReply, { kind: "device" }>) => void,
  signal?: AbortSignal,
) {
  for (
    let attempt = 0;
    Date.now() - pending.request.createdAt < 15 * 60_000;
    attempt++
  ) {
    for (const reply of await mailboxReplies(pending, "", signal)) {
      if (reply.kind === "error") throw new Error(reply.message);
      if (reply.kind === "device") onDevice(reply);
      if (reply.kind === "session") {
        if (
          typeof reply.accessToken !== "string" ||
          !reply.accessToken ||
          !Number.isSafeInteger(reply.userId) ||
          typeof reply.login !== "string" ||
          typeof reply.expiresAt !== "number" ||
          reply.expiresAt <= Date.now() ||
          reply.expiresAt > Date.now() + 28_800_000
        )
          throw new Error("Invalid GitHub session response.");
        return reply;
      }
    }
    await pause(attempt < 3 ? 5000 : 20_000, signal);
  }
  throw new Error("Sign-in timed out. Start again.");
}
export async function vaultRequest<T>(
  config: MailboxConfig,
  token: string,
  operation: VaultOperation,
  signal?: AbortSignal,
  requestId?: string,
): Promise<T> {
  if (!token) throw new Error("Sign in before opening a private conversation.");
  if (config.backend) {
    const { backendJson } = await import("./backend");
    return backendJson<T>("/api/vault", token, {
      organization: config.repository.split("/")[0], operation, nonce: requestId,
    }, signal);
  }
  const pending = await prepareMailbox(config, operation);
  if (requestId) {
    pending.request.id = requestId;
    pending.request.payload = await seal(
      pending.privateKey,
      pending.request.publicKey,
      config.publicKey,
      requestId,
      operation,
    );
  }
  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({
        title: VAULT_PREFIX + pending.request.id,
        body: requestBody(pending.request),
      }),
      signal,
    },
  );
  if (!response.ok)
    throw new Error(
      "Could not submit the vault request. The workspace App needs Issues write permission on gitrew-auth.",
    );
  pending.issue = (await response.json()).number;
  for (let attempt = 0; attempt < 120; attempt++) {
    const parts = new Map<number, string>();
    let total = 0;
    for (const reply of await mailboxReplies(pending, token, signal)) {
      if (reply.kind === "error") throw new Error(reply.message);
      if (
        reply.kind === "result" &&
        Number.isSafeInteger(reply.total) &&
        reply.total > 0 &&
        reply.total <= 200 &&
        Number.isSafeInteger(reply.part) &&
        reply.part >= 0 &&
        reply.part < reply.total &&
        typeof reply.data === "string"
      ) {
        if (total && total !== reply.total)
          throw new Error("Conflicting vault response.");
        total = reply.total;
        parts.set(reply.part, reply.data);
      }
    }
    if (total && parts.size === total)
      return JSON.parse(
        Array.from({ length: total }, (_, i) => parts.get(i)).join(""),
      ) as T;
    await pause(attempt < 5 ? 3000 : 10_000, signal);
  }
  throw new Error(
    "Vault request is still queued. Refresh before retrying a message to avoid duplicates.",
  );
}
