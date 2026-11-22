# BetweenUs mobile

Expo Router + React Native + TypeScript app for iOS, Android and a web preview. A restrained shared-debt record for friends and family. Pairs with the independent `betweenus-api` repository.

## Spec-driven development

**The development issue is the canonical implementation specification.** Work moves from issue/spec → isolated issue branch/worktree → independent latest-head review → passing applicable CI → authorized merge. State the problem, desired behavior and useful examples, scope, numbered acceptance criteria (AC1, AC2, …), relevant constraints/contracts, verification and unresolved decisions before dependent implementation. Scale detail to risk: a small fix can be a few lines with one criterion and a check; unused sections can be omitted or marked not applicable.

Sol inspects the existing repository and resolves material ambiguity before the work that depends on it. Repository/source evidence constrains interpretation. Record non-blocking assumptions and continue independent work; do not silently invent product or data behavior. If scope or acceptance criteria materially change, update the issue before implementing the change. The PR maps each criterion to the change and actual verification evidence; Astra independently reviews the latest SHA against that issue and applicable CI.

For bugs, including defects found during implementation/review: report to Astra → Astra immediately files one issue per distinct bug (or links an exact duplicate) → delegates Sol to independently investigate/fix → Sol opens the linked PR → Astra reviews → Sol resolves comments → Astra re-reviews the latest head, approves and merges after passing CI and authorization. Filing records symptoms and expected behavior, not an unverified prescribed cause; optional missing details do not delay it. See the [seven-step bug lifecycle](AGENTS.md#bug-report-to-merge).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the practical workflow, the [issue template](.github/ISSUE_TEMPLATE/change.md), [PR template](.github/pull_request_template.md), [AGENTS.md](AGENTS.md) and the [review playbook](.agents/skills/review-pr/SKILL.md). The [manual App publishing bridge](docs/session-publishing.md) posts completed session work without AI API execution or billing. Unattended dispatch/agent review is not configured; deployments remain manual.

## Mobile navigation

After choosing a mode (and signing in for an account), **Home**, **People**, **Vaults** and **Settings** stay in a labelled bottom bar. Home shows balances, recent records and creation shortcuts. People opens personal/counterparty records without merging the underlying debts. Vaults keeps private event expenses, rosters and repayments together in either mode. Settings holds mode/storage information and mode-switch/sign-out controls.

Tapping People or Vaults opens that tab’s root page, including when it is already selected. Home retains its selected detail during the session. Labelled back controls return to its parent; Android back handles in-app details. Entry forms use keyboard-aware sheets. Offline People groups names after Unicode/case/whitespace normalization; this is a local display grouping, not verified identity or cross-vault reconciliation. Account tabs stay within the signed-in identity; pending and disputed requests remain separate from confirmed balances.

## Free offline mode

Use Node24 LTS (24.3.0 or newer within the 24.x release line), run `npm ci`, then `npm run web` (or `npm run ios` / `npm run android` with a configured simulator). Choose **Use offline — free** on the first launch. No environment variables, backend, account, email or registration are needed. The selected mode is remembered on this device; **Switch mode** returns to the choice. Account code is lazy-loaded only after choosing account mode, so entering offline mode does not restore Supabase sessions or make auth/API requests. Existing offline data is never automatically transferred into account mode.

- Personal records use names, lend/borrow direction, date, note and AED amounts in integer minor units.
- Record partial or full repayments, reject overpayments, and undo a payment with a preserved correction history.
- Temporary vaults keep one or more event expenses. Vaults can keep an explicit reusable roster selected from saved People; adding a custom/selected phone contact saves that person separately before selection. Permanent vaults provide a reusable home for recurring events, with the previous roster carried into the next form.
- Event creation uses the native iOS/Android date picker, defaulted to local today, with a browser date input in the web preview. Dates stay calendar-only strings; vaults remain date-free containers.
- Guided event creation has Details, People and Split/review steps. Select any roster members, other saved People or a newly saved person; Include me controls your participation independently of the payer. Equal splits assign remainder cents in selected order. Manual shares use integer minor units and must exactly match the total; changing people/amount preserves entered values and requires explicit reconciliation.
- You can pay without participating (your share is zero). Any other payer must be a selected participant. The payer covers their own share; only your remaining share is payable when someone else pays.
- Football AED630 shared by14 including you is AED45 each. If you paid, the other13 owe AED585. When someone else paid, only your remaining share is included in your payable balance.
- Archive/reactivate vaults without deletion. Archived unpaid amounts remain in your overview.

Storage is local AsyncStorage on native devices and browser localStorage on web. Local ledger data is not encrypted by this app. BetweenUs does not upload it or send reminders. There is no export/backup function yet: uninstalling, clearing data, changing browser, or losing the device can lose records. OS-level backups depend on your device settings. Failed writes show an error and do not publish unsaved changes; unreadable saved data is not silently replaced. Web preview assets still require the local preview server; no service worker is installed for cold-start offline browser use. Installed native runtime has not yet been exercised on a physical device.

### Saved People and selected phone contacts

People now has a primary **Add person** action in both modes. Save a custom name with optional email/phone, or choose one phone contact and explicitly select at most one email and phone. Contacts permission is requested only after tapping **Choose phone contact**. Denied, cancelled and unavailable access leaves custom entry usable; web uses that fallback. The app never enumerates the address book, saves native contact IDs/photos, or sends invitations. Contact details are unverified; account debt creation only prefills an email for review and keeps the existing confirmation workflow.

Offline saved people have stable IDs. New debts can explicitly reference them; duplicate names remain separate. Earlier name-only records stay under **Earlier name groups** and are never linked by name. Ledger versions 1 and 2 load through a non-destructive version 3 migration, written only on the next successful save. Existing equal-event bytes and balances keep their original meaning; new events persist split mode and immutable name/share snapshots. After a successful version3 write, older version2 app binaries cannot read that ledger; there is no automatic downgrade. Keep the compatible app version when retaining these device records. Failed storage writes retain the old durable data. Account people use owner-private `GET/POST /v1/people`; they are separate from device records and cleared from views on identity changes. There is no automatic upload, edit/delete-person operation, or verified contact-to-account association.

`expo-contacts` **58.0.11** matches Expo58.0.25's bundled dependency range. SDK58's selected-contact API is used, with only selected name/email/phone fields retained. The config plugin supplies the iOS permission description; custom Android binaries explicitly remove `WRITE_CONTACTS` because this app only reads selected details. Expo Go uses its own host permissions. Existing custom binaries need rebuilding after adding this native module. Mocked permission tests and iOS/Android JS exports do not establish physical-device permission/picker behavior; verify granted/limited/denied/cancelled flows on devices before release.

### Event date picker compatibility

`@react-native-community/datetimepicker` is pinned to **9.2.1**, the version selected by `npx expo install` and listed in Expo58.0.25's installed `bundledNativeModules.json`. The package's [Expo users guidance](https://github.com/react-native-datetimepicker/datetimepicker#expo-users-notice) states it is included in Expo Go. Use an Expo Go version supporting this SDK; this standard picker needs no custom Expo Go binary. Existing custom development clients/native binaries need a rebuild after adding the native module. No build is submitted by installing it. No custom native styling/config plugin is required here.

On iOS, choose a draft date and use **Use date**, or **Cancel** to keep the prior value. Android uses the native dialog's confirm/dismiss actions. Neither action submits the event. Event strings remain `YYYY-MM-DD`, using local calendar parts and local-noon picker values rather than UTC serialization. Other date fields and stored events are unchanged.

Compatibility checks: `npx expo install --check @react-native-community/datetimepicker` passes. The full dependency check still reports the pre-existing React/React DOM19.3.1 versus Expo-expected19.3.0 warning; that unrelated baseline is not changed by this feature. Browser tests and native JS bundles are not physical iPhone/Android picker verification.

### Vault rosters in both modes

Create a title-only temporary/permanent vault, choose zero to100 saved people, then use **Manage members** to update its roster. Identical names stay separate by ID; selecting a member does not contact them or grant account access. New custom/contact-derived people remain in People even if the vault form is cancelled. The owner is implicit; Include me and the payer are chosen separately in the guided event flow. Earlier device vaults have no inferred roster: configuring one preserves every saved event participant, share and repayment.

Account Vaults uses owner-private `/v1/vaults` and idempotent member add/remove routes from the companion API. Device vaults remain separate. A multi-member save can partially succeed server-side; the draft retains the desired selection and retry completes the remaining changes. Vault creation itself is not idempotent: after an interrupted response, close the draft and refresh the list before creating again. The account event ledger supports equal/manual splits, partial/full payments, undo history and archive/reactivation through the companion API event routes. Private vault balances (including archived unpaid events) are shown separately from borrower-confirmed shared-debt balances. No paid/free gating is added.

## Shared account mode and local API demo

Choose **Use account mode** for the existing email sign-in and shared confirmation workflow. It requires a configured Supabase project and authenticated API. It does not synchronize offline records. No subscription or billing system is implemented; account pricing is not committed here.

Shared account records have pending, confirmed and needs-resolution states. Only confirmed shared debts count in account balances; the named borrower can confirm or dispute with a reason. Repayment of confirmed shared-debt principal, invitation delivery, notifications, editing and dispute closure are not implemented. Private vault-event repayments are recorded in both modes and never send messages or move money.

For the existing API demo, explicitly set `EXPO_PUBLIC_DEMO_MODE=true` and start the backend's `npm run dev:demo` loopback-only ephemeral server at localhost:3001. This opens the labelled Alex/John persona demo directly. Use `npm run export:demo` for an explicitly named demo build. Real-mode exports force demo mode off. Do not expose the demo API on a LAN or public network. Physical devices using shared account mode require a reachable authenticated HTTPS API. Match backend CORS to the web preview origin (localhost:8081 by default). Restart Expo after changing environment variables.

## Authentication and release boundary

Set `EXPO_PUBLIC_DEMO_MODE=false` for real accounts (the default when absent). Configure the public `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; missing configuration shows a setup message. Email sign-in requests a numeric code and verifies it with Supabase; no deep-link callback or password is required. The same flow creates an account for a new email when project signups are enabled. There is no manual access-token entry. Google and Apple sign-in are future work.

Native sessions persist through Expo SecureStore in Unicode-safe chunks of at most 1,800 UTF-8 bytes. A manifest commits only after every chunk is stored; old chunks are removed on replacement and sign-out. Sessions over the bounded storage capacity are rejected. Native refresh pauses in the background and resumes while active. Web sessions use browser localStorage (accessible to scripts on the same origin); use HTTPS and keep hosted dependencies and script injection tightly controlled. Sign-out is local to this device, immediately clears account views, and blocks stale refresh callbacks until a new explicit sign-in succeeds. In-flight debt responses cannot populate another account's screen.

Configure a real HTTPS `EXPO_PUBLIC_API_URL` backed by the same Supabase project. Until that API exists, authentication can work but debt operations cannot. The locally configured `.invalid` API placeholder deliberately shows connection errors rather than silently substituting a demo backend. The API accepts the signed-in user's access token and must validate it independently. Never put a Supabase secret/service-role key or database URL in client variables.

### Supabase email setup

In Supabase Authentication, enable Email and allow new users if desired. Edit the **Magic Link** email template to include the numeric `{{ .Token }}` variable, for example `Your BetweenUs sign-in code is {{ .Token }}`. Do not use only `{{ .ConfirmationURL }}`: this client expects a code, not a link. New-account confirmation emails should also include `{{ .Token }}`; keep the project's OTP length within the supported 6–10 numeric digits. Configure expiry and rate limits in Supabase. The UI shows wrong/expired code and rate-limit errors and supports resend or changing email.

Supabase's default mail service is restricted (often only authorized organization/team recipients and low rate limits). Configure a verified custom SMTP provider and sender for a real pilot, and check deliverability before inviting users. No test here sends real email. Public project URL and publishable key belong in Expo environment variables; the provider's SMTP credentials stay in Supabase.

### EAS builds

`eas.json` contains development, internal preview, and production profiles; `expo-dev-client` supports the development profile. Preview and production force demo mode off. Project owner is `RobMKR`; no EAS project ID or signing credentials are guessed. After authenticating the Expo CLI, run `eas init` to link the intended project, configure the three public client variables and authenticated API URL in each EAS environment, then use `eas build --profile preview --platform android` (or the required platform/profile). Native signing, EAS project linking and store submission still require account setup; no build has been submitted.

Do not enable demo auth on a public production backend. Client build flags are not a security boundary. The API must reject demo authentication outside its explicitly configured local environment. Use HTTPS for a hosted API. Native release signing and store deployment are not configured.

## Verification

```sh
npm test
npm run typecheck
npm run export
```

Production export refuses an explicitly enabled demo flag. For the local browser smoke, run `npm run export:demo`, serve `dist` on localhost:8081, start the local-demo API, and run `npm run test:smoke` (requires Chromium at `/usr/bin/chromium`, or set `CHROMIUM_PATH`). The smoke creates two ephemeral demo debts, confirms one, disputes the other, and saves a screenshot to `/tmp/betweenus-mobile-overview.png`.

`npm run export:auth-test` builds a fake-configuration web bundle into `dist-auth`; serve it on localhost:8082 and run `npm run test:auth-browser`. Every auth and API request is intercepted. It tests wrong codes, success, persistence, expired-session refresh, failed-signout stale-refresh isolation, and an old account request completing after a new account signs in. This sends no real email.

`npm run export:offline-test` creates `dist-offline` with fake account configuration. Serve it on localhost:8083, then run `npm run test:offline-browser`. This blocks every external request, seeds a dormant account session, and verifies no auth requests; football630/14→585, overpayment rejection, partial/full payments, undo, reload persistence, archive/reactivation, multiple permanent events, and a personal borrowing repayment. Only local preview assets remain reachable. The four-tab smoke also checks local name grouping, separate directions, People and Vaults root taps and detail back, storage-write failure/retry, mode switching and 320/430px layouts. Screenshots are saved under `/tmp/betweenus-tabs-home-320.png`, `/tmp/betweenus-tabs-home-430.png`, `/tmp/betweenus-tabs-people.png`, `/tmp/betweenus-tabs-event.png` and `/tmp/betweenus-tabs-settings.png`.

For focused event-date web checks, serve `dist-offline` on localhost:8094 after `npm run export:offline-test`, then run `node scripts/event-date-smoke.cjs` (or set `EVENT_DATE_TEST_URL`). It checks local-day defaults near UTC midnight, the browser date fallback, dismissal, date persistence and320/430px layouts. Unit tests also cover date-only roundtrips across timezones/DST and unchanged legacy events.

CI repeats unit tests (auth, money/split drafts, storage/migrations, People/rosters and retry intents), type checking and a production web bundle. A web bundle does not verify iOS/Android device behavior. Exercise the two-person flow above on both device platforms before a pilot release.

For saved People checks, serve `dist-offline` on localhost:8095 and `dist-auth` on localhost:8096 after their test exports, then run `node scripts/people-smoke.cjs`. The intercepted browser flow covers version-1 preservation/migration, failed-write retry, duplicate names and explicit debt links, account creation/email prefill, directory failure/retry, stale-account response isolation and 320/430px layouts. No real contacts or emails are used. Screenshots: `/tmp/betweenus-saved-people-320.png`, `/tmp/betweenus-saved-people-430.png`, `/tmp/betweenus-saved-people-account.png`.

For vault roster checks, serve `dist-offline` on localhost:8097 and `dist-auth` on localhost:8098 after their test exports, then run `node scripts/roster-smoke.cjs`. It exercises duplicate-name IDs, custom entry inside a vault draft, membership removal/reload, legacy event preservation, failed local writes and partial account-save retry with mocked API responses. Screenshots are saved under `/tmp/betweenus-roster-offline-320.png`, `/tmp/betweenus-roster-offline-430.png` and `/tmp/betweenus-roster-account.png`. Android detail-back is implemented; physical-device keyboard/back and screen-reader behavior remain unverified.

### Guided events, retries and release requirements

New events store participant names/shares as snapshots; changing a vault roster never rewrites an expense. Both modes allow partial/full payments and append-only undo history, reject overpayment, and keep archived unpaid balances. The current payment sheet supports amount entry and a full-remaining shortcut; the separately tracked payment-toggle request is not implemented here.

Web account writes need a secure origin (HTTPS or localhost) for WebCrypto UUID generation. Account money writes generate UUID intent IDs with Expo Crypto58.0.8, the installed Expo58.0.25-compatible bundled version. An interrupted expense or payment keeps its request and UUID through sheet closure, ledger refresh and in-app navigation. Retry the original request to confirm an existing save or finish saving it, then start a new expense or payment with a fresh UUID. An unchanged undo retry also retains its UUID. Restarting the app or reloading the browser page clears this in-memory recovery state. Inspect the saved ledger before repeating a write that was interrupted by a restart. Account events remain owner-private records, not invitations or borrower-confirmed debts.

The companion API must support People/vault routes plus the account-event contract and additive migrations002/003 before these account operations can succeed. This mobile change does not deploy that server, migrate a production database, send email, or submit an EAS build. Expo Crypto adds a native module: existing custom development clients need rebuilding; use an Expo Go build supporting the matching SDK. Compatibility checks and iOS/Android JavaScript exports passed; physical-device date picker, permission, keyboard/back and screen-reader behavior still require testing. The existing React/React DOM version warning is unchanged.

Serve the test exports on localhost:8099 (`dist-offline`) and8100 (`dist-auth`) for the new checks:

```sh
node scripts/wizard-smoke.cjs
# In a separate companion API checkout with its dependencies installed:
DEMO_MODE=true HOST=127.0.0.1 PORT=3002 npm run dev:demo
# Run in this mobile checkout against that fresh ephemeral API:
node scripts/wizard-account-smoke.cjs
```

The offline script blocks external requests and verifies Back/Next/draft preservation, manual allocation reconciliation, explicit payer/Include me, custom saved participants, v2→v3 failure/retry preservation, repayment/undo/reload and archived totals. The account script mocks auth and proxies ledger requests to a real loopback **local-demo/ephemeral-memory** API, checked before creating sample records. It loses successful event/payment/undo responses, checks reconciliation through cancellation, refresh and navigation, and verifies unchanged retries keep their UUIDs while genuinely new identical saves receive fresh ones. It also covers failure before payment commit, equal/manual splits, custom participants, archive/reload, separate balances and stale-owner isolation. Use a fresh demo process per full run to reset sample records and normal API rate limits. No production API or real email is used. Browser screenshots: `/tmp/betweenus-wizard-manual-320.png`, `/tmp/betweenus-wizard-manual-430.png`, `/tmp/betweenus-wizard-account-320.png`, `/tmp/betweenus-wizard-account-430.png`.
