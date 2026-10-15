<script setup lang="ts">
import dayjs from "dayjs";
import { backendJson } from "~/lib/backend";
import { useClipboard, useLocalStorage } from "@vueuse/core";
import { useGitHubAuth } from "~/composables/useGitHubAuth";
import { useChat } from "~/composables/useChat";
import { GitHubError, parseRepository } from "~/lib/github";
import { safeUrl } from "~/lib/links";
import { useQuery } from "@tanstack/vue-query";
import { listWorkspaceRepositories } from "~/lib/github";
import type { Channel } from "../../shared/chat";
import type { MailboxConfig } from "../../shared/mailbox";

import { legacyWorkspacePath, workspacePath } from "../../shared/routes";
const route = useRoute();
const router = useRouter();
const requestedChannel = computed(() => {
  const parts = route.params.conversation;
  return Array.isArray(parts)
    ? parts[1] || ""
    : typeof route.query.channel === "string"
      ? route.query.channel
      : "";
});
const runtime = useRuntimeConfig();
const auth = useGitHubAuth();
const preview = ref(false);
const login = computed(() => auth.viewer.value?.login || "");
const savedRepositories = useLocalStorage<Record<string, string>>(
  "gitrew:workspaces:v2",
  {},
);
const repository = computed({
  get: () => {
    // A server-selected workspace may have moved since this browser last visited.
    const selected =
      (auth.backend ? auth.activeMailbox.value?.repository : "") ||
      (typeof route.params.organization === "string"
        ? `${route.params.organization}/${typeof route.query.repo === "string" ? route.query.repo : savedRepositories.value[login.value]?.startsWith(route.params.organization + "/") ? savedRepositories.value[login.value]!.split("/")[1] : "gitrew-chat"}`
        : "") ||
      savedRepositories.value[login.value] ||
      runtime.public.defaultRepository ||
      "inchidev/gitrew";
    const owner = selected.split("/")[0]!;
    const mailboxOwner = auth.activeMailbox.value?.repository.split("/")[0];
    // Managed workspaces use a canonical private chat repository even after a legacy saved preference.
    return !auth.backend &&
      auth.activeMailbox.value?.vault &&
      mailboxOwner?.toLowerCase() === owner.toLowerCase()
      ? `${owner}/gitrew-chat`
      : selected;
  },
  set: (value) => {
    savedRepositories.value = {
      ...savedRepositories.value,
      [login.value]: parseRepository(value).join("/"),
    };
  },
});
const organization = computed(() => repository.value.split("/")[0]!);
const repositoriesQuery = useQuery({
  queryKey: computed(() => ["workspace-sources", login.value]),
  enabled: computed(() =>
    Boolean(auth.token.value && login.value && !preview.value),
  ),
  queryFn: ({ signal }) => listWorkspaceRepositories(auth.token.value, signal),
  staleTime: 30_000,
});
// Repository work is independent of the canonical conversation store.
const projectRepositories = computed(() =>
  (repositoriesQuery.data.value || [])
    .filter(
      (repo) =>
        repo.full_name
          .toLowerCase()
          .startsWith(organization.value.toLowerCase() + "/") &&
        !["gitrew-chat", "gitrew-vault", "gitrew-auth"].includes(
          repo.full_name.split("/")[1]!,
        ),
    )
    .map((repo) => repo.full_name),
);
const sources = computed(() => {
  // Independent deployments own one configured chat/vault pair per organization.
  if (auth.backend) return [repository.value];
  const all = (repositoriesQuery.data.value || [])
    .filter(
      (r) =>
        r.has_discussions &&
        r.full_name
          .toLowerCase()
          .startsWith(organization.value.toLowerCase() + "/") &&
        !["gitrew-vault", "gitrew-auth"].includes(r.full_name.split("/")[1]!),
    )
    .map((r) => r.full_name);
  return [...new Set([...all, repository.value])].filter(
    (value) =>
      !value.endsWith("/gitrew-vault") && !value.endsWith("/gitrew-auth"),
  );
});
const vaultMailbox = computed(() =>
  auth.activeMailbox.value?.vault &&
  auth.activeMailbox.value.repository.split("/")[0]!.toLowerCase() ===
    organization.value.toLowerCase()
    ? auth.activeMailbox.value
    : null,
);
const chat = useChat(
  computed(() => (auth.installer.value ? "" : auth.token.value)),
  login,
  preview,
  repository,
  sources,
  vaultMailbox,
  requestedChannel,
);
const live = useLiveChat(auth.token, organization, chat.channel, () => {
  // Coalesce webhook delivery and the immediate send acknowledgement.
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => chat.refresh(), 200);
});
let liveRefreshTimer: ReturnType<typeof setTimeout>;
watch(live.connected, (value) => {
  chat.liveConnected.value = value;
});
watch([chat.roomDraft, chat.threadDraft], () =>
  live.sendTyping(Boolean(chat.roomDraft.value || chat.threadDraft.value)),
);
onBeforeUnmount(() => clearTimeout(liveRefreshTimer));
const otherTypers = computed(() =>
  live.typing.value.filter((name) => name !== login.value),
);
const push = usePushNotifications(
  auth.token,
  login,
  organization,
  chat.channel,
);
const huddle = ref<{
  provider: "realtimekit" | "livekit";
  token: string;
  url: string;
  lease: string;
  channel: string;
  room: {
    organization: string;
    channel: string;
    kind: "public" | "private" | "dm";
  };
} | null>(null);
const huddleError = ref(""),
  huddleBusy = ref(false),
  huddleOpen = ref(false);
let huddleHeartbeat: ReturnType<typeof setInterval> | undefined;
async function leaveHuddle() {
  clearInterval(huddleHeartbeat);
  const current = huddle.value;
  huddle.value = null;
  huddleOpen.value = false;
  if (current)
    try {
      await backendJson("/api/huddle/leave", auth.token.value, {
        room: current.room,
        lease: current.lease,
      });
    } catch {
      huddleError.value = "Huddle disconnected. Server cleanup will retry.";
    }
}
async function joinHuddle() {
  if (!chat.channel.value || huddleBusy.value) return;
  if (huddle.value) {
    huddleOpen.value = true;
    return;
  }
  huddleBusy.value = true;
  huddleError.value = "";
  const sessionToken = auth.token.value;
  const room = {
    organization: organization.value,
    channel: chat.channel.value.id,
    kind: chat.channel.value.kind || ("public" as const),
  };
  try {
    const result = await backendJson<{
      provider: "realtimekit" | "livekit";
      token: string;
      url: string;
      lease: string;
    }>("/api/huddle/join", auth.token.value, { room });
    if (sessionToken !== auth.token.value) {
      await backendJson("/api/huddle/leave", sessionToken, {
        room,
        lease: result.lease,
      }).catch(() => undefined);
      return;
    }
    huddle.value = {
      ...result,
      room,
      channel: chat.channel.value?.name || "Huddle",
    };
    huddleOpen.value = true;
    huddleHeartbeat = setInterval(() => {
      const current = huddle.value;
      if (current)
        void backendJson("/api/huddle/heartbeat", auth.token.value, {
          room: current.room,
          lease: current.lease,
        }).catch(() => void leaveHuddle());
    }, 30_000);
  } catch (e) {
    huddleError.value =
      e instanceof Error ? e.message : "Could not join huddle";
  } finally {
    huddleBusy.value = false;
  }
}
watch(huddleOpen, (open) => {
  if (!open && huddle.value) void leaveHuddle();
});
watch(auth.token, () => void leaveHuddle());
onBeforeUnmount(() => {
  clearInterval(huddleHeartbeat);
  void leaveHuddle();
});
const authOpen = ref(false);
const signingOut = ref(false);
const workspaceOpen = ref(false);
const ownOpen = ref(false);
const setupOpen = ref(false);
const conversationOpen = ref(false);
const membersOpen = ref(false);
const projectsOpen = ref(false);
const creatorUrl = computed(() =>
  auth.activeMailbox.value?.creatorAppSlug
    ? `https://github.com/apps/${auth.activeMailbox.value.creatorAppSlug}/installations/new`
    : undefined,
);
async function installerSignIn() {
  setupOpen.value = false;
  authOpen.value = true;
  await auth.signIn(true);
}
async function chooseMailbox(value: string) {
  try {
    await auth.selectMailbox(value);
    const url = new URL(window.location.href);
    url.searchParams.set("auth", value);
    history.replaceState(null, "", url);
    authOpen.value = true;
  } catch (e) {
    auth.error.value =
      e instanceof Error ? e.message : "Could not connect team sign-in.";
  }
}
async function ownWorkspace(config: MailboxConfig) {
  await chooseMailbox(config.repository);
  await connect(`${config.repository.split("/")[0]}/gitrew-chat`);
}
async function conversationCreated(channel?: Channel) {
  if (channel) {
    await chat.vaultChannelsQuery.refetch();
    await selectChannel(channel.id);
  } else await chat.channelsQuery.refetch();
}
watch(auth.installer, (value) => {
  if (value) void navigateTo("/create/");
});
const channelsOpen = ref(false);
const appError = ref("");
const feed = useTemplateRef("feed");
const { copy, copied } = useClipboard();
const colorMode = useColorMode();
const isMobile = useMediaQuery("(max-width: 760px)");
const threadOverlay = useMediaQuery("(max-width: 1000px)");
const globalSearch = useTemplateRef<HTMLElement>("globalSearch");
const shortcutKey = computed(() =>
  import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl",
);
const roomChannels = computed(() =>
  chat.channels.value.filter((c) => c.kind !== "dm"),
);
const directChannels = computed(() =>
  chat.channels.value.filter((c) => c.kind === "dm"),
);
useEventListener(
  import.meta.client ? window : undefined,
  "keydown",
  (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      globalSearch.value?.querySelector("input")?.focus();
    }
  },
);
const {
  channels,
  channel,
  selectedChannel,
  selectedThread,
  search,
  roots,
  parent,
  replies,
  roomDraft,
  threadDraft,
  canWrite,
  online,
} = chat;
const isSignedIn = computed(() =>
  Boolean(auth.viewer.value && auth.token.value),
);
const sample = computed(() => preview.value);
const workspaceName = computed(() =>
  sample.value
    ? "Gitrew demo"
    : isSignedIn.value
      ? organization.value
      : "Your workspace",
);
const queryError = computed(
  () =>
    chat.channelsQuery.error.value ||
    chat.messagesQuery.error.value ||
    chat.vaultChannelsQuery.error.value,
);
const queryErrorMessage = computed(() =>
  queryError.value?.message.startsWith("Another workspace operation")
    ? "Conversations are busy. Try again shortly."
    : queryError.value?.message || "",
);
const sendError = computed(() => chat.sendMutation.error.value?.message || "");
const isPending = chat.sendMutation.isPending;
const loading = computed(
  () =>
    isSignedIn.value &&
    !sample.value &&
    (chat.channelsQuery.isPending.value ||
      (Boolean(channel.value) && chat.messagesQuery.isPending.value)),
);
const currentUrl = computed(() => safeUrl(channel.value?.url || ""));
const updatedAt = computed(() =>
  chat.messagesQuery.dataUpdatedAt.value
    ? dayjs(chat.messagesQuery.dataUpdatedAt.value).format("HH:mm")
    : "",
);
const threadPresent = ref(false);
watch(
  parent,
  (value) => {
    if (value) threadPresent.value = true;
  },
  { flush: "sync" },
);
const conversationMenu = computed(() =>
  sample.value
    ? [
        {
          label: "Export preview channel",
          icon: "i-octicon-download-16",
          onSelect: exportPreview,
        },
        {
          label: "Host your own Gitrew",
          icon: "i-octicon-repo-template-16",
          onSelect: () => {
            ownOpen.value = true;
          },
        },
      ]
    : [
        {
          label: "Change workspace",
          icon: "i-octicon-apps-16",
          onSelect: openWorkspaces,
        },
        {
          label: "Create workspace",
          icon: "i-octicon-plus-16",
          onSelect: () => navigateTo("/create/"),
        },
        {
          label: "Projects and issues",
          icon: "i-octicon-project-16",
          onSelect: () => {
            projectsOpen.value = true;
          },
        },
        {
          label: "Host your own Gitrew",
          icon: "i-octicon-repo-template-16",
          onSelect: () => {
            ownOpen.value = true;
          },
        },
      ],
);

watch(
  [auth.busy, isSignedIn],
  ([busy, signedIn]) => {
    if (!busy && !signedIn && !preview.value && !signingOut.value)
      void navigateTo(
        { path: "/login", query: { returnTo: route.fullPath } },
        { replace: true },
      );
  },
  { immediate: true },
);
function channelLocation(id: string) {
  const item = chat.channels.value.find((value) => value.id === id);
  const path = workspacePath(organization.value, id, item?.kind);
  const query: Record<string, string> = {};
  if (!preview.value && repository.value.split("/")[1] !== "gitrew-chat")
    query.repo = repository.value.split("/")[1]!;
  if (typeof route.query.auth === "string" && !auth.backend)
    query.auth = route.query.auth;
  return { path, query };
}
function selectChannel(id: string) {
  return router.push(channelLocation(id));
}
watch(
  () => chat.channel.value,
  (value) => {
    if (value && (preview.value || isSignedIn.value)) {
      const location = channelLocation(value.id);
      if (route.path !== location.path)
        void router.replace({
          ...location,
          query: {
            ...location.query,
            ...(typeof route.query.thread === "string"
              ? { thread: route.query.thread }
              : {}),
          },
        });
    }
  },
);
function openThread(id: string) {
  const query = { ...route.query };
  if (id) query.thread = id;
  else delete query.thread;
  void router.push({ path: route.path, query });
}
watch(
  [() => route.query.thread, chat.messages, chat.messagesQuery.isPending],
  ([id]) => {
    selectedThread.value =
      typeof id === "string" &&
      chat.messages.value.some(
        (message) => message.id === id && !message.parentId,
      )
        ? id
        : "";
  },
  { immediate: true },
);
watch(queryError, (error) => {
  if (error instanceof GitHubError && error.status === 401) auth.signOut();
});
watch(
  () => chat.messages.value.length,
  async () => {
    const nearEnd =
      !feed.value ||
      feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight <
        180;
    if (nearEnd) {
      await nextTick();
      feed.value?.scrollTo({
        top: feed.value.scrollHeight,
        behavior: "instant",
      });
    }
  },
);
watch(selectedChannel, async () => {
  channelsOpen.value = false;
  await nextTick();
  feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: "instant" });
});

function openLogin() {
  void navigateTo("/login");
}
function openWorkspaces() {
  if (isSignedIn.value) workspaceOpen.value = true;
  else openLogin();
}
async function connect(value: string) {
  const owner = parseRepository(value)[0];
  if (
    auth.activeMailbox.value?.vault &&
    owner.toLowerCase() !==
      auth.activeMailbox.value.repository.split("/")[0]!.toLowerCase()
  ) {
    try {
      await auth.selectMailbox(`${owner}/gitrew-auth`);
    } catch {
      appError.value =
        "Connect this organization’s gitrew-auth before opening its workspace.";
      return;
    }
  }
  repository.value = value;
  appError.value = "";
  const target = legacyWorkspacePath(value)!;
  await navigateTo(
    auth.activeMailbox.value && !auth.backend
      ? target +
          (target.includes("?") ? "&" : "?") +
          "auth=" +
          encodeURIComponent(auth.activeMailbox.value.repository)
      : target,
  );
}
async function installApp() {
  appError.value = "";
  try {
    const url = await auth.installationLink();
    window.location.assign(url);
  } catch (error) {
    appError.value =
      error instanceof Error
        ? error.message
        : "Could not open GitHub App installation.";
  }
}
async function signOut() {
  const returnTo = route.fullPath;
  signingOut.value = true;
  await auth.signOut();
  await navigateTo({ path: "/login", query: { returnTo } }, { replace: true });
}
function shareWorkspace() {
  void copy(
    new URL(
      runtime.app.baseURL.replace(/\/$/, "") + route.fullPath,
      window.location.origin,
    ).href,
  );
}
function exportPreview() {
  const blob = new Blob(
    [
      JSON.stringify(
        { channels: channels.value, messages: chat.messages.value },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gitrew-preview-channel.json";
  link.click();
  URL.revokeObjectURL(url);
}
function dayLabel(index: number) {
  const message = roots.value[index];
  if (
    !message ||
    (index &&
      dayjs(roots.value[index - 1]?.createdAt).isSame(message.createdAt, "day"))
  )
    return "";
  return dayjs(message.createdAt).isSame(dayjs(), "day")
    ? "Today"
    : dayjs(message.createdAt).format("D MMMM YYYY");
}
</script>

<template>
  <main v-if="!sample && !isSignedIn" class="auth-page">
    <p role="status">Opening your workspace…</p>
  </main>
  <div
    v-else
    class="gitrew-shell"
    :class="{ 'has-thread': parent || threadPresent }"
  >
    <header class="app-toolbar" :inert="Boolean(parent) && isMobile">
      <NuxtLink to="/" class="brand" aria-label="Gitrew home"
        ><BrandMark /><span>Gitrew</span></NuxtLink
      >
      <div ref="globalSearch" class="global-search">
        <UInput
          v-model="search"
          type="search"
          icon="i-octicon-search-16"
          placeholder="Search messages"
          aria-label="Search messages"
          class="w-full"
          size="sm"
        >
          <template #trailing>
            <UButton
              v-if="search"
              icon="i-octicon-x-16"
              aria-label="Clear search"
              color="neutral"
              variant="link"
              size="xs"
              @click="search = ''"
            />
            <kbd v-else>{{ shortcutKey }} K</kbd>
          </template>
        </UInput>
      </div>
      <span v-if="sample" class="demo-badge">Demo</span>
      <span v-else class="toolbar-workspace">{{ workspaceName }}</span>
    </header>
    <nav class="workspace-rail" aria-label="Workspaces">
      <UTooltip
        :text="workspaceName"
        :delay-duration="300"
        :content="{ side: 'right' }"
      >
        <button
          class="workspace-badge"
          :aria-label="`Open ${workspaceName} workspace`"
          @click="openWorkspaces"
        >
          {{ sample ? "gh" : organization.slice(0, 2) }}
        </button>
      </UTooltip>
      <UTooltip
        text="Create a workspace"
        :delay-duration="300"
        :content="{ side: 'right' }"
      >
        <UButton
          to="/create/"
          icon="i-octicon-plus-16"
          aria-label="Create a workspace"
          color="neutral"
          variant="ghost"
        />
      </UTooltip>
      <div class="rail-bottom">
        <UTooltip
          text="About Gitrew"
          :delay-duration="300"
          :content="{ side: 'right' }"
        >
          <UButton
            to="https://github.com/inchidev/gitrew"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-octicon-question-16"
            aria-label="About Gitrew"
            color="neutral"
            variant="ghost"
          />
        </UTooltip>
      </div>
    </nav>
    <aside
      class="channel-sidebar"
      :class="{ 'is-open': channelsOpen }"
      aria-label="Workspace navigation"
      :inert="(isMobile && !channelsOpen) || (Boolean(parent) && isMobile)"
    >
      <div class="sidebar-top">
        <button class="workspace-switch" @click="openWorkspaces">
          <strong>{{ workspaceName }}</strong
          ><UIcon name="i-octicon-chevron-down-16" />
        </button>
        <UButton
          icon="i-octicon-x-16"
          aria-label="Close channels"
          color="neutral"
          variant="ghost"
          class="mobile-only"
          @click="channelsOpen = false"
        />
      </div>
      <div class="channel-heading">
        <span>Channels</span
        ><span class="channel-count">{{ roomChannels.length }}</span>
        <UButton
          v-if="isSignedIn"
          icon="i-octicon-plus-16"
          aria-label="Start a conversation"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="conversationOpen = true"
        />
      </div>
      <nav class="channels" aria-label="Channels">
        <UButton
          v-for="item in roomChannels"
          :key="item.id"
          :label="item.kind === 'private' ? item.name : `# ${item.name}`"
          :icon="item.kind === 'private' ? 'i-octicon-lock-16' : undefined"
          color="neutral"
          variant="ghost"
          :class="{ active: selectedChannel === item.id }"
          :aria-current="selectedChannel === item.id ? 'page' : undefined"
          @click="selectChannel(item.id)"
        />
        <p v-if="!channels.length && !loading" class="sidebar-note">
          No channels yet.
        </p>
      </nav>
      <div class="channel-heading dm-heading"><span>Direct messages</span></div>
      <nav class="channels" aria-label="Direct messages">
        <UButton
          v-for="item in directChannels"
          :key="item.id"
          :label="item.name"
          icon="i-octicon-person-16"
          color="neutral"
          variant="ghost"
          :class="{ active: selectedChannel === item.id }"
          :aria-current="selectedChannel === item.id ? 'page' : undefined"
          @click="selectChannel(item.id)"
        />
        <p v-if="!directChannels.length" class="sidebar-note">
          No direct messages yet
        </p>
      </nav>
      <div class="sidebar-bottom">
        <UButton
          v-if="isSignedIn && vaultMailbox?.vault"
          label="Workspace members"
          icon="i-octicon-people-16"
          color="neutral"
          variant="ghost"
          class="w-full justify-start"
          @click="membersOpen = true"
        />
        <button class="own-client" @click="ownOpen = true">
          <UIcon name="i-octicon-repo-template-16" /><span
            ><strong>Host your own</strong></span
          ><UIcon name="i-octicon-link-external-16" />
        </button>
        <div class="user-bar">
          <span
            ><strong>{{ auth.viewer.value?.login || "Demo" }}</strong
            ><small>{{
              isSignedIn
                ? "Your account"
                : sample
                  ? "Demo workspace"
                  : "Sign in to open your workspace"
            }}</small></span
          >
          <UButton
            icon="i-octicon-sun-16"
            aria-label="Toggle color theme"
            color="neutral"
            variant="ghost"
            @click="
              colorMode.preference =
                colorMode.value === 'dark' ? 'light' : 'dark'
            "
          />
          <UButton
            v-if="isSignedIn"
            icon="i-octicon-sign-out-16"
            aria-label="Sign out"
            color="neutral"
            variant="ghost"
            @click="signOut"
          />
          <UButton
            v-else
            icon="i-octicon-mark-github-16"
            aria-label="Sign in with GitHub"
            color="neutral"
            variant="ghost"
            @click="openLogin"
          />
        </div>
      </div>
    </aside>
    <button
      v-if="channelsOpen"
      class="sidebar-backdrop"
      aria-label="Close channel navigation"
      @click="channelsOpen = false"
    />

    <main class="conversation" :inert="Boolean(parent) && threadOverlay">
      <header class="conversation-header">
        <UButton
          icon="i-octicon-three-bars-16"
          aria-label="Open channels"
          color="neutral"
          variant="ghost"
          class="mobile-only"
          @click="channelsOpen = true"
        />
        <div class="channel-title">
          <h2>
            <UIcon
              v-if="channel?.kind === 'private'"
              name="i-octicon-lock-16"
              aria-hidden="true"
            />
            <UIcon
              v-else-if="channel?.kind === 'dm'"
              name="i-octicon-person-16"
              aria-hidden="true"
            />
            <span v-else>#</span> {{ channel?.name || "Your workspace" }}
          </h2>
          <p>
            {{
              channel?.kind === "private"
                ? "Private channel"
                : channel?.kind === "dm"
                  ? "Direct message"
                  : channel?.description || ""
            }}
          </p>
        </div>
        <div class="header-actions">
          <UButton
            v-if="auth.backend && !sample"
            :icon="push.enabled.value ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
            :aria-label="
              push.enabled.value
                ? 'Disable conversation notifications'
                : 'Enable conversation notifications'
            "
            color="neutral"
            variant="ghost"
            :loading="push.busy.value"
            @click="push.toggle"
          />
          <UButton
            v-if="auth.backend && !sample"
            icon="i-lucide-headphones"
            :aria-label="huddle ? 'Return to huddle' : 'Join huddle'"
            :label="
              live.huddleMembers.value.length
                ? String(live.huddleMembers.value.length)
                : undefined
            "
            color="neutral"
            variant="ghost"
            :loading="huddleBusy"
            @click="joinHuddle"
          />
          <UButton
            v-if="sample"
            label="Sign in"
            aria-label="Sign in with GitHub"
            icon="i-octicon-mark-github-16"
            color="neutral"
            variant="outline"
            size="sm"
            @click="openLogin"
          />
          <UButton
            v-else
            icon="i-octicon-link-16"
            :aria-label="
              copied ? 'Workspace link copied' : 'Copy workspace link'
            "
            color="neutral"
            variant="ghost"
            @click="shareWorkspace"
          />
          <UButton
            v-if="currentUrl"
            :to="currentUrl"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-octicon-link-external-16"
            aria-label="Open channel in GitHub"
            color="neutral"
            variant="ghost"
          />
          <UButton
            v-if="!sample"
            icon="i-octicon-sync-16"
            aria-label="Refresh messages"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="chat.messagesQuery.isFetching.value"
            :disabled="!online || chat.messagesQuery.isFetching.value"
            @click="chat.refresh"
          />
          <UDropdownMenu :items="conversationMenu"
            ><UButton
              icon="i-octicon-kebab-horizontal-16"
              aria-label="Conversation options"
              color="neutral"
              variant="ghost"
          /></UDropdownMenu>
        </div>
      </header>
      <div v-if="!online" class="notice offline-notice" role="status">
        You’re offline. Your draft is saved on this device.<span v-if="!sample">
          Send it when you reconnect.</span
        >
      </div>
      <div v-else-if="sample" class="notice preview-notice">
        Demo workspace. Changes stay in this browser.
      </div>
      <div
        v-if="chat.vaultChannelsQuery.isFetching.value"
        class="sr-only"
        role="status"
      >
        Loading conversations…
      </div>
      <div v-if="push.error.value" class="notice error-notice" role="alert">
        {{ push.error.value }}
        <a
          href="https://github.com/inchidev/gitrew/blob/main/docs/notifications.md"
          target="_blank"
          rel="noopener noreferrer"
          >Notifications setup</a
        >
      </div>
      <div v-if="huddleError" class="notice error-notice" role="alert">
        {{ huddleError }}
        <a
          href="https://github.com/inchidev/gitrew/blob/main/docs/huddles.md"
          target="_blank"
          rel="noopener noreferrer"
          >Huddles setup</a
        >
      </div>
      <div v-if="appError" class="notice error-notice" role="alert">
        {{ appError }}
      </div>
      <div
        v-if="queryError && !sample"
        class="notice error-notice"
        role="alert"
      >
        <span>{{ queryErrorMessage }}</span
        ><UButton
          label="Retry"
          size="xs"
          color="neutral"
          variant="outline"
          :disabled="!online"
          @click="chat.refresh"
        />
      </div>

      <div
        ref="feed"
        class="message-feed"
        role="region"
        aria-label="Messages"
        tabindex="0"
        :aria-busy="loading"
      >
        <div v-if="loading" class="empty-state">
          <UIcon name="i-octicon-sync-16" class="animate-spin" />
          <h3>Loading messages…</h3>
        </div>
        <div v-else-if="!channels.length" class="empty-state">
          <BrandMark />
          <h3>
            {{
              isSignedIn
                ? "This workspace is ready for a conversation."
                : "Your team’s conversations stay behind sign-in."
            }}
          </h3>
          <p>Create a channel to start talking with your team.</p>
          <UButton
            label="Open Discussions"
            :to="`https://github.com/${repository}/discussions`"
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="outline"
          />
        </div>
        <div v-else-if="!roots.length" class="empty-state">
          <UIcon
            :name="
              search ? 'i-octicon-search-16' : 'i-octicon-comment-discussion-16'
            "
          />
          <h3>
            {{ search ? "No messages match your search." : "No messages yet." }}
          </h3>
          <p>
            {{
              search
                ? "Try another word, or return to the conversation."
                : "Send the first message."
            }}
          </p>
          <UButton
            v-if="search"
            label="Clear search"
            color="neutral"
            variant="outline"
            @click="search = ''"
          />
        </div>
        <template v-for="(message, index) in roots" :key="message.id">
          <div v-if="dayLabel(index)" class="day-divider">
            <span>{{ dayLabel(index) }}</span>
          </div>
          <MessageItem
            :message="message"
            :replies="chat.replyCount(message.id)"
            :selected="selectedThread === message.id"
            @thread="openThread($event)"
          />
        </template>
      </div>
      <div
        v-if="live.connected.value"
        class="px-4 py-1 text-xs text-muted"
        role="status"
      >
        {{
          otherTypers.length
            ? `${otherTypers.join(", ")} typing…`
            : `${live.members.value.length} online in this conversation`
        }}
      </div>
      <ChatComposer
        v-model="roomDraft"
        label="Message"
        :disabled="!canWrite"
        :pending="isPending"
        :preview="sample"
        :error="sendError"
        @send="chat.send()"
      />
    </main>

    <Transition name="thread" @after-leave="threadPresent = false">
      <aside v-if="parent" class="thread-panel" aria-label="Thread">
        <header class="thread-header">
          <div>
            <h2>Thread</h2>
            <p># {{ channel?.name }}</p>
          </div>
          <UButton
            icon="i-octicon-x-16"
            aria-label="Close thread"
            color="neutral"
            variant="ghost"
            @click="openThread('')"
          />
        </header>
        <div
          class="thread-feed"
          role="region"
          aria-label="Thread messages"
          tabindex="0"
        >
          <MessageItem :message="parent" in-thread selected />
          <div class="thread-divider">
            {{ replies.length }}
            {{ replies.length === 1 ? "reply" : "replies" }}
          </div>
          <MessageItem
            v-for="reply in replies"
            :key="reply.id"
            :message="reply"
            in-thread
          />
        </div>
        <ChatComposer
          v-model="threadDraft"
          label="Reply"
          reply
          :disabled="!canWrite"
          :pending="isPending"
          :preview="sample"
          :error="sendError"
          @send="chat.send(selectedThread)"
        />
      </aside>
    </Transition>
    <UModal
      v-model:open="huddleOpen"
      title="Voice huddle"
      description="A voice conversation with your crew."
      :dismissible="false"
    >
      <template #body
        ><HuddlePanel
          v-if="huddle"
          :provider="huddle.provider"
          :token="huddle.token"
          :url="huddle.url"
          :channel="huddle.channel"
          @leave="leaveHuddle"
      /></template>
    </UModal>
    <AuthModal
      :sandbox="
        auth.backend
          ? Boolean(auth.sandbox.value)
          : auth.mailboxRepository.value === 'gitrew-sandbox/gitrew-auth'
      "
      :backend="auth.backend"
      v-model:open="authOpen"
      :busy="auth.busy.value"
      :error="auth.error.value"
      :request-url="auth.requestUrl.value"
      :device-code="auth.deviceCode.value"
      :waiting="auth.mailboxWaiting.value"
      :mailbox-repository="auth.mailboxRepository.value"
      @sign-in="auth.signIn()"
      @mailbox="chooseMailbox"
      @cancel="auth.cancelMailbox"
    />
    <WorkspaceModal
      v-model:open="workspaceOpen"
      :token="auth.token.value"
      :login="login"
      :repository="repository"
      :public-only="false"
      @connect="connect"
      @install="installApp"
      @create="navigateTo('/create/')"
    />
    <OwnClientModal v-model:open="ownOpen" />
    <SetupModal
      v-model:open="setupOpen"
      :token="auth.token.value"
      :login="login"
      :user-id="auth.viewer.value?.id || 0"
      :installer="auth.installer.value"
      :creator-url="creatorUrl"
      @authorize="installerSignIn"
      @ready="ownWorkspace"
    />
    <ConversationModal
      v-model:open="conversationOpen"
      :token="auth.token.value"
      :user-id="auth.viewer.value?.id || 0"
      :repository="repository"
      :mailbox="vaultMailbox"
      @created="conversationCreated"
    />
    <ConversationModal
      v-model:open="membersOpen"
      members-only
      :token="auth.token.value"
      :user-id="auth.viewer.value?.id || 0"
      :repository="repository"
      :mailbox="vaultMailbox"
    />
    <ProjectsModal
      v-model:open="projectsOpen"
      :token="auth.token.value"
      :organization="organization"
      :repositories="projectRepositories"
    />
  </div>
</template>
