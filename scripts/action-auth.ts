import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  REQUEST_PREFIX,
  VAULT_PREFIX,
  REPLY_PREFIX,
  parseMailboxRequest,
  seal,
  unseal,
  type MailboxConfig,
  type MailboxReply,
} from "../shared/mailbox.ts";
import { installationToken, executeVault } from "./vault-service.ts";

interface Actor {
  login: string;
  id: number;
}
interface Event {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string;
    user: Actor;
    created_at: string;
  };
  sender: Actor;
  repository: { full_name: string };
}
export async function processAuth(
  event: Event,
  config: MailboxConfig,
  privateKey: JsonWebKey,
  dependencies: {
    fetch: typeof fetch;
    token: string;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    appPrivateKey?: string;
  },
) {
  if (
    event.action !== "opened" ||
    ![REQUEST_PREFIX, VAULT_PREFIX].some((prefix) =>
      event.issue.title.startsWith(prefix),
    )
  )
    return;
  if (
    event.repository.full_name.toLowerCase() !==
      config.repository.toLowerCase() ||
    event.issue.user.id !== event.sender.id
  )
    throw new Error("Invalid auth event.");
  const request = parseMailboxRequest(
    event.issue.title,
    event.issue.body,
    dependencies.now(),
  );
  if (
    Math.abs(Date.parse(event.issue.created_at) - request.createdAt) > 600_000
  )
    throw new Error("Invalid request time.");
  const issuePath = `https://api.github.com/repos/${config.repository}/issues/${event.issue.number}`;
  const headers = {
    Authorization: `Bearer ${dependencies.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  const comment = async (reply: MailboxReply) => {
    const encrypted = await seal(
      privateKey,
      config.publicKey,
      request.publicKey,
      request.id,
      reply,
    );
    const response = await dependencies.fetch(`${issuePath}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: REPLY_PREFIX + JSON.stringify(encrypted) }),
    });
    if (!response.ok)
      throw new Error("Could not publish encrypted auth response.");
  };
  const github = async (url: string, data: unknown) => {
    const response = await dependencies.fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("GitHub authorization is unavailable.");
    return (await response.json()) as Record<string, unknown>;
  };
  try {
    if (request.kind === "probe") {
      await comment({
        id: request.id,
        kind: "probe",
        login: event.issue.user.login,
        userId: event.issue.user.id,
      });
      return;
    }
    if (request.kind === "vault") {
      if (
        !config.vault ||
        !config.appId ||
        !dependencies.appPrivateKey ||
        !request.payload
      )
        throw new Error("Vault is not configured.");
      const expectedVault = `${config.repository.split("/")[0]}/gitrew-vault`;
      if (config.vault.toLowerCase() !== expectedVault.toLowerCase())
        throw new Error("Invalid vault configuration.");
      const operation = await unseal(
        privateKey,
        request.publicKey,
        request.id,
        request.payload,
      );
      const settings = {
        repository: config.vault,
        appId: config.appId,
        privateKey: dependencies.appPrivateKey,
      };
      const vaultToken = await installationToken(settings, dependencies.fetch);
      let result: string;
      try {
        result = JSON.stringify(
          await executeVault(
            settings,
            event.issue.user,
            operation,
            request.id,
            vaultToken,
            dependencies.fetch,
          ),
        );
      } finally {
        await dependencies.fetch("https://api.github.com/installation/token", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${vaultToken}`,
            Accept: "application/vnd.github+json",
          },
        });
      }
      const total = Math.max(1, Math.ceil(result.length / 5000));
      if (total > 200)
        throw new Error(
          "Conversation is too large to transfer through the mailbox.",
        );
      for (let part = 0; part < total; part++)
        await comment({
          id: request.id,
          kind: "result",
          part,
          total,
          data: result.slice(part * 5000, (part + 1) * 5000),
        });
      return;
    }
    const clientId =
      request.app === "creator" ? config.creatorClientId : config.clientId;
    if (!clientId) throw new Error("The installer App is not configured.");
    const device = await github("https://github.com/login/device/code", {
      client_id: clientId,
      scope: "offline_access",
    });
    if (
      typeof device.device_code !== "string" ||
      typeof device.user_code !== "string" ||
      typeof device.expires_in !== "number" ||
      typeof device.interval !== "number"
    )
      throw new Error(
        "Device Flow is unavailable. Enable it in this GitHub App’s settings.",
      );
    const deadline =
      dependencies.now() + Math.min(device.expires_in * 1000, 600_000);
    await comment({
      id: request.id,
      kind: "device",
      userCode: device.user_code,
      expiresAt: deadline,
    });
    let delay = Math.max(5, device.interval) * 1000;
    while (dependencies.now() < deadline) {
      await dependencies.sleep(delay);
      const result = await github(
        "https://github.com/login/oauth/access_token",
        {
          client_id: clientId,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
      );
      if (result.error === "authorization_pending") continue;
      if (result.error === "slow_down") {
        delay += 5000;
        continue;
      }
      if (result.error)
        throw new Error(
          "GitHub authorization was cancelled or expired. Start again.",
        );
      if (
        typeof result.access_token !== "string" ||
        typeof result.expires_in !== "number" ||
        result.expires_in <= 0 ||
        result.expires_in > 28_800 ||
        result.token_type !== "bearer"
      )
        throw new Error("GitHub did not issue an expiring session.");
      const response = await dependencies.fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${result.access_token}`,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const user = response.ok ? ((await response.json()) as Actor) : null;
      if (!user || user.id !== event.issue.user.id)
        throw new Error(
          "Authorize the same GitHub account that created this issue.",
        );
      // Refresh credentials are deliberately discarded. Reauthorize when the eight-hour session ends.
      await comment({
        id: request.id,
        kind: "session",
        accessToken: result.access_token,
        expiresAt: dependencies.now() + result.expires_in * 1000,
        login: user.login,
        userId: user.id,
      });
      return;
    }
    throw new Error("Sign-in timed out. Start again.");
  } catch (error) {
    const allowed = [
      "Device Flow is unavailable. Enable it in this GitHub App’s settings.",
      "Authorize the same GitHub account that created this issue.",
      "GitHub authorization was cancelled or expired. Start again.",
      "Sign-in timed out. Start again.",
      "Vault is not configured.",
      "Vault must be private.",
      "Install the workspace App on gitrew-vault.",
      "Workspace App cannot access the vault.",
      "Vault repository access must be restricted to workspace administrators.",
      "You are not a member of this workspace.",
      "Only workspace administrators can remove members.",
      "Only workspace administrators can invite members.",
      "Only administrators can create private channels.",
      "Every participant must belong to this workspace.",
      "Select exactly one other member for a direct conversation.",
      "Conversation is too large to transfer through the mailbox.",
    ];
    await comment({
      id: request.id,
      kind: "error",
      message:
        error instanceof Error && allowed.includes(error.message)
          ? error.message
          : request.kind === "vault"
            ? "Vault request failed. Refresh or contact the workspace administrator."
            : "Sign-in failed. Start again or contact the workspace administrator.",
    });
  } finally {
    await dependencies.fetch(issuePath, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ state: "closed" }),
    });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const event = JSON.parse(
      await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"),
    );
    const config = JSON.parse(await readFile("gitrew-auth.json", "utf8"));
    const privateKey = JSON.parse(process.env.MAILBOX_PRIVATE_KEY!);
    await processAuth(event, config, privateKey, {
      fetch,
      token: process.env.GITHUB_TOKEN!,
      appPrivateKey: process.env.GITREW_APP_PRIVATE_KEY,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
    });
  } catch {
    console.error(
      "Gitrew auth request could not be processed. No credentials were logged.",
    );
    process.exitCode = 1;
  }
}
