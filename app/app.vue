<script setup lang="ts">
const colorMode = useColorMode();
useHead(() => ({
  htmlAttrs: {
    "data-color-mode": colorMode.value === "dark" ? "dark" : "light",
    "data-light-theme": "light",
    "data-dark-theme": "dark",
  },
}));
</script>
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
