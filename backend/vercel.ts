import type { IncomingMessage, ServerResponse } from "node:http";
import worker, { type BackendEnv } from "./worker";
import { BlobStore, privateBlobTransport } from "./blob-store";
import { HttpError, json } from "./security";

type Environment = Record<string, string | undefined>;

export function deploymentOrigin(env: Environment) {
  const value =
    env.GITREW_ORIGIN ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  if (!value)
    throw new HttpError(
      503,
      "Set GITREW_ORIGIN to your site's HTTPS address in Vercel settings.",
    );
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new HttpError(
      503,
      "GITREW_ORIGIN must be an HTTPS origin without a path.",
    );
  return url.origin;
}

export function vercelEnvironment(env: Environment): BackendEnv {
  if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID)
    throw new HttpError(
      503,
      "Connect a private Blob store in Vercel Storage, then redeploy this project.",
    );
  return {
    STORE: new BlobStore(
      env.SETUP_TOKEN || "",
      privateBlobTransport(env.BLOB_READ_WRITE_TOKEN, env.BLOB_STORE_ID),
    ),
    SETUP_TOKEN: env.SETUP_TOKEN || "",
    PUBLIC_APP: "false",
    SANDBOX_ORGANIZATION: "",
    PLATFORM: "vercel",
  };
}

// A Node launcher keeps the same Web Request/Response backend as Cloudflare.
// No per-user credentials or setup state are retained in function memory.
export function createVercelHandler(
  environment: Environment,
  backend = () => vercelEnvironment(environment),
) {
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    let response: Response;
    try {
      const origin = deploymentOrigin(environment);
      const path = incoming.url || "/";
      if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
        throw new HttpError(400, "Invalid request address.");
      if (incoming.headers.host !== new URL(origin).host)
        throw new HttpError(
          403,
          "Use this deployment's configured Gitrew address.",
        );
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      // Vercel sets this header at its proxy. Never accept a caller's CF header.
      headers.delete("CF-Connecting-IP");
      headers.set(
        "CF-Connecting-IP",
        headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      );
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 131_072) throw new HttpError(413, "Request is too large.");
        chunks.push(bytes);
      }
      const method = incoming.method || "GET";
      const request = new Request(origin + path, {
        method,
        headers,
        body:
          method === "GET" || method === "HEAD"
            ? undefined
            : Buffer.concat(chunks),
      });
      response = await worker.fetch(request, backend());
    } catch (error) {
      response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Gitrew could not complete this request. Check this deployment's configuration.",
        },
        error instanceof HttpError ? error.status : 503,
      );
    }
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") outgoing.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader("Set-Cookie", cookies);
    outgoing.end(
      incoming.method === "HEAD"
        ? undefined
        : Buffer.from(await response.arrayBuffer()),
    );
  };
}

export default createVercelHandler(process.env);
