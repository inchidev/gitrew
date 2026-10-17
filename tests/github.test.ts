import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GitHubError,
  GitHubTransport,
  parseRepository,
} from "../app/lib/github";
import { safeUrl } from "../app/lib/links";

afterEach(() => vi.unstubAllGlobals());

function mockResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}
const pageInfo = { hasNextPage: false, endCursor: null };
const comment = (id: string) => ({
  id,
  body: `Message ${id}`,
  createdAt: "2026-10-14T09:00:00Z",
  updatedAt: "2026-10-14T09:00:00Z",
  author: { login: "owner" },
  url: `https://github.com/inchidev/chat/discussions/1#${id}`,
});

describe("GitHub transport", () => {
  it("paginates both messages and replies without losing older messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          node: {
            comments: {
              nodes: [
                {
                  ...comment("a"),
                  replies: {
                    nodes: [comment("r1")],
                    pageInfo: { hasNextPage: true, endCursor: "reply-cursor" },
                  },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: "message-cursor" },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          node: {
            comments: {
              nodes: [{ ...comment("b"), replies: { nodes: [], pageInfo } }],
              pageInfo,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          node: { replies: { nodes: [comment("r2")], pageInfo } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const messages = await new GitHubTransport(
      "inchidev/chat",
      "test-only",
    ).listMessages("channel");
    expect(messages.map((message) => message.id)).toEqual([
      "a",
      "r1",
      "r2",
      "b",
    ]);
    expect(messages.find((message) => message.id === "r2")?.parentId).toBe("a");
    const calls = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(calls[1].variables.after).toBe("message-cursor");
    expect(calls[2].variables.after).toBe("reply-cursor");
  });

  it("fails the complete scan when a later page fails, rather than returning a partial snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            node: {
              comments: {
                nodes: [{ ...comment("a"), replies: { nodes: [], pageInfo } }],
                pageInfo: { hasNextPage: true, endCursor: "cursor" },
              },
            },
          }),
        )
        .mockResolvedValueOnce(new Response("{}", { status: 503 })),
    );
    await expect(
      new GitHubTransport("inchidev/chat", "test-only").listMessages("channel"),
    ).rejects.toThrow("503");
  });

  it("does not mark a mutation as saved when GraphQL returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ errors: [{ message: "denied" }] })),
        ),
    );
    await expect(
      new GitHubTransport("inchidev/chat", "test-only").sendMessage(
        "channel",
        "Keep this draft",
      ),
    ).rejects.toThrow(GitHubError);
  });

  it("surfaces a retry delay for GitHub rate limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
      ),
    );
    const failure = await new GitHubTransport("inchidev/chat", "test-only")
      .listChannels()
      .catch((error) => error);
    expect(failure).toBeInstanceOf(GitHubError);
    expect(failure.retryAfterMs).toBe(120_000);
  });

  it("paginates workspace channels and retains GitHub IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            repository: {
              discussions: {
                nodes: [
                  {
                    id: "one",
                    title: "#general",
                    body: "Everyday",
                    url: "https://github.com/inchidev/chat/discussions/1",
                    updatedAt: "2026-10-15T09:00:00Z",
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: "next" },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            repository: {
              discussions: {
                nodes: [
                  {
                    id: "two",
                    title: "#building",
                    body: "Progress",
                    url: "https://github.com/inchidev/chat/discussions/2",
                  },
                ],
                pageInfo,
              },
            },
          }),
        ),
    );
    const listed = await new GitHubTransport(
      "inchidev/chat",
      "test-only",
    ).listChannels();
    expect(listed.map((channel) => [channel.id, channel.name])).toEqual([
      ["one", "general"],
      ["two", "building"],
    ]);
    expect(listed[0]?.activityAt).toBe("2026-10-15T09:00:00Z");
  });

  it("carries reactions on messages and toggles them through GitHub mutations", async () => {
    const reacted = (
      field: "addReaction" | "removeReaction",
      totals: Record<string, [number, boolean]>,
    ) =>
      mockResponse({
        [field]: {
          subject: {
            reactionGroups: Object.entries(totals).map(
            ([content, [totalCount, viewerHasReacted]]) => ({
              content,
              users: { totalCount },
              viewerHasReacted,
            }),
          ),
        },
      },
      });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          node: {
            comments: {
              nodes: [
                {
                  ...comment("a"),
                  reactionGroups: [
                    {
                      content: "THUMBS_UP",
                      users: { totalCount: 2 },
                      viewerHasReacted: false,
                    },
                    {
                      content: "HEART",
                      users: { totalCount: 1 },
                      viewerHasReacted: true,
                    },
                    {
                      content: "ROCKET",
                      users: { totalCount: 0 },
                      viewerHasReacted: false,
                    },
                  ],
                  replies: { nodes: [], pageInfo },
                },
              ],
              pageInfo,
            },
          },
        }),
      )
      .mockResolvedValueOnce(reacted("addReaction", {
        THUMBS_UP: [3, true],
      }))
      .mockResolvedValueOnce(reacted("removeReaction", {}));
    vi.stubGlobal("fetch", fetchMock);
    const transport = new GitHubTransport("inchidev/chat", "test-only");
    const [message] = await transport.listMessages("D_1");
    expect(message!.reactions).toEqual([
      { emoji: "👍", count: 2, content: "THUMBS_UP", mine: false },
      { emoji: "❤️", count: 1, content: "HEART", mine: true },
    ]);
    expect(await transport.toggleReaction("a", "THUMBS_UP", false)).toEqual([
      { emoji: "👍", count: 3, content: "THUMBS_UP", mine: true },
    ]);
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).query,
    ).toContain("addReaction");
    expect(await transport.toggleReaction("a", "ROCKET", true)).toEqual([]);
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]![1]!.body)).query,
    ).toContain("removeReaction");
  });
});

describe("untrusted content boundaries", () => {
  it("rejects repository paths that point outside GitHub", () => {
    expect(parseRepository("https://github.com/inchidev/gitrew.git")).toEqual([
      "inchidev",
      "gitrew",
    ]);
    expect(() =>
      parseRepository("https://evil.example/inchidev/gitrew"),
    ).toThrow();
  });

  it("only links to HTTPS GitHub URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("https://github.com.evil.example/a")).toBe("");
    expect(safeUrl("https://github.com/inchidev/gitrew")).toBe(
      "https://github.com/inchidev/gitrew",
    );
  });
});
