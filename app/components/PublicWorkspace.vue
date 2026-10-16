<script setup lang="ts">
import {
  publicComments,
  publicDiscussions,
  PublicError,
  type PublicComment,
  type PublicDiscussion,
} from "~/lib/public";
import type { PublicThreadComment } from "~/lib/public";
import type { Message } from "../../shared/chat";

const props = defineProps<{ owner: string; repo: string }>();

const discussions = ref<PublicDiscussion[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const pending = ref(true);
const loadingMore = ref(false);
const error = ref("");

const selectedId = ref("");
const commentsBy = ref(new Map<string, PublicThreadComment[]>());
const cursors = ref(new Map<string, string | null>());
const mores = ref(new Map<string, boolean>());
const commentsPending = ref(false);
const commentsError = ref("");
const threadId = ref("");
const search = ref("");

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function toMessage(
  comment: PublicComment,
  channelId: string,
  parentId: string,
): Message {
  return {
    id: comment.id,
    channelId,
    parentId,
    author: comment.author?.login || "Deleted account",
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    status: "saved",
    url: comment.url,
  };
}

const selected = computed(
  () => discussions.value.find((item) => item.id === selectedId.value) || null,
);
const comments = computed(() => commentsBy.value.get(selectedId.value) || []);
const messages = computed(() => {
  const query = search.value.trim().toLowerCase();
  return comments.value
    .map((comment) => toMessage(comment, selectedId.value, ""))
    .filter(
      (message) =>
        !query ||
        `${message.author} ${message.body}`.toLowerCase().includes(query),
    );
});
const thread = computed(
  () => comments.value.find((comment) => comment.id === threadId.value) || null,
);
const threadReplies = computed(
  () =>
    thread.value?.replies.nodes.map((reply) =>
      toMessage(reply, selectedId.value, thread.value!.id),
    ) || [],
);

async function loadComments(discussion: PublicDiscussion) {
  if (commentsBy.value.has(discussion.id)) return;
  commentsPending.value = true;
  commentsError.value = "";
  try {
    const page = await publicComments(discussion.id, null);
    commentsBy.value.set(discussion.id, page.comments);
    cursors.value.set(discussion.id, page.pageInfo.endCursor);
    mores.value.set(discussion.id, page.pageInfo.hasNextPage);
  } catch (failure) {
    commentsError.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load these messages.";
  } finally {
    commentsPending.value = false;
  }
}

async function select(discussion: PublicDiscussion) {
  selectedId.value = discussion.id;
  threadId.value = "";
  search.value = "";
  await loadComments(discussion);
}

async function loadMoreComments() {
  const discussion = selected.value;
  if (!discussion || !mores.value.get(discussion.id)) return;
  commentsPending.value = true;
  try {
    const page = await publicComments(
      discussion.id,
      cursors.value.get(discussion.id) || null,
    );
    commentsBy.value.set(discussion.id, [
      ...(commentsBy.value.get(discussion.id) || []),
      ...page.comments,
    ]);
    cursors.value.set(discussion.id, page.pageInfo.endCursor);
    mores.value.set(discussion.id, page.pageInfo.hasNextPage);
  } catch (failure) {
    commentsError.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load more messages.";
  } finally {
    commentsPending.value = false;
  }
}

async function load() {
  pending.value = true;
  error.value = "";
  try {
    const page = await publicDiscussions(props.owner, props.repo, null);
    discussions.value = page.discussions;
    cursor.value = page.pageInfo.endCursor;
    hasMore.value = page.pageInfo.hasNextPage;
    if (page.discussions.length) await select(page.discussions[0]!);
  } catch (failure) {
    error.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load this page.";
  } finally {
    pending.value = false;
  }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    const page = await publicDiscussions(props.owner, props.repo, cursor.value);
    discussions.value.push(...page.discussions);
    cursor.value = page.pageInfo.endCursor;
    hasMore.value = page.pageInfo.hasNextPage;
  } catch (failure) {
    error.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load more discussions.";
  } finally {
    loadingMore.value = false;
  }
}

onMounted(() => void load());
</script>
<template>
  <div v-if="pending" class="stack">
    <USkeleton v-for="index in [1, 2, 3]" :key="index" class="h-16" />
  </div>
  <UAlert v-else-if="error" color="error" variant="subtle" :title="error">
    <template #actions>
      <UButton label="Retry" size="xs" variant="soft" @click="load()" />
    </template>
  </UAlert>
  <div v-else class="guest-workspace">
    <aside class="channel-sidebar" aria-label="Discussions">
      <div class="channel-heading">
        <span>Discussions</span
        ><span class="channel-count">{{ discussions.length }}</span>
      </div>
      <nav class="channels">
        <button
          v-for="discussion in discussions"
          :key="discussion.id"
          class="channel-item"
          :class="{ active: discussion.id === selectedId }"
          :aria-current="discussion.id === selectedId ? 'page' : undefined"
          @click="select(discussion)"
        >
          <span class="channel-name">{{
            discussion.title.replace(/^#/, "")
          }}</span>
          <span class="muted"
            >{{ discussion.comments.totalCount }} messages ·
            {{ formatDate(discussion.createdAt) }}</span
          >
        </button>
      </nav>
      <UButton
        v-if="hasMore"
        :loading="loadingMore"
        label="Load more discussions"
        color="neutral"
        variant="outline"
        size="sm"
        @click="loadMore()"
      />
    </aside>
    <section v-if="selected" class="message-feed" aria-label="Messages">
      <article class="opening-post">
        <h2>{{ selected.title.replace(/^#/, "") }}</h2>
        <p>{{ selected.body }}</p>
        <p class="muted">
          {{ formatDate(selected.createdAt) }} ·
          <a :href="selected.url" target="_blank" rel="noopener noreferrer"
            >Reply on GitHub</a
          >
        </p>
      </article>
      <UInput
        v-model="search"
        placeholder="Search messages…"
        aria-label="Search messages"
        size="sm"
      />
      <div v-if="commentsPending && !comments.length" class="stack">
        <USkeleton v-for="index in [1, 2]" :key="index" class="h-12" />
      </div>
      <UAlert
        v-else-if="commentsError"
        color="error"
        variant="subtle"
        :title="commentsError"
      />
      <template v-else>
        <MessageItem
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :replies="
            (commentsBy.get(selectedId) || []).find((c) => c.id === message.id)
              ?.replies.nodes.length || 0
          "
          @thread="threadId = $event"
        />
        <p v-if="!messages.length" class="muted">No messages yet.</p>
        <UButton
          v-if="mores.get(selectedId)"
          :loading="commentsPending"
          label="Load more messages"
          color="neutral"
          variant="outline"
          size="sm"
          @click="loadMoreComments()"
        />
      </template>
      <UAlert
        color="neutral"
        variant="subtle"
        title="You’re reading as a guest"
        description="Sign in with GitHub on gitrew.com to join a workspace, or reply directly on GitHub."
      >
        <template #actions>
          <UButton
            label="Reply on GitHub"
            size="xs"
            variant="soft"
            :to="selected.url"
            target="_blank"
          />
        </template>
      </UAlert>
    </section>
    <aside v-if="thread" class="thread-panel" aria-label="Thread">
      <header class="thread-header">
        <strong>Thread</strong>
        <UButton
          icon="i-octicon-x-16"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Close thread"
          @click="threadId = ''"
        />
      </header>
      <div class="thread-feed">
        <MessageItem :message="toMessage(thread, selectedId, '')" in-thread />
        <MessageItem
          v-for="reply in threadReplies"
          :key="reply.id"
          :message="reply"
          in-thread
        />
        <p v-if="thread.replies.pageInfo.hasNextPage" class="muted">
          More replies on
          <a :href="thread.url" target="_blank" rel="noopener noreferrer"
            >GitHub</a
          >.
        </p>
      </div>
    </aside>
  </div>
</template>
