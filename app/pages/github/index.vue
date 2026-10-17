<script setup lang="ts">
definePageMeta({
  validate: () => true,
});
useHead(() => ({ title: "Browse public communities · Gitrew" }));

const owner = ref("");
const repo = ref("");
const error = ref("");

function open() {
  const cleanOwner = owner.value.trim();
  const cleanRepo = repo.value.trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(cleanOwner)) {
    error.value = "Enter a GitHub user or organization name.";
    return;
  }
  if (cleanRepo && !/^[\w.-]{1,100}$/.test(cleanRepo)) {
    error.value = "Enter a valid repository name.";
    return;
  }
  error.value = "";
  void navigateTo(
    cleanRepo ? `/github/${cleanOwner}/${cleanRepo}` : `/github/${cleanOwner}`,
  );
}
</script>
<template>
  <div class="public-page">
    <header class="public-header">
      <nav aria-label="Breadcrumb">
        <NuxtLink to="/">Gitrew</NuxtLink>
      </nav>
    </header>
    <main>
      <h1>Browse public communities</h1>
      <p class="lede">
        Open any GitHub user or organization and read its public repositories
        and discussions. Nothing is copied or indexed; pages load as you open
        them.
      </p>
      <PublicBanner />
      <form class="browse-form" @submit.prevent="open">
        <UInput
          v-model="owner"
          placeholder="octocat"
          aria-label="GitHub user or organization"
          autocomplete="off"
          spellcheck="false"
        />
        <UInput
          v-model="repo"
          placeholder="repository (optional)"
          aria-label="Repository (optional)"
          autocomplete="off"
          spellcheck="false"
        />
        <UButton type="submit" label="Open" icon="i-octicon-arrow-right-16" trailing />
      </form>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    </main>
  </div>
</template>
