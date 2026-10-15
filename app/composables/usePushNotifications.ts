import { backendJson } from "~/lib/backend";
import type { Channel } from "../../shared/chat";
import { useLocalStorage } from "@vueuse/core";
export function usePushNotifications(
  token: Ref<string>,
  login: Ref<string>,
  organization: Ref<string>,
  channel: Ref<Channel | undefined>,
) {
  const followed = useLocalStorage<Record<string, boolean>>(
      "gitrew:push-follows:v1",
      {},
    ),
    busy = ref(false),
    error = ref("");
  const key = computed(
      () => `${login.value}:${organization.value}:${channel.value?.id}`,
    ),
    enabled = computed(() => Boolean(followed.value[key.value]));
  async function toggle() {
    if (!channel.value || busy.value) return;
    busy.value = true;
    error.value = "";
    const currentKey = key.value,
      room = {
        organization: organization.value,
        channel: channel.value.id,
        kind: channel.value.kind || "public",
      };
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "This browser does not support Web Push. On iPhone, install the web app on your Home Screen first.",
        );
      const config = await backendJson<{
        push: boolean;
        pushPublicKey: string;
      }>("/api/config");
      if (!config.push)
        throw new Error(
          "Ask your installation owner to configure Web Push. See the notifications guide.",
        );
      if (
        !enabled.value &&
        (await Notification.requestPermission()) !== "granted"
      )
        throw new Error(
          "Notifications were not enabled. You can allow them in browser settings.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && !enabled.value) {
        const raw = atob(
          config.pushPublicKey.replace(/-/g, "+").replace(/_/g, "/"),
        );
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
        });
      }
      if (subscription)
        await backendJson("/api/push", token.value, {
          room,
          subscription: subscription.toJSON(),
          remove: enabled.value,
        });
      followed.value = { ...followed.value, [currentKey]: !enabled.value };
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Could not change notifications";
    } finally {
      busy.value = false;
    }
  }
  return { enabled, busy, error, toggle };
}
