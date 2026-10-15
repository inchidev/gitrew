import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer, request } from "node:http";

const root = new URL("../.vercel/output/", import.meta.url);
const config = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
assert.equal(config.version, 3);
for (const path of [
  "/api/setup/callback",
  "/api/auth/callback",
  "/api/webhooks",
  "/api/vault",
  "/health",
]) {
  const route = config.routes.find(
    (route) => route.src && new RegExp(`^${route.src}$`).test(path),
  );
  assert.equal(route?.dest, "/api/gitrew", path);
}
assert.deepEqual(config.routes.at(-1), { src: "/.*", dest: "/200.html" });
for (const path of [
  "static/index.html",
  "static/200.html",
  "static/create/index.html",
  "functions/api/gitrew.func/index.mjs",
]) {
  assert.ok((await stat(new URL(path, root))).size > 0, path);
}
const fn = JSON.parse(
  await readFile(
    new URL("functions/api/gitrew.func/.vc-config.json", root),
    "utf8",
  ),
);
assert.equal(fn.runtime, "nodejs22.x");
process.env.GITREW_ORIGIN = "https://gitrew-package.test";
process.env.BLOB_READ_WRITE_TOKEN = "build-check-placeholder-never-used";
const { default: handler } = await import(
  new URL("functions/api/gitrew.func/index.mjs", root)
);
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const result = await new Promise((resolve, reject) => {
    request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path: "/health",
        headers: { Host: "gitrew-package.test" },
      },
      async (response) => {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString(),
        });
      },
    )
      .on("error", reject)
      .end();
  });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { service: "gitrew", version: 1 });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  "Vercel package: frontend, API routing, deep-link fallback and bundled Node handler verified.",
);
