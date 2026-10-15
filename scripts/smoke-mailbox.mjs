import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  newMailboxKey,
  REQUEST_PREFIX,
  REPLY_PREFIX,
  requestBody,
  unseal,
} from "../shared/mailbox.ts";
const repository = process.argv[2] || "inchidev/gitrew-auth";
const kind = process.argv[3] || "probe";
const creator = process.argv[4] === "creator";
if (process.argv[4] && !creator)
  throw new Error("Use creator as the optional App selector.");
if (
  !["probe", "device"].includes(kind) ||
  !/^[\w-]+\/gitrew-auth$/.test(repository)
)
  throw new Error("Invalid smoke test arguments.");
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
const config = JSON.parse(
  Buffer.from(
    gh([
      "api",
      `repos/${repository}/contents/gitrew-auth.json`,
      "--jq",
      ".content",
    ]),
    "base64",
  ).toString(),
);
const key = await newMailboxKey();
const started = Date.now();
const request = {
  id: crypto.randomUUID(),
  createdAt: started,
  kind,
  publicKey: key.publicKey,
  ...(creator ? { app: "creator" } : {}),
};
await mkdir("artifacts/live-auth", { recursive: true });
await writeFile("artifacts/live-auth/issue.md", requestBody(request));
const url = gh([
  "issue",
  "create",
  "--repo",
  repository,
  "--title",
  REQUEST_PREFIX + request.id,
  "--body-file",
  "artifacts/live-auth/issue.md",
]).trim();
console.log(url);
const issue = url.split("/").at(-1);
const seen = new Set();
for (let attempt = 0; attempt < 120; attempt++) {
  const comments = JSON.parse(
    gh(["api", `repos/${repository}/issues/${issue}/comments`, "--paginate"]),
  );
  for (const comment of comments) {
    if (seen.has(comment.id) || !comment.body.startsWith(REPLY_PREFIX))
      continue;
    seen.add(comment.id);
    const reply = await unseal(
      key.privateKey,
      config.publicKey,
      request.id,
      JSON.parse(comment.body.slice(REPLY_PREFIX.length)),
    );
    if (reply.id !== request.id) throw new Error("Wrong challenge.");
    if (reply.kind === "device")
      console.log(
        JSON.stringify({
          userCode: reply.userCode,
          verificationUrl: "https://github.com/login/device",
        }),
      );
    if (reply.kind === "error") throw new Error(reply.message);
    if (reply.kind === "probe" || reply.kind === "session") {
      if (reply.kind === "session")
        await writeFile(
          creator
            ? "artifacts/live-auth/creator-session.json"
            : repository.startsWith("gitrew-sandbox/")
              ? "artifacts/live-auth/sandbox-session.json"
              : "artifacts/live-auth/session.json",
          JSON.stringify(reply),
          { mode: 0o600 },
        );
      console.log(
        JSON.stringify({
          verified: true,
          kind: reply.kind,
          login: reply.login,
          userId: reply.userId,
          elapsedSeconds: Math.round((Date.now() - started) / 1000),
        }),
      );
      process.exit(0);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error("Mailbox test timed out.");
