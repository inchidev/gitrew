<template>
  <UAlert
    color="info"
    variant="subtle"
    icon="i-lucide-globe"
    title="Public preview"
    description="Browsing public GitHub content. To participate, run your own workspace."
  >
    <template #actions>
      <UButton to="/#install" label="Install yours" size="xs" variant="soft" />
    </template>
  </UAlert>
</template>
