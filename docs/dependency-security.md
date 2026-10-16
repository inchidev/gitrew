# Dependency security status

Checked on 2026-10-16. Track remaining work in [issue #26](https://github.com/inchidev/gitrew/issues/26). This is a scoped dependency assessment, not a claim of a clean vulnerability audit or complete application security review.

## Fixes in this source tree

| GitHub alert | Dependency | Resolution |
| --- | --- | --- |
| [#1](https://github.com/inchidev/gitrew/security/dependabot/1) | `uuid` below 11.1.1 under `@cloudflare/realtimekit@2.0.3` | Scoped override to 11.1.1; this release fixes the output-buffer bounds advisory and retains ESM and CommonJS entry points. |
| [#2](https://github.com/inchidev/gitrew/security/dependabot/2) | `fontless@0.2.1` → `esbuild@0.27.7` | Scoped override to the existing root esbuild spec (`$esbuild`, currently 0.28.2), removing the old nested binary packages. The advisory affects esbuild's Windows development file server. |

RealtimeKit's ESM entry imports only UUID `v4()` and `validate()`, with parameterless `v4()` calls. Its CommonJS entry also consumes UUID. Compatibility checks exercise UUID generation/validation, reject undersized output buffers for v3/v5/v6, and initialize the real SDK through both entry points until it deliberately rejects an invalid participant token. Backend browser coverage loads the real SDK/UI, confirms the SDK's invalid-token error and disconnect cleanup, without contacting a provider or requesting microphone access. This is not an audio-delivery test.

Nuxt generation exercises fontless's CSS `transform()` integration with the selected esbuild. The full frontend/backend/portal, WebKit, Worker and OAuth build checks remain required. No broad Nuxt/UI upgrade or major transitive override beyond this reviewed UUID consumer is needed for these two fixes.

Remove the UUID override when a validated RealtimeKit release declares a patched compatible UUID dependency. Remove the fontless override when its supported dependency chain resolves esbuild 0.28.1 or newer without it. Recheck every installed copy and GitHub alert state after removing either override.

Primary references: [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [UUID 11.1.1 exports](https://github.com/uuidjs/uuid/blob/v11.1.1/package.json), [esbuild advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).

## Still blocked on upstream releases

| GitHub alert | Current chain | Blocker and exposure |
| --- | --- | --- |
| [#4](https://github.com/inchidev/gitrew/security/dependabot/4) | Nuxt 4.6.1 → Nitro 2.13.4 → globby 16.2.4 / fast-glob 3.3.3 → micromatch 4.0.8 → braces 3.0.3 | No published patched version. The advisory concerns stack exhaustion from untrusted deeply nested brace patterns. Current usage is Node build/tooling; Gitrew's HTTP/chat APIs do not accept glob patterns for this dependency. Keep externally supplied patterns out of the build/tooling path. |
| [#3](https://github.com/inchidev/gitrew/security/dependabot/3) | Nuxt 4.6.1 → Nitro 2.13.4 → listhen 1.10.1 → node-forge 1.4.0 | No published patched version. Listhen uses forge for development HTTPS certificate/key handling. The advisory concerns RSA PKCS#1 v1.5 signature verification; no Gitrew request/auth path using that verifier was found. Current `npm run dev` binds to 127.0.0.1. |

The npm registry and GitHub advisories were checked directly. The listed owning packages are already their latest published releases. The braces maintainer disputes the advisory's practical use case; GitHub still lists it as high severity with no patch, so the alert remains open. Forge's proposed fix is not yet merged/released.

`tests/dependencies.test.ts` bundles the actual Worker entry and RealtimeKit browser SDK and checks their module graphs for `braces` and `node-forge`. Neither is included. Production serves static Nuxt assets with a separately bundled Worker; it does not run Nuxt/Nitro's development server. This limits the assessed deployment exposure but does not fix or dismiss the installed build dependencies. Reassess if SSR, a Node server, untrusted build globs or certificate verification is added.

After these fixes, local `npm audit --json` reports two underlying high-severity advisories propagated through 11 dependency entries, with no low/moderate findings. Its suggested forced Nuxt downgrade is not a verified fix for the current application; do not apply `npm audit fix --force` to clear the report. No advisory is ignored or dismissed, and no unreleased cryptography patch/fork is substituted.

Upstream follow-up: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [issue #70](https://github.com/micromatch/braces/issues/70); [forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [issue #1149](https://github.com/digitalbazaar/forge/issues/1149) and [proposed fix #1152](https://github.com/digitalbazaar/forge/pull/1152). Upgrade published fixes or the owning packages when available, rerun the required checks and confirm the alerts are resolved through a default-branch dependency scan.
