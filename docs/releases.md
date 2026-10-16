# Releases

Gitrew releases pin the reviewed source for independent installations. Download the source archive and `SHA256SUMS` from the [latest GitHub release](https://github.com/inchidev/gitrew/releases/latest), or clone the desired version:

```sh
git clone --branch v0.2.0 --depth 1 https://github.com/inchidev/gitrew.git
cd gitrew
npm ci
```

Use the [Cloudflare guide](cloudflare-backend.md) or [celld/VPS guide](vps.md) from that version. The release source archive contains tracked files only; it does not contain installation secrets, state, `node_modules` or generated frontend assets. Build in your own environment. These source releases do not publish a prebuilt Docker image.

To verify a downloaded source archive on macOS, put it beside `SHA256SUMS` and run `shasum -a 256 -c SHA256SUMS` (on Linux, `sha256sum -c SHA256SUMS`). The checksum verifies archive integrity; it is not an independent signature.

## Maintainer procedure

1. Review all included PRs. Update their branches, wait for required CI and merge through the protected branch policy.
2. Prepare a focused release PR with matching versions in `package.json` and `package-lock.json`, dated `CHANGELOG.md` notes and any installation changes.
3. Merge after CI. Verify the final `main` commit, its CI and the Cloudflare production build. Check `/health`, `/api/config` and the deployed UI. These checks do not prove two-person media or background push delivery.
4. Confirm the version tag and release do not already exist. Create an annotated `v<version>` tag at that exact commit and push it. Never move or recreate a published tag; correct problems in a new version.
5. From the tag, use `git archive --format=tar --prefix=gitrew-v<version>/ v<version> | gzip -n` to produce `gitrew-v<version>-source.tar.gz`. Create `SHA256SUMS` in the same directory. Inspect the archive before publication; include no local credentials or state.
6. Publish the GitHub release with `--verify-tag`, the reviewed notes and both files. Download the published files into a fresh directory, verify the checksum and compare the archive contents with the tagged tree. Verify the tag commit, release visibility, remaining PRs and a clean local `main`.

For upgrades, preserve the installation's origin, secrets and persistent state and follow [operations](operations.md). A source release does not automatically upgrade independent installations. The public gitrew.com site is deployed from `main` with `npm run build:portal` followed by `wrangler deploy --config wrangler.portal.jsonc`.
