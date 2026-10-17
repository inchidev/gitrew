import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  useLocalStorage,
  useOnline,
  useDocumentVisibility,
} from "@vueuse/core";
import { z } from "zod";
import type { Channel, Message, ChatTransport } from "../../shared/chat";
import type { MailboxConfig } from "../../shared/mailbox";
import { VaultTransport } from "~/lib/vault";
import { GitHubError, GitHubTransport } from "~/lib/github";
import { PublicError } from "~/lib/public";
import { PublicTransport } from "~/lib/public-chat";
import { previewChannels, previewMessages } from "~/lib/preview";

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(60_000, "This message is too long for GitHub.");

export function useChat(
  token: Ref<string>,
  login: Ref<string>,
  preview: Ref<boolean>,
  repository: Ref<string>,
  sources?: Ref<string[]>,
  mailbox?: Ref<MailboxConfig | null>,
  requestedChannel?: Ref<string>,
  publicSource?: Ref<{ owner: string; repo: string } | null>,
) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const liveConnected = ref(false);
  const visibility = useDocumentVisibility();
  let pendingInitialChannel = requestedChannel?.value || "";
  const selectedChannel = ref(pendingInitialChannel);
  const selectedThread = ref("");
  const search = ref("");
  const localMessages = useLocalStorage<Message[]>(
    "gitrew:preview-messages:v2",
    previewMessages(),
  );
  const drafts = useLocalStorage<Record<string, string>>(
    "gitrew:drafts:v2",
    {},
  );
  const authenticated = computed(() =>
    Boolean(token.value && login.value && !preview.value),
  );
  const publicMode = computed(() => Boolean(publicSource?.value));
  const publicTransport = computed(() =>
    publicSource?.value
      ? new PublicTransport(publicSource.value.owner, publicSource.value.repo)
      : null,
  );
  const scope = computed(() =>
    preview.value ? "preview" : `${login.value}:${repository.value}`,
  );
  const roomKey = computed(() => [
    "channels",
    login.value,
    repository.value,
    ...(sources?.value || []),
  ]);
  const messageKey = computed(() => [
    "messages",
    login.value,
    repository.value,
    selectedChannel.value,
  ]);

  const channelsQuery = useQuery({
    queryKey: roomKey,
    enabled: authenticated,
    queryFn: ({ signal }) =>
      Promise.all(
        (sources?.value || [repository.value]).map(async (source) =>
          (
            await new GitHubTransport(source, token.value).listChannels(signal)
          ).map((channel) => ({
            ...channel,
            repository: source,
            kind: "public" as const,
          })),
        ),
      ).then((groups) => groups.flat()),
    refetchInterval: (query) => {
      if (
        !online.value ||
        visibility.value !== "visible" ||
        (query.state.error instanceof GitHubError &&
          query.state.error.status === 401)
      )
        return false;
      return Math.max(
        liveConnected.value ? 300_000 : 60_000,
        query.state.error instanceof GitHubError
          ? query.state.error.retryAfterMs
          : 0,
      );
    },
  });
  const vaultChannelsQuery = useQuery({
    refetchOnWindowFocus: false,
    queryKey: computed(() => [
      "vault-channels",
      login.value,
      mailbox?.value?.repository,
    ]),
    enabled: computed(
      () => authenticated.value && Boolean(mailbox?.value?.vault),
    ),
    queryFn: ({ signal }) =>
      new VaultTransport(mailbox!.value!, token.value).listChannels(signal),
    retry: false,
    refetchInterval: () =>
      online.value && visibility.value === "visible"
        ? liveConnected.value
          ? 300_000
          : 120_000
        : false,
  });
  const publicChannelsQuery = useQuery({
    queryKey: computed(() => [
      "public-channels",
      publicSource?.value?.owner || "",
      publicSource?.value?.repo || "",
    ]),
    enabled: publicMode,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const channels = await publicTransport.value!.listChannels();
      publicHasMoreChannels.value = publicTransport.value!.hasMoreChannels();
      return channels;
    },
    retry: (attempt, error) =>
      attempt < 2 &&
      (!(error instanceof PublicError) || error.status !== 429),
  });
  // Guest pages are read-only snapshots: auto refetch would evaporate any
  // history the visitor already pulled, so refresh stays an explicit action.
  const publicHasMoreChannels = ref(false);
  const olderMessageHistory = ref<Record<string, boolean>>({});
  const hasOlderMessages = computed(
    () =>
      Boolean(selectedChannel.value) &&
      (olderMessageHistory.value[selectedChannel.value] ??
        publicTransport.value?.hasOlderMessages(selectedChannel.value) ??
        false),
  );
  const publicMessagesQuery = useQuery({
    retry: (attempt, error) =>
      attempt < 2 &&
      (!(error instanceof PublicError) || error.status !== 429),
    refetchOnWindowFocus: false,
    queryKey: computed(() => [
      "public-messages",
      publicSource?.value?.owner || "",
      publicSource?.value?.repo || "",
      selectedChannel.value,
    ]),
    enabled: computed(
      () =>
        publicMode.value &&
        Boolean(selectedChannel.value) &&
        (publicChannelsQuery.isPending.value ||
          channels.value.some(
            (channel) => channel.id === selectedChannel.value,
          )),
    ),
    queryFn: async ({ signal }) => {
      const messages = await publicTransport.value!.listMessages(
        selectedChannel.value,
      );
      olderMessageHistory.value = {
        ...olderMessageHistory.value,
        [selectedChannel.value]: publicTransport.value!.hasOlderMessages(
          selectedChannel.value,
        ),
      };
      return messages;
    },
  });
  const publicLoadMoreChannels = useMutation({
    mutationFn: () => publicTransport.value!.listMoreChannels(),
    onSuccess: (page) => {
      publicHasMoreChannels.value = page.hasMore;
      queryClient.setQueryData<Channel[]>(
        [
          "public-channels",
          publicSource?.value?.owner || "",
          publicSource?.value?.repo || "",
        ],
        (previous) => [...(previous || []), ...page.channels],
      );
    },
  });
  const publicLoadOlderMessages = useMutation({
    mutationFn: (channelId: string) =>
      publicTransport.value!.listOlderMessages(channelId),
    onSuccess: (page, channelId) => {
      olderMessageHistory.value = {
        ...olderMessageHistory.value,
        [channelId]: page.hasMore,
      };
      if (channelId !== selectedChannel.value) return;
      queryClient.setQueryData<Message[]>(
        [
          "public-messages",
          publicSource?.value?.owner || "",
          publicSource?.value?.repo || "",
          channelId,
        ],
        (previous) => [...page.messages, ...(previous || [])],
      );
    },
  });
  const channels = computed(() =>
    preview.value
      ? previewChannels
      : publicMode.value
        ? publicChannelsQuery.data.value || []
        : !authenticated.value
          ? []
          : [
              ...(channelsQuery.data.value || []),
              ...(vaultChannelsQuery.data.value || []),
            ],
  );
  const messagesQuery = useQuery({
    retry: (attempt, error) =>
      !["private", "dm"].includes(
        channels.value.find((c) => c.id === selectedChannel.value)?.kind || "",
      ) &&
      attempt < 2 &&
      !(error instanceof GitHubError),
    refetchOnWindowFocus: () =>
      !["private", "dm"].includes(
        channels.value.find((c) => c.id === selectedChannel.value)?.kind || "",
      ),
    queryKey: messageKey,
    enabled: computed(
      () =>
        authenticated.value &&
        channels.value.some((channel) => channel.id === selectedChannel.value),
    ),
    queryFn: ({ signal }) =>
      (["private", "dm"].includes(
        channels.value.find((c) => c.id === selectedChannel.value)?.kind || "",
      ) && mailbox?.value
        ? new VaultTransport(mailbox.value, token.value)
        : new GitHubTransport(
            channels.value.find((c) => c.id === selectedChannel.value)
              ?.repository || repository.value,
            token.value,
          )
      ).listMessages(selectedChannel.value, signal),
    refetchInterval: (query) => {
      if (
        !online.value ||
        visibility.value !== "visible" ||
        (query.state.error instanceof GitHubError &&
          query.state.error.status === 401)
      )
        return false;
      return Math.max(
        liveConnected.value
          ? 300_000
          : ["private", "dm"].includes(
                channels.value.find((c) => c.id === selectedChannel.value)
                  ?.kind || "",
              )
            ? 120_000
            : 20_000,
        query.state.error instanceof GitHubError
          ? query.state.error.retryAfterMs
          : 0,
      );
    },
  });
  const messages = computed(() => {
    const data = preview.value
      ? localMessages.value.filter(
          (message) => message.channelId === selectedChannel.value,
        )
      : publicMode.value
        ? publicMessagesQuery.data.value || []
        : authenticated.value
          ? messagesQuery.data.value || []
          : [];
    return [...data].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  });
  const channel = computed(() =>
    channels.value.find((value) => value.id === selectedChannel.value),
  );
  const roots = computed(() =>
    messages.value.filter(
      (message) =>
        !message.parentId &&
        (!search.value ||
          `${message.author} ${message.body}`
            .toLowerCase()
            .includes(search.value.toLowerCase()) ||
          messages.value.some(
            (reply) =>
              reply.parentId === message.id &&
              `${reply.author} ${reply.body}`
                .toLowerCase()
                .includes(search.value.toLowerCase()),
          )),
    ),
  );
  const parent = computed(() =>
    messages.value.find(
      (message) => message.id === selectedThread.value && !message.parentId,
    ),
  );
  const replies = computed(() =>
    messages.value.filter(
      (message) => message.parentId === selectedThread.value,
    ),
  );
  const replyCount = (id: string) =>
    messages.value.filter((message) => message.parentId === id).length;
  const draftKey = (parentId = "") =>
    `${scope.value}:${selectedChannel.value}:${parentId}`;
  const roomDraft = computed({
    get: () => drafts.value[draftKey()] || "",
    set: (value) => {
      drafts.value = { ...drafts.value, [draftKey()]: value };
    },
  });
  const threadDraft = computed({
    get: () => drafts.value[draftKey(selectedThread.value)] || "",
    set: (value) => {
      drafts.value = {
        ...drafts.value,
        [draftKey(selectedThread.value)]: value,
      };
    },
  });
  const canWrite = computed(
    () =>
      !publicMode.value &&
      (preview.value ||
        (authenticated.value && Boolean(channel.value) && online.value)),
  );

  if (requestedChannel)
    watch(requestedChannel, (id) => {
      pendingInitialChannel = id;
      selectedChannel.value = id;
    });
  watch(scope, () => {
    pendingInitialChannel = requestedChannel?.value || pendingInitialChannel;
    selectedChannel.value = pendingInitialChannel;
    selectedThread.value = "";
    search.value = "";
  });
  watch(
    [
      channels,
      selectedChannel,
      authenticated,
      channelsQuery.isPending,
      channelsQuery.isError,
      vaultChannelsQuery.isPending,
      vaultChannelsQuery.isError,
    ],
    ([value]) => {
      if (value.some((item) => item.id === selectedChannel.value)) {
        pendingInitialChannel = "";
        return;
      }
      // A linked private channel is absent until both identity and the vault list arrive.
      if (
        pendingInitialChannel &&
        !preview.value &&
        (!authenticated.value ||
          channelsQuery.isPending.value ||
          channelsQuery.isError.value ||
          (mailbox?.value?.vault &&
            (vaultChannelsQuery.isPending.value ||
              vaultChannelsQuery.isError.value)))
      )
        return;
      pendingInitialChannel = "";
      selectedChannel.value = value[0]?.id || "";
    },
    { immediate: true },
  );
  watch(selectedChannel, (id) => {
    if (pendingInitialChannel && id !== pendingInitialChannel)
      pendingInitialChannel = "";
    selectedThread.value = "";
    search.value = "";
  });
  watch(messages, () => {
    if (
      selectedThread.value &&
      !messages.value.some((message) => message.id === selectedThread.value)
    )
      selectedThread.value = "";
  });

  const sendMutation = useMutation({
    mutationFn: async (input: {
      body: string;
      parentId: string;
      channelId: string;
      key: string;
      queryKey: string[];
      local: boolean;
      sessionToken: string;
      transport: ChatTransport | null;
    }) => {
      const body = messageBodySchema.parse(input.body);
      if (!input.local) {
        if (!online.value || !input.transport)
          throw new Error(
            "You’re offline. Your draft is saved; send it when you reconnect.",
          );
        return input.transport.sendMessage(
          input.channelId,
          body,
          input.parentId,
        );
      }
      const time = new Date().toISOString();
      const message: Message = {
        id: crypto.randomUUID(),
        channelId: input.channelId,
        parentId: input.parentId,
        body,
        author: "You",
        createdAt: time,
        updatedAt: time,
        status: "local",
        url: "",
      };
      localMessages.value = [...localMessages.value, message];
      return message;
    },
    onSuccess: (message, input) => {
      if (!input.local && input.sessionToken !== token.value) return;
      if (drafts.value[input.key] === input.body)
        drafts.value = { ...drafts.value, [input.key]: "" };
      if (!input.local) {
        queryClient.setQueryData<Message[]>(input.queryKey, (previous) => [
          ...(previous || []).filter((item) => item.id !== message.id),
          message,
        ]);
        void queryClient.invalidateQueries({ queryKey: input.queryKey });
      }
    },
  });
  async function send(parentId = "") {
    if (!canWrite.value || sendMutation.isPending.value) return;
    const body = drafts.value[draftKey(parentId)] || "";
    if (!messageBodySchema.safeParse(body).success) return;
    try {
      await sendMutation.mutateAsync({
        body,
        parentId,
        channelId: selectedChannel.value,
        key: draftKey(parentId),
        queryKey: [...messageKey.value],
        local: preview.value,
        sessionToken: token.value,
        transport: authenticated.value
          ? ["private", "dm"].includes(channel.value?.kind || "") &&
            mailbox?.value
            ? new VaultTransport(mailbox.value, token.value)
            : new GitHubTransport(
                channel.value?.repository || repository.value,
                token.value,
              )
          : null,
      });
    } catch {
      /* Mutation state renders the failure; the draft stays intact. */
    }
  }
  function refresh() {
    if (!online.value) return;
    if (publicMode.value) {
      void publicChannelsQuery.refetch();
      if (channel.value) void publicMessagesQuery.refetch();
      return;
    }
    if (!authenticated.value) return;
    void channelsQuery.refetch();
    if (mailbox?.value?.vault) void vaultChannelsQuery.refetch();
    if (channel.value) void messagesQuery.refetch();
  }
  return {
    online,
    liveConnected,
    channels,
    channel,
    selectedChannel,
    selectedThread,
    search,
    roots,
    messages,
    parent,
    replies,
    replyCount,
    roomDraft,
    threadDraft,
    canWrite,
    send,
    refresh,
    channelsQuery,
    vaultChannelsQuery,
    messagesQuery,
    publicChannelsQuery,
    publicHasMoreChannels,
    publicLoadMoreChannels,
    hasOlderMessages,
    publicLoadOlderMessages,
    publicMessagesQuery,
    sendMutation,
  };
}
