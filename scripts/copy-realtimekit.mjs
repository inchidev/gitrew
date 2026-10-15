import { cp, mkdir } from "node:fs/promises";
await mkdir("public/rtk", { recursive: true });
await cp(
  "node_modules/@cloudflare/realtimekit-ui/dist/realtimekit-ui",
  "public/rtk",
  { recursive: true },
);
