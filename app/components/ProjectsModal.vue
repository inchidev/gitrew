<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { z } from "zod";
import { adminApi } from "~/lib/creator";
const props = defineProps<{
  token: string;
  organization: string;
  repositories: string[];
}>();
const open = defineModel<boolean>("open", { required: true });
const repository = ref(props.repositories[0] || "");
const title = ref("");
const body = ref("");
const error = ref("");
const busy = ref(false);
watch(open, (value) => {
  if (value && !props.repositories.includes(repository.value))
    repository.value = props.repositories[0] || "";
});
const issues = useQuery({
  queryKey: computed(() => ["issues", repository.value, props.organization]),
  enabled: computed(
    () => open.value && Boolean(repository.value && props.token),
  ),
  queryFn: async () =>
    z
      .array(
        z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          html_url: z.url(),
          pull_request: z.unknown().optional(),
        }),
      )
      .parse(
        await adminApi(
          props.token,
          `/repos/${repository.value}/issues?state=open&per_page=100`,
        ),
      ),
});
const projects = useQuery({
  queryKey: computed(() => ["projects", props.organization]),
  enabled: computed(() => open.value && Boolean(props.token)),
  retry: false,
  queryFn: async () => {
    const result = await adminApi(props.token, "/graphql", "POST", {
      query:
        "query Projects($login:String!) { organization(login:$login) { projectsV2(first:50) { nodes { id title url closed } } } }",
      variables: { login: props.organization },
    });
    if (result.errors?.length)
      throw new Error(
        "Install the workspace App with organization Projects read permission to list boards here.",
      );
    return z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          url: z.url(),
          closed: z.boolean(),
        }),
      )
      .parse(result.data.organization?.projectsV2.nodes || []);
  },
});
async function createIssue() {
  busy.value = true;
  error.value = "";
  try {
    await adminApi(props.token, `/repos/${repository.value}/issues`, "POST", {
      title: title.value.trim(),
      body: body.value,
    });
    title.value = "";
    body.value = "";
    await issues.refetch();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not create issue.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <UModal
    v-model:open="open"
    title="Projects and issues"
    description="GitHub remains the source of your team’s work."
    ><template #body
      ><div class="space-y-5">
        <div>
          <h3 class="font-semibold mb-2">Organization boards</h3>
          <p v-if="projects.error.value" class="text-muted text-sm">
            {{ projects.error.value.message }}
          </p>
          <UButton
            v-for="project in projects.data.value"
            :key="project.id"
            :label="project.title"
            :to="project.url"
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="ghost"
            block
          /><UButton
            :to="`https://github.com/orgs/${organization}/projects`"
            target="_blank"
            rel="noopener noreferrer"
            label="Manage GitHub Projects"
            variant="link"
          />
        </div>
        <UFormField label="Project repository"
          ><USelect v-model="repository" :items="repositories" class="w-full"
        /></UFormField>
        <UAlert
          v-if="issues.error.value || error"
          role="alert"
          color="error"
          variant="subtle"
          title="GitHub request failed"
          :description="error || issues.error.value?.message"
        />
        <div>
          <UButton
            v-for="issue in issues.data.value"
            :key="issue.id"
            :to="issue.html_url"
            :label="`${issue.pull_request ? 'PR' : 'Issue'} #${issue.number} · ${issue.title}`"
            target="_blank"
            rel="noopener noreferrer"
            color="neutral"
            variant="ghost"
            block
          />
          <p v-if="issues.isFetching.value" role="status">Loading issues…</p>
        </div>
        <UForm :state="{ title, body }" class="space-y-3" @submit="createIssue"
          ><UFormField label="New issue title"
            ><UInput v-model="title" class="w-full" /></UFormField
          ><UFormField label="Description"
            ><UTextarea v-model="body" class="w-full" /></UFormField
          ><UButton
            type="submit"
            label="Create GitHub issue"
            :loading="busy"
            :disabled="!repository || !title.trim() || busy"
        /></UForm></div></template
  ></UModal>
</template>
