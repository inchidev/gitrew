# Contributing to Gitrew

Use a branch and pull request for changes to `main`. The upstream branch policy
requires the branch to be up to date, the GitHub Actions `check` job to pass, and
review conversations to be resolved. `check` is the job in the **Check client**
workflow; the workflow title itself is not the status-check context. The check is
bound to the GitHub Actions app so another integration cannot satisfy it.

Gitrew currently has one maintainer, so approving reviews are optional for all
changes. The maintainer can merge their own PR after the required checks pass.
`.github/CODEOWNERS` identifies ownership of auth, credentials, encryption,
security, and review-policy paths and requests review where possible. It does
not create a mandatory approval gate. Administrators are subject to the same PR
and CI requirements; force pushes and deletion of `main` are disabled.

## Administration

`.github/main-protection.json` is the versioned payload for the upstream policy.
GitHub does not automatically apply it when the file is merged. An administrator
must apply it and read the settings back. First confirm the target repository:

```sh
gh api repos/inchidev/gitrew --jq '{full_name, default_branch, permissions}'
gh api --method PUT repos/inchidev/gitrew/branches/main/protection \
  --input .github/main-protection.json
gh api repos/inchidev/gitrew/branches/main/protection
gh api repos/inchidev/gitrew/codeowners/errors
```

For an independent installation, replace the repository and code owners with
your own. Recheck the actual CI job name and source app before applying the
payload. CODEOWNERS is read from the PR's base branch after it is merged into
`main`. Required code-owner approvals can be enabled later when another trusted
maintainer with write access is available.
