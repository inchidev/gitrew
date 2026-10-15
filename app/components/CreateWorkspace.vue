<template>
  <main class="min-h-screen px-5 py-12">
    <div class="max-w-xl mx-auto space-y-6">
      <NuxtLink to="/" class="brand"><BrandMark /><span>Gitrew</span></NuxtLink>
      <h1 class="text-3xl font-semibold">Create your own workspace</h1>
      <p>
        Deploy Gitrew in your account, then open /create/ on your deployment.
      </p>
      <p>
        All workspace repositories are private. Organization members can use
        shared channels; private groups and DMs have their own participant
        lists.
      </p>
      <UAlert
        title="Private repositories need the backend setup"
        description="The earlier Actions installer required a public authentication mailbox and is retired. Choose a deployment below to keep your workspace private."
      />
      <DeployButtons />
    </div>
  </main>
</template>
