import { z } from "zod";
import type { App } from "./store";
import { HttpError } from "./security";

type MembershipApi = { response(path: string): Promise<Response> };
export class WorkspaceAccessError extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}
export async function requireTeamAccess(
  api: MembershipApi,
  app: App,
  login: string,
) {
  if (!app.allowedTeam) return;
  const organization = encodeURIComponent(app.owner.login);
  const membership = await api.response(
    `/orgs/${organization}/memberships/${encodeURIComponent(login)}`,
  );
  if (membership.status === 404)
    throw new WorkspaceAccessError(
      "You must be an active member of this workspace's GitHub organization.",
    );
  if (!membership.ok)
    throw new HttpError(
      502,
      "Could not verify workspace organization membership.",
    );
  const role = z
    .object({ state: z.string(), role: z.enum(["admin", "member"]) })
    .parse(await membership.json());
  if (role.state !== "active")
    throw new WorkspaceAccessError(
      "Your organization invitation must be accepted before entering this workspace.",
    );
  // GitHub organization owners are trusted workspace administrators.
  if (role.role === "admin") return;
  const team = await api.response(
    `/orgs/${organization}/teams/${encodeURIComponent(app.allowedTeam)}/memberships/${encodeURIComponent(login)}`,
  );
  if (team.status === 404)
    throw new WorkspaceAccessError(
      `This workspace is limited to the ${app.allowedTeam} GitHub team.`,
    );
  if (!team.ok)
    throw new HttpError(
      502,
      "Could not verify GitHub team access. Ask an owner to check the App's Members read permission.",
    );
  if (
    z.object({ state: z.string() }).parse(await team.json()).state !== "active"
  )
    throw new WorkspaceAccessError(
      "Your GitHub team invitation must be accepted before entering this workspace.",
    );
}

export function deploymentApp(
  app: App,
  env: { APP_ORIGIN?: string; ALLOWED_TEAM?: string },
): App {
  const allowedTeam = env.ALLOWED_TEAM || app.allowedTeam;
  if (allowedTeam && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(allowedTeam))
    throw new HttpError(503, "Configure ALLOWED_TEAM with a GitHub team slug.");
  let origin = app.origin;
  if (env.APP_ORIGIN) {
    const value = new URL(env.APP_ORIGIN);
    if (
      value.protocol !== "https:" ||
      value.username ||
      value.password ||
      value.pathname !== "/" ||
      value.search ||
      value.hash ||
      value.port
    )
      throw new HttpError(
        503,
        "Configure APP_ORIGIN with the deployment's HTTPS origin.",
      );
    origin = value.origin;
  }
  return { ...app, origin, allowedTeam };
}
