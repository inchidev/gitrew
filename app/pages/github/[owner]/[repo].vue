<script setup lang="ts">
import { safeUrl } from "~/lib/links";
import { publicRepoMeta, PublicError, type PublicRepoMeta } from "~/lib/public";

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
const pending = ref(true);
const error = ref("");

// The header keeps the workspace chrome: find any public GitHub repo from
// here. Accepts "owner/repo" or a full GitHub URL; a bare owner browses
// that account's public discussions.
const searchOpen = ref(false);
const searchQuery = ref("");
const searchError = ref("");
const searchInput = useTemplateRef<HTMLElement>("searchInput");

async function load() {
  pending.value = true;
  error.value = "";
  try {
    meta.value = await publicRepoMeta(owner.value, repo.value);
  } catch (failure) {
    error.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load this page.";
  } finally {
    pending.value = false;
  }
}

function parseTarget(raw: string): string {
  const path = raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = path.split(/[/?#\s]/).filter(Boolean);
  const [head, tail] = parts;
  if (!head || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(head)) {
    searchError.value = "Enter a GitHub owner — a user or organization.";
    return "";
  }
  if (tail && !/^[\w.-]{1,100}$/.test(tail)) {
    searchError.value = "Enter a valid repository name.";
    return "";
  }
  searchError.value = "";
  return tail ? `/github/${head}/${tail}` : `/github/${head}`;
}

function switchWorkspace() {
  const target = parseTarget(searchQuery.value);
  if (!target || searchError.value) return;
  searchOpen.value = false;
  void navigateTo(target);
}
function openSearch() {
  searchQuery.value = "";
  searchError.value = "";
  searchOpen.value = true;
  void nextTick(() => searchInput.value?.querySelector("input")?.focus());
}
onMounted(() => void load());
</script>
<template>
  <div class="public-page public-workspace-page">
    <header class="public-header">
      <NuxtLink to="/" class="brand public-brand" aria-label="Gitrew home">
        <BrandMark /><span>Gitrew</span>
      </NuxtLink>
      <nav aria-label="Breadcrumb">
        <NuxtLink to="/github/">GitHub</NuxtLink>
        <span aria-hidden="true"> / </span>
        <NuxtLink :to="`/github/${owner}`">{{ owner }}</NuxtLink>
        <span aria-hidden="true"> / </span>
        <span>{{ repo }}</span>
      </nav>
      <span v-if="meta" class="repo-stars" title="Stargazers"
        >★ {{ meta.stargazerCount }}</span
      >
      <a
        v-if="meta"
        :href="safeUrl(meta.url)"
        target="_blank"
        rel="noopener noreferrer"
        class="github-link"
        aria-label="Open on GitHub"
      >
        <UIcon name="i-octicon-mark-github-16" />
      </a>
      <UButton
        class="workspace-finder-open"
        label="Find a workspace"
        icon="i-octicon-search-16"
        size="xs"
        color="neutral"
        variant="outline"
        @click="openSearch"
      />
    </header>
    <div
      v-if="searchOpen"
      class="switcher-overlay"
      @click.self="searchOpen = false"
      @keydown.esc="searchOpen = false"
    >
      <form
        ref="searchInput"
        class="switcher repo-finder"
        @submit.prevent="switchWorkspace"
      >
        <UInput
          v-model="searchQuery"
          size="lg"
          icon="i-octicon-search-16"
          placeholder="nuxt/nuxt or https://github.com/nuxt/nuxt"
          aria-label="GitHub repository to open"
        />
        <p v-if="searchError" class="repo-finder-error" role="alert">
          {{ searchError }}
        </p>
        <div class="composer-bottom">
          <span class="draft-status"
            >Any public repository that has Discussions on GitHub.</span
          >
          <UButton type="submit" label="Open" size="sm" />
        </div>
      </form>
    </div>
    <main>
      <div v-if="pending" class="stack">
        <USkeleton v-for="index in [1, 2, 3]" :key="index" class="h-16" />
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" :title="error">
        <template #actions>
          <UButton label="Retry" size="xs" variant="soft" @click="load()" />
        </template>
      </UAlert>
      <template v-else-if="meta">
        <UAlert
          v-if="!meta.hasDiscussionsEnabled"
          color="warning"
          variant="subtle"
          title="Discussions are off in this repository"
          description="If this repository recently enabled Discussions, try again in a few minutes — repository details are cached briefly."
        >
          <template #actions>
            <UButton label="Retry" size="xs" variant="soft" @click="load()" />
          </template>
        </UAlert>
        <Gitrew
          v-else
          :public-source="{ owner, repo }"
          :key="`${owner}/${repo}`"
        />
      </template>
    </main>
  </div>
</template>
