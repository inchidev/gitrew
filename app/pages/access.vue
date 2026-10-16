<script setup lang="ts">
import { z } from "zod";
import { accessReportSchema, type AccessCheck } from "../../shared/access";
import { appReturnTo, legacyWorkspacePath } from "../../shared/routes";
import { backendResponse } from "~/lib/backend";
const route = useRoute();
const auth = useGitHubAuth();
const schema = accessReportSchema.extend({
  snapshot: z.boolean(),
  returnTo: z.string().nullable().optional(),
});
const report = shallowRef<z.infer<typeof schema> | null>(null);
const busy = ref(false),
  error = ref("");
const name = computed(
  () =>
    report.value?.displayName ||
    (auth.backend ? auth.displayName.value : "Gitrew"),
);
const target = computed(
  () =>
    appReturnTo(route.query.returnTo) || appReturnTo(report.value?.returnTo),
);
const labels: Record<AccessCheck["status"], string> = {
  passed: "Ready",
  missing: "Needed",
  unknown: "Couldn’t verify",
  not_required: "Not required",
  not_checked: "Not checked",
};
function signIn() {
  const query = new URLSearchParams();
  if (target.value) query.set("returnTo", target.value);
  window.location.assign("/api/auth/start" + (query.size ? "?" + query : ""));
}
async function check() {
  if (report.value?.snapshot) {
    signIn();
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const response = await backendResponse("/api/access");
    if (response.status === 401) {
      report.value = null;
      return;
    }
    if (!response.ok)
      throw new Error(
        "Access could not be checked. Try again, or ask a workspace administrator.",
      );
    report.value = schema.parse(await response.json());
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not check access.";
  } finally {
    busy.value = false;
  }
}
async function enter() {
  if (!report.value?.canEnter) return;
  if (report.value.snapshot) {
    signIn();
    return;
  }
  busy.value = true;
  try {
    await auth.selectMailbox(report.value.organization + "/gitrew-chat");
    if (auth.backend && auth.accessRequired.value) {
      await check();
      return;
    }
    const shared =
      legacyWorkspacePath(auth.activeMailbox.value?.repository || "") ||
      "/login";
    const privateAccess =
      report.value.checks.find((c) => c.id === "membership")?.status ===
      "passed";
    await navigateTo((privateAccess ? target.value : null) || shared);
  } finally {
    busy.value = false;
  }
}
onMounted(check);
useHead(() => ({ title: `Access · ${name.value}` }));
</script>
<template>
  <main class="access-page">
    <NuxtLink to="/" class="brand" aria-label="Gitrew home"
      ><BrandMark /><span>Gitrew</span></NuxtLink
    >
    <h1>Access to {{ name }}</h1>
    <p class="access-intro" v-if="report">
      Signed in on GitHub as <strong>{{ report.viewer.login }}</strong
      >. Check what your account still needs.
    </p>
    <p class="access-intro" v-else>
      Sign in with GitHub to check your access to this workspace.
    </p>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Couldn’t check access"
      :description="error"
      role="alert"
    />
    <template v-if="report">
      <h2>Workspace entry</h2>
      <ul class="access-checks">
        <li
          v-for="item in report.checks.filter((c) => c.id !== 'membership')"
          :key="item.id"
        >
          <div class="access-check-title">
            <h3>{{ item.label }}</h3>
            <UBadge
              class="access-status"
              :color="
                item.status === 'passed'
                  ? 'success'
                  : item.status === 'missing'
                    ? 'warning'
                    : 'neutral'
              "
              variant="subtle"
              >{{ labels[item.status] }}</UBadge
            >
          </div>
          <p>{{ item.detail }}</p>
        </li>
      </ul>
      <h2>Private conversations</h2>
      <ul class="access-checks">
        <li
          v-for="item in report.checks.filter((c) => c.id === 'membership')"
          :key="item.id"
        >
          <div class="access-check-title">
            <h3>Workspace members</h3>
            <UBadge
              class="access-status"
              :color="
                item.status === 'passed'
                  ? 'success'
                  : item.status === 'missing'
                    ? 'warning'
                    : 'neutral'
              "
              variant="subtle"
              >{{ labels[item.status] }}</UBadge
            >
          </div>
          <p>{{ item.detail }}</p>
        </li>
      </ul>
      <p v-if="report.snapshot" class="access-snapshot">
        Checked during GitHub sign-in. Check again after your permissions
        change.
      </p>
    </template>
    <div class="access-actions">
      <UButton
        v-if="report?.canEnter"
        label="Open shared channels"
        :loading="busy"
        @click="enter"
      />
      <UButton
        v-if="report"
        label="Check again"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="check"
      />
      <UButton
        v-else
        label="Continue with GitHub"
        icon="i-octicon-mark-github-16"
        :loading="busy"
        @click="signIn"
      />
      <UButton
        v-if="
          report?.isAdmin &&
          report.checks.find((c) => c.id === 'chat')?.status === 'not_checked'
        "
        to="/create/"
        label="Finish workspace setup"
        color="neutral"
        variant="outline"
      />
    </div>
  </main>
</template>
<style scoped>
.access-page {
  max-width: 680px;
  margin: auto;
  padding: calc(32px + var(--safe-top)) max(24px, var(--safe-right))
    calc(40px + var(--safe-bottom)) max(24px, var(--safe-left));
}
h1 {
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.8px;
  margin-top: 38px;
}
.access-intro {
  color: var(--ui-text-muted);
  line-height: 1.7;
  margin: 16px 0 28px;
}
h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 28px 0 12px;
}
.access-checks {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
}
.access-checks li {
  padding: 18px 20px;
}
.access-checks li + li {
  border-top: 1px solid var(--ui-border);
}
.access-check-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.access-status {
  color: var(--ui-text);
}
h3 {
  font-size: 15px;
  font-weight: 600;
}
.access-checks p {
  font-size: 15px;
  color: var(--ui-text-muted);
  line-height: 1.65;
  margin-top: 9px;
}
.access-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}
.access-snapshot {
  margin-top: 18px;
  font-size: 14px;
  color: var(--ui-text-muted);
  line-height: 1.6;
}
</style>
