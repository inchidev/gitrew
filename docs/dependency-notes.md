# Dependency notes — 2026-10-14

The client uses current Nuxt 4 and Nuxt UI releases. TypeScript 5.9.3 is pinned
because the installed vue-tsc release does not support TypeScript 7's package
exports. This is verified by the typecheck, not an inferred compatibility claim.

`npm audit` reports upstream build-tool findings in node-forge (via Nitro's local
HTTPS tooling), braces (glob parsing), and a nested esbuild Windows development
server version. Several additional package warnings inherit those findings.
The latest published node-forge and braces versions still fall within their
advisory ranges; automatic forced fixes propose downgrading Nuxt. No forced
downgrade or unreviewed dependency substitution is applied.

The deployed Pages output is static. Nitro/listhen's HTTPS server, RSA processing,
glob parsing and esbuild development server are not deployed with it. Keep build
inputs trusted and the development server bound to localhost. The separate OAuth
Worker bundles only its own code and a small validation contract; it has no npm
runtime dependency. These boundaries do not mean the upstream audit is clean.

Upstream advisories:

- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-g7r4-m6w7-qqqr
