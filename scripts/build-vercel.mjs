import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NUXT_PUBLIC_BACKEND_ENABLED: "true",
    BASE_PATH: "/",
    NITRO_PRESET: "static",
  },
});
if (result.status !== 0) process.exit(result.status || 1);

const output = ".vercel/output";
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/functions/api/gitrew.func`, { recursive: true });
await cp(".output/public", `${output}/static`, { recursive: true });
await build({
  entryPoints: ["backend/vercel.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: `${output}/functions/api/gitrew.func/index.mjs`,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await writeFile(
  `${output}/functions/api/gitrew.func/.vc-config.json`,
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    maxDuration: 60,
  }),
);
await writeFile(
  `${output}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { src: "/api(?:/.*)?", dest: "/api/gitrew" },
      { src: "/health", dest: "/api/gitrew" },
      {
        src: "/_nuxt/.*",
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        continue: true,
      },
      { handle: "filesystem" },
      { src: "/.*", dest: "/200.html" },
    ],
  }),
);
