const organizationPattern = /^[a-z\d][a-z\d-]{0,38}$/i;
const conversationPattern = /^[\w-]{1,200}$/;

export function workspacePath(
  organization: string,
  channel = "",
  kind = "public",
) {
  const base = `/w/${encodeURIComponent(organization.toLowerCase())}`;
  return channel
    ? `${base}/${kind === "dm" ? "dm" : "c"}/${encodeURIComponent(channel)}`
    : base;
}

/** Only application destinations are accepted, never arbitrary URLs or encoded paths. */
export function appReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("\\")
  )
    return null;
  let url: URL;
  try {
    url = new URL(value, "https://gitrew.invalid");
  } catch {
    return null;
  }
  if (
    url.origin !== "https://gitrew.invalid" ||
    url.hash ||
    /%/i.test(url.pathname)
  )
    return null;
  const parts = url.pathname.replace(/\/$/, "").split("/").slice(1);
  if (parts[0] === "create" && parts.length === 1) return "/create/";
  if (
    parts[0] !== "w" ||
    !organizationPattern.test(parts[1] || "") ||
    !(
      parts.length === 2 ||
      (parts.length === 4 &&
        ["c", "dm"].includes(parts[2]!) &&
        conversationPattern.test(parts[3]!))
    )
  )
    return null;
  const clean = new URL(
    workspacePath(parts[1]!, parts[3], parts[2] === "dm" ? "dm" : "public"),
    url.origin,
  );
  for (const name of ["repo", "auth", "thread"]) {
    const entry = url.searchParams.get(name);
    if (
      entry &&
      (name === "auth"
        ? /^[\w-]+\/[\w.-]+$/.test(entry)
        : /^[\w.-]{1,200}$/.test(entry))
    )
      clean.searchParams.set(name, entry);
  }
  return clean.pathname + clean.search;
}

export function legacyWorkspacePath(repository: string, channel = "") {
  const [organization, repo] = repository.split("/");
  const path = workspacePath(organization || "", channel);
  return appReturnTo(
    path +
      (repo && repo !== "gitrew-chat"
        ? `?repo=${encodeURIComponent(repo)}`
        : ""),
  );
}
