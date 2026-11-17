# BetweenUs mobile

Expo Router + React Native + TypeScript app for iOS, Android and a web preview. A restrained shared-debt record for friends and family. Pairs with the independent `betweenus-api` repository.

## Local pilot

Use Node 22+. Start the backend with its local Postgres setup first.

```sh
npm ci
cp .env.example .env
npm run web
```

Use `npm run ios` / `npm run android` for an installed simulator or scan the Expo QR code with Expo Go. Physical devices need `EXPO_PUBLIC_API_URL` set to your computer's LAN address and reachable backend port 3001. Set backend CORS to the web preview origin (default localhost:8081). Restart Expo after changing environment variables.

The explicitly labeled local demo selector uses `demo-lender` (Alex, alex@example.com) and `demo-borrower` (John, john@example.com). The backend must enable its demo authentication mode. Create a debt as Alex for john@example.com, switch to John, open it and confirm or dispute with a reason, then switch back to see the shared result. Seeded entries persist in the backend database. Pull down to refresh.

## Included behavior

- Accepted-only receivable, payable and net AED totals.
- Pending, confirmed, and needs-resolution views.
- Lender creates a positive AED debt using integer minor units, borrower email and description.
- Only the named borrower sees confirmation and dispute controls; the API must independently enforce authorization.
- Debt history, visible network and validation errors, and explicit empty states.

AED is the only creation currency supported by this pilot. Balances are never combined across currencies. There is no payment processing, repayment tracking, invitation delivery, push notification, email notification, debt editing or dispute-closing workflow. Disputed debts stay out of confirmed balances.

## Authentication and release boundary

This is a runnable **local pilot**, not a release-ready authenticated consumer app. Set `EXPO_PUBLIC_DEMO_MODE=false` for release builds; it defaults to false when absent. This removes demo persona controls. The client then accepts a Supabase access token manually for developer integration testing. Full email sign-in, refresh-token persistence, logout and password recovery screens remain to be implemented before a consumer release. The backend validates Supabase JWTs when configured for real authentication. No service role keys or private secrets belong in an Expo public environment variable.

Do not enable demo auth on a public production backend. Client build flags are not a security boundary. The API must reject demo authentication outside its explicitly configured local environment. Use HTTPS for a hosted API. Native release signing and store deployment are not configured.

## Verification

```sh
npm run typecheck
npm run export
```

CI repeats type checking and a production web bundle. A web bundle does not verify iOS/Android device behavior. Exercise the two-person flow above on both device platforms before a pilot release.
