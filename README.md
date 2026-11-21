# BetweenUs mobile

Expo Router + React Native + TypeScript app for iOS, Android and a web preview. A restrained shared-debt record for friends and family. Pairs with the independent `betweenus-api` repository.

## Spec-driven development

**The development issue is the canonical implementation specification.** Work moves from issue/spec → isolated issue branch/worktree → independent latest-head review → passing applicable CI → authorized merge. State the problem, desired behavior and useful examples, scope, numbered acceptance criteria (AC1, AC2, …), relevant constraints/contracts, verification and unresolved decisions before dependent implementation. Scale detail to risk: a small fix can be a few lines with one criterion and a check; unused sections can be omitted or marked not applicable.

Sol inspects the existing repository and resolves material ambiguity before the work that depends on it. Repository/source evidence constrains interpretation. Record non-blocking assumptions and continue independent work; do not silently invent product or data behavior. If scope or acceptance criteria materially change, update the issue before implementing the change. The PR maps each criterion to the change and actual verification evidence; Astra independently reviews the latest SHA against that issue and applicable CI.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the practical workflow, the [issue template](.github/ISSUE_TEMPLATE/change.md), [PR template](.github/pull_request_template.md), [AGENTS.md](AGENTS.md) and the [review playbook](.agents/skills/review-pr/SKILL.md). The [manual App publishing bridge](docs/session-publishing.md) posts completed session work without AI API execution or billing. Unattended dispatch/agent review is not configured; deployments remain manual.

## Free offline mode

Use Node24 LTS (24.3.0 or newer within the 24.x release line), run `npm ci`, then `npm run web` (or `npm run ios` / `npm run android` with a configured simulator). Choose **Use offline — free** on the first launch. No environment variables, backend, account, email or registration are needed. The selected mode is remembered on this device; **Switch mode** returns to the choice. Account code is lazy-loaded only after choosing account mode, so entering offline mode does not restore Supabase sessions or make auth/API requests. Existing offline data is never automatically transferred into account mode.

- Personal records use names, lend/borrow direction, date, note and AED amounts in integer minor units.
- Record partial or full repayments, reject overpayments, and undo a payment with a preserved correction history.
- Temporary vaults keep one or more event expenses. Permanent vaults provide a reusable home for recurring events, with the previous roster carried into the next form.
- Each event has its own date, total, participants, a selected self participant and payer. Equal splits assign remainder cents to participants in saved order. The payer covers their own share.
- Football AED630 shared by14 including you is AED45 each. If you paid, the other13 owe AED585. When someone else paid, only your remaining share is included in your payable balance.
- Archive/reactivate vaults without deletion. Archived unpaid amounts remain in your overview.

Storage is local AsyncStorage on native devices and browser localStorage on web. Local ledger data is not encrypted by this app. BetweenUs does not upload it or send reminders. There is no export/backup function yet: uninstalling, clearing data, changing browser, or losing the device can lose records. OS-level backups depend on your device settings. Failed writes show an error and do not publish unsaved changes; unreadable saved data is not silently replaced. Web preview assets still require the local preview server; no service worker is installed for cold-start offline browser use. Installed native runtime has not yet been exercised on a physical device.

## Shared account mode and local API demo

Choose **Use account mode** for the existing email sign-in and shared confirmation workflow. It requires a configured Supabase project and authenticated API. It does not synchronize offline records. No subscription or billing system is implemented; account pricing is not committed here.

Shared account records have pending, confirmed and needs-resolution states. Only confirmed shared debts count in account balances; the named borrower can confirm or dispute with a reason. Account-mode repayment tracking, invitation delivery, notifications, editing and dispute closure are not implemented. Offline repayments are private local notes and never send messages or move money.

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

`npm run export:offline-test` creates `dist-offline` with fake account configuration. Serve it on localhost:8083, then run `npm run test:offline-browser`. This blocks every external request, seeds a dormant account session, and verifies no auth requests; football630/14→585, overpayment rejection, partial/full payments, undo, reload persistence, archive/reactivation, multiple permanent events, and a personal borrowing repayment. Only local preview assets remain reachable. Screenshots are saved to `/tmp/betweenus-football-event.png` and `/tmp/betweenus-offline-overview.png`.

CI repeats unit tests (auth plus offline model/storage), type checking and a production web bundle. A web bundle does not verify iOS/Android device behavior. Exercise the two-person flow above on both device platforms before a pilot release.
