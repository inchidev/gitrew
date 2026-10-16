import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
await mkdir(".celld", { recursive: true });
let secret;
try {
  secret = await readFile(".celld/setup-token", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  secret = randomBytes(32).toString("hex");
  await writeFile(".celld/setup-token", secret, { mode: 0o600, flag: "wx" });
}
const optional = [
  "WORKSPACE_NAME",
  "HUDDLE_PROVIDER",
  "RTK_ACCOUNT_ID",
  "RTK_APP_ID",
  "RTK_API_TOKEN",
  "RTK_PRESET",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];
await writeFile(
  ".dev.vars",
  `SETUP_TOKEN=${secret}\n` +
    optional
      .filter((name) => process.env[name])
      .map((name) => `${name}=${JSON.stringify(process.env[name])}`)
      .join("\n") +
    "\n",
  { mode: 0o600 },
);
const child = spawn(
  "celld",
  ["dev", ".", "--host", "0.0.0.0", "--port", "9877", "--no-watch"],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 1));
