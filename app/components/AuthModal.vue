<script setup lang="ts">
const props = defineProps<{
  busy: boolean;
  error: string;
  requestUrl?: string;
  deviceCode?: string;
  waiting?: boolean;
  mailboxRepository?: string;
  hideCreate?: boolean;
  dismissible?: boolean;
  sandbox?: boolean;
  backend?: boolean;
  standalone?: boolean;
  displayName?: string;
}>();
const open = defineModel<boolean>("open", { required: true });
const colorMode = useColorMode();
const emit = defineEmits<{
  signIn: [];
  mailbox: [repository: string];
  cancel: [];
}>();
</script>
<template>
  <main v-if="standalone" class="auth-page">
    <UButton
      class="auth-theme"
      icon="i-octicon-sun-16"
      aria-label="Toggle color theme"
      color="neutral"
      variant="ghost"
      @click="
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      "
    />
    <AuthContent
      v-bind="props"
      @sign-in="emit('signIn')"
      @mailbox="emit('mailbox', $event)"
      @cancel="emit('cancel')"
    />
    <footer class="auth-page-footer">
      <a href="https://inchi.dev" target="_blank" rel="noopener noreferrer"
        >Made by inchi</a
      >
      <a
        href="https://github.com/inchidev/gitrew"
        target="_blank"
        rel="noopener noreferrer"
        >Source code</a
      >
    </footer>
  </main>
  <UModal
    v-else
    v-model:open="open"
    :dismissible="dismissible === true"
    :close="dismissible === true"
    title="Sign in to Gitrew"
    description="Your team’s conversations, in one place."
    :ui="{ content: 'auth-modal' }"
  >
    <template #body>
      <AuthContent
        v-bind="props"
        compact
        @sign-in="emit('signIn')"
        @mailbox="emit('mailbox', $event)"
        @cancel="emit('cancel')"
      />
    </template>
  </UModal>
</template>
