import { appReturnTo, legacyWorkspacePath } from "../../shared/routes";
import { useQueryClient } from "@tanstack/vue-query";
import { useNow, useIntervalFn } from "@vueuse/core";
import {
  oauthConfigSchema,
  sessionSchema,
  type GitHubSession,
} from "../../shared/auth";
import {
  brokerAddress,
  consumeCallback,
  createAuthorization,
  readSession,
  SESSION_KEY,
} from "~/lib/auth";
import { githubRequest, viewerSchema, type Viewer } from "~/lib/github";
import {
  mailboxConfig,
  prepareMailbox,
  mailboxIssueUrl,
  waitForSession,
  type PendingMailbox,
} from "~/lib/mailbox";
import type { MailboxConfig } from "../../shared/mailbox";
import { clearVaultSends } from "~/lib/vault";

export function useGitHubAuth() {
  const config = useRuntimeConfig();
  if (config.public.backendEnabled) return useBackendAuth();
  const queryClient = useQueryClient();
  const session = shallowRef<GitHubSession | null>(null);
  const viewer = shallowRef<Viewer | null>(null);
  const error = ref("");
  const busy = ref(true);
  const installUrl = ref("");
  const mailboxRepository = ref(
    localStorage.getItem("gitrew:auth-repository:v1") ||
      config.public.authRepository,
  );
  const activeMailbox = shallowRef<MailboxConfig | null>(null);
  const pendingMailbox = shallowRef<PendingMailbox | null>(null);
  const deviceCode = ref("");
  const mailboxWaiting = ref(false);
  const requestUrl = computed(() =>
    pendingMailbox.value ? mailboxIssueUrl(pendingMailbox.value) : "",
  );
  const installer = computed(() => session.value?.installer === true);
  let mailboxAbort: AbortController | null = null;
  function cancelMailbox() {
    mailboxAbort?.abort();
    mailboxAbort = null;
    pendingMailbox.value = null;
    deviceCode.value = "";
    mailboxWaiting.value = false;
    sessionStorage.removeItem("gitrew:mailbox-pending:v1");
  }
  async function pollMailbox(pending: PendingMailbox, isInstaller = false) {
    const controller = new AbortController();
    mailboxAbort = controller;
    mailboxWaiting.value = true;
    try {
      const result = await waitForSession(
        pending,
        (value) => {
          deviceCode.value = value.userCode;
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      queryClient.clear();
      session.value = sessionSchema.parse({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
        mailboxRepository: pending.config.repository,
        installer: isInstaller,
      });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session.value));
      activeMailbox.value = pending.config;
      await loadViewer();
      cancelMailbox();
    } catch (failure) {
      if (!controller.signal.aborted) {
        cancelMailbox();
        error.value =
          failure instanceof Error ? failure.message : "Sign-in failed.";
      }
    } finally {
      if (mailboxAbort === controller) {
        mailboxWaiting.value = false;
        mailboxAbort = null;
      }
    }
  }
  async function selectMailbox(repository: string) {
    const value = await mailboxConfig(repository);
    signOut();
    mailboxRepository.value = value.repository;
    activeMailbox.value = value;
    localStorage.setItem("gitrew:auth-repository:v1", value.repository);
  }
  const now = useNow({
    scheduler: (callback) => useIntervalFn(callback, 30_000),
  });
  const token = computed(() =>
    session.value && session.value.expiresAt > now.value.getTime()
      ? session.value.accessToken
      : "",
  );

  async function oauthConfig() {
    const base = brokerAddress(config.public.oauthBrokerUrl);
    const response = await fetch(
      new URL("config", `${base.href.replace(/\/$/, "")}/`),
      {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new Error(
        "GitHub sign-in is temporarily unavailable. Please try again.",
      );
    const value = oauthConfigSchema.parse(await response.json());
    if (
      value.redirectUri !== `${window.location.origin}${config.app.baseURL}`
    ) {
      throw new Error(
        "GitHub sign-in is configured for a different site. Ask this deployment’s administrator to check its callback URL.",
      );
    }
    installUrl.value = value.installUrl;
    return { ...value, base };
  }

  async function loadViewer() {
    if (!token.value) return;
    viewer.value = await githubRequest("/user", token.value, viewerSchema);
  }

  function signOut() {
    cancelMailbox();
    clearVaultSends();
    sessionStorage.removeItem(SESSION_KEY);
    session.value = null;
    viewer.value = null;
    queryClient.clear();
  }

  async function initialize() {
    try {
      const url = new URL(window.location.href);
      const incomingMailbox = url.searchParams.get("auth");
      if (incomingMailbox && incomingMailbox !== mailboxRepository.value) {
        const incoming = await mailboxConfig(incomingMailbox);
        signOut();
        mailboxRepository.value = incoming.repository;
        activeMailbox.value = incoming;
        localStorage.setItem("gitrew:auth-repository:v1", incoming.repository);
      }
      // Remove OAuth parameters before performing network requests or rendering external links.
      if (url.searchParams.has("code") || url.searchParams.has("error")) {
        const clean = new URL(url);
        for (const name of [
          "code",
          "state",
          "error",
          "error_description",
          "error_uri",
        ])
          clean.searchParams.delete(name);
        history.replaceState(null, "", clean);
        if (url.searchParams.has("setup") && url.searchParams.has("code")) {
          const plan = JSON.parse(
            sessionStorage.getItem("gitrew:setup:v1") || "null",
          );
          if (
            !plan ||
            plan.registrationState !== url.searchParams.get("setup") ||
            plan.registrationState !== url.searchParams.get("state")
          )
            throw new Error("This workspace setup could not be verified.");
          sessionStorage.setItem(
            "gitrew:app-manifest-code",
            JSON.stringify({
              code: url.searchParams.get("code"),
              nonce: plan.registrationState,
            }),
          );
        }
      }
      const callback = url.searchParams.has("setup")
        ? null
        : consumeCallback(url, sessionStorage);
      if (callback) {
        const { base } = await oauthConfig();
        const response = await fetch(
          new URL("exchange", `${base.href.replace(/\/$/, "")}/`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(callback),
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!response.ok)
          throw new Error(
            "GitHub sign-in could not be completed. Please try again.",
          );
        session.value = sessionSchema.parse(await response.json());
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session.value));
        const clean = new URL(window.location.href);
        clean.searchParams.delete("preview");
        history.replaceState(null, "", clean);
      } else session.value = readSession(sessionStorage);
      // A legacy broker token must not silently become a session for a new mailbox authority.
      if (
        session.value &&
        mailboxRepository.value &&
        session.value.mailboxRepository !== mailboxRepository.value
      )
        signOut();
      if (session.value?.mailboxRepository)
        activeMailbox.value = await mailboxConfig(
          session.value.mailboxRepository,
        );
      await loadViewer();
      if (!session.value) {
        const saved = sessionStorage.getItem("gitrew:mailbox-pending:v1");
        if (saved) {
          try {
            const pending = JSON.parse(saved) as PendingMailbox;
            if (
              pending.config.repository !== mailboxRepository.value ||
              Date.now() - pending.request.createdAt > 900_000
            )
              throw new Error("Expired request");
            pendingMailbox.value = pending;
            void pollMailbox(pending, pending.request.app === "creator");
          } catch {
            cancelMailbox();
          }
        }
      }
    } catch (failure) {
      signOut();
      error.value =
        failure instanceof Error
          ? failure.message
          : "Could not sign in. Please try again.";
    } finally {
      busy.value = false;
    }
  }

  async function signIn(isInstaller = false) {
    const url = new URL(window.location.href);
    const workspaceReturnTo = legacyWorkspacePath(
      url.searchParams.get("workspace") || "",
      url.searchParams.get("channel") || "",
    );
    const returnTo =
      appReturnTo(url.searchParams.get("returnTo")) ||
      workspaceReturnTo ||
      appReturnTo(url.pathname + url.search);
    if (returnTo) sessionStorage.setItem("gitrew:return-to:v1", returnTo);
    error.value = "";
    busy.value = true;
    try {
      if (mailboxRepository.value) {
        cancelMailbox();
        const value = await mailboxConfig(mailboxRepository.value);
        if (isInstaller && !value.creatorClientId)
          throw new Error(
            "The Gitrew Creator App has not been configured for this mailbox.",
          );
        activeMailbox.value = value;
        const pending = await prepareMailbox(value, undefined, isInstaller);
        pendingMailbox.value = pending;
        sessionStorage.setItem(
          "gitrew:mailbox-pending:v1",
          JSON.stringify(pending),
        );
        busy.value = false;
        void pollMailbox(pending, isInstaller);
        return;
      }
      if (isInstaller)
        throw new Error(
          "Configure the GitHub-only mailbox to authorize Gitrew Creator.",
        );
      const value = await oauthConfig();
      window.location.assign(
        await createAuthorization(
          value.clientId,
          value.redirectUri,
          sessionStorage,
        ),
      );
    } catch (failure) {
      error.value =
        failure instanceof Error
          ? failure.message
          : "Could not start GitHub sign-in.";
      busy.value = false;
    }
  }

  async function installationLink() {
    if (activeMailbox.value)
      return `https://github.com/apps/${installer.value ? activeMailbox.value.creatorAppSlug || activeMailbox.value.appSlug : activeMailbox.value.appSlug}/installations/new`;
    if (!installUrl.value) await oauthConfig();
    return installUrl.value;
  }

  watch(token, (value, old) => {
    if (!value && old) {
      signOut();
      error.value = "Your GitHub session expired. Sign in again to continue.";
    }
  });
  onMounted(initialize);
  onUnmounted(cancelMailbox);
  return {
    backend: false as const,
    sandbox: ref(""),
    token,
    viewer,
    error,
    busy,
    signIn,
    signOut,
    installationLink,
    mailboxRepository,
    activeMailbox,
    requestUrl,
    deviceCode,
    mailboxWaiting,
    cancelMailbox,
    selectMailbox,
    installer,
  };
}
