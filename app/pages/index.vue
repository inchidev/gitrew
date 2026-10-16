<script setup lang="ts">
const portal = useRuntimeConfig().public.siteMode === "portal";
</script>
<template>
  <ProductLanding v-if="portal" />
  <WorkspaceEntry v-else />
</template>
