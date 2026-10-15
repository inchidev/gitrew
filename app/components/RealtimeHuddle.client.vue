<script setup lang="ts">
import type RealtimeKitClient from "@cloudflare/realtimekit";
const props = defineProps<{ token: string; channel: string }>();
const emit = defineEmits<{ leave: [] }>();
const element = useTemplateRef<
  HTMLElement & { meeting?: RealtimeKitClient; showSetupScreen?: boolean }
>("meetingElement");
const error = ref("");
const ready = ref(false);
const microphones = shallowRef<MediaDeviceInfo[]>([]),
  speakers = shallowRef<MediaDeviceInfo[]>([]);
const microphone = ref(""),
  speaker = ref(""),
  muted = ref(true),
  changing = ref(false),
  audioError = ref("");
let meeting: RealtimeKitClient | undefined;
let disposed = false;
async function refreshDevices() {
  if (!meeting || disposed) return;
  try {
    const [inputs, outputs] = await Promise.all([
      meeting.self.getAudioDevices(),
      meeting.self.getSpeakerDevices(),
    ]);
    if (disposed) return;
    microphones.value = inputs.filter((device) => !!device.deviceId);
    speakers.value = outputs.filter((device) => !!device.deviceId);
    const current = meeting.self.getCurrentDevices();
    microphone.value = current.audio?.deviceId || inputs[0]?.deviceId || "";
    speaker.value = current.speaker?.deviceId || outputs[0]?.deviceId || "";
    muted.value = !meeting.self.audioEnabled;
  } catch {
    audioError.value =
      "Could not list audio devices. Check microphone permissions in your browser.";
  }
}
async function setDevice(id: string, kind: "microphone" | "speaker") {
  const device = (
    kind === "microphone" ? microphones.value : speakers.value
  ).find((device) => device.deviceId === id);
  if (!meeting || !device) return;
  changing.value = true;
  audioError.value = "";
  try {
    await meeting.self.setDevice(device);
    await refreshDevices();
  } catch {
    audioError.value =
      "Could not switch audio device. Your browser may require choosing the output in system settings.";
    await refreshDevices();
  } finally {
    changing.value = false;
  }
}
async function toggleMicrophone() {
  if (!meeting) return;
  changing.value = true;
  audioError.value = "";
  try {
    if (meeting.self.audioEnabled) await meeting.self.disableAudio();
    else await meeting.self.enableAudio();
    await refreshDevices();
  } catch {
    audioError.value =
      "Could not enable the microphone. Allow microphone access and check your participant preset.";
  } finally {
    changing.value = false;
  }
}
onMounted(async () => {
  try {
    const [{ default: Client }, { defineCustomElements }] = await Promise.all([
      import("@cloudflare/realtimekit"),
      import("@cloudflare/realtimekit-ui/loader"),
    ]);
    if (disposed) return;
    defineCustomElements(window, { resourcesUrl: "/rtk/" });
    const initialized = await Client.init({
      authToken: props.token,
      defaults: { audio: true, video: false },
    });
    if (disposed) {
      await initialized.leave();
      return;
    }
    meeting = initialized;
    meeting.self.on("roomLeft", () => emit("leave"));
    meeting.self.on("roomJoined", () => {
      void refreshDevices();
    });
    meeting.self.on("deviceListUpdate", () => {
      void refreshDevices();
    });
    meeting.self.on("deviceUpdate", () => {
      void refreshDevices();
    });
    meeting.self.on("audioUpdate", () => {
      if (meeting) muted.value = !meeting.self.audioEnabled;
    });
    if (element.value) {
      element.value.meeting = meeting;
      element.value.showSetupScreen = true;
    }
    ready.value = true;
    await refreshDevices();
  } catch {
    error.value =
      "Could not initialize the huddle. Check microphone permissions and the RealtimeKit participant preset.";
  }
});
onBeforeUnmount(() => {
  disposed = true;
  void meeting?.leave().catch(() => undefined);
});
</script>

<template>
  <div class="huddle-panel">
    <header>
      <span><UIcon name="i-lucide-audio-lines" /> {{ channel }}</span
      ><UButton color="error" icon="i-lucide-phone-off" @click="emit('leave')"
        >Disconnect</UButton
      >
    </header>
    <UAlert v-if="error" color="error" :title="error" />
    <p v-else-if="!ready" role="status">Connecting to your huddle…</p>
    <div v-if="ready" class="space-y-3 p-4">
      <div class="field-grid">
        <UFormField label="MICROPHONE"
          ><USelect
            :model-value="microphone"
            :items="
              microphones.map((device, index) => ({
                label: device.label || `Microphone ${index + 1}`,
                value: device.deviceId,
              }))
            "
            :disabled="changing || !microphones.length"
            aria-label="Huddle microphone"
            class="w-full"
            @update:model-value="
              setDevice(String($event), 'microphone')
            " /></UFormField
        ><UFormField label="AUDIO OUTPUT"
          ><USelect
            :model-value="speaker"
            :items="
              speakers.map((device, index) => ({
                label: device.label || `Speaker ${index + 1}`,
                value: device.deviceId,
              }))
            "
            :disabled="changing || !speakers.length"
            aria-label="Huddle audio output"
            class="w-full"
            @update:model-value="setDevice(String($event), 'speaker')"
        /></UFormField>
      </div>
      <p v-if="!speakers.length" class="text-sm text-muted">
        This browser uses your system audio output. Choose headphones or
        speakers in your device settings.
      </p>
      <div class="flex flex-wrap gap-3">
        <UButton
          color="neutral"
          variant="outline"
          :icon="muted ? 'i-lucide-mic-off' : 'i-lucide-mic'"
          :loading="changing"
          @click="toggleMicrophone"
          >{{ muted ? "Unmute microphone" : "Mute microphone" }}</UButton
        ><UButton color="neutral" variant="ghost" @click="refreshDevices"
          >Refresh devices</UButton
        >
      </div>
      <UAlert v-if="audioError" color="error" :title="audioError" />
    </div>
    <rtk-meeting
      ref="meetingElement"
      show-setup-screen="true"
      class="rtk-surface"
    />
  </div>
</template>
