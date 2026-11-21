## Problem and resulting behavior

Explain the change against the canonical issue specification, including any scope changes already recorded there.

Closes #<issue>

## Acceptance criteria and evidence

Map each issue criterion to the change and actual check/result. For a small fix, one concise row or bullet is enough.

| Criterion | Implementation   | Verification/result and limitations         |
| --------- | ---------------- | ------------------------------------------- |
| AC1       | What fulfills it | Command, behavior evidence or remaining gap |

For UI, name the platform, viewport/device and OS actually tested. State remaining real-device checks; browser tests do not establish native behavior. Separate checks run from checks planned.

## Relevant impact and decisions

Describe affected UX/states/accessibility, offline/network, money/auth/API or saved-data compatibility and recovery; include dependency/native impact only when relevant. Omit unrelated detail. Link resolved scope decisions in the issue and state any remaining material blockers or non-blocking assumptions.

## Review handoff

- Independent reviewer: <!-- Astra; distinct from Sol, the author -->
- Latest head SHA and CI: <!-- reviewer verifies immediately before merge -->
- Remaining limitations or unresolved findings:

Use [the review playbook](https://github.com/betweenus-tech/betweenus-mobile/blob/main/.agents/skills/review-pr/SKILL.md). Review against the issue criteria, not just a passing suite. New commits require review of the new head. Merge only after blocking findings are resolved and applicable CI passes; deployment remains a separate manual action.
