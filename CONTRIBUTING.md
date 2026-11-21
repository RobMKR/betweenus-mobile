# Contributing to BetweenUs mobile

Read [AGENTS.md](AGENTS.md) before changing the repository. Sol implements; Astra manages scope and independently reviews. The [review playbook](.agents/skills/review-pr/SKILL.md) can be read directly even if your runner has no skill discovery.

## Write the issue specification

The development issue is the canonical implementation specification. Before dependent implementation, inspect the existing code, tests and contracts and capture the applicable details:

- The user problem, desired behavior and examples (including important failure behavior).
- Scope and exclusions, with observable numbered acceptance criteria: AC1, AC2, and so on.
- Relevant constraints and contracts: mobile navigation/screens/states, accessibility, offline/network boundaries, integer money rules, auth/API compatibility, saved-data versions/migrations and recovery. Omit unrelated items.
- How each criterion will be verified, and unresolved decisions marked blocking or non-blocking with any explicit assumptions.

Scale this to risk. A simple fix can fit in a short problem statement, expected result, AC1 and a check. Use the [issue template](.github/ISSUE_TEMPLATE/change.md) as a prompt, not a demand to fill every section. For example, a split fix might specify: “AC1: AED630 divided among14 including the payer produces AED45 per share and AED585 receivable; verify the domain calculation and the affected display.” A redesign needs the relevant navigation/state/accessibility expectations before dependent UI work, not speculative architecture.

Source evidence constrains interpretation. Clarify conflicts and material unknowns before the implementation that depends on them; continue independent work with documented non-blocking assumptions. If scope, behavior or criteria materially change, update the issue before implementing that change. An implementation plan describes execution, not new requirements. Do not silently move the specification into a chat plan or PR.

## Issue to reviewed PR

1. Select the issue and confirm its applicable specification is sufficient. Create an isolated branch/worktree from current `origin/main`; assign one writer to that workspace.
2. Implement the agreed criteria with focused behavior/failure-case evidence. Keep unrelated changes and credentials out of the branch; update the issue first if material scope changes.
3. Prepare a PR linking the canonical issue (`Closes #<number>` when complete). Map each criterion to its implementation and actual verification result using the [PR template](.github/pull_request_template.md), including gaps and platform limitations. Use the Worker publishing bridge for session work; preserve truthful Sol attribution.
4. Astra independently reviews the latest head SHA against the issue, the diff and evidence. Resolve blocking findings and pass applicable CI, then repeat review for new commits. Merge only after those manual team gates; do not push implementation directly to `main`.

The [manual session publishing bridge](docs/session-publishing.md) publishes already-pushed Sol work and supplied real Astra reviews through App identities. It does not execute AI models, create an unattended dispatcher, merge, or deploy. CI currently runs on pushes and PRs. Unattended issue dispatch and automated agent execution/review are **not configured**; branch protection is not established by these documents. Follow-up automation is tracked in [betweenus-api#2](https://github.com/betweenus-tech/betweenus-api/issues/2). The mobile UX redesign, including navigation work, is tracked separately in [mobile#2](https://github.com/betweenus-tech/betweenus-mobile/issues/2); standards are not permission to include that redesign in unrelated PRs. Deployments, EAS builds and publishing remain manual and require task authorization.

## Verification

Use Node24 LTS (24.3.0 or newer within the 24.x release line) and install the committed lockfile:

```sh
npm ci
npm test
npm run typecheck
npm run export
```

These are the current CI checks, not evidence of native-device behavior. For documentation-only work, verify links, documented commands and formatting; do not add runtime tests just for prose. Dependency/native changes should also run `npx expo install --check` and report compatibility findings without silently bundling unrelated upgrades.

Use the relevant smoke test for affected behavior; see the [README verification section](README.md#verification) for all prerequisites:

| Scope                        | Prepare and serve                                                                                                                                                              | Verify                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Offline ledger/vaults        | `npm run export:offline-test`, then `python3 -m http.server 8083 --directory dist-offline` in another terminal                                                                 | `npm run test:offline-browser` |
| Email auth/session isolation | `npm run export:auth-test`, then `python3 -m http.server 8082 --directory dist-auth` in another terminal                                                                       | `npm run test:auth-browser`    |
| Shared local demo            | Start `betweenus-api` with `npm run dev:demo`; set `EXPO_PUBLIC_API_URL=http://localhost:3001`; run `npm run export:demo`, then `python3 -m http.server 8081 --directory dist` | `npm run test:smoke`           |

Browser smoke scripts require Chromium at `/usr/bin/chromium`, or an appropriate executable supplied through `CHROMIUM_PATH`. Auth traffic is mocked and offline tests block external requests. The shared demo creates ephemeral API records; do not point it at a production service. Build-time environment values must match each test's documented configuration.

For mobile UI, verify safe areas, small-screen layout, keyboard/scroll/back handling, touch targets, labels/contrast and relevant text-size behavior. Record the actual iOS/Android device or simulator and OS used. If only browser testing was possible, state the remaining device check in the PR. Keep domain/storage tests focused on invariants and failure recovery rather than rendering details.
