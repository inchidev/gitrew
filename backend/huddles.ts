import { Buffer } from "node:buffer";
import { z } from "zod";
import { HttpError } from "./security";
export interface MediaEnv {
  HUDDLE_PROVIDER?: string;
  RTK_ACCOUNT_ID?: string;
  RTK_APP_ID?: string;
  RTK_API_TOKEN?: string;
  RTK_PRESET?: string;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}
export function mediaProvider(env: MediaEnv) {
  if (
    env.HUDDLE_PROVIDER === "livekit" &&
    env.LIVEKIT_URL &&
    env.LIVEKIT_API_KEY &&
    env.LIVEKIT_API_SECRET
  )
    return "livekit" as const;
  if (
    env.HUDDLE_PROVIDER === "realtimekit" &&
    env.RTK_ACCOUNT_ID &&
    env.RTK_APP_ID &&
    env.RTK_API_TOKEN &&
    env.RTK_PRESET
  )
    return "realtimekit" as const;
  return null;
}
async function rtk(
  env: MediaEnv,
  path: string,
  method: string,
  body?: unknown,
  allowMissing = false,
) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.RTK_ACCOUNT_ID!)}/realtime/kit/${encodeURIComponent(env.RTK_APP_ID!)}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${env.RTK_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (allowMissing && response.status === 404) return null;
  const result = z
    .object({ success: z.boolean(), data: z.unknown().optional() })
    .parse(await response.json());
  if (!response.ok || !result.success)
    throw new HttpError(
      502,
      "RealtimeKit could not complete the huddle operation. Check its credentials and preset.",
    );
  return result.data;
}
async function livekitToken(env: MediaEnv, claims: object) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000),
    data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: env.LIVEKIT_API_KEY, nbf: now - 10, exp: now + 300, ...claims })}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LIVEKIT_API_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${data}.${Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))).toString("base64url")}`;
}
export interface HuddleLease {
  id: string;
  sessionId: string;
  userId: number;
  login: string;
  channel: string;
  provider: "realtimekit" | "livekit";
  meeting: string;
  participant: string;
  expires: number;
}
export async function joinMedia(
  env: MediaEnv,
  channel: string,
  login: string,
  userId: number,
  meeting?: string,
) {
  const provider = mediaProvider(env);
  if (!provider)
    throw new HttpError(
      409,
      "Your installation owner needs to configure a huddle provider. See the huddles setup guide.",
    );
  if (provider === "realtimekit") {
    if (!meeting)
      meeting = z.object({ id: z.string() }).parse(
        await rtk(env, "/meetings", "POST", {
          title: "Gitrew huddle",
          record_on_start: false,
          session_keep_alive_time_in_secs: 60,
        }),
      ).id;
    const p = z.object({ id: z.string(), token: z.string() }).parse(
      await rtk(env, `/meetings/${meeting}/participants`, "POST", {
        name: login,
        custom_participant_id: `${userId}:${crypto.randomUUID()}`,
        preset_name: env.RTK_PRESET,
      }),
    );
    return { provider, meeting, participant: p.id, token: p.token, url: "" };
  }
  const room =
    meeting ||
    `gitrew-${await crypto.subtle.digest("SHA-256", new TextEncoder().encode(channel)).then((b) => Buffer.from(b).toString("hex").slice(0, 32))}`;
  const participant = `${userId}:${crypto.randomUUID()}`;
  const token = await livekitToken(env, {
    sub: participant,
    name: login,
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
    },
  });
  return { provider, meeting: room, participant, token, url: env.LIVEKIT_URL! };
}
export async function leaveMedia(env: MediaEnv, lease: HuddleLease) {
  if (lease.provider === "realtimekit") {
    await rtk(
      env,
      `/meetings/${lease.meeting}/active-session/kick`,
      "POST",
      { participant_ids: [lease.participant] },
      true,
    );
    await rtk(
      env,
      `/meetings/${lease.meeting}/participants/${lease.participant}`,
      "DELETE",
      undefined,
      true,
    );
  } else {
    const url = new URL(env.LIVEKIT_URL!);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/twirp/livekit.RoomService/RemoveParticipant";
    const token = await livekitToken(env, {
      video: { roomAdmin: true, room: lease.meeting },
    });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room: lease.meeting,
        identity: lease.participant,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 404)
      throw new HttpError(
        502,
        "LiveKit could not remove the huddle participant. Cleanup will retry.",
      );
  }
}
