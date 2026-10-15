export interface VaultActor {
  id: number;
  login: string;
}
export interface VaultMembers {
  version: 1;
  organization: string;
  admins: number[];
  members: VaultActor[];
  openRegistration?: boolean;
  memberPrivateChannels?: boolean;
  blocked?: number[];
}
export interface VaultConversation {
  version: 1;
  kind: "private" | "dm";
  id: string;
  name: string;
  members: number[];
}
export type VaultOperation =
  | { op: "list" }
  | { op: "read"; conversation: string }
  | { op: "send"; conversation: string; body: string; parentId?: string }
  | { op: "create"; kind: "private" | "dm"; name: string; members: number[] }
  | { op: "members" }
  | { op: "join" }
  | { op: "invite"; login: string }
  | { op: "remove"; userId: number };
// Membership is enforced on every request, including requests already queued in Actions.
export function parseVaultOperation(input: unknown): VaultOperation {
  if (!input || typeof input !== "object")
    throw new Error("Invalid vault operation.");
  const value = input as Record<string, unknown>;
  if (value.op === "list" || value.op === "members" || value.op === "join")
    return { op: value.op };
  if (
    value.op === "invite" &&
    typeof value.login === "string" &&
    /^[a-z\d-]{1,39}$/i.test(value.login)
  )
    return { op: "invite", login: value.login };
  if (
    value.op === "remove" &&
    Number.isSafeInteger(value.userId) &&
    Number(value.userId) > 0
  )
    return { op: "remove", userId: Number(value.userId) };
  if (
    (value.op === "read" || value.op === "send") &&
    typeof value.conversation === "string" &&
    /^[\w=-]{1,150}$/.test(value.conversation)
  ) {
    if (value.op === "read")
      return { op: "read", conversation: value.conversation };
    if (
      typeof value.body !== "string" ||
      !value.body.trim() ||
      value.body.length > 6000 ||
      (value.parentId !== undefined &&
        (typeof value.parentId !== "string" ||
          !/^[\w=-]{1,150}$/.test(value.parentId)))
    )
      throw new Error("Messages must contain 1–6000 characters.");
    return {
      op: "send",
      conversation: value.conversation,
      body: value.body.trim(),
      parentId: value.parentId as string | undefined,
    };
  }
  if (
    value.op === "create" &&
    ["private", "dm"].includes(String(value.kind)) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 80 &&
    Array.isArray(value.members) &&
    value.members.length <= 100 &&
    value.members.every((id) => Number.isSafeInteger(id) && id > 0)
  )
    return {
      op: "create",
      kind: value.kind as "private" | "dm",
      name: value.name.trim(),
      members: [...new Set(value.members)],
    };
  throw new Error("Invalid vault operation.");
}
export function validateMembers(input: unknown): VaultMembers {
  if (!input || typeof input !== "object")
    throw new Error("Vault membership is not configured.");
  const value = input as VaultMembers;
  if (
    value.version !== 1 ||
    typeof value.organization !== "string" ||
    !/^[\w-]+$/.test(value.organization) ||
    !Array.isArray(value.admins) ||
    !value.admins.length ||
    !value.admins.every((id) => Number.isSafeInteger(id) && id > 0) ||
    (value.openRegistration !== undefined &&
      typeof value.openRegistration !== "boolean") ||
    (value.memberPrivateChannels !== undefined &&
      typeof value.memberPrivateChannels !== "boolean") ||
    (value.blocked !== undefined &&
      (!Array.isArray(value.blocked) ||
        !value.blocked.every((id) => Number.isSafeInteger(id) && id > 0))) ||
    !Array.isArray(value.members) ||
    !value.members.every(
      (m) =>
        Number.isSafeInteger(m.id) && m.id > 0 && typeof m.login === "string",
    )
  )
    throw new Error("Vault membership is invalid.");
  return value;
}
export function canReadConversation(
  actor: VaultActor,
  membership: VaultMembers,
  conversation: VaultConversation,
) {
  return (
    membership.admins.includes(actor.id) ||
    (membership.members.some((member) => member.id === actor.id) &&
      conversation.members.includes(actor.id))
  );
}
