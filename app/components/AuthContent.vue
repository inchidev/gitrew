<script setup lang="ts">
const props = defineProps<{
  busy: boolean;
  error: string;
  requestUrl?: string;
  deviceCode?: string;
  mailboxRepository?: string;
  hideCreate?: boolean;
  backend?: boolean;
  compact?: boolean;
  displayName?: string;
}>();
const mailbox = ref(props.mailboxRepository || "");
const { copy, copied } = useClipboard();
const emit = defineEmits<{
  signIn: [];
  mailbox: [repository: string];
  cancel: [];
}>();
</script>
<template>
  <section class="auth-content" aria-label="Sign in">
    <template v-if="!compact">
      <NuxtLink to="/" class="auth-brand" aria-label="Gitrew home"
        ><BrandMark /><span>Gitrew</span></NuxtLink
      >
      <h1>Sign in to {{ displayName || "Gitrew" }}</h1>
      <p class="auth-intro">Your team’s conversations, in one place.</p>
    </template>
    <div class="auth-card">
      <UAlert
        v-if="error"
        role="alert"
        color="error"
        variant="subtle"
        title="Couldn’t sign in"
        :description="error"
        class="mb-4"
      />
      <div v-if="requestUrl" class="space-y-4" role="status">
        <template v-if="!deviceCode">
          <p>Confirm the sign-in request on GitHub, then return here.</p>
          <UButton
            :to="requestUrl"
            target="_blank"
            rel="noopener noreferrer"
            label="Create sign-in request"
            icon="i-octicon-mark-github-16"
            block
          />
          <p class="text-muted text-sm">Waiting for GitHub…</p>
        </template>
        <template v-else>
          <p>Enter this code on GitHub to continue.</p>
          <div class="flex items-center justify-between gap-3">
            <strong class="text-xl tracking-widest">{{ deviceCode }}</strong>
            <UButton
              :label="copied ? 'Copied' : 'Copy code'"
              color="neutral"
              variant="outline"
              @click="copy(deviceCode)"
            />
          </div>
          <UButton
            to="https://github.com/login/device"
            target="_blank"
            rel="noopener noreferrer"
            label="Authorize on GitHub"
            block
          />
          <p class="text-muted text-sm">Waiting for GitHub approval…</p>
        </template>
        <UButton
          label="Cancel sign-in"
          color="neutral"
          variant="link"
          @click="emit('cancel')"
        />
      </div>
      <template v-else>
        <UButton
          label="Continue with GitHub"
          icon="i-octicon-mark-github-16"
          class="github-signin"
          block
          size="lg"
          :loading="busy"
          @click="emit('signIn')"
        />
        <p v-if="busy" class="auth-progress" role="status">
          Connecting to your workspace…
        </p>
      </template>
      <details v-if="!requestUrl && !backend" class="auth-team">
        <summary>Use your organization’s Gitrew</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Authentication repository">
            <UInput
              v-model="mailbox"
              placeholder="your-org/gitrew-auth"
              class="w-full"
            />
          </UFormField>
          <UButton
            label="Connect team sign-in"
            color="neutral"
            variant="outline"
            :disabled="!mailbox"
            @click="emit('mailbox', mailbox.trim())"
          />
        </div>
      </details>
    </div>
    <p v-if="!hideCreate && !backend" class="auth-create">
      <NuxtLink to="/create/">Create your own workspace</NuxtLink>
    </p>
  </section>
</template>
