<script setup lang="ts">
import type { Room } from "livekit-client";
const props = defineProps<{
  provider: "realtimekit" | "livekit";
  token: string;
  url: string;
  channel: string;
}>();
const emit = defineEmits<{ leave: [] }>();
const audio = useTemplateRef<HTMLDivElement>("audio");
const muted = ref(false),
  error = ref(""),
  connecting = ref(true);
let room: Room | undefined,
  disposed = false;
onMounted(async () => {
  if (props.provider !== "livekit") return;
  try {
    const { Room: Client, RoomEvent, Track } = await import("livekit-client");
    if (disposed) return;
    const current = new Client();
    room = current;
    current.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio)
        audio.value?.appendChild(track.attach());
    });
    current.on(RoomEvent.TrackUnsubscribed, (track) =>
      track.detach().forEach((el) => el.remove()),
    );
    current.on(RoomEvent.Disconnected, () => {
      if (!disposed) emit("leave");
    });
    await current.connect(props.url, props.token);
    if (disposed) {
      await current.disconnect();
      return;
    }
    await current.startAudio();
    await current.localParticipant.setMicrophoneEnabled(true);
    connecting.value = false;
  } catch {
    error.value =
      "Could not join the huddle. Check your microphone permission and LiveKit connection.";
  }
});
async function toggle() {
  if (!room) return;
  try {
    await room.localParticipant.setMicrophoneEnabled(muted.value);
    muted.value = !muted.value;
  } catch {
    error.value = "Could not change microphone access.";
  }
}
onBeforeUnmount(() => {
  disposed = true;
  void room?.disconnect();
});
</script>
<template>
  <RealtimeHuddle
    v-if="provider === 'realtimekit'"
    :token="token"
    :channel="channel"
    @leave="emit('leave')"
  />
  <div v-else class="space-y-4 p-5">
    <h2 class="font-semibold">Huddle · {{ channel }}</h2>
    <p v-if="connecting && !error" role="status">Connecting your microphone…</p>
    <UAlert v-if="error" color="error" :title="error" />
    <div ref="audio" />
    <div class="flex flex-wrap gap-3">
      <UButton
        color="neutral"
        variant="outline"
        :disabled="connecting"
        :icon="muted ? 'i-lucide-mic-off' : 'i-lucide-mic'"
        @click="toggle"
        >{{ muted ? "Unmute" : "Mute" }}</UButton
      >
      <UButton color="error" icon="i-lucide-phone-off" @click="emit('leave')"
        >Leave huddle</UButton
      >
    </div>
  </div>
</template>
