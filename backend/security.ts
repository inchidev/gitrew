import { Buffer } from "node:buffer";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const random = () =>
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(bytes).toString("hex");
}
export async function equal(a: string, b: string) {
  const left = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
  );
  const right = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)),
  );
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}
export async function boundedBytes(source: Request | Response, limit = 32_768) {
  const reader = source.body?.getReader();
  if (!reader || Number(source.headers.get("Content-Length")) > limit)
    throw new HttpError(413, "Request is too large.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function boundedJson(
  source: Request | Response,
  limit = 32_768,
): Promise<unknown> {
  const bytes = await boundedBytes(source, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(
  request: Request,
  name: string,
  value: string,
  seconds: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${name.startsWith("__Host-") || new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new HttpError(403, "This request must come from your Gitrew site.");
}
export function json(value: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(value), { status, headers });
}
export function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
}
