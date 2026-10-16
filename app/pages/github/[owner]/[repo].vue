<script setup lang="ts">
import {
  publicComments,
  publicDiscussions,
  publicRepoMeta,
  PublicError,
  type PublicComment,
  type PublicDiscussion,
  type PublicRepoMeta,
  type PublicThreadComment,
} from "~/lib/public";

const route = useRoute();
const owner = computed(() => String(route.params.owner || ""));
const repo = computed(() => String(route.params.repo || ""));
definePageMeta({
  validate: (route) =>
    /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(String(route.params.owner || "")) &&
    /^[\w.-]{1,100}$/.test(String(route.params.repo || "")),
});
useHead(() => ({ title: `${owner.value}/${repo.value} · Gitrew` }));

const meta = ref<PublicRepoMeta | null>(null);
const discussions = ref<PublicDiscussion[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const pending = ref(true);
const loadingMore = ref(false);
const error = ref("");

const openId = ref<string | null>(null);
const comments = ref<PublicThreadComment[]>([]);
const commentsCursor = ref<string | null>(null);
const commentsMore = ref(false);
const commentsPending = ref(false);
const commentsLoadingMore = ref(false);
const commentsError = ref("");

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

async function load() {
  pending.value = true;
  error.value = "";
  try {
    meta.value = await publicRepoMeta(owner.value, repo.value);
    if (!meta.value.hasDiscussionsEnabled) return;
    const page = await publicDiscussions(owner.value, repo.value, null);
    discussions.value = page.discussions;
    cursor.value = page.pageInfo.endCursor;
    hasMore.value = page.pageInfo.hasNextPage;
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
    const page = await publicDiscussions(owner.value, repo.value, cursor.value);
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

async function openDiscussion(discussion: PublicDiscussion) {
  if (openId.value === discussion.id) {
    openId.value = null;
    return;
  }
  openId.value = discussion.id;
  comments.value = [];
  commentsCursor.value = null;
  commentsMore.value = false;
  commentsError.value = "";
  commentsPending.value = true;
  try {
    const page = await publicComments(discussion.id, null);
    comments.value = page.comments;
    commentsCursor.value = page.pageInfo.endCursor;
    commentsMore.value = page.pageInfo.hasNextPage;
  } catch (failure) {
    commentsError.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load this conversation.";
  } finally {
    commentsPending.value = false;
  }
}

async function loadMoreComments() {
  if (!openId.value) return;
  commentsLoadingMore.value = true;
  try {
    const page = await publicComments(openId.value, commentsCursor.value);
    comments.value.push(...page.comments);
    commentsCursor.value = page.pageInfo.endCursor;
    commentsMore.value = page.pageInfo.hasNextPage;
  } catch (failure) {
    commentsError.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load more messages.";
  } finally {
    commentsLoadingMore.value = false;
  }
}

function authorOf(comment: PublicComment): string {
  return comment.author?.login || "Deleted account";
}

onMounted(() => void load());
</script>
<template>
  <div class="public-page">
    <header class="public-header">
      <NuxtLink to="/" class="brand" aria-label="Gitrew home"
        ><BrandMark /><span>Gitrew</span></NuxtLink
      >
      <nav aria-label="Breadcrumb">
        <NuxtLink to="/github/">Public</NuxtLink>
        <span aria-hidden="true"> / </span>
        <NuxtLink :to="`/github/${owner}`">{{ owner }}</NuxtLink>
        <span aria-hidden="true"> / </span>
        <span>{{ repo }}</span>
      </nav>
    </header>
    <main>
      <h1>{{ owner }}/{{ repo }}</h1>
      <PublicBanner />
      <div v-if="pending" class="stack">
        <USkeleton v-for="index in [1, 2, 3]" :key="index" class="h-16" />
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" :title="error">
        <template #actions>
          <UButton label="Retry" size="xs" variant="soft" @click="load()" />
        </template>
      </UAlert>
      <template v-else-if="meta">
        <p class="lede">
          <span v-if="meta.description">{{ meta.description }} · </span>★
          {{ meta.stargazerCount }}
          ·
          <a :href="meta.url" target="_blank" rel="noopener noreferrer"
            >Open on GitHub</a
          >
        </p>
        <UAlert
          v-if="!meta.hasDiscussionsEnabled"
          color="warning"
          variant="subtle"
          title="Discussions are off in this repository"
          description="Maintainers can enable them on GitHub. Other public content stays available there."
        />
        <template v-else>
          <ul v-if="discussions.length" class="discussion-list">
            <li v-for="discussion in discussions" :key="discussion.id">
              <button
                class="discussion-card"
                :aria-expanded="openId === discussion.id"
                @click="openDiscussion(discussion)"
              >
                <span class="discussion-title">{{
                  discussion.title.replace(/^#/, "")
                }}</span>
                <span class="muted"
                  >{{ discussion.comments.totalCount }} messages ·
                  {{ formatDate(discussion.createdAt) }}</span
                >
              </button>
              <div v-if="openId === discussion.id" class="thread">
                <div v-if="commentsPending" class="stack">
                  <USkeleton v-for="index in [1, 2]" :key="index" class="h-12" />
                </div>
                <UAlert
                  v-else-if="commentsError"
                  color="error"
                  variant="subtle"
                  :title="commentsError"
                />
                <template v-else>
                  <article
                    v-for="comment in comments"
                    :key="comment.id"
                    class="public-message"
                  >
                    <header>
                      <strong>{{ authorOf(comment) }}</strong>
                      <span class="muted">{{ formatDate(comment.createdAt) }}</span>
                    </header>
                    <p>{{ comment.body }}</p>
                    <div
                      v-for="reply in comment.replies.nodes"
                      :key="reply.id"
                      class="public-message public-reply"
                    >
                      <header>
                        <strong>{{ authorOf(reply) }}</strong>
                        <span class="muted">{{ formatDate(reply.createdAt) }}</span>
                      </header>
                      <p>{{ reply.body }}</p>
                    </div>
                    <p v-if="comment.replies.pageInfo.hasNextPage" class="muted">
                      More replies on
                      <a
                        :href="comment.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        >GitHub</a
                      >.
                    </p>
                  </article>
                  <UButton
                    v-if="commentsMore"
                    :loading="commentsLoadingMore"
                    label="Load more messages"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="loadMoreComments()"
                  />
                </template>
              </div>
            </li>
          </ul>
          <p v-else class="muted">No discussions yet.</p>
          <UButton
            v-if="hasMore"
            :loading="loadingMore"
            label="Load more discussions"
            color="neutral"
            variant="outline"
            @click="loadMore()"
          />
        </template>
      </template>
    </main>
  </div>
</template>
