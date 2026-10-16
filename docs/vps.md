# Deploy to a VPS with celld

Gitrew's VPS target is celld: the same Worker-compatible API, D1-compatible storage, Durable Object live coordination and static Nuxt frontend. The committed Compose file is a local compatibility example. A successful localhost run does not prove a production Coolify deployment.

Public production hosting and its acceptance checks are tracked in [#28](https://github.com/inchidev/gitrew/issues/28).

## Local Compose example

```sh
git clone https://github.com/inchidev/gitrew.git
cd gitrew
cp .env.example .env
# Optional: configure a media provider and Web Push in the private .env.
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:9877/health
curl http://127.0.0.1:9877/api/config
```

Open `http://127.0.0.1:9877`. Read your generated setup key locally:

```sh
docker compose exec gitrew cat .celld/setup-token
```

The file [compose.yml](../compose.yml) binds only `127.0.0.1:9877`, limits the container to 512 MiB/one CPU and preserves `.celld` in a named volume. `.env` is optional and ignored by Git. Use the correct Docker context; never accidentally deploy the example to an unrelated remote daemon.

## Public VPS / Coolify checklist

1. Decide the final HTTPS domain before registering a GitHub App. Use a reverse proxy that supports WebSocket upgrade and forwards the original HTTPS origin. Keep port9877 private.
2. For a Coolify Compose resource, remove the host-loopback `ports` mapping and expose container port9877 through its proxy. Preserve the named state volume. Run a single authoritative instance of this compatibility-mode service; no horizontal replicas on independent SQLite volumes.
3. Check celld's current production deployment/durability guidance before relying on its dev runtime. This image uses `celld dev`; it is not a supported production celld fleet recipe. We have not validated this image on Coolify.
4. Open `/create/` at the final origin, register your organization-owned App, sign in and provision the private chat/vault repositories. Confirm the new webhook subscriptions.
5. Optionally configure [huddles](huddles.md) and [Web Push](notifications.md). LiveKit is an external media server; deploying Gitrew does not deploy LiveKit/TURN.
6. Complete the two-user, restart, backup/restore and upgrade checks in [operations](operations.md).

Stop while preserving data with `docker compose down`. Do not add `-v` unless you intend to delete the installation state.

[celld instructions](celld.md) · [celld0.6.2 production documentation](https://github.com/denoland/celld/tree/v0.6.2/docs).
