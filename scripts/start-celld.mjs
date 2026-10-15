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
await writeFile(".dev.vars", `SETUP_TOKEN=${secret}\n`, { mode: 0o600 });
const child = spawn(
  "celld",
  ["dev", ".", "--host", "0.0.0.0", "--port", "9877", "--no-watch"],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 1));
