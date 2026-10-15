<script setup lang="ts">
import { appReturnTo } from "../../../../shared/routes";
definePageMeta({
  key: (route) => `workspace:${route.params.organization}`,
  validate: (route) => Boolean(appReturnTo(route.path)),
});
</script>
<template><Gitrew /></template>
