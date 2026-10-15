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
