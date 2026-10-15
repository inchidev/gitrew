import { backendJson, isBackendToken } from "~/lib/backend";
import type { Channel } from "../../shared/chat";
interface Member {
  id: number;
  login: string;
}
export function useLiveChat(
  token: Ref<string>,
  organization: Ref<string>,
  channel: Ref<Channel | undefined>,
  refresh: () => void,
) {
  const connected = ref(false),
    members = ref<Member[]>([]),
    huddleMembers = ref<string[]>([]),
    typing = ref<string[]>([]),
    error = ref("");
  let socket: WebSocket | undefined,
    generation = 0,
    reconnect: ReturnType<typeof setTimeout> | undefined,
    renewal: ReturnType<typeof setTimeout> | undefined;
  const typers = new Map<string, number>();
  let lastTyping = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;
  function stop() {
    generation++;
    clearTimeout(reconnect);
    clearTimeout(renewal);
    socket?.close();
    socket = undefined;
    connected.value = false;
    members.value = [];
    huddleMembers.value = [];
    typers.clear();
    typing.value = [];
  }
  async function connect() {
    stop();
    const current = generation;
    if (!isBackendToken(token.value) || !channel.value || !organization.value)
      return;
    try {
      const config = await backendJson<{ realtime: boolean }>("/api/config");
      if (current !== generation || !config.realtime) return;
      const result = await backendJson<{ ticket: string }>(
        "/api/live/ticket",
        token.value,
        {
          organization: organization.value,
          channel: channel.value.id,
          kind: channel.value.kind || "public",
        },
      );
      if (current !== generation) return;
      const url = new URL("/api/live/socket", window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", result.ticket);
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        if (current !== generation) return;
        const value = JSON.parse(event.data);
        if (value.type === "ready") {
          connected.value = true;
          error.value = "";
          refresh();
          renewal = setTimeout(() => void connect(), 210_000);
        }
        if (value.type === "refresh") refresh();
        if (value.type === "huddle") huddleMembers.value = value.members;
        if (value.type === "presence") members.value = value.members;
        if (value.type === "typing") {
          if (value.active) typers.set(value.login, Date.now() + 5000);
          else typers.delete(value.login);
          typing.value = [...typers.keys()];
        }
      };
      socket.onclose = () => {
        if (current !== generation) return;
        connected.value = false;
        members.value = [];
        huddleMembers.value = [];
        typers.clear();
        typing.value = [];
        reconnect = setTimeout(
          () => void connect(),
          3000 + Math.random() * 2000,
        );
      };
      socket.onerror = () => socket?.close();
    } catch (e) {
      if (current !== generation) return;
      error.value =
        e instanceof Error ? e.message : "Live connection unavailable";
      reconnect = setTimeout(() => void connect(), 15_000);
    }
  }
  function sendTyping(active: boolean) {
    if (!connected.value || socket?.readyState !== WebSocket.OPEN) return;
    if (active && Date.now() - lastTyping < 2500) return;
    lastTyping = Date.now();
    socket.send(JSON.stringify({ type: "typing", active }));
  }
  onMounted(() => {
    ticker = setInterval(() => {
      for (const [name, expires] of typers)
        if (expires < Date.now()) typers.delete(name);
      typing.value = [...typers.keys()];
    }, 1000);
    void connect();
  });
  watch([token, organization, () => channel.value?.id], () => {
    if (import.meta.client) void connect();
  });
  onBeforeUnmount(() => {
    stop();
    clearInterval(ticker);
  });
  return { connected, members, huddleMembers, typing, error, sendTyping };
}
