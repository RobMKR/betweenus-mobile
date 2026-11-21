---
name: Change or bug
about: Define the canonical implementation specification, scaled to the change
title: ""
---

This issue is the canonical specification. Keep simple fixes concise; omit unrelated sections or mark them not applicable. Inspect existing behavior before deciding what must change.

## Problem and desired behavior

What happens now, what should happen, and for whom? Include a concrete example or important failure case. For bugs, include reproduction steps and platform/version.

## Scope

What is included, and what is explicitly excluded?

## Acceptance criteria and verification

1. **AC1:** Observable result. **Verify:** focused check or evidence.
2. **AC2:** Add only if needed. **Verify:** check or evidence.

## Relevant constraints and contracts

Only when affected: navigation/screens and loading/empty/error/recovery states; safe areas, keyboard/back behavior and accessibility; offline/network boundaries; integer money rules; auth/API contracts; saved-data compatibility, migration or storage-failure handling. Do not include credentials or private user data.

## Unresolved decisions

Identify material blockers to clarify before dependent implementation. Record non-blocking assumptions separately. Write “none” if decisions are settled. Update this issue before implementing material scope or criterion changes.
