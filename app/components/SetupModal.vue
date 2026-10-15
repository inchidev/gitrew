<script setup lang="ts">
import type { MailboxConfig } from "../../shared/mailbox";
defineProps<{
  token: string;
  login: string;
  userId: number;
  installer: boolean;
  creatorUrl?: string;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ authorize: []; ready: [config: MailboxConfig] }>();
</script>
<template>
  <UModal
    v-model:open="open"
    title="Create your Gitrew"
    description="Your organization owns its repositories and App."
  >
    <template #body
      ><SetupWizard
        :token="token"
        :login="login"
        :user-id="userId"
        :installer="installer"
        :creator-url="creatorUrl"
        @authorize="emit('authorize')"
        @ready="
          (config) => {
            emit('ready', config);
            open = false;
          }
        "
    /></template>
  </UModal>
</template>
