<script setup lang="ts">
const runtime = useRuntimeConfig();
</script>
<template>
  <PublicCreate v-if="runtime.public.siteMode === 'portal'" />
  <BackendSetup v-else-if="runtime.public.backendEnabled" />
  <CreateWorkspace v-else />
</template>
