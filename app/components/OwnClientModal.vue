<script setup lang="ts">
const open = defineModel<boolean>("open", { required: true });
</script>

<template>
  <UModal
    v-model:open="open"
    title="A Gitrew of your own"
    description="Your frontend, your backend, your GitHub App, your conversations."
  >
    <template #body>
      <div class="own-copy">
        <BrandMark />
        <p>
          Deploy the frontend and its small backend together in your Cloudflare
          or Vercel account. Register your own GitHub App through the guided
          setup.
        </p>
        <ol>
          <li>
            Choose a hosting provider and a deployment setup key. On Vercel,
            create the private Blob store when prompted.
          </li>
          <li>
            Open Create workspace on your deployed site and approve your App in
            GitHub.
          </li>
          <li>Sign in, install your App and create the workspace.</li>
        </ol>
        <p class="text-muted">
          Workspace channels live in private gitrew-chat; all private channels and DMs share
          one administrator-only gitrew-vault. Updates are reviewed changes to
          your copy; a template does not update itself.
        </p>
        <DeployButtons />
        <UButton
          label="Read the hosting guide"
          to="https://github.com/inchidev/gitrew#your-own-deployment"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="link"
          trailing-icon="i-octicon-link-external-16"
        />
      </div>
    </template>
  </UModal>
</template>
