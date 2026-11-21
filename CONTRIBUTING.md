# Contributing to BetweenUs mobile

Read [AGENTS.md](AGENTS.md) before changing the repository. Sol implements; Astra manages scope and independently reviews. The [review playbook](.agents/skills/review-pr/SKILL.md) can be read directly even if your runner has no skill discovery.

## Issue to reviewed PR

1. Open or select an issue describing the user outcome, acceptance criteria and scope. Create an isolated branch/worktree from current `origin/main`; assign one writer to that workspace.
2. Implement only that issue, with focused evidence for behavior and failure cases. Keep unrelated local changes and credentials out of the branch.
3. Open a PR linking the issue (`Closes #<number>` when complete), explain the resulting behavior, and list checks plus limitations.
4. Get independent review of the latest head SHA and passing applicable CI. Resolve blocking findings, then repeat review for any new commits. Merge only after those manual team gates; do not push implementation directly to `main`.

CI currently runs on pushes and PRs. Unattended issue dispatch and automated agent review are **not configured**; branch protection is not established by these documents. Follow-up automation is tracked in [betweenus-api#2](https://github.com/RobMKR/betweenus-api/issues/2). The mobile UX redesign, including navigation work, is tracked separately in [mobile#2](https://github.com/RobMKR/betweenus-mobile/issues/2); standards are not permission to include that redesign in unrelated PRs. Deployments, EAS builds and publishing remain manual and require task authorization.

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
