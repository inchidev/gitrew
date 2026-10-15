import { expect, type Page } from "@playwright/test";

const pageInfo = { hasNextPage: false, endCursor: null };
function reply(id: string, body: string) {
  return {
    id,
    body,
    createdAt: "2026-10-14T08:00:00Z",
    updatedAt: "2026-10-14T08:00:00Z",
    url: `https://github.com/inchidev/gitrew/discussions/1#${id}`,
    author: { login: "robin" },
  };
}
function comment(id: string, body: string) {
  return {
    ...reply(id, body),
    replies: { nodes: new Array<ReturnType<typeof reply>>(), pageInfo },
  };
}
export async function githubRoutes(page: Page, failSend = false) {
  const messages = [
    comment("remote-1", "A conversation from GitHub"),
    comment("remote-2", "This message will be deleted"),
  ];
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    expect(route.request().headers().authorization).toBe(
      "Bearer test-browser-session",
    );
    const json = (data: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname === "/user") return json({ id: 123, login: "robin" });
    if (url.pathname === "/user/installations")
      return json({ total_count: 1, installations: [{ id: 1 }] });
    if (url.pathname.endsWith("/repositories"))
      return json({
        total_count: 2,
        repositories: [
          {
            id: 1,
            full_name: "inchidev/gitrew",
            private: false,
            has_discussions: true,
          },
          {
            id: 2,
            full_name: "my-team/private-chat",
            private: true,
            has_discussions: true,
          },
        ],
      });
    const { query, variables } = route.request().postDataJSON();
    if (query.includes("query Channels"))
      return json({
        data: {
          repository: {
            discussions: {
              nodes: [
                {
                  id:
                    variables.name === "gitrew"
                      ? "github-general"
                      : "private-general",
                  title: "#general",
                  body: "The team’s conversation",
                  url: "https://github.com/inchidev/gitrew/discussions/1",
                },
              ],
              pageInfo,
            },
          },
        },
      });
    if (query.includes("query Messages"))
      return json({
        data: {
          node: {
            comments: {
              nodes:
                variables.id === "github-general"
                  ? messages
                  : [comment("private-message", "Only the private workspace")],
              pageInfo,
            },
          },
        },
      });
    if (query.includes("mutation Send")) {
      if (failSend) return json({ errors: [{ message: "denied" }] });
      const message = comment("new-saved", variables.body);
      if (variables.replyToId)
        messages
          .find((parent) => parent.id === variables.replyToId)
          ?.replies.nodes.push(reply(message.id, message.body));
      else messages.push(message);
      return json({ data: { addDiscussionComment: { comment: message } } });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
  return messages;
}

export async function session(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "gitrew:github-session:v1",
      JSON.stringify({
        accessToken: "test-browser-session",
        expiresAt: Date.now() + 60 * 60_000,
      }),
    ),
  );
}
