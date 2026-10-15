<script setup lang="ts">
const props = defineProps<{
  label: string;
  reply?: boolean;
  disabled?: boolean;
  pending?: boolean;
  preview?: boolean;
  error?: string;
}>();
const shortcutKey = computed(() =>
  import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl",
);
const model = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [] }>();
function shortcut(event: KeyboardEvent) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    emit("send");
  }
}
</script>

<template>
  <form class="composer" @submit.prevent="emit('send')">
    <UFormField
      :label="label"
      class="composer-field"
      :ui="{ label: 'sr-only' }"
    >
      <UTextarea
        v-model="model"
        :aria-label="label"
        :placeholder="reply ? 'Write a reply…' : 'Write a message…'"
        :rows="2"
        autoresize
        :maxrows="7"
        :maxlength="60000"
        :disabled="disabled"
        class="w-full"
        :ui="{ base: 'composer-input' }"
        @keydown="shortcut"
      />
    </UFormField>
    <p v-if="error" role="alert" class="composer-error">
      {{ error }} Your draft is still here.
    </p>
    <div class="composer-bottom">
      <span id="draft-status" class="draft-status">{{
        model
          ? "Draft saved"
          : preview
            ? "Demo message"
            : `${shortcutKey} + Enter to send`
      }}</span>
      <UButton
        type="submit"
        :label="reply ? 'Reply' : 'Send message'"
        icon="i-octicon-paper-airplane-16"
        :loading="pending"
        :disabled="disabled || !model.trim() || pending"
        size="sm"
      />
    </div>
  </form>
</template>
