# Voice huddles

The backend authorizes the conversation before issuing a participant token. Choose one provider per installation; API credentials stay on the server. Huddles are voice first. Camera, screen sharing, recording, ringing and background/locked-phone call continuity are not part of this implementation.

## Cloudflare RealtimeKit

Create a RealtimeKit app and a participant preset in your own Cloudflare account. Use a dedicated voice preset allowing microphone publishing/subscription, with video/screenshare, recording, in-call chat, plugins and polls disabled. Automatic recording should be off. Configure:

```dotenv
HUDDLE_PROVIDER=realtimekit
RTK_ACCOUNT_ID=your-account-id
RTK_APP_ID=your-realtimekit-app-id
RTK_PRESET=group_call_participant
RTK_API_TOKEN=your-server-only-api-token
```

On Cloudflare, keep `RTK_API_TOKEN` as a Worker secret; account/app IDs and the preset can be Worker variables. On celld use the ignored `.env` loaded by Compose. The client receives only its participant token. Credentials are never copied from another application's installation.

[RealtimeKit quickstart](https://developers.cloudflare.com/realtime/realtimekit/quickstart/) · [Participant cleanup API](https://developers.cloudflare.com/api/resources/realtime_kit/subresources/active-session/methods/kick_participants/).

## LiveKit for a VPS

Use an HTTPS/WSS LiveKit deployment or LiveKit Cloud:

```dotenv
HUDDLE_PROVIDER=livekit
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-server-only-secret
```

Keep `LIVEKIT_API_SECRET` as a Worker secret or in the private VPS `.env`. Participant JWTs are room scoped, expire after five minutes for new connections, and allow only microphone publishing. The server issues a separate room-admin token for participant cleanup. Do not expose API secrets to Nuxt public configuration.

This repo does not configure your LiveKit server, TLS, TURN or UDP ports. Follow [LiveKit self-hosting](https://docs.livekit.io/home/self-hosting/) and [token grants](https://docs.livekit.io/frontends/reference/tokens-grants/).

## Lifecycle and costs

The DO serializes joins, stores provider meeting IDs and participant leases, and renews a lease via an authorized heartbeat. Leaving removes the provider participant. A browser crash expires its lease after roughly 90 seconds; DO alarms retry provider cleanup after failure. Revoking access also starts cleanup. Token expiration alone is not active-call removal.

An unreachable provider can delay cleanup and billing termination. Monitor its active sessions. Media traffic is handled and billed by the chosen provider, independently from GitHub and the Gitrew Worker. Audio between two real users must be tested separately from mocked token/lifecycle tests. Stop all huddles before changing provider credentials or account/app IDs.
