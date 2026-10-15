<script setup lang="ts">
const colorMode = useColorMode();
const route = useRoute();
const workspace = computed(() => route.path.startsWith("/w/"));
useHead(() => ({
  htmlAttrs: {
    "data-color-mode": colorMode.value === "dark" ? "dark" : "light",
    "data-light-theme": "light",
    "data-dark-theme": "dark",
    "data-app-surface": workspace.value ? "workspace" : "page",
  },
  meta: [
    {
      name: "theme-color",
      content:
        colorMode.value === "dark"
          ? workspace.value
            ? "#151b23"
            : "#0d1117"
          : workspace.value
            ? "#f6f8fa"
            : "#ffffff",
    },
  ],
}));
</script>
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
