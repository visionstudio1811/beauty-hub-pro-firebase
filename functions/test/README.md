# Firestore Security Rules tests

`firestore.rules.test.ts` tests the three highest-risk security invariants in
`firestore.rules` against the **Firestore emulator**:

1. **Tenant isolation** — a user of org A cannot read org B's clients.
2. **`users/{uid}` immutability** — a user cannot change their own `role` or `isActive`.
3. **Waiver signing path** — an unauthenticated signer can only flip a
   `clientWaivers` doc to `signed` with a valid, pending, unexpired
   `waiverTokens` entry whose `waiverId` + `organizationId` match the path.

These are **not** part of `npm test`. They need the emulator running, so they
would fail on any CI job or laptop without it. Each test is also guarded by a
`FIRESTORE_EMULATOR_HOST` check and **skips** (does not fail) when the emulator
is absent — so importing/running this file anywhere is safe.

## Prerequisites

Install the dev dependency once (it's declared in `functions/package.json`):

```bash
cd functions
npm install
```

You also need `firebase-tools` (the repo already uses `npx firebase-tools@latest`)
and Java (required by the Firestore emulator).

## Running

`emulators:exec` boots the Firestore emulator, sets `FIRESTORE_EMULATOR_HOST`,
runs the command, and tears the emulator down afterward.

From the **repo root**:

```bash
npx firebase-tools@latest emulators:exec --only firestore \
  "npx vitest run --config functions/test/vitest.rules.config.ts"
```

The emulator picks up `firestore.rules` and the Firestore port (`8180`) from
`firebase.json`.

### Watch mode while iterating on rules

```bash
# Terminal 1 — long-running emulator
npx firebase-tools@latest emulators:start --only firestore

# Terminal 2 — re-runs on change; the env var must be exported so the
# in-test emulator guard activates.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 \
  npx vitest --config functions/test/vitest.rules.config.ts
```

## Extending

Add more `describeWithEmulator(...)` blocks. Seed cross-collection fixtures the
rules read via `get()` (users, orgs, tokens) inside
`testEnv.withSecurityRulesDisabled(...)`, then assert with `assertSucceeds` /
`assertFails` from an `authenticatedContext(uid)` or `unauthenticatedContext()`.
