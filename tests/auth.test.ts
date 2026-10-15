import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brokerAddress,
  consumeCallback,
  createAuthorization,
  OAUTH_KEY,
  readSession,
  SESSION_KEY,
} from "../app/lib/auth";
import worker from "../oauth/worker";

afterEach(() => vi.unstubAllGlobals());

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("OAuth browser boundary", () => {
  it("binds the callback to a PKCE transaction, then consumes it exactly once", async () => {
    const storage = new MemoryStorage();
    const url = new URL(
      await createAuthorization(
        "test-client",
        "https://gitrew.example/",
        storage,
      ),
    );
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toHaveLength(43);
    const callback = new URL(
      `https://gitrew.example/?code=temporary&state=${url.searchParams.get("state")}`,
    );
    const result = consumeCallback(callback, storage);
    expect(result?.code).toBe("temporary");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(result?.verifier),
    );
    const challenge = Buffer.from(digest).toString("base64url");
    expect(challenge).toBe(url.searchParams.get("code_challenge"));
    expect(() => consumeCallback(callback, storage)).toThrow(
      "could not be verified",
    );
  });

  it("rejects missing, mismatched and expired state and removes the pending transaction", () => {
    for (const pending of [
      null,
      {
        state: "a".repeat(43),
        verifier: "v".repeat(64),
        createdAt: Date.now(),
      },
      {
        state: "b".repeat(43),
        verifier: "v".repeat(64),
        createdAt: Date.now() - 601_000,
      },
    ]) {
      const storage = new MemoryStorage();
      if (pending) storage.setItem(OAUTH_KEY, JSON.stringify(pending));
      expect(() =>
        consumeCallback(
          new URL(
            `https://gitrew.example/?code=temporary&state=${"b".repeat(43)}`,
          ),
          storage,
        ),
      ).toThrow();
      expect(storage.getItem(OAUTH_KEY)).toBeNull();
    }
  });

  it("removes expired sessions and refuses unsafe broker addresses", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ accessToken: "test-only", expiresAt: Date.now() - 1 }),
    );
    expect(readSession(storage)).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    for (const value of [
      "",
      "http://example.com",
      "https://user:password@example.com",
      "https://example.com/?key=test",
    ]) {
      expect(() => brokerAddress(value)).toThrow();
    }
  });
});

const env = {
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret-never-real",
  GITHUB_APP_SLUG: "test-gitrew",
  CLIENT_URL: "https://gitrew.example/",
};
function exchange(body: unknown, origin = "https://gitrew.example") {
  return new Request("https://oauth.example/exchange", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("OAuth-only Worker", () => {
  it("restricts CORS to the configured client and never exposes the app secret in config", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const rejected = await worker.fetch(
      exchange({}, "https://attacker.example"),
      env,
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const config = await worker.fetch(
      new Request("https://oauth.example/config", {
        headers: { Origin: "https://gitrew.example" },
      }),
      env,
    );
    expect(config.headers.get("cache-control")).toBe("no-store");
    expect(await config.json()).toEqual({
      clientId: env.GITHUB_CLIENT_ID,
      redirectUri: env.CLIENT_URL,
      installUrl: "https://github.com/apps/test-gitrew/installations/new",
    });
  });

  it("rejects invalid PKCE, oversized requests and caller-supplied redirect targets before contacting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const body of [
      { code: "c", verifier: "short" },
      { code: "c".repeat(3000), verifier: "v".repeat(64) },
      {
        code: "c",
        verifier: "v".repeat(64),
        redirect_uri: "https://attacker.example",
      },
    ]) {
      expect((await worker.fetch(exchange(body), env)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges only at GitHub and returns an expiring access token without the refresh token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "test-access",
            refresh_token: "test-refresh",
            expires_in: 28800,
            token_type: "bearer",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      exchange({ code: "temporary", verifier: "v".repeat(64) }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://gitrew.example",
    );
    const result = await response.json();
    expect(result).toEqual({
      accessToken: "test-access",
      expiresAt: expect.any(Number),
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://github.com/login/oauth/access_token",
    );
    const options = fetchMock.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({
      client_secret: env.GITHUB_CLIENT_SECRET,
      redirect_uri: env.CLIENT_URL,
      code_verifier: "v".repeat(64),
    });
    expect(options.redirect).toBe("error");
  });

  it("fails closed for unconfigured apps, upstream failures and non-expiring tokens", async () => {
    expect((await worker.fetch(exchange({}), {})).status).toBe(503);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              access_token: "non-expiring",
              token_type: "bearer",
            }),
          ),
        ),
    );
    expect(
      (
        await worker.fetch(
          exchange({ code: "temporary", verifier: "v".repeat(64) }),
          env,
        )
      ).status,
    ).toBe(401);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("test-secret upstream-error")),
    );
    const failure = await worker.fetch(
      exchange({ code: "temporary", verifier: "v".repeat(64) }),
      env,
    );
    expect(failure.status).toBe(502);
    expect(await failure.text()).not.toContain("test-secret");
  });
});
