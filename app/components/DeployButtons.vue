<script setup lang="ts">
import { cloudflareDeployUrl } from "../../shared/deploy";
</script>

<template>
  <div class="flex flex-wrap gap-3" aria-label="Deploy your own Gitrew">
    <UButton
      label="Deploy to Cloudflare"
      icon="i-octicon-cloud-16"
      :to="cloudflareDeployUrl"
      target="_blank"
      rel="noopener noreferrer"
      color="neutral"
      variant="outline"
    />
    <UButton
      label="Deploy to VPS"
      icon="i-octicon-server-16"
      to="https://github.com/inchidev/gitrew/blob/main/docs/vps.md"
      target="_blank"
      rel="noopener noreferrer"
      color="neutral"
      variant="outline"
    />
  </div>
</template>
