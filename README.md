# BetweenUs mobile

Expo Router + React Native + TypeScript app for iOS, Android and a web preview. A restrained shared-debt record for friends and family. Pairs with the independent `betweenus-api` repository.

## Local pilot

Use Node 22+. Start the backend in its explicitly enabled local-demo mode first (see its README). The demo binds to loopback and uses ephemeral memory; no Postgres is required for this mode.

```sh
npm ci
cp .env.example .env
npm run web
```

Use `npm run ios` / `npm run android` for an installed simulator or scan the Expo QR code with Expo Go. The loopback-only demo supports the web preview and simulators with host-loopback access; physical devices require a separately configured, authenticated API reachable over HTTPS. Do not expose the demo API on a LAN or public network. Set backend CORS to the web preview origin (default localhost:8081). Restart Expo after changing environment variables.

The explicitly labeled local demo selector uses `demo-lender` (Alex, alex@example.com) and `demo-borrower` (John, john@example.com). The backend must enable its demo authentication mode. Create a debt as Alex for john@example.com, switch to John, open it and confirm or dispute with a reason, then switch back to see the shared result. Demo records live in memory and reset whenever the backend restarts. Pull down to refresh.

## Included behavior

- Accepted-only receivable, payable and net AED totals.
- Pending, confirmed, and needs-resolution views.
- Lender creates a positive AED debt using integer minor units, borrower email and description.
- Only the named borrower sees confirmation and dispute controls; the API must independently enforce authorization.
- Debt history, visible network and validation errors, and explicit empty states.

AED is the only creation currency supported by this pilot. Balances are never combined across currencies. There is no payment processing, repayment tracking, invitation delivery, push notification, email notification, debt editing or dispute-closing workflow. Disputed debts stay out of confirmed balances.

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

CI repeats unit tests, type checking and a production web bundle. A web bundle does not verify iOS/Android device behavior. Exercise the two-person flow above on both device platforms before a pilot release.
