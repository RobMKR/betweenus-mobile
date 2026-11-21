# Publish session work through GitHub Apps

This bridge publishes work that Sol and Astra have **already performed in a session**. A maintainer manually dispatches it on the repository's default branch. It does not run an AI model, use an AI API key, incur AI API billing, pick up issues unattended, generate a review, merge, build a mobile binary, or deploy anything.

Sol still implements and tests in an isolated issue branch; Astra independently reviews the latest SHA using [the review playbook](../.agents/skills/review-pr/SKILL.md). An App identity publishing a PR or supplied review is not evidence that an agent independently performed that work. Keep the actual session evidence and reviewer attribution in the submitted text.

## Setup and trust boundary

The workflow is `.github/workflows/session-bridge.yml`; its Node module and dependency-free tests live in `.github/bridge/`. It must be merged into the default branch before its normal manual dispatch is available. Dispatch from that branch only. Repository maintainers initiate actions; untrusted branches, forks and PR comments are not execution triggers.

The bridge uses four repository GitHub App secrets: `WORKER_APP_ID`, `WORKER_APP_PRIVATE_KEY`, `REVIEWER_APP_ID` and `REVIEWER_APP_PRIVATE_KEY`, not an AI provider key. Keep App private keys and minted tokens out of commits, issue/PR text, workflow inputs and logs. Tokens are scoped to this repository and only the selected publishing action. Do not change App permissions or repository rules just to bypass a failure. Missing configuration or insufficient installation permissions must fail visibly.

The trusted default-branch script reads structured inputs rather than executing supplied branch code or interpolating user text into a shell. The issue branch must already be pushed to this repository. Expected SHAs prevent silently publishing a different revision; if a branch or PR changes, inspect it and supply the new SHA after the appropriate session review.

## Commit and review attribution

Keep the actual author on commits: Sol authors implementation and tests; Astra supplies the independently performed review. A local agent attribution such as `Sol <sol@betweenus.invalid>` is an explicit label, not a verified GitHub bot account. Do not fabricate a bot numeric ID, reuse the user's identity as the agent, or imply a commit is verified. The Worker publishing an existing branch does not rewrite its commits. App identity and the human/agent work it publishes are separate facts.

## Manual actions

Use **Actions → Session agent publishing bridge → Run workflow**, selecting the default branch. The same workflow can be dispatched with `gh workflow run`; never put a private key or token in its arguments. Input names and action-specific requirements are defined in the workflow.

- **auth-check** validates the configured App identities and repository access. It does not create a PR or review. Run this after initial installation/setup.
- **create-pr** uses the Worker to publish an already-pushed issue branch. Supply the branch, its expected full commit SHA, linked issue number, title and actual PR description. Do not use this to upload unfinished workspace files or claim tests that were not run.
- **review** uses the Reviewer to post Astra's real supplied review text and disposition to a PR at the expected head SHA. The review must name the actual independent reviewer and evidence. A successful post does not authorize merging; the latest SHA and applicable checks still need to meet the team's review gates.

After any dispatch, inspect the workflow result and the resulting PR/review on GitHub. If the expected SHA is stale, checks are missing/incomplete, identity verification fails, or the bridge refuses a sensitive change, stop and resolve the stated condition. Do not weaken a guard, invent a bot identity or turn an incomplete review into approval. Changes to the publishing workflow and its trust/provisioning files require human handling rather than self-approval through this bridge.

## Local checks and limitations

```sh
node --test --test-isolation=none .github/bridge/session-bridge.test.mjs
```

The workflow and bridge module/tests are shared with the API repository; keep shared fixes and tests synchronized rather than independently forking their behavior. Tests use mocked GitHub responses and no App secrets. CI runs this separately from the existing mobile tests/typecheck/web export. Passing unit tests does not prove the live secrets, App installation or Actions permissions work. Live auth-check and any publishing action must be reported separately as performed or not performed.

Unattended issue dispatch and automatic agent execution/review remain unconfigured. Branch protection and required-review rules are not installed by this PR. Publishing, merge decisions, EAS builds and backend deployments remain separate authorized manual steps. This issue does not alter mobile behavior, dependencies, stored records or HTML hosting.
