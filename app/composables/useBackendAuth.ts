import { appReturnTo, legacyWorkspacePath } from "../../shared/routes";
import { useQueryClient } from "@tanstack/vue-query";
import { z } from "zod";
import { backendJson, backendResponse, backendToken } from "~/lib/backend";
import { clearVaultSends } from "~/lib/vault";
import { viewerSchema, type Viewer } from "~/lib/github";
import type { MailboxConfig } from "../../shared/mailbox";

export const backendWorkspaceSchema = z.object({
  version: z.literal(1),
  backend: z.literal(true),
  repository: z.string(),
  vault: z.string(),
  clientId: z.string(),
  appSlug: z.string(),
  publicKey: z.string(),
  openRegistration: z.boolean(),
  memberPrivateChannels: z.boolean(),
  displayName: z.string().optional(),
  administrator: z.boolean().default(false),
});
const sessionResponse = z.object({
  viewer: viewerSchema,
  csrf: z.string().min(32),
  expiresAt: z.number(),
  workspace: backendWorkspaceSchema.nullable(),
  app: z.object({ installUrl: z.url() }),
  sandbox: z.string(),
});
export function useBackendAuth() {
  const query = useQueryClient();
  const token = ref(""),
    viewer = shallowRef<Viewer | null>(null),
    error = ref(""),
    busy = ref(true),
    installUrl = ref(""),
    sandbox = ref("");
  const activeMailbox = shallowRef<MailboxConfig | null>(null);
  const displayName = ref("Gitrew");
  const accessRequired = ref(false);
  const mailboxRepository = computed(
    () => activeMailbox.value?.repository || "",
  );
  async function load(organization = "") {
    const response = await backendResponse(
      "/api/session" +
        (organization
          ? "?organization=" + encodeURIComponent(organization)
          : ""),
    );
    if (response.status === 401) {
      token.value = "";
      viewer.value = null;
      activeMailbox.value = null;
      return;
    }
    const body = await response.json();
    if (!response.ok && [403, 502].includes(response.status)) {
      accessRequired.value = true;
      token.value = "";
      viewer.value = null;
      activeMailbox.value = null;
      return;
    }
    if (!response.ok)
      throw new Error(body.error || "Could not load your session.");
    const value = sessionResponse.parse(body);
    token.value = backendToken(value.csrf);
    viewer.value = value.viewer;
    activeMailbox.value = value.workspace;
    displayName.value = value.workspace?.displayName || displayName.value;
    accessRequired.value = false;
    installUrl.value = value.app.installUrl;
    sandbox.value = value.sandbox;
  }
  async function initialize() {
    try {
      const url = new URL(window.location.href);
      const config = await backendJson<{
        configured: boolean;
        sandbox: string;
        displayName?: string;
      }>("/api/config");
      sandbox.value = config.sandbox;
      displayName.value = config.displayName || "Gitrew";
      if (!config.configured) {
        if (url.pathname !== "/create/") await navigateTo("/create/");
        return;
      }
      if (url.searchParams.has("authError")) {
        if (url.searchParams.get("authError") === "restricted") {
          accessRequired.value = true;
          return;
        }
        error.value =
          url.searchParams.get("authError") === "restricted"
            ? "This workspace is limited to its GitHub team. Ask an organization owner to add you."
            : "GitHub sign-in was cancelled. Try again.";
        url.searchParams.delete("authError");
        history.replaceState(null, "", url);
      }
      const destination = appReturnTo(url.searchParams.get("returnTo"));
      const organization =
        url.pathname.match(/\/w\/([^/]+)/)?.[1] ||
        destination?.match(/^\/w\/([^/?]+)/)?.[1] ||
        url.searchParams.get("workspace")?.split("/")[0] ||
        "";
      await load(organization);
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Could not load your session.";
    } finally {
      busy.value = false;
    }
  }
  async function signIn(setup = false) {
    const query = new URLSearchParams();
    if (setup) query.set("setup", "1");
    else {
      const url = new URL(window.location.href);
      const workspaceReturnTo = legacyWorkspacePath(
        url.searchParams.get("workspace") || "",
        url.searchParams.get("channel") || "",
      );
      const returnTo =
        appReturnTo(url.searchParams.get("returnTo")) ||
        workspaceReturnTo ||
        appReturnTo(url.pathname + url.search);
      if (returnTo) query.set("returnTo", returnTo);
    }
    window.location.assign(
      "/api/auth/start" + (query.size ? "?" + query.toString() : ""),
    );
  }
  async function signOut() {
    const current = token.value;
    token.value = "";
    viewer.value = null;
    activeMailbox.value = null;
    accessRequired.value = false;
    query.clear();
    clearVaultSends();
    if (current) {
      try {
        const response = await backendResponse("/api/logout", current, {});
        if (!response.ok && response.status !== 401)
          throw new Error("Logout failed");
      } catch {
        error.value =
          "The server could not confirm sign-out. Reload and retry before leaving this shared device.";
      }
    }
  }
  async function selectMailbox(repository: string) {
    await load(repository.split("/")[0]);
    query.clear();
  }
  async function installationLink() {
    if (!installUrl.value) {
      const config = await backendJson<{ app: { installUrl: string } | null }>(
        "/api/config",
      );
      installUrl.value = config.app?.installUrl || "";
    }
    if (!installUrl.value)
      throw new Error("Register this deployment's GitHub App first.");
    return installUrl.value;
  }
  onMounted(initialize);
  return {
    token,
    viewer,
    error,
    busy,
    signIn,
    signOut,
    installationLink,
    mailboxRepository,
    activeMailbox,
    displayName,
    accessRequired,
    selectMailbox,
    sandbox,
    backend: true as const,
    requestUrl: ref(""),
    deviceCode: ref(""),
    mailboxWaiting: ref(false),
    cancelMailbox: () => {},
    installer: computed(() => false),
  };
}
