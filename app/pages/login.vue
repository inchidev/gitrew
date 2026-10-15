<script setup lang="ts">
import {
  appReturnTo,
  legacyWorkspacePath,
  workspacePath,
} from "../../shared/routes";
const auth = useGitHubAuth();
const route = useRoute();
const runtime = useRuntimeConfig();
const open = ref(true);
const destination = computed(() => {
  if (auth.installer.value || typeof route.query.setup === "string")
    return "/create/";
  const explicit =
    appReturnTo(route.query.returnTo) ||
    (!auth.backend
      ? appReturnTo(sessionStorage.getItem("gitrew:return-to:v1"))
      : null);
  if (explicit) return explicit;
  const repo =
    (auth.backend
      ? auth.activeMailbox.value?.repository
      : auth.activeMailbox.value?.vault
        ? `${auth.activeMailbox.value.repository.split("/")[0]}/gitrew-chat`
        : "") ||
    (typeof route.query.workspace === "string" ? route.query.workspace : "") ||
    runtime.public.defaultRepository;
  return repo
    ? legacyWorkspacePath(
        repo,
        typeof route.query.channel === "string" ? route.query.channel : "",
      )!
    : auth.backend
      ? "/create/"
      : workspacePath("inchidev") + "?repo=gitrew";
});
watch(
  [auth.busy, auth.viewer, auth.token],
  ([busy, viewer, token]) => {
    if (!busy && viewer && token) {
      const target = destination.value;
      sessionStorage.removeItem("gitrew:return-to:v1");
      void navigateTo(target, { replace: true });
    }
  },
  { immediate: true },
);
async function chooseMailbox(repository: string) {
  try {
    await auth.selectMailbox(repository);
  } catch (error) {
    auth.error.value =
      error instanceof Error
        ? error.message
        : "Could not connect team sign-in.";
  }
}
useHead({ title: "Sign in · Gitrew" });
</script>
<template>
  <AuthModal
    standalone
    v-model:open="open"
    :backend="auth.backend"
    :busy="auth.busy.value"
    :error="auth.error.value"
    :request-url="auth.requestUrl.value"
    :device-code="auth.deviceCode.value"
    :mailbox-repository="auth.mailboxRepository.value"
    @sign-in="auth.signIn()"
    @mailbox="chooseMailbox"
    @cancel="auth.cancelMailbox"
  />
</template>
