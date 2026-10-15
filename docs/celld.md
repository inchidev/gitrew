# Local celld installation

Gitrew can package its Workers-compatible backend, D1 binding and static frontend for a local celld 0.6.2 compatibility test. This is not a production fleet or a proven Coolify deployment.

```sh
docker compose up --build -d
curl http://127.0.0.1:9877/health
curl http://127.0.0.1:9877/api/config
```

Open http://127.0.0.1:9877. The compose service binds only to localhost. Its named `gitrew-state` volume holds local D1 data and a generated 32-byte setup secret in `.celld/setup-token`. Container restarts retain that secret. Never publish it or delete it independently of the encrypted data.

To read your own local setup key when configuring a test App:

```sh
docker compose exec gitrew cat .celld/setup-token
```

GitHub sign-in requires configuring an App with reachable callback URLs. A local health/config check alone does not prove GitHub OAuth. For public hosting, use HTTPS and the final origin before App registration. Keep the vault private and restrict App installation repositories.

```sh
docker compose down
```

This preserves the state volume. Use your local Docker context explicitly if other contexts point to remote hosts. Production celld uses an object-store-backed deployment and durability design; review [celld documentation](https://github.com/denoland/celld/tree/v0.6.2/docs) before adapting the image to Coolify. Local dev mode is not the recommended production fleet setup.

## Local verification, 2026-10-15

Built the Docker image and ran it on the local Colima context. `/`, `/create/`, `/login/`, `/w/inchidev`, `/health` and `/api/config` returned200. Config initialized D1 and showed a fresh unconfigured installation. An incorrect setup key returned403. Restart retained the generated key and initialized storage. The container became healthy. No GitHub OAuth or second-member private-message flow was claimed by this local test.

celld0.6.2 needed a small static-route adapter for trailing slashes; the Docker build uses that adapter while Cloudflare continues using the original Worker.

## Live coordination verification, 2026-10-15

After adding the `LIVE` binding, the local installation returned `platform:celld` and `realtime:true` and became healthy with the existing state volume. A separate disposable celld container ran the actual LiveHub class: WebSocket ready, conversation presence, huddle state and typing arrived; an HTTP-triggered DO RPC broadcast returned200 and delivered `refresh`. The probe container was stopped afterward. It used synthetic identities in a localhost-only harness, not the application's GitHub authorization flow. GitHub authorization/isolation is covered separately by workerd runtime tests.
