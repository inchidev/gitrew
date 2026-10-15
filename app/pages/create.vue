<script setup lang="ts">
const runtime = useRuntimeConfig();
</script>
<template><BackendSetup v-if="runtime.public.backendEnabled" /><CreateWorkspace v-else /></template>
