# BetweenUs engineering standards

## Ownership and delivery

- Sol implements code and tests. Astra manages scope and independently reviews the final change. Never self-approve; author and reviewer must be distinct agents or people.
- Start from a GitHub issue as the canonical implementation specification, with a concrete outcome and numbered acceptance criteria. Work from current `origin/main` in an isolated feature branch/worktree, then open a PR linking the issue. Do not push implementation directly to `main`.
- One writer per workspace. Parallel work needs explicit, non-overlapping file ownership and separate workspaces; do not switch another worker's branch or commit their unfinished files. Review from a clean checkout of the PR's latest head SHA.
- Keep changes focused. Prefer small, clear functions and existing Expo/React Native patterns. Add abstractions only for a demonstrated need. Fix the underlying cause without unrelated cleanup or speculative features.
- Before merge: independent review of the latest SHA, resolved blocking findings, and passing applicable CI on that SHA. New commits invalidate the previous review. These are team gates; do not claim GitHub branch protection enforces them unless verified.

## Specification before dependent implementation

- Read the current issue specification and inspect the relevant existing code, tests and contracts before planning a change. Repository/source evidence constrains interpretation of the issue; call out conflicts rather than silently changing the requested outcome.
- Keep the issue proportionate: problem, desired behavior/examples, scope and exclusions, numbered criteria (AC1, AC2, …), relevant constraints/contracts/data impact, verification and unresolved decisions. A simple fix needs only concise applicable details, not a full design document or every template section.
- Clarify material ambiguity before implementation that depends on it, especially money, navigation/state, identity, offline/network and saved-data behavior. Record non-blocking assumptions and continue independent work. Separate blocking decisions from optional preferences.
- Update the canonical issue before implementing material changes to scope, behavior or acceptance criteria. Keep useful rationale there; do not let a chat plan or PR silently replace the agreed specification.
- Map implementation and focused verification to the issue criteria in the PR. Astra reviews those criteria, evidence and remaining limitations on the latest SHA; a passing test suite alone does not establish the requested behavior.

## Mobile product quality

- Design for iOS and Android first. Respect safe areas, keyboard avoidance, small screens, scrolling and Android back behavior. Primary sections should use familiar, labelled bottom tabs; create/edit flows belong in sheets or routed screens. Preserve existing navigation outside an explicitly scoped UX change.
- Make controls accessible: useful labels and roles, visible focus, readable contrast, adequate touch targets, and clear loading, empty, validation and recovery states. Check screen-reader and text-size behavior when changing the relevant UI.
- Keep domain rules outside rendering. Use integer currency minor units, validate input at boundaries, preserve deterministic split remainders, and exclude the payer's own share from receivables. Prevent overpayment and retain correction history.
- Offline mode must remain usable without registration or network requests. Load account/auth code only after account-mode selection. Never upload or mix device-only records without an explicit user-authorized flow. Do not add pretend payment, notification or subscription success states.

## Data, dependencies and security

- Treat saved records as user data. Preserve schema/version compatibility or provide a tested, non-destructive migration. Never replace unreadable data silently. Publish changes only after durable writes succeed; test failure/retry and stale-request/account-switch paths when affected.
- Keep local ledger storage separate from auth secrets and demo data. Use the established SecureStore session adapter on native and document browser storage limits. Never commit `.env`, service-role keys, database credentials, tokens or private user records.
- Match native dependencies to the installed Expo SDK; check compatibility for dependency/native configuration changes. Explain upgrade and migration effects. Do not change dependencies merely to complete a documentation task.
- Use HTTPS for hosted APIs. UI checks do not replace API authorization. Real email, external writes, EAS builds and releases need authorization in the task; mocked tests must not contact production services.

## Evidence and handoff

- Run focused tests for the changed behavior, including meaningful failure cases. Do not add tests that merely repeat implementation details. CI currently runs `npm test`, `npm run typecheck`, `npm run export` and secret-free publishing bridge tests; see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and scoped smoke checks.
- Report commands, results and material gaps accurately. A web export or browser smoke is not native-device evidence. For mobile UI changes, record viewport and platform tested, and flag real-device verification still needed.
- Use [.agents/skills/review-pr/SKILL.md](.agents/skills/review-pr/SKILL.md) for independent review. Read it explicitly if skill auto-discovery is unavailable. PRs should explain behavior, why it changes, validation, and data/platform risks.
- Unattended issue dispatch and automatic agent execution/review are not configured. The [manual publishing bridge](docs/session-publishing.md) can publish already-completed session work through App identities; it does not run agents or establish independent review. CI runs checks, not agent dispatch. Merges, deployments and EAS builds remain separate authorized manual steps.
