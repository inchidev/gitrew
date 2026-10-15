import { Buffer } from "node:buffer";
import { createPrivateKey, sign } from "node:crypto";
import {
  parseVaultOperation,
  validateMembers,
  canReadConversation,
  type VaultActor,
  type VaultConversation,
  type VaultMembers,
} from "../shared/vault.ts";

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
interface Discussion {
  id: string;
  body: string;
  title: string;
  url: string;
}
export interface VaultSettings {
  repository: string;
  appId: string;
  privateKey: string;
  checkOrganizationRole?: boolean;
  manageAccess?: boolean;
}
export async function installationToken(
  settings: VaultSettings,
  request: typeof fetch = fetch,
) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const data = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 30, exp: now + 300, iss: settings.appId })}`;
  const jwt = `${data}.${sign("RSA-SHA256", Buffer.from(data), createPrivateKey(settings.privateKey)).toString("base64url")}`;
  const headers = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/vnd.github+json",
  };
  const installResponse = await request(
    `https://api.github.com/repos/${settings.repository}/installation`,
    { headers },
  );
  if (!installResponse.ok)
    throw new Error(`Install the workspace App on ${settings.repository}.`);
  const installation = (await installResponse.json()) as { id: number };
  const tokenResponse = await request(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        repositories: [settings.repository.split("/")[1]],
        permissions: {
          ...(settings.manageAccess
            ? { administration: "write" }
            : { discussions: "write", contents: "write" }),
          ...(settings.checkOrganizationRole ? { members: "read" } : {}),
        },
      }),
    },
  );
  if (!tokenResponse.ok)
    throw new Error("Workspace App cannot access the vault.");
  const token = ((await tokenResponse.json()) as { token: string }).token;
  try {
    const repoResponse = await request(
      `https://api.github.com/repos/${settings.repository}`,
      { headers: { ...headers, Authorization: `Bearer ${token}` } },
    );
    if (!repoResponse.ok) throw new Error("Vault is unavailable.");
    if (!((await repoResponse.json()) as { private: boolean }).private)
      throw new Error("Vault must be private.");
  } catch (error) {
    await request("https://api.github.com/installation/token", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    throw error;
  }
  return token;
}

export async function executeVault(
  settings: {
    repository: string;
    organizationRole?: "admin" | "member" | "outside";
    openRegistration?: boolean;
  },
  actor: VaultActor,
  raw: unknown,
  nonce: string,
  token: string,
  request: typeof fetch = fetch,
) {
  const operation = parseVaultOperation(raw);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  async function api(
    path: string,
    method = "GET",
    data?: unknown,
  ): Promise<any> {
    const response = await request(`https://api.github.com${path}`, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(`Vault operation failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }
  async function gql(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<any> {
    const value = await api("/graphql", "POST", { query, variables });
    if (value.errors?.length || !value.data)
      throw new Error("GitHub could not complete the vault operation.");
    return value.data;
  }
  const memberFile = await api(
    `/repos/${settings.repository}/contents/.gitrew/members.json`,
  );
  const membership = validateMembers(
    JSON.parse(Buffer.from(memberFile.content, "base64").toString()),
  );
  if (
    membership.organization.toLowerCase() !==
    settings.repository.split("/")[0]!.toLowerCase()
  )
    throw new Error("Vault membership belongs to a different workspace.");
  if (settings.openRegistration !== undefined)
    membership.openRegistration = settings.openRegistration;
  const admin = membership.admins.includes(actor.id);
  if (settings.organizationRole !== undefined) {
    if (admin && settings.organizationRole !== "admin")
      throw new Error(
        "Your GitHub organization administrator role has changed. Ask a current owner to review workspace access.",
      );
    if (!membership.openRegistration && settings.organizationRole === "outside")
      throw new Error(
        "You must be an active member of this GitHub organization.",
      );
  }
  const member = membership.members.some((m) => m.id === actor.id);
  if (!admin && (membership.blocked || []).includes(actor.id))
    throw new Error("You are not a member of this workspace.");
  if (
    !admin &&
    !member &&
    !(operation.op === "join" && membership.openRegistration === true)
  )
    throw new Error("You are not a member of this workspace.");
  // Include inherited organization and team access, not just direct invitations.
  // Fail closed if GitHub cannot prove that only declared administrators can read the repo.
  for (let page = 1; ; page++) {
    const collaborators = await api(
      `/repos/${settings.repository}/collaborators?affiliation=all&per_page=100&page=${page}`,
    );
    if (
      !Array.isArray(collaborators) ||
      collaborators.some(
        (user: { id?: number }) => !membership.admins.includes(user.id!),
      )
    )
      throw new Error(
        "Vault repository access must be restricted to workspace administrators.",
      );
    if (collaborators.length < 100) break;
  }
  if (operation.op === "join") {
    if (!admin && !member) {
      membership.members.push({ id: actor.id, login: actor.login });
      await api(
        `/repos/${settings.repository}/contents/.gitrew/members.json`,
        "PUT",
        {
          message: "Register Gitrew member",
          sha: memberFile.sha,
          content: Buffer.from(JSON.stringify(membership, null, 2)).toString(
            "base64",
          ),
        },
      );
    }
    return { joined: true };
  }
  if (operation.op === "members")
    return { members: membership.members, admins: membership.admins };
  if (operation.op === "remove") {
    if (!admin)
      throw new Error("Only workspace administrators can remove members.");
    if (membership.admins.includes(operation.userId))
      throw new Error(
        "Administrators cannot be removed through the chat interface.",
      );
    membership.blocked = [
      ...new Set([...(membership.blocked || []), operation.userId]),
    ];
    membership.members = membership.members.filter(
      (m) => m.id !== operation.userId,
    );
    await api(
      `/repos/${settings.repository}/contents/.gitrew/members.json`,
      "PUT",
      {
        message: "Update Gitrew membership",
        sha: memberFile.sha,
        content: Buffer.from(JSON.stringify(membership, null, 2)).toString(
          "base64",
        ),
      },
    );
    return { removed: operation.userId };
  }
  if (operation.op === "invite") {
    if (!admin)
      throw new Error("Only workspace administrators can invite members.");
    const member = await api(`/users/${operation.login}`);
    if (
      !Number.isSafeInteger(member.id) ||
      member.id <= 0 ||
      typeof member.login !== "string" ||
      !/^[a-z\d-]{1,39}$/i.test(member.login) ||
      member.type !== "User"
    )
      throw new Error(
        "Choose a personal GitHub account to add to this workspace.",
      );
    if (
      settings.organizationRole !== undefined &&
      !membership.openRegistration
    ) {
      const response = await request(
        `https://api.github.com/orgs/${membership.organization}/memberships/${member.login}`,
        { headers, signal: AbortSignal.timeout(20_000) },
      );
      if (response.status === 404)
        throw new Error(
          "This person must accept their GitHub organization invitation before you add them to Gitrew.",
        );
      if (!response.ok)
        throw new Error(
          "Could not verify this person's GitHub organization membership. Retry shortly.",
        );
      const role = (await response.json()) as {
        state?: string;
        role?: string;
        user?: { id?: number };
      };
      if (
        role.state !== "active" ||
        !["admin", "member"].includes(role.role || "") ||
        role.user?.id !== member.id
      )
        throw new Error(
          "This person must be an active member of your GitHub organization before you add them to Gitrew.",
        );
    }
    membership.blocked = (membership.blocked || []).filter(
      (id) => id !== member.id,
    );
    const existing = membership.members.find((m) => m.id === member.id);
    if (existing) existing.login = member.login;
    else membership.members.push({ id: member.id, login: member.login });
    await api(
      `/repos/${settings.repository}/contents/.gitrew/members.json`,
      "PUT",
      {
        message: "Update Gitrew membership",
        sha: memberFile.sha,
        content: Buffer.from(JSON.stringify(membership, null, 2)).toString(
          "base64",
        ),
      },
    );
    return { member: { id: member.id, login: member.login } };
  }
  const [owner, name] = settings.repository.split("/");
  const conversations: (Discussion & { meta: VaultConversation })[] = [];
  let after: string | null = null;
  let repositoryId = "";
  let categoryId = "";
  do {
    const data = await gql(
      `query Vault($owner: String!, $name: String!, $after: String) { repository(owner:$owner,name:$name) { id discussionCategories(first:20) { nodes { id slug } } discussions(first:100,after:$after) { nodes { id body title url } pageInfo { hasNextPage endCursor } } } }`,
      { owner, name, after },
    );
    if (!data.repository) throw new Error("Vault repository is unavailable.");
    repositoryId = data.repository.id;
    const categories = data.repository.discussionCategories.nodes as {
      id: string;
      slug: string;
    }[];
    categoryId =
      (categories.find((c) => c.slug === "general") || categories[0])?.id || "";
    for (const discussion of data.repository.discussions
      .nodes as Discussion[]) {
      try {
        const meta = JSON.parse(discussion.body) as VaultConversation;
        if (
          meta.version === 1 &&
          ["private", "dm"].includes(meta.kind) &&
          typeof meta.id === "string" &&
          typeof meta.name === "string" &&
          Array.isArray(meta.members) &&
          meta.members.every(Number.isSafeInteger)
        )
          conversations.push({ ...discussion, meta });
      } catch {
        /* Non-Gitrew Discussions are never exposed through the vault. */
      }
    }
    const page = data.repository.discussions.pageInfo;
    if (page.hasNextPage && !page.endCursor)
      throw new Error("Vault pagination failed.");
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  const visible = conversations.filter((c) =>
    canReadConversation(actor, membership, c.meta),
  );
  const channel = (c: (typeof conversations)[number]) => ({
    id: c.id,
    name: c.meta.name,
    description:
      c.meta.kind === "dm"
        ? "Direct conversation · workspace administrators can access the vault"
        : "Private conversation · workspace administrators can access the vault",
    kind: c.meta.kind,
    members: c.meta.members,
  });
  if (operation.op === "list") return { channels: visible.map(channel) };
  if (operation.op === "create") {
    if (
      operation.kind === "private" &&
      !admin &&
      membership.memberPrivateChannels !== true
    )
      throw new Error("Only administrators can create private channels.");
    const ids = [...new Set([...operation.members, actor.id])].sort(
      (a, b) => a - b,
    );
    if (
      ids.some(
        (id) =>
          !membership.members.some((m) => m.id === id) &&
          !membership.admins.includes(id),
      )
    )
      throw new Error("Every participant must belong to this workspace.");
    if (operation.kind === "dm" && ids.length !== 2)
      throw new Error(
        "Select exactly one other member for a direct conversation.",
      );
    const id = operation.kind === "dm" ? `dm:${ids.join(":")}` : nonce;
    const existing = conversations.find((c) => c.meta.id === id);
    if (existing) return { channel: channel(existing) };
    if (!categoryId)
      throw new Error(
        "Enable Discussions and create a General category in the vault.",
      );
    const meta: VaultConversation = {
      version: 1,
      id,
      name:
        operation.kind === "dm"
          ? ids
              .map(
                (id) =>
                  membership.members.find((m) => m.id === id)?.login ||
                  String(id),
              )
              .join(" · ")
          : operation.name,
      kind: operation.kind,
      members: ids,
    };
    const data = await gql(
      `mutation Create($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!) { createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}) { discussion { id body title url } } }`,
      {
        repositoryId,
        categoryId,
        title: meta.name,
        body: JSON.stringify(meta),
      },
    );
    return { channel: channel({ ...data.createDiscussion.discussion, meta }) };
  }
  const conversation = visible.find((c) => c.id === operation.conversation);
  if (!conversation)
    throw new Error(
      "This conversation is unavailable or you do not have access.",
    );
  const comments: Comment[] = [];
  after = null;
  do {
    const data = await gql(
      `query Read($id:ID!,$after:String) { node(id:$id) { ... on Discussion { comments(first:100,after:$after) { nodes { id body createdAt updatedAt } pageInfo { hasNextPage endCursor } } } } }`,
      { id: conversation.id, after },
    );
    if (!data.node) throw new Error("Conversation is unavailable.");
    comments.push(...data.node.comments.nodes);
    const page = data.node.comments.pageInfo;
    if (page.hasNextPage && !page.endCursor)
      throw new Error("Vault message pagination failed.");
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  function message(comment: Comment) {
    try {
      const data = JSON.parse(comment.body);
      if (
        data.version !== 1 ||
        data.type !== "message" ||
        typeof data.body !== "string" ||
        typeof data.author?.login !== "string" ||
        typeof data.nonce !== "string"
      )
        return null;
      return {
        id: comment.id,
        channelId: conversation!.id,
        parentId: data.parentId || "",
        author: data.author.login,
        body: data.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        status: "saved",
        url: "",
      };
    } catch {
      return null;
    }
  }
  if (operation.op === "read")
    return { messages: comments.map(message).filter(Boolean) };
  const previous = comments.find((c) => {
    try {
      const m = JSON.parse(c.body);
      return m.nonce === nonce && m.author?.id === actor.id;
    } catch {
      return false;
    }
  });
  if (previous) return { message: message(previous) };
  if (
    operation.parentId &&
    !comments.some(
      (c) => c.id === operation.parentId && message(c)?.parentId === "",
    )
  )
    throw new Error("The parent message is unavailable.");
  const body = JSON.stringify({
    version: 1,
    type: "message",
    nonce,
    author: actor,
    body: operation.body,
    parentId: operation.parentId || "",
  });
  const data = await gql(
    `mutation Send($id:ID!,$body:String!) { addDiscussionComment(input:{discussionId:$id,body:$body}) { comment { id body createdAt updatedAt } } }`,
    { id: conversation.id, body },
  );
  return { message: message(data.addDiscussionComment.comment) };
}
