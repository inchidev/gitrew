# GitHub security settings

Gitrew handles OAuth credentials and encrypted sessions. The upstream repository
uses secret scanning, secret scanning push protection, Dependabot alerts, and
Dependabot security updates. These are repository settings, not settings enabled
by cloning the source. Administrators of independent copies should enable them
where their GitHub plan and repository visibility support them.

The versioned `.github/dependabot.yml` checks npm dependencies and GitHub Actions
weekly. Minor and patch npm version updates are grouped; major updates remain
separate. This schedule is for version updates; security updates are enabled
separately in GitHub. Dependabot PRs must pass the normal checks before merging.

Node type declarations stay on the runtime's Node 24 major. TypeScript 7 version
updates are deferred because `vue-tsc` 3.3.13 fails to load its removed compiler
entry point (`typescript/lib/tsc`). Revisit these rules when upgrading Node or the
Vue typechecker; these compatibility exceptions do not disable dependency alerts.

See [dependency security status](dependency-security.md) for the reviewed UUID/esbuild overrides and the remaining braces/node-forge upstream blockers. Keep unresolved alerts visible; dependency scope in GitHub's graph is not a substitute for checking the actual deployed module graph.

## Configure and verify

In **Settings → Security → Advanced Security**, enable secret scanning and push
protection. Enable Dependabot alerts and security updates in the repository's
security settings. Do not enable paid security products just to match these
settings without checking the plan and cost.

For an administrator using GitHub CLI, replace `OWNER/REPO` with the intended
repository and verify it before changing settings:

```sh
gh api repos/OWNER/REPO --jq '{full_name, security_and_analysis}'
gh api --method PATCH repos/OWNER/REPO --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
gh api --method PUT repos/OWNER/REPO/vulnerability-alerts
gh api --method PUT repos/OWNER/REPO/automated-security-fixes
gh api repos/OWNER/REPO --jq .security_and_analysis
gh api repos/OWNER/REPO/vulnerability-alerts --silent
gh api repos/OWNER/REPO/automated-security-fixes
```

Expect enabled statuses for secret scanning, push protection, and Dependabot
security updates; the alerts endpoint returns HTTP 204 when enabled. After
merging the Dependabot configuration, check the repository's dependency graph and
Dependabot update jobs for configuration errors. Never push a real credential to
test push protection. If a credential is exposed, revoke or rotate it; deleting
the visible file does not revoke the credential.
