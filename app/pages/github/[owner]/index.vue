<script setup lang="ts">
import {
  publicOwner,
  PublicError,
  type PublicRepository,
} from "~/lib/public";

const route = useRoute();
const owner = computed(() => String(route.params.owner || ""));
definePageMeta({
  validate: (route) => /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(String(route.params.owner || "")),
});
useHead(() => ({ title: `${owner.value} on GitHub · Gitrew` }));

const repositories = ref<PublicRepository[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const pending = ref(true);
const loadingMore = ref(false);
const error = ref("");

async function load(after: string | null) {
  if (after) loadingMore.value = true;
  else {
    pending.value = true;
    repositories.value = [];
  }
  error.value = "";
  try {
    const page = await publicOwner(owner.value, after);
    repositories.value.push(...page.repositories);
    cursor.value = page.pageInfo.endCursor;
    hasMore.value = page.pageInfo.hasNextPage;
  } catch (failure) {
    error.value =
      failure instanceof PublicError
        ? failure.message
        : "Gitrew could not load this page.";
  } finally {
    pending.value = false;
    loadingMore.value = false;
  }
}

onMounted(() => void load(null));
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
        <span>{{ owner }}</span>
      </nav>
    </header>
    <main>
      <h1>{{ owner }}</h1>
      <PublicBanner />
      <div v-if="pending" class="stack">
        <USkeleton v-for="index in [1, 2, 3]" :key="index" class="h-16" />
      </div>
      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        :title="error"
      >
        <template #actions>
          <UButton label="Retry" size="xs" variant="soft" @click="load(null)" />
        </template>
      </UAlert>
      <template v-else>
        <ul v-if="repositories.length" class="repo-list">
          <li v-for="repository in repositories" :key="repository.name">
            <NuxtLink
              :to="`/github/${owner}/${repository.name}`"
              class="repo-card"
            >
              <span class="repo-name">{{ repository.name }}</span>
              <UBadge
                :label="repository.hasDiscussionsEnabled ? 'Discussions' : 'No discussions'"
                :color="repository.hasDiscussionsEnabled ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
              />
              <span v-if="repository.description" class="repo-description">{{
                repository.description
              }}</span>
              <span class="repo-stars">★ {{ repository.stargazerCount }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="muted">No public repositories found.</p>
        <UButton
          v-if="hasMore"
          :loading="loadingMore"
          label="Load more repositories"
          color="neutral"
          variant="outline"
          @click="load(cursor)"
        />
      </template>
    </main>
  </div>
</template>
