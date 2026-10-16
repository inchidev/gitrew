<script setup lang="ts">
import { workspaceSettingsSchema } from "../../shared/access";
import { backendJson } from "~/lib/backend";
const props = defineProps<{ name: string; token: string }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [] }>();
const state = reactive({ displayName: props.name });
const busy = ref(false),
  error = ref("");
watch(open, (value) => {
  if (value) {
    state.displayName = props.name;
    error.value = "";
  }
});
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await backendJson(
      "/api/workspace/settings",
      props.token,
      workspaceSettingsSchema.parse(state),
    );
    emit("saved");
    open.value = false;
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Could not save workspace settings.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <UModal
    v-model:open="open"
    title="Workspace settings"
    description="Choose the name your team sees in Gitrew."
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Couldn’t save settings"
        :description="error"
        role="alert"
        class="mb-4"
      />
      <UForm
        :schema="workspaceSettingsSchema"
        :state="state"
        @submit="save"
        class="space-y-5"
      >
        <UFormField
          name="displayName"
          label="Workspace name"
          description="Your GitHub organization and storage repositories keep their existing names."
          ><UInput v-model="state.displayName" maxlength="80" class="w-full"
        /></UFormField>
        <UButton type="submit" label="Save name" :loading="busy" />
      </UForm>
    </template>
  </UModal>
</template>
