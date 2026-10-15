<template>
  <span
    class="brand-mark"
    aria-hidden="true"
    :style="{
      maskImage: `url(${useRuntimeConfig().app.baseURL}brand/gitrew-mark.png)`,
    }"
  />
</template>
