# Testing

A minimal, extendable test seed. Two independent layers:

| Layer | Runner | Needs emulator? | Location |
|---|---|---|---|
| Frontend pure-logic unit tests | Vitest | No | `src/__tests__/` |
| Firestore security rules tests | Vitest + emulator | **Yes** | `functions/test/` |

## Frontend unit tests

Fast, pure-logic tests — no Firebase, no DOM, no network. They cover the date
normalization + formatting layer that every date in the UI flows through
(`validateDate` in `src/lib/timeUtils.ts`, `safeFormatters` in
`src/lib/safeDateFormatter.ts`).

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Config: `vitest.config.ts` (environment `node`, `@` → `./src` alias, matches
`src/**/*.{test,spec}.{ts,tsx}`). Add new tests next to the code or under
`src/__tests__/`.

## Firestore security rules tests

These exercise `firestore.rules` against the Firestore emulator and cover the
three highest-risk invariants (tenant isolation, `users/{uid}` immutability,
waiver-token signing). They are **deliberately not** part of `npm test` — they
require the emulator and would otherwise fail in CI.

From the repo root:

```bash
npx firebase-tools@latest emulators:exec --only firestore \
  "npx vitest run --config functions/test/vitest.rules.config.ts"
```

Details and watch-mode instructions: [`functions/test/README.md`](functions/test/README.md).

## Notes

- Frontend and rules tests never run together — different configs, different
  needs. `npm test` is the safe, no-emulator default suitable for CI.
- The production build (`npm run build`) does not run these tests and is not
  affected by them.
