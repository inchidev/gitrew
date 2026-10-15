# Contributing to Gitrew

Use a branch and pull request for changes to `main`. The upstream branch policy
requires the branch to be up to date, the GitHub Actions `check` job to pass, and
review conversations to be resolved. `check` is the job in the **Check client**
workflow; the workflow title itself is not the status-check context. The check is
bound to the GitHub Actions app so another integration cannot satisfy it.

Ordinary changes do not require a blanket approval. Changes to the auth,
credential, encryption, security, and review-policy paths listed in
`.github/CODEOWNERS` require an approving code-owner review. New commits dismiss
stale approvals. Administrators are subject to the same branch protection; force
pushes and deletion of `main` are disabled.

GitHub does not let a PR author approve their own PR. The current owner is
`@vnmtvlv`; another trusted collaborator with write access must be added to the
relevant CODEOWNERS entries before owner-authored changes to these paths can
complete the review requirement. Do not treat an AI review comment as a GitHub
approval or disable the policy to claim that a review passed.

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
payload. CODEOWNERS takes effect from the PR's base branch, so review enforcement
for these paths begins once the file is merged into `main`.
