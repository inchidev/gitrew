import { mkdir, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const raw = await webcrypto.subtle.exportKey("raw", pair.publicKey),
  jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
await mkdir(".gitrew-setup", { recursive: true, mode: 0o700 });
await writeFile(
  ".gitrew-setup/vapid.env",
  `VAPID_PUBLIC_KEY=${Buffer.from(raw).toString("base64url")}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=mailto:you@example.com\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Saved Web Push keys to ignored .gitrew-setup/vapid.env (0600). Set VAPID_SUBJECT before use.",
);
