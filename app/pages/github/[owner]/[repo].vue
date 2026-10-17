<script setup lang="ts">
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

const searchOwner = ref("");
const searchRepo = ref("");
const searchError = ref("");

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

function open() {
  const cleanOwner = searchOwner.value.trim();
  const cleanRepo = searchRepo.value.trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(cleanOwner)) {
    searchError.value = "Enter a GitHub user or organization name.";
    return;
  }
  if (cleanRepo && !/^[\w.-]{1,100}$/.test(cleanRepo)) {
    searchError.value = "Enter a valid repository name.";
    return;
  }
  searchError.value = "";
  void navigateTo(
    cleanRepo ? `/github/${cleanOwner}/${cleanRepo}` : `/github/${cleanOwner}`,
  );
}

onMounted(() => void load());
</script>
<template>
  <div class="public-page public-workspace-page">
    <header class="public-header">
      <nav aria-label="Breadcrumb">
        <NuxtLink to="/github/">Public</NuxtLink>
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
        :href="meta.url"
        target="_blank"
        rel="noopener noreferrer"
        class="github-link"
        aria-label="Open on GitHub"
      >
        <UIcon name="i-octicon-mark-github-16" />
      </a>
      <form class="org-search" @submit.prevent="open">
        <UInput
          v-model="searchOwner"
          placeholder="user or org"
          aria-label="GitHub user or organization"
          autocomplete="off"
          spellcheck="false"
          size="xs"
        />
        <UInput
          v-model="searchRepo"
          placeholder="repo"
          aria-label="Repository"
          autocomplete="off"
          spellcheck="false"
          size="xs"
        />
        <UButton type="submit" label="Open" size="xs" variant="outline" />
      </form>
    </header>
    <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
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
