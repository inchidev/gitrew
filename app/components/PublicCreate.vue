<script setup lang="ts">
const address = ref("");
const setupAddress = computed(() => {
  try {
    const url = new URL(address.value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["gitrew.com", "www.gitrew.com"].includes(url.hostname)
    )
      return "";
    return new URL("/create/", url.origin).href;
  } catch {
    return "";
  }
});
useHead({
  title: "Create your workspace — Gitrew",
  link: [{ rel: "canonical", href: "https://gitrew.com/create/" }],
  meta: [
    {
      name: "description",
      content:
        "Create your own Gitrew workspace on Cloudflare or a VPS. Choose your address, connect GitHub and invite your crew.",
    },
  ],
});
</script>

<template>
  <main class="public-create">
    <NuxtLink to="/" class="brand"><BrandMark /><span>Gitrew</span></NuxtLink>
    <h1>Create your workspace</h1>
    <p class="lead">A home for your crew, at your own address.</p>

    <section aria-labelledby="hosting-title">
      <span class="step">1</span>
      <h2 id="hosting-title">Choose where it runs</h2>
      <p>
        Deploy Gitrew in your Cloudflare account or on your own server with
        celld. The same application includes your team’s interface and backend.
      </p>
      <DeployButtons />
    </section>
    <section aria-labelledby="address-title">
      <span class="step">2</span>
      <h2 id="address-title">Give your crew an address</h2>
      <p>
        Use a domain such as example.com or gitrew.example.com. Configure HTTPS
        and your final address before connecting GitHub.
      </p>
      <p>
        Already deployed? Enter your workspace address to continue setup there.
      </p>
      <UFormField
        label="Workspace address"
        name="workspace-address"
        :error="
          address && !setupAddress
            ? 'Enter your deployment’s HTTPS origin, for example https://gitrew.example.com.'
            : undefined
        "
      >
        <UInput
          v-model="address"
          type="url"
          placeholder="https://gitrew.example.com"
          class="w-full"
          autocomplete="url"
        />
      </UFormField>
      <UButton
        :href="setupAddress || undefined"
        :disabled="!setupAddress"
        label="Continue setup on your domain"
        icon="i-octicon-arrow-right-16"
        trailing
        class="mt-4"
      />
    </section>
    <section aria-labelledby="github-title">
      <span class="step">3</span>
      <h2 id="github-title">Connect GitHub and invite your crew</h2>
      <p>
        On your deployment, register its GitHub App, connect your organization
        and create private repositories for conversations. Your team signs in at
        that workspace address.
      </p>
      <p>
        Each installation owns its credentials, storage and access rules.
        Gitrew.com provides the landing page and installation guide; it does not
        host your conversations or create hosted workspaces.
      </p>
    </section>
    <p class="footnote">
      Gitrew is free and open source. Hosting and optional voice services are
      billed by the providers you choose.
    </p>
    <a
      href="https://github.com/inchidev/gitrew/blob/main/docs/README.md"
      target="_blank"
      rel="noopener noreferrer"
      >Read the installation and operations docs
      <UIcon name="i-octicon-link-external-16"
    /></a>
  </main>
</template>

<style scoped>
.public-create {
  max-width: 760px;
  margin: auto;
  padding: calc(36px + var(--safe-top)) max(24px, var(--safe-right))
    calc(48px + var(--safe-bottom)) max(24px, var(--safe-left));
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 28px;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
h1 {
  font-size: clamp(32px, 6vw, 48px);
  line-height: 1.2;
  margin-top: 40px;
  color: var(--ui-text-highlighted);
}
.lead {
  font-size: 20px;
}
p {
  color: var(--ui-text-muted);
  line-height: 1.7;
  margin: 12px 0 20px;
}
section {
  position: relative;
  border-top: 1px solid var(--ui-border);
  padding: 28px 0;
}
h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  padding-left: 42px;
}
.step {
  position: absolute;
  top: 28px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
}
.footnote {
  font-size: 14px;
}
</style>
