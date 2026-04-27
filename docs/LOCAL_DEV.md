# Local Dev with Firebase Emulators

A full local mirror of the production stack — Auth, Firestore, Functions,
Storage, Hosting. Run it against seeded test data to exercise every feature
end-to-end before deploying to live.

## Requirements

- Node 20+
- **Java 11+** (Firestore emulator needs it). macOS: `brew install --cask temurin`.
  Verify with `java -version`.
- Your normal `.env` with `VITE_FIREBASE_*` values — the emulator layer wraps
  them; production data is never touched.

## Three-terminal workflow

### Terminal 1 — emulators

```bash
npm run emulators
```

Builds Cloud Functions (TypeScript → `functions/lib/`) and boots the full
suite. Emulator UI: http://localhost:4000.

| Service     | Port |
| ----------- | ---- |
| Auth        | 9099 |
| Firestore   | 8180 |
| Functions   | 5001 |
| Storage     | 9199 |
| Hosting     | 5050 |
| Emulator UI | 4000 |

> Firestore uses **8180** (not the default 8080) to avoid colliding with
> the Vite dev server on 8080.

### Terminal 2 — seed test data

```bash
npm run seed:emulators
```

Idempotent — safe to re-run. Creates:

**Users (all share password `Password123!`):**

| Email | Role | Org |
| ----- | ---- | --- |
| admin@test.local | admin | test-org |
| staff@test.local | staff | test-org |
| reception@test.local | reception | test-org |
| beautician@test.local | beautician | test-org |
| rivaladmin@test.local | admin | rival-org (isolation test) |

**Data (under Test Salon):**

- Business info with 8.5% tax, USD, `INV` prefix, address/phone/email/tax ID
- Business hours (Mon–Fri 9–18, Sat 10–16, Sun closed)
- Scheduling config (30-min slots)
- Dropdown data (cities, referral sources)
- 6 treatments (5 active, 1 legacy inactive)
- 3 staff members
- 4 packages (3 active — Relaxation, Nails, Laser — plus 1 retired)
- 2 product categories + 5 products (4 active, 1 discontinued)
- 5 clients: Jane (VIP, membership), Mary, Lee, Carol, plus 1 soft-deleted
- 5 purchases: mix of active, completed, expired states
- 8 appointments: scheduled, confirmed, completed, cancelled, no-show
- 2 product assignments
- 2 waiver templates (waiver + intake)
- 1 pending waiver for Jane (token `seed-pending-waiver-token-0001`) + 1 signed historical waiver for Mary
- 1 membership history entry for Jane

**Public waiver URL** (signs without auth):
```
http://localhost:8080/waiver/seed-pending-waiver-token-0001
```

### Terminal 3 — frontend pointed at emulators

```bash
npm run dev:emulators
```

Sets `VITE_USE_EMULATORS=true`, which flips `src/lib/firebase.ts` to
`connect*Emulator()` for every Firebase service. Browser console should log:

```
[firebase] Connected to emulators at localhost (auth:9099, firestore:8180, functions:5001, storage:9199)
```

Open http://localhost:8080.

## Test matrix — what to verify before deploying

### Authentication & roles
- Sign in as **admin** → full access everywhere
- Sign in as **staff** → can't see Users/Acuity in Settings; can manage packages/treatments/products
- Sign in as **reception** → can view clients/appointments, manage appointments, can't edit treatments
- Sign in as **beautician** → can view but not edit most things; Settings hidden or restricted
- Sign out → `queryClient.clear()` fires; open the app again → no cached data from the prior tenant
- **Isolation**: sign in as **rivaladmin** → you see 1 client (Rival Client), not Jane/Mary/etc. No `test-org` data leaks.

### Invoices (the new feature)
- **Settings → Invoices**: tax 8.5%, USD, prefix INV, terms/notes filled, next number `INV-00001`
- **Clients → Jane → Packages → Generate Invoice** on Relaxation Bundle:
  - PDF opens; number `INV-00001`; business info + tax ID in header; Jane in Bill To; 5× Facial @ $100 and 3× Massage @ $150 listed; subtotal $950; tax $80.75; total $1030.75
- Click Generate again → same invoice returned (idempotency check)
- Open Jane's **Invoices** tab → invoice listed, download works
- Generate invoice for Mary's Nails package → `INV-00002`
- In Emulator UI → Firestore → `organizations/test-org/config/invoiceCounter.next_number` should be 3
- Edit Jane's name → regenerate blocked by idempotency → open existing PDF, original name still shown (snapshot immutability)
- Emulator UI → try editing an invoice's `total_cents` field → rule denies
- Storage → `invoices/test-org/{invoiceId}.pdf` → `Content-Disposition` has invoice number filename

### Clients
- Active clients list shows 4 (Jane, Mary, Lee, Carol) — not the soft-deleted Pat
- Deleted Clients page shows Pat
- Edit a client, save, see updates reflect in list
- Send waiver via SMS → fails cleanly with "Twilio not configured" (expected — no Twilio creds)
- Send waiver via device → generates a waiver link you can open in a new tab
- Open the pre-seeded pending waiver link → public form loads → sign → back in the app the waiver shows as signed with the PDF attached

### Appointments
- See past + upcoming mix on the calendar
- Book a new appointment via the booking flow
- Verify Acuity sync button is present in Settings but fails without Acuity creds (expected)

### Packages / Treatments / Products (Settings)
- 6 treatments in list, "Legacy Treatment" shown as inactive
- 4 packages, Discontinued Wellness Pack inactive
- Products + categories both populated

### Cloud Functions logs
- Emulator UI → Functions tab → exercise any flow → logs appear in real time
- Force an error: try generating invoice for a bogus purchase_id → `createInvoice` logs an `HttpsError("not-found")`

### Rate limiting
- Invoke `createInvoice` 101 times in one day for `test-org` → 101st rejects with `resource-exhausted`
- Counter doc at `organizations/test-org/rateLimits/generateInvoice_<YYYYMMDD>` in Firestore UI

### Host gate / white-label
- Visit http://localhost:8080 → shows `PublicHome` (marketing page) because `localhost` isn't in the app-only host list
- Simulate `crm.lumiereut.com` locally: add `127.0.0.1 crm.lumiereut.com` to `/etc/hosts`, restart Vite, open http://crm.lumiereut.com:8080 → should redirect `/` to `/auth`

## What does NOT work in emulator mode

- **Real emails (Resend)** — without `RESEND_API_KEY` in the functions env, the
  `sendWaiver` / `sendClientEmail` / `notifyOrgOnWaiverSigned` functions log a
  warning and skip the send. Firestore records still created — the UI flow works.
- **Real SMS (Twilio)** — creds pulled from `marketingIntegrations` (not seeded),
  so SMS sends fail cleanly with "Twilio integration not configured".
- **Acuity webhook** — Acuity can't reach `localhost:5001`. To test, run `ngrok http 5001` and set the tunnel URL as Acuity's webhook.
- **Google sign-in** — Emulator Auth supplies a fake Google flow (popup picks a generated identity). Use email/password for realistic testing.

## Resetting the emulator state

Emulator data lives in memory by default — restart `npm run emulators` to
wipe. To persist between runs:

```bash
npx firebase-tools@latest emulators:start --import=./emulator-data --export-on-exit=./emulator-data
```

## Common issues

**"JAVA_HOME not found" when emulators start**
Install JDK 11+. `brew install --cask temurin` on Mac.

**"listen EADDRINUSE 8180"**
Another process is on that port. Kill it (`lsof -i :8180 | awk 'NR>1 {print $2}' | xargs kill`) or change the port in `firebase.json` AND in `src/lib/firebase.ts`.

**Browser still hits production**
Verify `VITE_USE_EMULATORS=true` — the console log line must appear on app load. If you started Vite with plain `npm run dev`, restart with `npm run dev:emulators`.

**"Permission denied" when seeding**
The seed uses Admin SDK (bypasses rules). If it fails, check the emulator is up and `FIRESTORE_EMULATOR_HOST` resolves — the seed script sets it automatically.

**Functions can't find a module after editing**
Functions are compiled into `functions/lib/`. Re-run `npm run emulators` (which rebuilds) or `cd functions && npm run build` in another terminal.

**Stale data after changing seed**
The seed is idempotent on ids — it merges over existing docs. To fully reset, restart the emulators (`Ctrl+C` on Terminal 1 and start again without `--import`).
