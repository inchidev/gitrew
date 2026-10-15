import { isRecord, parseExchange } from "../shared/oauth-contract";

function parseBindings(input: unknown) {
  if (!isRecord(input)) throw new Error("Missing configuration");
  function text(key: string): string {
    const value = input && isRecord(input) ? input[key] : null;
    if (typeof value !== "string" || !value)
      throw new Error("Missing configuration");
    return value;
  }
  const env = {
    GITHUB_CLIENT_ID: text("GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: text("GITHUB_CLIENT_SECRET"),
    GITHUB_APP_SLUG: text("GITHUB_APP_SLUG"),
    CLIENT_URL: text("CLIENT_URL"),
  };
  const url = new URL(env.CLIENT_URL);
  if (
    !/^[a-z0-9-]+$/.test(env.GITHUB_APP_SLUG) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/") ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    )
  )
    throw new Error("Invalid configuration");
  return env;
}

async function boundedJson(
  request: Request | Response,
  limit: number,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** OAuth code exchange only: no chat proxy, storage, installation credentials, or request logging. */
export default {
  async fetch(request: Request, bindings: unknown): Promise<Response> {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    let env: ReturnType<typeof parseBindings>;
    try {
      env = parseBindings(bindings);
    } catch {
      return json({ error: "Sign-in is not configured." }, 503);
    }
    if (origin !== new URL(env.CLIENT_URL).origin)
      return json({ error: "Origin is not allowed." }, 403);
    headers.set("Access-Control-Allow-Origin", origin);
    const url = new URL(request.url);
    if (!["/config", "/exchange"].includes(url.pathname) || url.search)
      return json({ error: "Not found." }, 404);
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/config" && request.method === "GET") {
      return json({
        clientId: env.GITHUB_CLIENT_ID,
        redirectUri: env.CLIENT_URL,
        installUrl: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
      });
    }
    if (url.pathname !== "/exchange" || request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json"
    )
      return json({ error: "Use JSON." }, 415);
    let input: ReturnType<typeof parseExchange>;
    try {
      input = parseExchange(await boundedJson(request, 2048));
    } catch {
      return json({ error: "Invalid sign-in request." }, 400);
    }
    try {
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: input.code,
            code_verifier: input.verifier,
            redirect_uri: env.CLIENT_URL,
          }),
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        },
      );
      if (!response.ok)
        return json({ error: "GitHub sign-in is unavailable." }, 502);
      const token = await boundedJson(response, 16_384);
      // Reject non-expiring tokens. Refresh tokens, if returned by GitHub, are deliberately discarded.
      if (
        !isRecord(token) ||
        typeof token.access_token !== "string" ||
        !token.access_token ||
        token.token_type !== "bearer" ||
        typeof token.expires_in !== "number" ||
        !Number.isInteger(token.expires_in) ||
        token.expires_in <= 0 ||
        token.expires_in > 28_800
      ) {
        return json(
          {
            error:
              "Sign-in was rejected or the app does not issue expiring tokens.",
          },
          401,
        );
      }
      return json({
        accessToken: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000,
      });
    } catch {
      return json(
        { error: "GitHub sign-in is unavailable. Please try again." },
        502,
      );
    }
  },
};
