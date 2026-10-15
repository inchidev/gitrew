<script setup lang="ts">
import dayjs from "dayjs";
import type { Message } from "../../shared/chat";
import { safeUrl } from "~/lib/links";
const props = defineProps<{
  message: Message;
  replies?: number;
  selected?: boolean;
  inThread?: boolean;
}>();
const emit = defineEmits<{ thread: [id: string] }>();
const url = computed(() => safeUrl(props.message.url));
const avatar = computed(() =>
  props.message.status === "saved" &&
  /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(props.message.author)
    ? `https://github.com/${encodeURIComponent(props.message.author)}.png?size=64`
    : "",
);
const avatarFailed = ref(false);
</script>
<template>
  <article class="message" :class="{ 'message-selected': selected }">
    <div class="message-avatar" aria-hidden="true">
      <img
        v-if="avatar && !avatarFailed"
        :src="avatar"
        alt=""
        width="32"
        height="32"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="avatarFailed = true"
      />
      <UIcon v-else name="i-octicon-person-16" />
    </div>
    <div class="message-content">
      <div class="message-meta">
        <strong>{{ message.author }}</strong>
        <time
          :datetime="message.createdAt"
          :title="dayjs(message.createdAt).format('D MMM YYYY, HH:mm')"
        >
          {{ dayjs(message.createdAt).format("HH:mm") }}
        </time>
        <span
          class="delivery"
          :class="{ 'sr-only': message.status === 'local' }"
        >
          <template v-if="message.status === 'saved'"
            ><UIcon name="i-octicon-check-16" aria-hidden="true" /><span
              class="sr-only"
              >Sent</span
            ></template
          >
          <template v-else>On this device</template>
        </span>
      </div>
      <p class="message-body">{{ message.body }}</p>
      <div class="message-actions">
        <UButton
          v-if="!inThread"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-octicon-comment-discussion-16"
          :class="{ 'reply-empty': !replies }"
          :aria-label="!replies ? 'Reply in thread' : undefined"
          :label="
            replies
              ? `${replies} ${replies === 1 ? 'reply' : 'replies'}`
              : undefined
          "
          @click="emit('thread', message.id)"
        />
        <UButton
          v-if="url"
          :to="url"
          target="_blank"
          rel="noopener noreferrer"
          class="message-source"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-octicon-link-external-16"
          aria-label="Open in GitHub"
        />
      </div>
    </div>
  </article>
</template>
