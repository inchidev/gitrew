/** GitHub-only auth mailbox. Both peers bind the ciphertext to one request ID. */
export interface Envelope {
  v: 1;
  key: string;
  iv: string;
  data: string;
}
export interface MailboxConfig {
  displayName?: string;
  administrator?: boolean;
  /** Cookie-session transport; no issue mailbox or encryption key is used. */
  backend?: boolean;
  version: 1;
  repository: string;
  clientId: string;
  appSlug: string;
  publicKey: string;
  vault?: string;
  appId?: string;
  creatorClientId?: string;
  creatorAppSlug?: string;
  openRegistration?: boolean;
  memberPrivateChannels?: boolean;
}
export interface MailboxRequest {
  id: string;
  createdAt: number;
  kind: "device" | "probe" | "vault";
  publicKey: string;
  payload?: Envelope;
  app?: "creator";
}
export type MailboxReply =
  | { id: string; kind: "device"; userCode: string; expiresAt: number }
  | {
      id: string;
      kind: "session";
      accessToken: string;
      expiresAt: number;
      login: string;
      userId: number;
    }
  | { id: string; kind: "probe"; login: string; userId: number }
  | { id: string; kind: "result"; part: number; total: number; data: string }
  | { id: string; kind: "error"; message: string };
export const REQUEST_PREFIX = "Gitrew auth ";
export const VAULT_PREFIX = "Gitrew vault ";
export const REPLY_PREFIX = "gitrew-reply-v1:";
const algorithm = { name: "ECDH", namedCurve: "P-256" };
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value) || value.length > 32_000)
    throw new Error("Invalid encrypted envelope.");
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function newMailboxKey() {
  const pair = await crypto.subtle.generateKey(algorithm, true, ["deriveKey"]);
  return {
    publicKey: encode(
      new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    ),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}
async function sharedKey(privateKey: JsonWebKey, peer: string) {
  const local = await crypto.subtle.importKey(
    "jwk",
    privateKey,
    algorithm,
    false,
    ["deriveKey"],
  );
  const remote = await crypto.subtle.importKey(
    "raw",
    decode(peer),
    algorithm,
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remote },
    local,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(
  privateKey: JsonWebKey,
  publicKey: string,
  recipient: string,
  id: string,
  value: unknown,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(`gitrew-mailbox-v1:${id}`),
    },
    await sharedKey(privateKey, recipient),
    encoder.encode(JSON.stringify(value)),
  );
  return {
    v: 1,
    key: publicKey,
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
  };
}
export async function unseal(
  privateKey: JsonWebKey,
  expectedPeer: string,
  id: string,
  value: Envelope,
): Promise<unknown> {
  if (value.v !== 1 || value.key !== expectedPeer)
    throw new Error("Unexpected auth sender.");
  const data = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(value.iv),
      additionalData: encoder.encode(`gitrew-mailbox-v1:${id}`),
    },
    await sharedKey(privateKey, expectedPeer),
    decode(value.data),
  );
  return JSON.parse(new TextDecoder().decode(data));
}
export function requestBody(request: MailboxRequest) {
  return `Gitrew sign-in request. Do not edit this block.\n\n\`\`\`json\n${JSON.stringify(request)}\n\`\`\``;
}
export function parseMailboxRequest(
  title: string,
  body: string,
  now = Date.now(),
): MailboxRequest {
  const prefix = title.startsWith(VAULT_PREFIX) ? VAULT_PREFIX : REQUEST_PREFIX;
  const id = title.slice(prefix.length);
  if (!title.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Invalid auth request.");
  const match = /```json\n([^\n]+)\n```/.exec(body);
  const value = match ? JSON.parse(match[1]!) : null;
  if (
    !value ||
    value.id !== id ||
    !["probe", "device", "vault"].includes(value.kind) ||
    (value.app !== undefined && value.app !== "creator") ||
    typeof value.createdAt !== "number" ||
    now - value.createdAt > 600_000 ||
    value.createdAt > now + 30_000 ||
    typeof value.publicKey !== "string" ||
    decode(value.publicKey).length !== 65
  )
    throw new Error("Expired or invalid auth request.");
  if ((prefix === VAULT_PREFIX) !== (value.kind === "vault"))
    throw new Error("Invalid mailbox route.");
  return value;
}
