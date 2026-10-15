import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
// Discard a stale Nitro-generated redirect from an earlier provider preset.
rmSync(".wrangler/deploy/config.json", { force: true });
for (const args of [
  ["run", "build"],
  [
    "exec",
    "--",
    "esbuild",
    "backend/worker.ts",
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--target=es2022",
    "--external:node:*",
    "--outfile=artifacts/backend-worker.mjs",
  ],
]) {
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      NUXT_PUBLIC_BACKEND_ENABLED: "true",
      BASE_PATH: "/",
      NITRO_PRESET: "static",
    },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
