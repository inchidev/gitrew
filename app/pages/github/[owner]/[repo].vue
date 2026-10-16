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
