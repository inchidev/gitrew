import { Buffer } from "node:buffer";
import { z } from "zod";
import { executeVault, installationToken } from "../scripts/vault-service";
import { GitHub, githubFetch, actorSchema } from "./github";
import { HttpError, random } from "./security";
import { type App, type BackendStore, type Workspace } from "./store";
import { workspaceRepositoryNamesSchema } from "../shared/workspace";

export const organizationSchema = z
  .string()
  .regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i)
  .transform((v) => v.toLowerCase());
const repoSchema = z.object({
  id: z.number(),
  private: z.boolean(),
  description: z.string().nullable(),
  has_discussions: z.boolean(),
});
const gqlSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
});
export function workspaceConfig(
  workspace: Workspace,
  app: App,
  fallbackName = "",
) {
  return {
    displayName:
      workspace.displayName || fallbackName || workspace.organization,
    version: 1 as const,
    backend: true,
    repository: workspace.repository,
    vault: workspace.vault,
    clientId: app.client_id,
    appSlug: app.slug,
    publicKey: "",
    openRegistration: false,
    memberPrivateChannels: workspace.memberPrivateChannels,
  };
}
export async function provisionWorkspace(
  store: BackendStore,
  api: GitHub,
  actor: z.infer<typeof actorSchema>,
  organization: string,
  sandbox: string,
  names: { repositoryName?: string; vaultName?: string } = {},
) {
  return store.locked("provision:" + organization, async () => {
    const membership = await api.api(
      `/user/memberships/orgs/${organization}`,
      z.object({ role: z.string(), state: z.string() }),
    );
    if (membership.role !== "admin" || membership.state !== "active")
      throw new HttpError(
        403,
        "A GitHub organization owner must create this workspace.",
      );
    const org = await api.api(
      `/orgs/${organization}`,
      z.object({
        default_repository_permission: z.string().nullable().optional(),
      }),
    );
    if (org.default_repository_permission !== "none")
      throw new HttpError(
        409,
        "Set this organization's base repository permission to None in GitHub first, then retry. This keeps the private vault administrator-only. Gitrew will not change access to your other repositories.",
      );
    const installations: {
      id: number;
      app_id: number;
      account: { login: string };
    }[] = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await api.api(
        `/user/installations?per_page=100&page=${page}`,
        z.object({
          total_count: z.number(),
          installations: z.array(
            z.object({
              id: z.number(),
              app_id: z.number(),
              account: z.object({ login: z.string() }),
            }),
          ),
        }),
      );
      installations.push(...batch.installations);
      if (installations.length >= batch.total_count) break;
      if (page === 20)
        throw new HttpError(413, "Too many App installations to inspect.");
    }
    const app = await store.app();
    if (!app) throw new HttpError(503, "Register your Gitrew App first.");
    const installation = installations.find(
      (i) =>
        i.app_id === app.id && i.account.login.toLowerCase() === organization,
    );
    if (!installation)
      throw new HttpError(
        409,
        "Install this deployment's Gitrew App in the organization, then retry.",
      );
    let workspace = await store.workspace(organization);
    if (
      workspace &&
      ((names.repositoryName !== undefined &&
        names.repositoryName !== workspace.repository.split("/")[1]) ||
        (names.vaultName !== undefined &&
          names.vaultName !== workspace.vault.split("/")[1]))
    )
      throw new HttpError(
        409,
        "Repository names are fixed once workspace setup starts. Retry with the saved names; renaming existing workspace repositories is not supported.",
      );
    if (!workspace) {
      const selected = workspaceRepositoryNamesSchema.parse({
        repositoryName: names.repositoryName ?? "gitrew-chat",
        vaultName: names.vaultName ?? "gitrew-vault",
      });
      workspace = {
        organization,
        repository: `${organization}/${selected.repositoryName}`,
        vault: `${organization}/${selected.vaultName}`,
        installationId: installation.id,
        openRegistration: false,
        memberPrivateChannels: organization === sandbox.toLowerCase(),
        nonce: random(),
        ready: false,
      };
      await store.saveWorkspace(workspace);
    }
    if (workspace.installationId !== installation.id)
      throw new HttpError(
        409,
        "This workspace was registered under another App installation. Ask its administrator to review the connection.",
      );
    if (workspace.ready) {
      await ensureWorkspaceAccess(api, app, workspace, actor);
      return workspace;
    }
    const repositories = [
      [workspace.repository.split("/")[1]!, true],
      [workspace.vault.split("/")[1]!, true],
    ] as const;
    // Check both names before creating either repository.
    const inspected = new Map<string, z.infer<typeof repoSchema>>();
    for (const [name, isPrivate] of repositories) {
      const existing = await api.response(`/repos/${organization}/${name}`);
      if (existing.status === 404) continue;
      if (!existing.ok)
        throw new HttpError(
          502,
          "Could not inspect existing workspace repositories.",
        );
      const repo = repoSchema.parse(await existing.json());
      if (
        repo.description !== `Gitrew workspace ${workspace.nonce}` ||
        repo.private !== isPrivate
      )
        throw new HttpError(
          409,
          `${name} already exists. Gitrew will not overwrite or adopt an unrelated repository.`,
        );
      inspected.set(name, repo);
    }
    for (const [name, isPrivate] of repositories) {
      const path = `/repos/${organization}/${name}`;
      const existing = inspected.get(name);
      const description = `Gitrew workspace ${workspace.nonce}`;
      let repo: z.infer<typeof repoSchema>;
      if (!existing)
        repo = await api.api(
          `/orgs/${organization}/repos`,
          repoSchema,
          "POST",
          {
            name,
            private: isPrivate,
            description,
            auto_init: true,
            has_issues: false,
            has_discussions: true,
          },
        );
      else repo = existing;
      if (!repo.private)
        throw new HttpError(
          409,
          "Workspace repositories must be private. Setup stopped.",
        );
      if (!repo.has_discussions)
        await api.api(path, repoSchema, "PATCH", { has_discussions: true });
    }
    const admins: number[] = [];
    for (let page = 1; page <= 20; page++) {
      const owners = await api.api(
        `/orgs/${organization}/members?role=admin&per_page=100&page=${page}`,
        z.array(actorSchema),
      );
      admins.push(...owners.map((owner) => owner.id));
      if (owners.length < 100) break;
      if (page === 20)
        throw new HttpError(413, "Too many organization owners to inspect.");
    }
    if (!admins.includes(actor.id))
      throw new HttpError(
        403,
        "GitHub did not confirm your organization-owner role.",
      );
    const membersPath = `/repos/${workspace.vault}/contents/.gitrew/members.json`;
    const members = await api.response(membersPath);
    if (members.status === 404)
      await api.api(membersPath, z.unknown(), "PUT", {
        message: "Initialize Gitrew workspace membership",
        content: Buffer.from(
          JSON.stringify({
            version: 1,
            organization,
            admins,
            members: [actor],
            openRegistration: false,
            memberPrivateChannels: workspace.memberPrivateChannels,
            blocked: [],
          }),
        ).toString("base64"),
      });
    else if (!members.ok)
      throw new HttpError(502, "Could not verify workspace membership.");
    const channels = await api.api("/graphql", gqlSchema, "POST", {
      query:
        "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:20){nodes{id slug}} discussions(first:1){totalCount}}}",
      variables: {
        owner: organization,
        name: workspace.repository.split("/")[1],
      },
    });
    const data = z
      .object({
        repository: z.object({
          id: z.string(),
          discussionCategories: z.object({
            nodes: z.array(z.object({ id: z.string(), slug: z.string() })),
          }),
          discussions: z.object({ totalCount: z.number() }),
        }),
      })
      .parse(channels.data);
    if (data.repository.discussions.totalCount === 0) {
      const category =
        data.repository.discussionCategories.nodes.find(
          (c) => c.slug === "general",
        ) || data.repository.discussionCategories.nodes[0];
      if (!category)
        throw new HttpError(
          409,
          "GitHub has not prepared Discussion categories yet. Retry shortly.",
        );
      const created = await api.api("/graphql", gqlSchema, "POST", {
        query:
          'mutation($repositoryId:ID!,$categoryId:ID!){createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:"general",body:"Your crew on GitHub. Welcome to the workspace."}){discussion{id}}}',
        variables: {
          repositoryId: data.repository.id,
          categoryId: category.id,
        },
      });
      if (created.errors?.length || !created.data)
        throw new HttpError(502, "Could not create the general channel.");
    }
    await vaultOperation(
      store,
      app,
      workspace,
      actor,
      { op: "members" },
      crypto.randomUUID(),
    );
    workspace.ready = true;
    await store.saveWorkspace(workspace);
    return workspace;
  });
}

// Shared channels are private GitHub repositories. Organization membership is
// checked before granting read access; the installation token is scoped only to
// the chat repository and never grants access to the vault.
export async function ensureWorkspaceAccess(
  api: GitHub,
  app: App,
  workspace: Workspace,
  actor: z.infer<typeof actorSchema>,
) {
  const membership = await api.response(
    `/user/memberships/orgs/${workspace.organization}`,
  );
  if (membership.status === 404)
    throw new HttpError(
      403,
      "You must be an active member of this GitHub organization.",
    );
  if (!membership.ok)
    throw new HttpError(
      502,
      "Could not verify your GitHub organization membership.",
    );
  const role = z
    .object({ state: z.string(), role: z.string() })
    .parse(await membership.json());
  if (role.state !== "active" || !["admin", "member"].includes(role.role))
    throw new HttpError(
      403,
      "You must be an active member of this GitHub organization.",
    );
  const repository = await api.response(`/repos/${workspace.repository}`);
  if (repository.ok) {
    if (
      !z.object({ private: z.boolean() }).parse(await repository.json()).private
    )
      throw new HttpError(
        409,
        "The chat repository must be private. Ask an organization owner to fix its visibility.",
      );
    return role.role === "admin";
  }
  if (repository.status !== 404)
    throw new HttpError(
      502,
      "Could not verify access to the private chat repository.",
    );
  if (workspace?.allowedTeam ?? app.allowedTeam)
    throw new HttpError(
      403,
      "Your GitHub team needs Read access to this workspace's chat repository. Ask an organization owner to grant it; individual access is not created automatically for team workspaces.",
    );
  const token = await installationToken(
    {
      repository: workspace.repository,
      appId: String(app.id),
      privateKey: app.pem,
      manageAccess: true,
    },
    githubFetch,
  );
  try {
    const granted = await githubFetch(
      `https://api.github.com/repos/${workspace.repository}/collaborators/${actor.login}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permission: "pull" }),
      },
    );
    if (granted.status !== 204)
      throw new HttpError(
        502,
        "Could not grant organization-member access to the private chat repository. Check the App's repository administration permission.",
      );
  } finally {
    await githubFetch("https://api.github.com/installation/token", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  return role.role === "admin";
}

export async function vaultOperation(
  store: BackendStore,
  app: App,
  workspace: Workspace,
  actor: z.infer<typeof actorSchema>,
  operation: unknown,
  nonce: string,
) {
  const run = async () => {
    const deadline = Date.now() + 60_000;
    let calls = 0;
    const request: typeof fetch = async (input, init) => {
      if (++calls > 80 || Date.now() >= deadline)
        throw new HttpError(
          504,
          "This workspace operation took too long. Retry shortly.",
        );
      return githubFetch(input, {
        ...init,
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(20_000, deadline - Date.now())),
        ),
      });
    };
    const token = await installationToken(
      {
        repository: workspace.vault,
        appId: String(app.id),
        privateKey: app.pem,
        checkOrganizationRole: true,
      },
      request,
    );
    try {
      const roleResponse = await request(
        `https://api.github.com/orgs/${workspace.organization}/memberships/${actor.login}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      let organizationRole: "admin" | "member" | "outside" = "outside";
      if (roleResponse.ok) {
        const role = z
          .object({
            state: z.string(),
            role: z.enum(["admin", "member"]),
            user: actorSchema,
          })
          .parse(await roleResponse.json());
        if (role.user.id !== actor.id)
          throw new HttpError(
            403,
            "GitHub organization identity could not be verified.",
          );
        if (role.state === "active") organizationRole = role.role;
      } else if (roleResponse.status !== 404)
        throw new HttpError(
          502,
          "Could not verify current organization membership.",
        );
      if (organizationRole === "outside")
        throw new HttpError(
          403,
          "You must be an active member of this GitHub organization.",
        );
      return await executeVault(
        {
          repository: workspace.vault,
          organizationRole,
          openRegistration: false,
        },
        actor,
        operation,
        nonce,
        token,
        request,
      );
    } finally {
      await githubFetch("https://api.github.com/installation/token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  };
  // Read-only operations still perform all membership, participant and vault
  // collaborator checks. Only writes need serialization; serializing readers
  // makes a realtime broadcast or push fan-out fail with lock conflicts.
  const op = (operation as { op?: string } | null)?.op;
  return ["list", "read", "members"].includes(op || "")
    ? run()
    : store.locked("vault:" + workspace.organization, run);
}
