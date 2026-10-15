<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { z } from "zod";
import { listWorkspaceRepositories, parseRepository } from "~/lib/github";

const props = defineProps<{
  token: string;
  login: string;
  repository: string;
  publicOnly?: boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{
  connect: [repository: string];
  install: [];
  create: [];
}>();
const state = reactive({ repository: props.repository });
const schema = z.object({
  repository: z.string().refine((value) => {
    try {
      parseRepository(value);
      return true;
    } catch {
      return false;
    }
  }, "Use owner/repository or its GitHub URL."),
});
const repos = useQuery({
  queryKey: computed(() => ["repositories", props.login]),
  enabled: computed(() => open.value && Boolean(props.token)),
  queryFn: ({ signal }) => listWorkspaceRepositories(props.token, signal),
  staleTime: 30_000,
});
const visibleRepositories = computed(() =>
  (repos.data.value || []).filter(
    (repo) =>
      !["gitrew-vault", "gitrew-auth"].includes(repo.full_name.split("/")[1]!) &&
      (!props.publicOnly || !repo.private),
  ),
);
const organizations = computed(() => [
  ...new Set(
    visibleRepositories.value.map((repo) => repo.full_name.split("/")[0]!),
  ),
]);
function connectOrganization(owner: string) {
  const values = visibleRepositories.value.filter((repo) =>
    repo.full_name.startsWith(owner + "/"),
  );
  const primary =
    values.find((repo) => repo.full_name === `${owner}/gitrew-chat`) ||
    values.find((repo) => repo.has_discussions) ||
    values[0];
  if (primary) connect(primary.full_name);
}
watch(open, (value) => {
  if (value) state.repository = props.repository;
});
function connect(value: string) {
  emit("connect", parseRepository(value).join("/"));
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Your workspaces"
    description="An organization brings its connected repositories and conversations together."
  >
    <template #body>
      <div class="workspace-list">
        <UButton
          v-for="owner in organizations"
          :key="owner"
          :label="`Organization: ${owner}`"
          icon="i-octicon-organization-16"
          color="neutral"
          variant="outline"
          block
          @click="connectOrganization(owner)"
        />
        <p
          v-if="repos.isPending.value && props.token"
          class="text-muted text-sm"
        >
          Finding repositories…
        </p>
        <UAlert
          v-if="repos.error.value"
          role="alert"
          color="error"
          variant="subtle"
          title="Couldn’t load repositories"
          :description="repos.error.value.message"
        />
        <UButton
          v-for="repo in visibleRepositories"
          :key="repo.id"
          color="neutral"
          variant="ghost"
          block
          :icon="repo.private ? 'i-octicon-lock-16' : 'i-octicon-globe-16'"
          :label="repo.full_name"
          :disabled="!repo.has_discussions"
          :ui="{ base: 'justify-start' }"
          @click="connect(repo.full_name)"
        >
          <template v-if="!repo.has_discussions" #trailing
            ><span class="text-xs ml-auto">Enable Discussions</span></template
          >
        </UButton>
      </div>
      <div class="workspace-connect">
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-3"
          @submit="connect(state.repository)"
        >
          <UFormField
            name="repository"
            label="Repository"
            description="You need access, and the Gitrew GitHub App must be installed there."
          >
            <UInput
              v-model="state.repository"
              placeholder="my-team/chat"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Open workspace"
            icon="i-octicon-arrow-right-16"
            :disabled="!token"
          />
        </UForm>
      </div>
      <div class="workspace-setup">
        <h3>Start a workspace</h3>
        <UButton
          label="Create organization workspace"
          icon="i-octicon-plus-16"
          class="my-3"
          @click="
            open = false;
            emit('create');
          "
        />
        <p>
          Create a workspace with organization-wide channels, one administrator-only
          gitrew-vault for private channels and DMs, and your own sign-in
          workflow.
        </p>
        <div class="flex flex-wrap gap-2 mt-3">
          <UButton
            v-if="!publicOnly"
            label="Create repository"
            to="https://github.com/new?name=chat&visibility=private"
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="outline"
            size="sm"
            trailing-icon="i-octicon-link-external-16"
          />
          <UButton
            label="Install Gitrew App"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!token"
            @click="emit('install')"
          />
          <UButton
            label="Refresh list"
            icon="i-octicon-sync-16"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="repos.isFetching.value"
            :disabled="!token"
            @click="repos.refetch()"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
