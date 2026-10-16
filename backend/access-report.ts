import { z } from "zod";
import type { AccessCheck, AccessReport } from "../shared/access";
import { WorkspaceMemberRequired } from "../shared/vault";
import type { App, BackendStore, Workspace } from "./store";
import type { GitHub, actorSchema } from "./github";
import { vaultOperation } from "./workspace";

export const displayName = (
  workspace: Workspace | null,
  app: App | null,
  fallback = "",
) =>
  workspace?.displayName ||
  fallback ||
  workspace?.organization ||
  app?.owner.login ||
  "Gitrew";

/** Own-identity diagnostics only. Never grants repository or workspace access. */
export async function inspectAccess(
  store: BackendStore,
  api: GitHub,
  app: App,
  actor: z.infer<typeof actorSchema>,
  fallbackName = "",
): Promise<AccessReport> {
  const workspace = await store.workspace(app.owner.login);
  const organization = workspace?.organization || app.owner.login;
  const checks: AccessCheck[] = [
    {
      id: "organization",
      label: "GitHub organization",
      status: "unknown",
      detail:
        "Could not verify organization access. Check again or ask an administrator.",
    },
    {
      id: "team",
      label: "GitHub team",
      status: "not_checked",
      detail: "Organization access must be confirmed first.",
    },
    {
      id: "chat",
      label: "Chat repository",
      status: "not_checked",
      detail: "Organization and team access must be confirmed first.",
    },
    {
      id: "membership",
      label: "Private conversations and DMs",
      status: "not_checked",
      detail:
        "Workspace entry must be available before checking private conversations.",
    },
  ];
  const org = checks[0]!,
    team = checks[1]!,
    chat = checks[2]!,
    member = checks[3]!;
  let owner = false;
  try {
    const response = await api.response(
      `/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(actor.login)}`,
    );
    if (response.status === 404)
      Object.assign(org, {
        status: "missing",
        detail: `Ask an owner to invite you to ${organization}, then accept the GitHub invitation.`,
      });
    else if (response.ok) {
      const role = z
        .object({ state: z.string(), role: z.enum(["admin", "member"]) })
        .parse(await response.json());
      owner = role.state === "active" && role.role === "admin";
      Object.assign(
        org,
        role.state === "active"
          ? {
              status: "passed",
              detail: `You are an active member of ${organization}.`,
            }
          : {
              status: "missing",
              detail: `Accept your GitHub organization invitation to ${organization}.`,
            },
      );
    }
  } catch {
    /* Unknown is a verification failure, never a grant. */
  }
  if (org.status === "passed") {
    if (!app.allowedTeam || owner)
      Object.assign(team, {
        status: "not_required",
        detail: owner
          ? "Organization owners retain administrator access."
          : "This workspace has no team restriction.",
      });
    else {
      Object.assign(team, {
        status: "unknown",
        detail:
          "Could not verify the GitHub team. Ask an owner to check the App's Members read permission.",
      });
      try {
        const response = await api.response(
          `/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(app.allowedTeam)}/memberships/${encodeURIComponent(actor.login)}`,
        );
        if (response.status === 404)
          Object.assign(team, {
            status: "missing",
            detail: `Ask an owner to add you to the ${app.allowedTeam} team.`,
          });
        else if (response.ok) {
          const value = z
            .object({ state: z.string() })
            .parse(await response.json());
          Object.assign(
            team,
            value.state === "active"
              ? {
                  status: "passed",
                  detail: `You belong to the ${app.allowedTeam} team.`,
                }
              : {
                  status: "missing",
                  detail: `Accept your invitation to the ${app.allowedTeam} team.`,
                },
          );
        }
      } catch {
        /* Preserve unknown. */
      }
    }
  }
  if (
    org.status === "passed" &&
    ["passed", "not_required"].includes(team.status)
  ) {
    if (!workspace?.ready)
      chat.detail =
        "An organization owner needs to finish setting up this workspace.";
    else {
      Object.assign(chat, {
        status: "unknown",
        detail:
          "Could not verify the chat repository. Ask an administrator to check its visibility and App installation.",
      });
      try {
        const response = await api.response(`/repos/${workspace.repository}`);
        if (response.status === 404)
          Object.assign(chat, {
            status: "missing",
            detail: app.allowedTeam
              ? "Ask an owner to give your GitHub team Read access to this workspace's chat repository."
              : "Ask an owner to check your Read access and the App's access to this workspace's chat repository.",
          });
        else if (
          response.ok &&
          z.object({ private: z.boolean() }).parse(await response.json())
            .private
        )
          Object.assign(chat, {
            status: "passed",
            detail: "You can read this workspace's private chat repository.",
          });
      } catch {
        /* Preserve unknown. */
      }
    }
  }
  const canEnter =
    org.status === "passed" &&
    ["passed", "not_required"].includes(team.status) &&
    chat.status === "passed";
  let isAdmin = owner && !workspace?.ready;
  if (canEnter && workspace) {
    try {
      const result = z
        .object({
          admins: z.array(z.number()),
          members: z.array(z.object({ id: z.number() })),
        })
        .parse(
          await vaultOperation(
            store,
            app,
            workspace,
            actor,
            { op: "members" },
            crypto.randomUUID(),
          ),
        );
      isAdmin = owner && result.admins.includes(actor.id);
      Object.assign(member, {
        status: "passed",
        detail:
          "You are registered in Gitrew. Private channels still require their own participant invitation.",
      });
    } catch (error) {
      Object.assign(
        member,
        error instanceof WorkspaceMemberRequired
          ? {
              status: "missing",
              detail:
                "Ask a workspace administrator to add your GitHub username in Workspace members. You can still use shared channels.",
            }
          : {
              status: "unknown",
              detail:
                "Could not verify private conversation access. Ask an administrator to check workspace membership and vault permissions.",
            },
      );
    }
  }
  return {
    viewer: { id: actor.id, login: actor.login },
    displayName: displayName(workspace, app, fallbackName),
    organization,
    checkedAt: new Date().toISOString(),
    canEnter,
    isAdmin,
    checks,
  };
}
