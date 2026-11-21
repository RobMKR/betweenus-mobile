---
name: review-pr
description: Independently review a BetweenUs mobile PR against its issue, latest commit, CI, native UX and data-integrity requirements before merge.
---

# Review a pull request

Use this procedure when asked to review a BetweenUs mobile PR. This is a repository playbook; runners that do not discover skills must read this file explicitly. It does not schedule work or create an automatic reviewer.

For each distinct bug discovered in review, Astra immediately files an issue before delegating investigation or implementation to Sol, or links an existing exact duplicate. Capture observed symptoms, available reproduction, expected/actual behavior, platform/context and acceptance criteria; keep unknowns explicit and do not wait for optional details. Do not prescribe an unverified root cause or implementation. Corrections for the already-tracked bug stay with its issue. Sol independently investigates and resolves comments; Astra re-reviews the latest head before approving and performing an authorized merge after CI. Never silently fix code as the reviewer or treat session delegation as an autonomous runner/Sol GitHub account.

1. **Establish independence and scope.** Astra reviews Sol's implementation in a separate, clean workspace. Do not review your own authorship as independent approval. Read `AGENTS.md`, the linked issue, acceptance criteria and PR description. Identify platform, persistence and security implications before reading the implementation.
2. **Pin the latest revision.** Read the PR's current head SHA and base branch. Fetch that exact commit, inspect the complete base-to-head diff, affected callers and relevant existing tests. Record the SHA in the review. Do not rely solely on a summary, an earlier review or generated screenshots.
3. **Check behavior and risks.** Trace user actions and failure paths. For relevant changes, check integer money/splits, participant identity, repayment/undo history, archived balances, offline/no-network behavior, persistence failures and schema migrations, auth/logout/account isolation, input handling, and dependency compatibility with Expo. Check safe areas, keyboard/scroll/back behavior, accessibility and expected mobile navigation. Review scope and maintainability; avoid speculative objections.
4. **Verify evidence and CI.** Inspect the actual checks on this SHA. CI currently runs unit tests, type checking and a production web export. Run focused reproduction or regression checks where needed; compare evidence to acceptance criteria. Identify whether screenshots/tests came from a browser, simulator or physical device. Never describe browser evidence as device testing. Explain an unavailable relevant check rather than inventing a pass. Documentation-only changes need accurate links/commands and format checks, not new runtime tests.
5. **Report actionable findings.** Give each finding a severity, exact `path:line`, concrete trigger, user impact and source-supported correction direction; label hypotheses and never prescribe an unverified diagnosis. Use P0 for immediate critical exposure/data loss, P1 for serious security or core-flow breakage, P2 for a material correctness/regression issue, P3 for a minor optional improvement. State uncertainty and reproduction evidence. Keep optional preferences separate from blockers.
6. **Resolve and re-review.** Return fixes to Sol; do not silently edit the author's workspace or approve before fixes land. After any commit, read the new head SHA, changed diff and relevant checks, then review that revision. P0–P2 findings and unmet acceptance criteria block merge; optional P3 suggestions do not by themselves block it.
7. **Give a final disposition.** State `approve`, `request changes` or `review incomplete`, the exact reviewed SHA, validation evidence, remaining limitations and any unresolved findings. Immediately before merge, confirm the PR head still matches and applicable CI has passed. GitHub may prohibit same-account formal approval for distinct agents; record the independent review as a PR comment in that case. Do not present a manual team gate as configured branch protection. Astra approves and merges only when authorized and all gates are satisfied.

Useful GitHub CLI commands (replace placeholders with the actual PR/repository):

```sh
gh pr view <number> --repo betweenus-tech/betweenus-mobile --json headRefOid,baseRefName,body,files,url
gh pr diff <number> --repo betweenus-tech/betweenus-mobile
gh pr checks <number> --repo betweenus-tech/betweenus-mobile
```

The existing manual publishing bridge is tracked in [betweenus-api#2](https://github.com/betweenus-tech/betweenus-api/issues/2). Do not create credentials, change repository rules or deploy as a side effect of review.
