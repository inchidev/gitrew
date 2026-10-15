import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

rmSync(".wrangler/deploy/config.json", { force: true });
const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NUXT_PUBLIC_SITE_MODE: "portal",
    NUXT_PUBLIC_BACKEND_ENABLED: "false",
    BASE_PATH: "/",
    NITRO_PRESET: "static",
  },
});
if (result.status !== 0) process.exit(result.status || 1);

// The product site has no workspace login or push service worker.
rmSync(".output/public/manifest.webmanifest", { force: true });
rmSync(".output/public/sw.js", { force: true });
writeFileSync(
  ".output/public/robots.txt",
  "User-agent: *\nAllow: /\nSitemap: https://gitrew.com/sitemap.xml\n",
);
writeFileSync(
  ".output/public/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://gitrew.com/</loc></url><url><loc>https://gitrew.com/create/</loc></url></urlset>',
);
