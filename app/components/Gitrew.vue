<script setup lang="ts">
import dayjs from "dayjs";
import { backendJson } from "~/lib/backend";
import { useClipboard, useLocalStorage } from "@vueuse/core";
import { useGitHubAuth } from "~/composables/useGitHubAuth";
import { useChat } from "~/composables/useChat";
import { GitHubError, parseRepository } from "~/lib/github";
import { safeUrl } from "~/lib/links";
import { channelSections } from "~/lib/channel-groups";
import { useQuery } from "@tanstack/vue-query";
import { listWorkspaceRepositories } from "~/lib/github";
import type { Channel } from "../../shared/chat";
import type { MailboxConfig } from "../../shared/mailbox";

import { legacyWorkspacePath, workspacePath } from "../../shared/routes";
const props = defineProps<{
  publicSource?: { owner: string; repo: string };
}>();
const publicMode = computed(() => Boolean(props.publicSource));
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
    if (publicMode.value && props.publicSource)
      return `${props.publicSource.owner}/${props.publicSource.repo}`;
    // A server-selected workspace may have moved since this browser last visited.
    const selected =
      (auth.backend ? auth.activeMailbox.value?.repository : "") ||
      (typeof route.params.organization === "string"
        ? `${route.params.organization}/${typeof route.query.repo === "string" ? route.query.repo : savedRepositories.value[login.value]?.startsWith(route.params.organization + "/") ? savedRepositories.value[login.value]!.split("/")[1] : "gitrew-chat"}`
        : "") ||
      savedRepositories.value[login.value] ||
      runtime.public.defaultRepository ||
      "";
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
    .filter((repo) => {
      const name = repo.full_name.split("/")[1]!.toLowerCase();
      const isManagedStorage =
        name === "gitrew-chat" ||
        name === "gitrew-vault" ||
        name === "gitrew-auth" ||
        /^gitrew-(.*-)?(chat|vault|auth)$/.test(name);
      return (
        repo.full_name
          .toLowerCase()
          .startsWith(organization.value.toLowerCase() + "/") &&
        !isManagedStorage
      );
    })
    .map((repo) => repo.full_name),
);
const sources = computed(() => {
  // Independent deployments own one configured chat/vault pair per organization.
  if (auth.backend) return [repository.value];
  const isManagedVault = (fullName: string) => {
    const name = fullName.split("/")[1]!.toLowerCase();
    return (
      name === "gitrew-vault" ||
      name === "gitrew-auth" ||
      /^gitrew-(.*-)?(vault|auth)$/.test(name)
    );
  };
  const all = (repositoriesQuery.data.value || [])
    .filter(
      (r) =>
        r.has_discussions &&
        r.full_name
          .toLowerCase()
          .startsWith(organization.value.toLowerCase() + "/") &&
        !isManagedVault(r.full_name),
    )
    .map((r) => r.full_name);
  return [...new Set([...all, repository.value])].filter(
    (value) => value.includes("/") && !isManagedVault(value),
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
  computed(() => props.publicSource || null),
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
const workspaceSettingsOpen = ref(false);
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
const shell = useTemplateRef<HTMLElement>("shell");
const appError = ref("");
const feed = useTemplateRef("feed");
const { copy, copied } = useClipboard();
const colorMode = useColorMode();
const isMobile = useMediaQuery("(max-width: 760px)");
const threadOverlay = useMediaQuery("(max-width: 1000px)");
useSidebarSwipe(
  shell,
  channelsOpen,
  () =>
    isMobile.value &&
    !chat.parent.value &&
    !route.query.thread &&
    !threadPresent.value &&
    !authOpen.value &&
    !workspaceSettingsOpen.value &&
    !setupOpen.value &&
    !conversationOpen.value &&
    !membersOpen.value &&
    !projectsOpen.value,
);
watch(isMobile, () => {
  channelsOpen.value = false;
});
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
const channelFilter = ref("");
const channelSectionsToRender = computed(() =>
  channelSections(roomChannels.value, channelFilter.value, publicMode.value),
);
// Guests reopen where they left: the last channel per repository lives in
// local storage only, consistent with the anonymous experience.
const lastChannelKey = computed(
  () => `gitrew:public:last-channel:v1:${repository.value.toLowerCase()}`,
);
watch(
  () => chat.channels.value,
  (list) => {
    if (!publicMode.value || !import.meta.client || !list.length) return;
    const saved = window.localStorage.getItem(lastChannelKey.value);
    if (
      saved &&
      saved !== chat.selectedChannel.value &&
      list.some((item) => item.id === saved)
    ) {
      chat.selectedChannel.value = saved;
    }
  },
  { immediate: true },
);
watch(
  () => chat.selectedChannel.value,
  (id) => {
    if (!publicMode.value || !import.meta.client) return;
    window.localStorage.setItem(
      lastChannelKey.value,
      id || "",
    );
  },
);
useEventListener(
  import.meta.client ? window : undefined,
  "keydown",
  (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (publicMode.value) {
        openChannelSwitcher();
        return;
      }
      globalSearch.value?.querySelector("input")?.focus();
    }
  },
);
const switcherOpen = ref(false);
const switcherQuery = ref("");
const switcherIndex = ref(0);
const switcherInput = useTemplateRef<HTMLElement>("switcherInput");
const switcherResults = computed(() =>
  channelSections(
    roomChannels.value,
    switcherQuery.value,
    publicMode.value,
  ).flatMap((section) => section.items),
);
function openChannelSwitcher() {
  switcherQuery.value = "";
  switcherIndex.value = 0;
  switcherOpen.value = true;
  channelsOpen.value = false;
  void nextTick(() =>
    switcherInput.value?.querySelector("input")?.focus(),
  );
}
function moveSwitcher(step: number) {
  const size = switcherResults.value.length;
  if (!size) return;
  switcherIndex.value = (switcherIndex.value + step + size) % size;
}
function chooseSwitcher(id: string) {
  switcherOpen.value = false;
  void selectChannel(id);
}
function switcherKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSwitcher(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSwitcher(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const pick = switcherResults.value[switcherIndex.value];
    if (pick) chooseSwitcher(pick.id);
  }
}
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
  publicHasMoreChannels,
  publicLoadMoreChannels,
  hasOlderMessages,
  publicLoadOlderMessages,
} = chat;
const isSignedIn = computed(() =>
  Boolean(auth.viewer.value && auth.token.value),
);
const sample = computed(() => preview.value);
const workspaceName = computed(() =>
  sample.value
    ? "Gitrew demo"
    : publicMode.value
      ? repository.value
      : isSignedIn.value
        ? auth.activeMailbox.value?.displayName || organization.value
        : "Your workspace",
);
const queryError = computed(
  () =>
    chat.publicChannelsQuery.error.value ||
    chat.publicMessagesQuery.error.value ||
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
    (publicMode.value &&
      (chat.publicChannelsQuery.isPending.value ||
        (Boolean(channel.value) &&
          chat.publicMessagesQuery.isPending.value))) ||
    (isSignedIn.value &&
      !sample.value &&
      (chat.channelsQuery.isPending.value ||
        (Boolean(channel.value) && chat.messagesQuery.isPending.value))),
);
const currentUrl = computed(() => safeUrl(channel.value?.url || ""));
const updatedAt = computed(() => {
  const stamp = publicMode.value
    ? chat.publicMessagesQuery.dataUpdatedAt.value
    : chat.messagesQuery.dataUpdatedAt.value;
  return stamp ? dayjs(stamp).format("HH:mm") : "";
});
const threadPresent = ref(false);
watch(
  parent,
  (value) => {
    if (value) threadPresent.value = true;
  },
  { flush: "sync" },
);
const conversationMenu = computed(() => [
  {
    label: "Projects and issues",
    icon: "i-octicon-project-16",
    onSelect: () => {
      projectsOpen.value = true;
    },
  },
]);
const accountItems = computed(() => [
  [
    {
      label: "Appearance",
      icon: "i-octicon-sun-16",
      children: ["system", "light", "dark"].map((value) => ({
        label:
          value === "system"
            ? "System appearance"
            : value === "light"
              ? "Light appearance"
              : "Dark appearance",
        icon: colorMode.preference === value ? "i-octicon-check-16" : undefined,
        onSelect: () => {
          colorMode.preference = value;
        },
      })),
    },
    ...(auth.backend
      ? [
          {
            label: "Check access",
            icon: "i-octicon-shield-check-16",
            to: "/access/",
          },
        ]
      : []),
  ],
  [{ label: "Sign out", icon: "i-octicon-sign-out-16", onSelect: signOut }],
]);
const workspaceItems = [
  {
    label: "Workspace settings",
    icon: "i-octicon-gear-16",
    onSelect: () => {
      workspaceSettingsOpen.value = true;
    },
  },
];
async function workspaceSaved() {
  await auth.selectMailbox(repository.value);
}

watch(
  [auth.busy, isSignedIn],
  ([busy, signedIn]) => {
    if (publicMode.value || signingOut.value) return;
    if (!busy && auth.backend && auth.accessRequired.value) {
      void navigateTo(
        { path: "/access/", query: { returnTo: route.fullPath } },
        { replace: true },
      );
      return;
    }
    if (!busy && !signedIn && !preview.value && !signingOut.value)
      void navigateTo(
        { path: "/login", query: { returnTo: route.fullPath } },
        { replace: true },
      );
  },
  { immediate: true },
);
function channelLocation(id: string) {
  if (publicMode.value && props.publicSource)
    return {
      path: `/github/${props.publicSource.owner}/${props.publicSource.repo}`,
      query: { channel: id },
    };
  const item = chat.channels.value.find((value) => value.id === id);
  const path = workspacePath(organization.value, id, item?.kind);
  const query: Record<string, string> = {};
  if (
    !preview.value &&
    !publicMode.value &&
    repository.value.split("/")[1] !== "gitrew-chat"
  )
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
    if (value && (preview.value || isSignedIn.value || publicMode.value)) {
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
  channelsOpen.value = false;
  if (id) threadPresent.value = true;
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
  <main v-if="!sample && !isSignedIn && !publicMode" class="auth-page">
    <p role="status">Opening your workspace…</p>
  </main>
  <div
    v-else
    ref="shell"
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
    </header>
    <aside
      id="channel-navigation"
      class="channel-sidebar"
      :class="{ 'is-open': channelsOpen }"
      aria-label="Workspace navigation"
      :inert="(isMobile && !channelsOpen) || (Boolean(parent) && isMobile)"
    >
      <div class="sidebar-top">
        <UDropdownMenu
          v-if="auth.backend && auth.activeMailbox.value?.administrator"
          :items="workspaceItems"
        >
          <UButton
            class="workspace-title"
            color="neutral"
            variant="ghost"
            :label="workspaceName"
            trailing-icon="i-octicon-chevron-down-16"
            aria-label="Workspace options"
          />
        </UDropdownMenu>
        <strong v-else class="workspace-title">{{ workspaceName }}</strong>
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
      <UInput
        v-if="publicMode"
        v-model="channelFilter"
        size="xs"
        icon="i-octicon-search-16"
        placeholder="Filter channels"
        aria-label="Filter channels"
        class="channel-filter"
      />
      <nav class="channels" aria-label="Channels">
        <template
          v-for="section in channelSectionsToRender"
          :key="section.label || 'channels'"
        >
          <div
            v-if="publicMode && section.label && channelSectionsToRender.length > 1"
            class="sidebar-section"
          >
            <span>{{ section.emoji ? `${section.emoji} ` : "" }}{{ section.label }}</span
            ><span class="channel-count">{{ section.items.length }}</span>
          </div>
          <UButton
            v-for="item in section.items"
            :key="item.id"
            :label="item.kind === 'private' ? item.name : `# ${item.name}`"
            :icon="item.kind === 'private' ? 'i-octicon-lock-16' : undefined"
            color="neutral"
            variant="ghost"
            :class="{ active: selectedChannel === item.id }"
            :aria-current="selectedChannel === item.id ? 'page' : undefined"
            @click="selectChannel(item.id)"
          />
        </template>
        <UButton
          v-if="publicMode && publicHasMoreChannels"
          label="Load more channels"
          trailing-icon="i-octicon-chevron-down-16"
          color="neutral"
          variant="ghost"
          size="xs"
          class="screen-wide"
          :loading="publicLoadMoreChannels.isPending.value"
          @click="publicLoadMoreChannels.mutate()"
        />
        <p v-if="!roomChannels.length && !loading" class="sidebar-note">
          No channels yet.
        </p>
      </nav>
      <div class="channel-heading dm-heading" v-if="!publicMode">
        <span>Direct messages</span>
      </div>
      <nav v-if="!publicMode" class="channels" aria-label="Direct messages">
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
        <div v-if="!publicMode" class="user-bar">
          <UDropdownMenu :items="accountItems" :content="{ align: 'start' }">
            <UButton
              class="user-profile"
              color="neutral"
              variant="ghost"
              aria-label="User settings"
            >
              <span
                ><strong>{{
                  auth.viewer.value?.login || "Your account"
                }}</strong
                ><small>Your account</small></span
              >
              <UIcon name="i-octicon-chevron-up-16" />
            </UButton>
          </UDropdownMenu>
        </div>
        <UButton
          v-else
          label="Sign in"
          icon="i-octicon-mark-github-16"
          color="neutral"
          variant="outline"
          size="sm"
          class="w-full justify-start"
          @click="openLogin"
        />
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
          aria-controls="channel-navigation"
          :aria-expanded="channelsOpen"
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
            v-if="auth.backend && !sample && !publicMode"
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
            v-if="auth.backend && !sample && !publicMode"
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
            v-if="sample || publicMode"
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
            v-if="!sample || publicMode"
            icon="i-octicon-sync-16"
            aria-label="Refresh messages"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="
              publicMode
                ? chat.publicMessagesQuery.isFetching.value
                : chat.messagesQuery.isFetching.value
            "
            :disabled="
              !online ||
              (publicMode
                ? chat.publicMessagesQuery.isFetching.value
                : chat.messagesQuery.isFetching.value)
            "
            @click="chat.refresh"
          />
          <UDropdownMenu v-if="!publicMode" :items="conversationMenu"
            ><UButton
              icon="i-octicon-kebab-horizontal-16"
              aria-label="Conversation options"
              color="neutral"
              variant="ghost"
          /></UDropdownMenu>
        </div>
      </header>
      <div v-if="!online" class="notice offline-notice" role="status">
        You’re offline. Your draft is saved on this device.<span
          v-if="!sample && !publicMode"
        >
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
        v-if="queryError && (!sample || publicMode)"
        class="notice error-notice"
        role="alert"
      >
        <span>{{ queryErrorMessage }}</span>
        <NuxtLink
          v-if="auth.backend && !publicMode"
          :to="{ path: '/access/', query: { returnTo: route.fullPath } }"
          >Check access</NuxtLink
        >
        <UButton
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
              publicMode
                ? "No discussions yet."
                : isSignedIn
                  ? "This workspace is ready for a conversation."
                  : "Your team’s conversations stay behind sign-in."
            }}
          </h3>
          <p v-if="!publicMode">Create a channel to start talking with your team.</p>
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
                : publicMode
                  ? "Follow along, or open the discussion on GitHub."
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
        <UButton
          v-if="publicMode && hasOlderMessages"
          label="Load older messages"
          icon="i-octicon-history-16"
          color="neutral"
          variant="ghost"
          size="xs"
          class="feed-load-older"
          :loading="publicLoadOlderMessages.isPending.value"
          @click="publicLoadOlderMessages.mutate(selectedChannel)"
        />
        <template v-for="(message, index) in roots" :key="message.id">
          <div v-if="dayLabel(index)" class="day-divider">
            <span>{{ dayLabel(index) }}</span>
          </div>
          <MessageItem
            :message="message"
            :replies="chat.replyCount(message.id)"
            :selected="selectedThread === message.id"
            :markdown="publicMode"
            @thread="openThread($event)"
          />
        </template>
      </div>
      <div
        v-if="live.connected.value && otherTypers.length"
        class="px-4 py-1 text-xs text-muted"
        role="status"
      >
        {{ otherTypers.join(", ") }} typing…
      </div>
      <ChatComposer
        v-if="!publicMode"
        v-model="roomDraft"
        label="Message"
        :disabled="!canWrite"
        :pending="isPending"
        :preview="sample"
        :error="sendError"
        @send="chat.send()"
      />
      <div v-else class="notice guest-notice" role="note">
        <span>You’re reading as a guest.</span>
        <UButton label="Sign in" size="xs" variant="soft" @click="openLogin" />
        <UButton
          v-if="currentUrl"
          label="Open in GitHub"
          size="xs"
          variant="soft"
          :to="currentUrl"
          target="_blank"
        />
      </div>
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
          <MessageItem :message="parent" in-thread selected :markdown="publicMode" />
          <div class="thread-divider">
            {{ replies.length }}
            {{ replies.length === 1 ? "reply" : "replies" }}
          </div>
          <MessageItem
            v-for="reply in replies"
            :key="reply.id"
            :message="reply"
            in-thread
            :markdown="publicMode"
          />
        </div>
        <ChatComposer
          v-if="!publicMode"
          v-model="threadDraft"
          label="Reply"
          reply
          :disabled="!canWrite"
          :pending="isPending"
          :preview="sample"
          :error="sendError"
          @send="chat.send(selectedThread)"
        />
        <div v-else class="notice guest-notice" role="note">
          <span>You’re reading as a guest.</span>
          <UButton
            label="Sign in"
            size="xs"
            variant="soft"
            @click="openLogin"
          />
        </div>
      </aside>
    </Transition>
    <div
      v-if="switcherOpen"
      class="switcher-overlay"
      @click.self="switcherOpen = false"
      @keydown.esc="switcherOpen = false"
    >
      <div class="switcher" ref="switcherInput" @keydown="switcherKeydown">
        <UInput
          v-model="switcherQuery"
          size="lg"
          icon="i-octicon-search-16"
          placeholder="Jump to a discussion…"
          aria-label="Jump to a discussion"
        />
        <ul class="switcher-list" role="listbox" aria-label="Discussions">
          <li v-for="(item, index) in switcherResults" :key="item.id">
            <button
              type="button"
              role="option"
              :aria-selected="item.id === selectedChannel"
              :class="{ 'is-focal': index === switcherIndex }"
              @click="chooseSwitcher(item.id)"
              @mouseenter="switcherIndex = index"
            >
              <span># {{ item.name }}</span>
              <small
                v-if="publicMode && item.category"
                >{{ item.category.emoji }} {{ item.category.name }}</small
              >
            </button>
          </li>
          <li v-if="!switcherResults.length" class="sidebar-note">
            No discussions match.
          </li>
        </ul>
      </div>
    </div>
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
    <WorkspaceSettings
      v-if="auth.backend && auth.activeMailbox.value?.administrator"
      v-model:open="workspaceSettingsOpen"
      :name="workspaceName"
      :token="auth.token.value"
      @saved="workspaceSaved"
    />
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
