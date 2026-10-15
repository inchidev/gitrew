<script setup lang="ts">
import type { MailboxConfig } from "../../shared/mailbox";
defineProps<{
  token: string;
  login: string;
  userId: number;
  installer: boolean;
  creatorUrl?: string;
}>();
defineEmits<{ authorize: []; ready: [config: MailboxConfig] }>();
</script>
<template>
  <div class="space-y-4">
    <p>
      Deploy Gitrew in your account and open /create/ on your deployment. All
      workspace repositories are private.
    </p>
    <UAlert
      title="The Actions installer is retired"
      description="It required a public authentication mailbox. Cloudflare and Vercel deployments keep authentication on your backend."
    />
    <DeployButtons />
  </div>
</template>
