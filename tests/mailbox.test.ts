import { describe, it, expect, vi } from "vitest";
import {
  newMailboxKey,
  seal,
  unseal,
  parseMailboxRequest,
  REQUEST_PREFIX,
  REPLY_PREFIX,
  requestBody,
} from "../shared/mailbox";
import { processAuth } from "../scripts/action-auth";
import { executeVault } from "../scripts/vault-service";

describe("encrypted mailbox", () => {
  it("binds the sender, recipient and request; public ciphertext cannot be replayed into another session", async () => {
    const server = await newMailboxKey(),
      alice = await newMailboxKey(),
      eve = await newMailboxKey();
    const encrypted = await seal(
      server.privateKey,
      server.publicKey,
      alice.publicKey,
      "request-a",
      { token: "private-value" },
    );
    expect(JSON.stringify(encrypted)).not.toContain("private-value");
    expect(
      await unseal(alice.privateKey, server.publicKey, "request-a", encrypted),
    ).toEqual({ token: "private-value" });
    await expect(
      unseal(eve.privateKey, server.publicKey, "request-a", encrypted),
    ).rejects.toThrow();
    await expect(
      unseal(alice.privateKey, server.publicKey, "request-b", encrypted),
    ).rejects.toThrow();
    await expect(
      unseal(alice.privateKey, eve.publicKey, "request-a", encrypted),
    ).rejects.toThrow("sender");
    await expect(
      unseal(alice.privateKey, server.publicKey, "request-a", {
        ...encrypted,
        data: encrypted.data.slice(0, -2) + "AA",
      }),
    ).rejects.toThrow();
  });
  it("rejects stale requests and cannot route a vault operation through the device concurrency group", async () => {
    const key = await newMailboxKey();
    const request = {
      id: crypto.randomUUID(),
      kind: "probe" as const,
      createdAt: Date.now(),
      publicKey: key.publicKey,
    };
    expect(
      parseMailboxRequest(REQUEST_PREFIX + request.id, requestBody(request)).id,
    ).toBe(request.id);
    expect(() =>
      parseMailboxRequest(
        REQUEST_PREFIX + request.id,
        requestBody(request),
        Date.now() + 600_001,
      ),
    ).toThrow();
    expect(() =>
      parseMailboxRequest(
        REQUEST_PREFIX + request.id,
        requestBody({ ...request, kind: "vault" }),
      ),
    ).toThrow("route");
  });
  it("does not release a user token when the approving account differs from the issue author", async () => {
    const server = await newMailboxKey(),
      client = await newMailboxKey();
    const request = {
      id: crypto.randomUUID(),
      kind: "device" as const,
      createdAt: Date.now(),
      publicKey: client.publicKey,
    };
    const publicBodies: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/device/code"))
        return Response.json({
          device_code: "secret-device",
          user_code: "ABCD-EFGH",
          interval: 5,
          expires_in: 900,
        });
      if (String(url).endsWith("/access_token"))
        return Response.json({
          access_token: "secret-user-token",
          token_type: "bearer",
          expires_in: 28800,
        });
      if (String(url) === "https://api.github.com/user")
        return Response.json({ id: 999, login: "wrong-account" });
      if (String(url).endsWith("/comments"))
        publicBodies.push(JSON.parse(String(init?.body)).body);
      return Response.json({});
    });
    await processAuth(
      {
        action: "opened",
        issue: {
          number: 1,
          title: REQUEST_PREFIX + request.id,
          body: requestBody(request),
          user: { id: 1, login: "alice" },
          created_at: new Date().toISOString(),
        },
        sender: { id: 1, login: "alice" },
        repository: { full_name: "acme/gitrew-auth" },
      },
      {
        version: 1,
        repository: "acme/gitrew-auth",
        clientId: "app",
        appSlug: "app",
        publicKey: server.publicKey,
      },
      server.privateKey,
      {
        fetch: fetcher,
        token: "action-token",
        sleep: async () => {},
        now: Date.now,
      },
    );
    expect(publicBodies.join()).not.toContain("secret-user-token");
    const replies = await Promise.all(
      publicBodies.map((body) =>
        unseal(
          client.privateKey,
          server.publicKey,
          request.id,
          JSON.parse(body.slice(REPLY_PREFIX.length)),
        ),
      ),
    );
    expect(replies).toContainEqual(
      expect.objectContaining({
        kind: "error",
        message: expect.stringContaining("same GitHub account"),
      }),
    );
    expect(
      replies.some((reply) => (reply as { kind: string }).kind === "session"),
    ).toBe(false);
  });
});

function vaultFixture() {
  const membership: import("../shared/vault").VaultMembers = {
    version: 1,
    organization: "acme",
    admins: [10],
    members: [
      { id: 10, login: "admin" },
      { id: 1, login: "alice" },
      { id: 2, login: "bob" },
      { id: 3, login: "eve" },
    ],
  };
  const discussion = {
    id: "D_private",
    title: "Leadership",
    url: "https://github.com/acme/gitrew-vault/discussions/1",
    body: JSON.stringify({
      version: 1,
      kind: "private",
      id: "private-1",
      name: "Leadership",
      members: [1, 2],
    }),
  };
  const discussions = [discussion];
  const comments: {
    id: string;
    body: string;
    createdAt: string;
    updatedAt: string;
  }[] = [];
  const collaborators = [{ id: 10 }];
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("/collaborators?"))
      return Response.json(collaborators);
    if (
      String(url).includes("/contents/.gitrew/members.json") &&
      init?.method === "PUT"
    ) {
      const body = JSON.parse(String(init.body));
      Object.assign(
        membership,
        JSON.parse(Buffer.from(body.content, "base64").toString()),
      );
      return Response.json({ content: { sha: "updated" } });
    }
    if (String(url).includes("/contents/.gitrew/members.json"))
      return Response.json({
        sha: "members-sha",
        content: Buffer.from(JSON.stringify(membership)).toString("base64"),
      });
    const input = JSON.parse(String(init?.body));
    if (input.query.includes("query Vault"))
      return Response.json({
        data: {
          repository: {
            id: "R_vault",
            discussionCategories: {
              nodes: [{ id: "C_general", slug: "general" }],
            },
            discussions: {
              nodes: discussions,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      });
    if (input.query.includes("query Read"))
      return Response.json({
        data: {
          node: {
            comments: {
              nodes: comments,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      });
    if (input.query.includes("mutation Create")) {
      const created = {
        id: `D_${discussions.length}`,
        title: input.variables.title,
        body: input.variables.body,
        url: "https://github.com/acme/gitrew-vault/discussions/2",
      };
      discussions.push(created);
      return Response.json({
        data: { createDiscussion: { discussion: created } },
      });
    }
    if (input.query.includes("mutation Send")) {
      const comment = {
        id: "M_" + comments.length,
        body: input.variables.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      comments.push(comment);
      return Response.json({ data: { addDiscussionComment: { comment } } });
    }
    throw new Error("Unexpected mock operation");
  });
  return { fetcher, calls, comments, membership, collaborators, discussions };
}
describe("administrator-only vault", () => {
  it("rejects an outsider before fetching private conversations, even with a forged author field", async () => {
    const fixture = vaultFixture();
    await expect(
      executeVault(
        { repository: "acme/gitrew-vault" },
        { id: 99, login: "outsider" },
        { op: "list", author: { id: 10 } },
        "nonce",
        "private-app-token",
        fixture.fetcher,
      ),
    ).rejects.toThrow("not a member");
    expect(fixture.calls.some((url) => url.endsWith("/graphql"))).toBe(false);
  });
  it("filters channels and rejects guessing a private conversation ID for both reads and writes", async () => {
    const fixture = vaultFixture();
    const args = [
      { repository: "acme/gitrew-vault" },
      { id: 3, login: "eve" },
    ] as const;
    expect(
      await executeVault(
        ...args,
        { op: "list" },
        "nonce",
        "private-app-token",
        fixture.fetcher,
      ),
    ).toEqual({ channels: [] });
    for (const op of [
      { op: "read", conversation: "D_private" },
      { op: "send", conversation: "D_private", body: "sneak in" },
    ])
      await expect(
        executeVault(
          ...args,
          op,
          "nonce",
          "private-app-token",
          fixture.fetcher,
        ),
      ).rejects.toThrow("do not have access");
    expect(fixture.comments).toHaveLength(0);
  });
  it("attributes messages to the authenticated event actor and makes retries idempotent", async () => {
    const fixture = vaultFixture();
    const args = [
      { repository: "acme/gitrew-vault" },
      { id: 1, login: "alice" },
    ] as const;
    const operation = {
      op: "send",
      conversation: "D_private",
      body: "hello",
      author: { id: 10, login: "admin" },
    };
    await executeVault(
      ...args,
      operation,
      "same-request",
      "private-app-token",
      fixture.fetcher,
    );
    await executeVault(
      ...args,
      operation,
      "same-request",
      "private-app-token",
      fixture.fetcher,
    );
    expect(fixture.comments).toHaveLength(1);
    expect(JSON.parse(fixture.comments[0]!.body).author).toEqual({
      id: 1,
      login: "alice",
    });
    const result = await executeVault(
      ...args,
      { op: "read", conversation: "D_private" },
      "read",
      "private-app-token",
      fixture.fetcher,
    );
    expect(result).toEqual({
      messages: [expect.objectContaining({ body: "hello", author: "alice" })],
    });
    expect(JSON.stringify(result)).not.toContain("private-app-token");
  });
  it("creates one canonical DM for either participant and hides it from another member", async () => {
    const fixture = vaultFixture();
    const first = await executeVault(
      { repository: "acme/gitrew-vault" },
      { id: 1, login: "alice" },
      { op: "create", kind: "dm", name: "DM", members: [2] },
      "nonce-a",
      "token",
      fixture.fetcher,
    );
    const second = await executeVault(
      { repository: "acme/gitrew-vault" },
      { id: 2, login: "bob" },
      { op: "create", kind: "dm", name: "DM", members: [1] },
      "nonce-b",
      "token",
      fixture.fetcher,
    );
    expect(second).toEqual(first);
    expect(fixture.discussions).toHaveLength(2);
    expect(JSON.parse(fixture.discussions[1]!.body).members).toEqual([1, 2]);
    const stranger = await executeVault(
      { repository: "acme/gitrew-vault" },
      { id: 3, login: "eve" },
      { op: "list" },
      "nonce-c",
      "token",
      fixture.fetcher,
    );
    expect(stranger).toEqual({ channels: [] });
  });
  it("fails closed when organization or team access exposes the vault to a non-administrator", async () => {
    const fixture = vaultFixture();
    fixture.collaborators.push({ id: 3 });
    await expect(
      executeVault(
        { repository: "acme/gitrew-vault" },
        { id: 1, login: "alice" },
        { op: "list" },
        "nonce",
        "private-app-token",
        fixture.fetcher,
      ),
    ).rejects.toThrow("restricted to workspace administrators");
    expect(fixture.calls.some((url) => url.endsWith("/graphql"))).toBe(false);
  });
  it("revokes access when membership is removed, even if a conversation still includes the old member ID", async () => {
    const fixture = vaultFixture();
    fixture.membership.members = fixture.membership.members.filter(
      (member) => member.id !== 1,
    );
    await expect(
      executeVault(
        { repository: "acme/gitrew-vault" },
        { id: 1, login: "alice" },
        { op: "read", conversation: "D_private" },
        "nonce",
        "private-app-token",
        fixture.fetcher,
      ),
    ).rejects.toThrow("not a member");
    expect(fixture.calls.some((url) => url.endsWith("/graphql"))).toBe(false);
  });
  it("does not allow a member to create a private channel or invite somebody into the workspace", async () => {
    const fixture = vaultFixture();
    for (const operation of [
      { op: "create", kind: "private", name: "secret", members: [1] },
      { op: "invite", login: "outsider" },
    ])
      await expect(
        executeVault(
          { repository: "acme/gitrew-vault" },
          { id: 1, login: "alice" },
          operation,
          "nonce",
          "private-app-token",
          fixture.fetcher,
        ),
      ).rejects.toThrow("administrator");
  });
});

describe("open sandbox registration", () => {
  const settings = { repository: "acme/gitrew-vault" };
  const actor = { id: 99, login: "visitor" };
  it("does not allow self-registration in an ordinary workspace", async () => {
    const f = vaultFixture();
    await expect(
      executeVault(settings, actor, { op: "join" }, "join", "token", f.fetcher),
    ).rejects.toThrow("not a member");
    expect(f.membership.members.some((m) => m.id === 99)).toBe(false);
  });
  it("registers only the authenticated actor, remains idempotent and hides existing private channels", async () => {
    const f = vaultFixture();
    f.membership.openRegistration = true;
    for (let i = 0; i < 2; i++)
      await executeVault(
        settings,
        actor,
        { op: "join", id: 10, login: "admin" },
        "join",
        "token",
        f.fetcher,
      );
    expect(f.membership.members.filter((m) => m.id === 99)).toEqual([actor]);
    expect(
      await executeVault(
        settings,
        actor,
        { op: "list" },
        "list",
        "token",
        f.fetcher,
      ),
    ).toEqual({ channels: [] });
  });
  it("audits vault access before saving a new member", async () => {
    const f = vaultFixture();
    f.membership.openRegistration = true;
    f.collaborators.push({ id: 3 });
    await expect(
      executeVault(settings, actor, { op: "join" }, "join", "token", f.fetcher),
    ).rejects.toThrow("restricted to workspace administrators");
    expect(f.membership.members.some((m) => m.id === 99)).toBe(false);
  });
  it("prevents a removed member from rejoining an open workspace", async () => {
    const f = vaultFixture();
    f.membership.openRegistration = true;
    await executeVault(
      settings,
      { id: 10, login: "admin" },
      { op: "remove", userId: 1 },
      "remove",
      "token",
      f.fetcher,
    );
    await expect(
      executeVault(
        settings,
        { id: 1, login: "alice" },
        { op: "join" },
        "join",
        "token",
        f.fetcher,
      ),
    ).rejects.toThrow("not a member");
    expect(f.membership.blocked).toContain(1);
  });
  it("lets sandbox members create a private group without granting others access", async () => {
    const f = vaultFixture();
    f.membership.memberPrivateChannels = true;
    await executeVault(
      settings,
      { id: 1, login: "alice" },
      { op: "create", kind: "private", name: "Small group", members: [2] },
      "group",
      "token",
      f.fetcher,
    );
    expect(JSON.parse(f.discussions.at(-1)!.body).members).toEqual([1, 2]);
    expect(
      await executeVault(
        settings,
        { id: 3, login: "eve" },
        { op: "list" },
        "list",
        "token",
        f.fetcher,
      ),
    ).toEqual({ channels: [] });
  });
});
