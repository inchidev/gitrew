<script setup lang="ts">
import dayjs from "dayjs";
import {
  quickReactions,
  type Message,
  type ReactionContent,
} from "../../shared/chat";
import { safeUrl } from "~/lib/links";
import { renderPublicMarkdown } from "~/lib/markdown";
const props = defineProps<{
  message: Message;
  replies?: number;
  selected?: boolean;
  inThread?: boolean;
  markdown?: boolean;
  canReact?: boolean;
}>();
const emit = defineEmits<{
  thread: [id: string];
  react: [content: ReactionContent];
}>();
const url = computed(() => safeUrl(props.message.url));
const avatar = computed(() =>
  props.message.status === "saved" &&
  /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(props.message.author)
    ? `https://github.com/${encodeURIComponent(props.message.author)}.png?size=64`
    : "",
);
const avatarFailed = ref(false);
const markdownBody = computed(() =>
  props.markdown ? renderPublicMarkdown(props.message.body) : "",
);
const pickerOpen = ref(false);
function pick(content: ReactionContent) {
  pickerOpen.value = false;
  emit("react", content);
}
function pickerBlur(event: FocusEvent) {
  const holder = event.currentTarget as HTMLElement | null;
  if (!holder?.contains(event.relatedTarget as HTMLElement | null))
    pickerOpen.value = false;
}
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
      <p v-if="!markdown" class="message-body">{{ message.body }}</p>
      <div
        v-else
        class="message-body message-body-md"
        data-markdown-body
        v-html="markdownBody"
      />
      <div
        v-if="(message.reactions && message.reactions.length) || canReact"
        class="message-reactions"
      >
        <template v-for="reaction in message.reactions || []" :key="reaction.emoji">
          <button
            v-if="canReact && reaction.content"
            type="button"
            class="message-reaction"
            :class="{ mine: reaction.mine }"
            :aria-pressed="reaction.mine ? 'true' : 'false'"
            :aria-label="
              `${reaction.emoji} ${reaction.count} — ${
                reaction.mine ? 'remove your reaction' : 'react too'
              }`
            "
            @click="emit('react', reaction.content)"
          >
            {{ reaction.emoji }} {{ reaction.count }}
          </button>
          <span v-else class="message-reaction" :class="{ mine: reaction.mine }"
            >{{ reaction.emoji }} {{ reaction.count }}</span
          >
        </template>
        <span
          v-if="canReact"
          class="reaction-picker-holder"
          @focusout="pickerBlur"
          @keydown.esc="pickerOpen = false"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-octicon-smiley-16"
            class="reaction-add"
            :aria-expanded="pickerOpen ? 'true' : 'false'"
            aria-haspopup="true"
            aria-label="Add a reaction"
            @click="pickerOpen = !pickerOpen"
          />
          <div v-if="pickerOpen" class="reaction-picker" role="menu">
            <button
              v-for="item in quickReactions"
              :key="item.content"
              type="button"
              role="menuitem"
              :class="{
                mine: message.reactions?.some(
                  (group) => group.content === item.content && group.mine,
                ),
              }"
              :title="`React with ${item.emoji}`"
              @click="pick(item.content)"
            >
              {{ item.emoji }}
            </button>
          </div>
        </span>
      </div>
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
