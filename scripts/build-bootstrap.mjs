import { readFile, mkdir, writeFile } from "node:fs/promises";
const files = {
  ".github/workflows/auth.yml": "templates/auth-workflow.yml",
  "scripts/action-auth.ts": "scripts/action-auth.ts",
  "scripts/vault-service.ts": "scripts/vault-service.ts",
  "shared/mailbox.ts": "shared/mailbox.ts",
  "shared/vault.ts": "shared/vault.ts",
};
const bundle = {};
for (const [target, source] of Object.entries(files))
  bundle[target] = await readFile(source, "utf8");
await mkdir("public/bootstrap", { recursive: true });
await writeFile("public/bootstrap/auth-bundle.json", JSON.stringify(bundle));
