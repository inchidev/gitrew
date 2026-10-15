import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import {
  BlobStore,
  privateBlobTransport,
  type BlobSnapshotTransport,
} from "../backend/blob-store";
import {
  createVercelHandler,
  deploymentOrigin,
  vercelEnvironment,
} from "../backend/vercel";
import type { App, Workspace } from "../backend/store";
import { vercelDeployUrl } from "../shared/deploy";

const origin = "https://gitrew.test";
const secret = "test-only-key-with-at-least-32-characters";
const app: App = {
  id: 123,
  slug: "gitrew-team",
  client_id: "client-id",
  client_secret: "private-client-secret",
  pem: "private-app-key",
  webhook_secret: "private-webhook-secret",
  owner: { login: "team" },
  origin,
};
const credentials = {
  accessToken: "private-user-token",
  accessExpires: Date.now() + 28800_000,
  refreshToken: "private-refresh-token",
  refreshExpires: Date.now() + 15897600_000,
};
class MemoryBlob implements BlobSnapshotTransport {
  value: string | null = null;
  revision = 0;
  conflicts = 0;
  async read() {
    return this.value === null
      ? null
      : { value: this.value, etag: String(this.revision) };
  }
  async write(value: string, etag?: string) {
    if (
      (etag === undefined && this.value !== null) ||
      (etag !== undefined && etag !== String(this.revision))
    ) {
      this.conflicts++;
      throw new BlobPreconditionFailedError();
    }
    this.value = value;
    this.revision++;
  }
}
let blob: MemoryBlob;
const stores = () => new BlobStore(secret, blob);
let server: Server | undefined;
beforeEach(async () => {
  blob = new MemoryBlob();
  await stores().initialize();
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("private Blob SDK transport", () => {
  it("keeps conditional writes working after the snapshot grows enough to be compressed", async () => {
    let value: string | null = null;
    let revision = 0;
    let compressedReads = 0;
    let conflicts = 0;
    const dispatcher = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    const pool = agent.get(/.*/);
    pool
      .intercept({ path: /.*/, method: "GET" })
      .reply((options) => {
        expect(options.path).toContain("cache=0");
        if (value === null) return { statusCode: 404, data: "" };
        const headers = new Headers(options.headers as Record<string, string>);
        const etag = `"revision-${revision}"`;
        // Vercel's CDN weakens the origin ETag when compressing larger bodies.
        const compressed =
          value.length > 2000 && headers.get("accept-encoding") !== "identity";
        if (compressed) compressedReads++;
        return {
          statusCode: 200,
          data: value,
          responseOptions: {
            headers: { etag: compressed ? `W/${etag}` : etag },
          },
        };
      })
      .persist();
    pool
      .intercept({ path: /.*/, method: "PUT" })
      .reply(async (options) => {
        const headers = new Headers(options.headers as Record<string, string>);
        if (
          value !== null &&
          headers.get("x-if-match") !== `"revision-${revision}"`
        ) {
          conflicts++;
          return {
            statusCode: 412,
            data: JSON.stringify({ error: { code: "precondition_failed" } }),
          };
        }
        const chunks: Buffer[] = [];
        for await (const chunk of options.body as AsyncIterable<Uint8Array>)
          chunks.push(Buffer.from(chunk));
        value = Buffer.concat(chunks).toString();
        revision++;
        return {
          statusCode: 200,
          data: JSON.stringify({
            url: "https://test.private.blob.vercel-storage.com/gitrew/state-v1.enc",
            pathname: "gitrew/state-v1.enc",
            contentType: "application/octet-stream",
            contentDisposition: "",
            etag: `"revision-${revision}"`,
          }),
        };
      })
      .persist();
    try {
      const store = new BlobStore(
        secret,
        privateBlobTransport("vercel_blob_rw_test_test"),
      );
      await store.initialize();
      await store.register({ ...app, pem: "private-app-key".repeat(200) });
      await store.locked("registration", async () => {
        const state = await store.state("oauth", { next: "/create/" });
        expect(await store.consume(state, "oauth")).toEqual({
          next: "/create/",
        });
      });
      const session = await store.createSession(42, credentials);
      expect((await store.session(session.raw)).userId).toBe(42);
      expect(compressedReads).toBe(0);
      expect(conflicts).toBe(0);
    } finally {
      setGlobalDispatcher(dispatcher);
      await agent.close();
    }
  });
});

describe("private Blob metadata storage", () => {
  it("persists encrypted App credentials and sessions across independent instances", async () => {
    await stores().register(app);
    const session = await stores().createSession(42, credentials);
    expect(await stores().app()).toEqual(app);
    expect((await stores().session(session.raw)).credentials).toEqual(
      credentials,
    );
    expect(blob.value).not.toContain(app.client_secret);
    expect(blob.value).not.toContain(credentials.accessToken);
    await expect(
      new BlobStore(
        "different-test-key-with-at-least-32-characters",
        blob,
      ).app(),
    ).rejects.toThrow();
    await expect(
      stores().register({ ...app, slug: "another-app" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves concurrent writes and consumes authorization state exactly once", async () => {
    const [first, second] = await Promise.all([
      stores().state("oauth", { first: true }),
      stores().state("oauth", { second: true }),
    ]);
    expect(blob.conflicts).toBeGreaterThan(0);
    expect(await stores().consume(second, "oauth")).toEqual({ second: true });
    const results = await Promise.allSettled([
      stores().consume(first, "oauth"),
      stores().consume(first, "oauth"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
  it("expires pending state, enforces distributed locks and revokes only the requested user's sessions", async () => {
    const state = await stores().state("oauth", {});
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 600_001);
    await expect(stores().consume(state, "oauth")).rejects.toMatchObject({
      status: 400,
    });
    clock.mockRestore();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const operation = stores().locked("vault:team", async () => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await ready;
    await expect(
      stores().locked("vault:team", async () => {}),
    ).rejects.toMatchObject({ status: 409 });
    release();
    await operation;
    await expect(
      stores().locked("vault:team", async () => "released"),
    ).resolves.toBe("released");
    const alice = await stores().createSession(1, credentials);
    const bob = await stores().createSession(2, credentials);
    await stores().revoke(1);
    await expect(stores().session(alice.raw)).rejects.toMatchObject({
      status: 401,
    });
    expect((await stores().session(bob.raw)).userId).toBe(2);
    await stores().logout(bob.session.id);
    await expect(stores().session(bob.raw)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("persists provisioning checkpoints and applies per-client rate limits", async () => {
    const workspace: Workspace = {
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "same-retry-nonce",
      ready: false,
      openRegistration: false,
      memberPrivateChannels: false,
    };
    await stores().saveWorkspace(workspace);
    expect(await stores().defaultWorkspace()).toBeNull();
    expect(await stores().workspace("TEAM")).toEqual(workspace);
    expect(await stores().workspace("constructor")).toBeNull();
    await stores().saveWorkspace({ ...workspace, ready: true });
    expect((await stores().defaultWorkspace())?.nonce).toBe(workspace.nonce);
    // Keep all requests in the same minute.
    vi.spyOn(Date, "now").mockReturnValue(1800000000000);
    const request = new Request(origin, {
      headers: { "CF-Connecting-IP": "192.0.2.1" },
    });
    for (let count = 0; count < 10; count++)
      await stores().rateLimit(request, "login");
    await expect(stores().rateLimit(request, "login")).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      stores().rateLimit(
        new Request(origin, { headers: { "CF-Connecting-IP": "192.0.2.2" } }),
        "login",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("Vercel function and deployment", () => {
  it("requests native private Blob storage without a database and pins the production origin", () => {
    const url = new URL(vercelDeployUrl);
    expect(JSON.parse(url.searchParams.get("stores")!)).toEqual([
      { type: "blob", access: "private" },
    ]);
    expect(url.searchParams.get("env")).toBe("SETUP_TOKEN");
    expect(
      deploymentOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "crew.vercel.app" }),
    ).toBe("https://crew.vercel.app");
    expect(() =>
      deploymentOrigin({ GITREW_ORIGIN: "https://crew.test/path" }),
    ).toThrow();
    expect(() => vercelEnvironment({})).toThrow(/private Blob/);
  });
  it("runs the App manifest and OAuth flow on the team's origin and validates raw webhook bytes", async () => {
    const network = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.hostname === "127.0.0.1") return network(input, init);
      if (url.pathname === "/app-manifests/manifest-code/conversions")
        return Response.json(app);
      if (url.pathname === "/login/oauth/access_token")
        return Response.json({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          token_type: "bearer",
          expires_in: 28800,
          refresh_token_expires_in: 15897600,
        });
      if (url.pathname === "/user")
        return Response.json({ id: 42, login: "alice" });
      throw new Error("Unexpected request " + url.href);
    });
    // Each request gets a new store instance, as it can on separate cold starts.
    server = createServer(
      createVercelHandler({ GITREW_ORIGIN: origin }, () => ({
        STORE: stores(),
        SETUP_TOKEN: secret,
        PUBLIC_APP: "false",
        SANDBOX_ORGANIZATION: "",
        PLATFORM: "vercel",
      })),
    );
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = (path: string, init: RequestInit = {}) =>
      new Promise<Response>((resolve, reject) => {
        const request = httpRequest(
          endpoint + path,
          {
            method: init.method || "GET",
            headers: {
              Host: "gitrew.test",
              Origin: origin,
              "Content-Type": "application/json",
              ...init.headers,
            },
          },
          (response) => {
            const headers = new Headers();
            for (let index = 0; index < response.rawHeaders.length; index += 2)
              headers.append(
                response.rawHeaders[index]!,
                response.rawHeaders[index + 1]!,
              );
            const chunks: Buffer[] = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: response.statusCode!,
                  headers,
                }),
              ),
            );
            response.on("error", reject);
          },
        );
        request.on("error", reject);
        request.end(typeof init.body === "string" ? init.body : undefined);
      });
    const start = await call("/api/setup/start", {
      method: "POST",
      body: JSON.stringify({ organization: "team", setupToken: secret }),
    });
    expect(start.status).toBe(200);
    const manifest = await start.json();
    expect(JSON.parse(manifest.manifest).callback_urls).toEqual([
      origin + "/api/auth/callback",
    ]);
    expect(JSON.parse(manifest.manifest).hook_attributes.url).toBe(
      origin + "/api/webhooks",
    );
    const state = new URL(manifest.action).searchParams.get("state");
    const setupCookie = start.headers.getSetCookie()[0]!.split(";")[0]!;
    expect(
      (
        await call(`/api/setup/callback?code=manifest-code&state=${state}`, {
          headers: { Cookie: setupCookie },
        })
      ).status,
    ).toBe(303);
    const config = await call("/api/config");
    expect(await config.json()).toMatchObject({
      configured: true,
      platform: "vercel",
    });
    const auth = await call("/api/auth/start");
    const authState = new URL(auth.headers.get("location")!).searchParams.get(
      "state",
    );
    const callback = await call(
      `/api/auth/callback?code=oauth-code&state=${authState}`,
      { headers: { Cookie: auth.headers.getSetCookie()[0]!.split(";")[0]! } },
    );
    expect(callback.status).toBe(303);
    const cookies = callback.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const session = cookies.find((cookie) =>
      cookie.startsWith("__Host-gitrew_session="),
    )!;
    expect(session).toContain("HttpOnly");
    expect(session).toContain("Secure");
    const cookie = session.split(";")[0]!;
    const loggedIn = await call("/api/session", {
      headers: { Cookie: cookie },
    });
    expect(loggedIn.status).toBe(200);
    const body = await loggedIn.text();
    expect(body).toContain("alice");
    expect(body).not.toContain(credentials.accessToken);
    expect(
      (await call("/api/config", { headers: { Host: "untrusted.test" } }))
        .status,
    ).toBe(403);
    const raw = JSON.stringify(
      { action: "revoked", sender: { id: 42, login: "alice" } },
      null,
      2,
    );
    const webhook = (signature: string) =>
      call("/api/webhooks", {
        method: "POST",
        headers: {
          "X-GitHub-Event": "github_app_authorization",
          "X-Hub-Signature-256": signature,
        },
        body: raw,
      });
    expect((await webhook("sha256=invalid")).status).toBe(403);
    expect(
      (
        await webhook(
          "sha256=" +
            createHmac("sha256", app.webhook_secret).update(raw).digest("hex"),
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/api/session", { headers: { Cookie: cookie } })).status,
    ).toBe(401);
  });
});
