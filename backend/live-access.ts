import { z } from "zod";
import { HttpError } from "./security";
import type { GitHub } from "./github";
import type { App, BackendStore, Workspace } from "./store";
import { ensureWorkspaceAccess, vaultOperation } from "./workspace";
export const roomSchema = z.object({
  organization: z
    .string()
    .regex(/^[a-z\d-]{1,39}$/i)
    .transform((s) => s.toLowerCase()),
  channel: z.string().regex(/^[\w=-]{1,150}$/),
  kind: z.enum(["public", "private", "dm"]),
});
export type Room = z.infer<typeof roomSchema>;
export async function authorizeRoom(
  store: BackendStore,
  app: App,
  api: GitHub,
  actor: { id: number; login: string },
  room: Room,
): Promise<Workspace> {
  const workspace = await store.workspace(room.organization);
  if (!workspace?.ready) throw new HttpError(404, "Workspace not found.");
  await ensureWorkspaceAccess(api, app, workspace, actor);
  if (room.kind === "public") {
    const data = await api.api(
      "/graphql",
      z.object({
        data: z.object({
          node: z
            .object({
              __typename: z.literal("Discussion"),
              repository: z.object({ nameWithOwner: z.string() }),
            })
            .nullable(),
        }),
      }),
      "POST",
      {
        query:
          "query Room($id:ID!){node(id:$id){__typename ... on Discussion {repository{nameWithOwner}}}}",
        variables: { id: room.channel },
      },
    );
    if (
      data.data.node?.repository.nameWithOwner.toLowerCase() !==
      workspace.repository.toLowerCase()
    )
      throw new HttpError(
        403,
        "This channel does not belong to the workspace.",
      );
  } else {
    const result = z
      .object({
        channels: z.array(z.object({ id: z.string(), kind: z.string() })),
      })
      .parse(
        await vaultOperation(
          store,
          app,
          workspace,
          actor,
          { op: "list" },
          crypto.randomUUID(),
        ),
      );
    if (
      !result.channels.some(
        (c) => c.id === room.channel && c.kind === room.kind,
      )
    )
      throw new HttpError(
        403,
        "This private conversation is not available to you.",
      );
  }
  return workspace;
}
