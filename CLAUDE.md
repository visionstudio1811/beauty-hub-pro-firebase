# Beauty Hub Pro — Claude Code Guide

## Project Overview

Beauty Hub Pro is a multi-tenant salon and spa management platform. It handles appointments, client records, staff, treatments, packages, products, waivers, marketing campaigns, Acuity Scheduling sync, and a white-label client portal PWA.

This project was migrated from Supabase to Firebase. All data lives in Firestore; all backend logic runs in Cloud Functions.

**Firebase project:** `beauty-hub-pro-app`
**GitHub:** https://github.com/visionstudio1811/beauty-hub-pro-firebase

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + SWC
- **UI:** shadcn/ui + Radix UI + Tailwind CSS
- **Routing:** React Router v6
- **Data fetching:** TanStack React Query
- **Forms:** React Hook Form + Zod
- **Database:** Firestore (multi-tenant sub-collections)
- **Auth:** Firebase Auth (email/password + Google sign-in)
- **Backend:** Cloud Functions v2 (Node.js 20, TypeScript)
- **Hosting:** Firebase Hosting (SPA)
- **Email:** Resend API (via Cloud Function)
- **SMS:** Twilio REST API (credentials stored per-org in Firestore `marketingIntegrations`, not Secret Manager)
- **Scheduling sync:** Acuity Scheduling API (via Cloud Function)
- **Client portal:** installable PWA at `/client` on white-label CRM domains

---

## Commands

### Frontend
```bash
npm run dev       # Start dev server on port 8080
npm run build     # Production build → dist/
npm run preview   # Preview the built app
npm run lint      # ESLint
```

### Cloud Functions
```bash
cd functions
npm run build       # Compile TypeScript → lib/
npm run build:watch # Watch mode
```

### Firebase
```bash
npx firebase-tools@latest deploy                         # Deploy everything (hosting + functions + firestore)
npx firebase-tools@latest deploy --only hosting:app      # App only (React build in dist/)
npx firebase-tools@latest deploy --only functions
npx firebase-tools@latest deploy --only firestore        # rules + indexes together
npx firebase-tools@latest deploy --only firestore:rules
npx firebase-tools@latest deploy --only firestore:indexes
npx firebase-tools@latest emulators:start                # Run all emulators locally
```

**After editing `firestore.rules` or `firestore.indexes.json`, always deploy.** The repo state is not the deployed state — a rules file that's only on disk grants nothing, and a new multi-field query will fail until its index is deployed and built.

---

## Project Structure

```
beauty-hub-pro-app/
├── src/
│   ├── components/       # UI components (shadcn/ui + custom)
│   ├── contexts/         # React context providers (one per domain)
│   ├── hooks/            # Custom hooks for data access
│   ├── lib/
│   │   ├── firebase.ts   # Firebase client init (auth, db, functions, storage)
│   │   ├── dataSanitization.ts
│   │   ├── validation.ts # Zod schemas
│   │   └── utils.ts
│   ├── pages/            # Route-level page components
│   ├── types/
│   │   └── firestore.ts  # TypeScript interfaces for all Firestore collections
│   └── App.tsx           # Router + provider tree
├── functions/
│   ├── src/              # Cloud Function source (TypeScript)
│   │   ├── index.ts                    # Exports all functions
│   │   ├── adminCreateUser.ts
│   │   ├── sendClientEmail.ts
│   │   ├── sendWaiver.ts
│   │   ├── notifyOrgOnWaiverSigned.ts  # Firestore trigger on clientWaivers update
│   │   ├── acuitySync.ts
│   │   ├── acuityWebhook.ts
│   │   ├── clientPortal.ts
│   │   ├── packageExpiryNotifications.ts
│   │   └── rateLimit.ts                # Shared per-org daily rate-limit helper
│   ├── lib/              # Compiled JS output (git-ignored)
│   └── package.json
├── firebase.json         # Hosting + Functions + Firestore + Storage + emulators config
├── .firebaserc           # Project + hosting target mapping (app ↔ the single hosting site)
├── firestore.rules       # Security rules
├── firestore.indexes.json
├── storage.rules         # Storage security rules (waiver PDFs + photos)
└── .env                  # Firebase SDK config (not committed)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values from the Firebase Console (Project Settings → Your apps → Web app):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=beauty-hub-pro-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=beauty-hub-pro-app
VITE_FIREBASE_STORAGE_BUCKET=beauty-hub-pro-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Cloud Function secrets (set once via CLI, stored in Secret Manager):
```bash
firebase functions:secrets:set RESEND_API_KEY       # sendWaiver, sendClientEmail, notifyOrgOnWaiverSigned
firebase functions:secrets:set ACUITY_API_USER_ID   # acuitySync
firebase functions:secrets:set ACUITY_API_KEY       # acuitySync
```

Per-org credentials (Twilio SMS creds, org-specific Resend API keys, Acuity webhook secret) live in each org's `marketingIntegrations` or `acuitySyncConfig` subcollection, not Secret Manager. Rules restrict read/write to org admins.

---

## Firestore Data Model

All organization data lives under `organizations/{orgId}/` sub-collections. This enforces multi-tenant isolation at the path level and mirrors security rules.

```
users/{uid}                          ← user profiles (role, organizationId)
organizations/{orgId}                ← org document
  /clients/{id}
  /appointments/{id}
  /staff/{id}
  /treatments/{id}
  /packages/{id}
  /purchases/{id}
  /products/{id}
  /productAssignments/{id}
  /businessHours/{id}
  /config/businessInfo               ← single-document config
  /schedulingConfig/{id}
  /dropdownData/{id}
  /waiverTemplates/{id}              ← kind: 'waiver' | 'intake' | 'agreement'
  /clientWaivers/{id}                ← signed forms; agreements include purchaseId + package snapshot
  /clientCommunications/{id}
  /auditLogs/{id}                    ← written by Cloud Functions only
  /marketingCampaigns/{id}
  /marketingTemplates/{id}
  /marketingAutomations/{id}
  /campaignRecipients/{id}
  /marketingIntegrations/{id}        ← stores Resend/Twilio API keys (admin-only, get-only, no list)
  /acuitySyncConfig/{id}             ← includes per-org Acuity `webhook_secret`
  /bookingRequests/{id}              ← client portal booking requests (CF-only create/update)
  /acuitySyncLogs/{id}
  /rateLimits/{action_YYYYMMDD}      ← Cloud-Function-only per-org daily counters
  /invoices/{id}                     ← immutable invoice records (CF-only create; admin one-time pdf_url update)
  /invoiceDrafts/{id}                ← pre-issue scratch state for the invoice dialog (admin-only CRUD, no sequential number)
  /config/invoiceCounter             ← per-org sequential counter (CF-only writes)
waiverTokens/{token}                 ← unauthenticated waiver signing (get-only, no list; 30-day TTL via expiresAt)
clientPortalAccess/{uid}/organizations/{orgId}
                                      ← client portal identity mapping (CF-only writes)
```

---

## Authentication Flow

1. User signs in with email/password (`signInWithEmail`) or Google (`signInWithGoogle`) — both live in `AuthContext`.
2. `onAuthStateChanged` fires → `AuthContext` loads user profile from `users/{uid}` via Firestore `getDoc`.
3. Profile contains `organizationId` and `role` used for all subsequent access control.
4. `signOut` calls `firebaseSignOut` **and** `queryClient.clear()` so cached tenant data does not leak to the next user on a shared device.

New user accounts are created exclusively by the `adminCreateUser` Cloud Function (Admin SDK bypasses rules). The client-side login error is a single generic "Invalid email or password" regardless of Firebase's specific code — do not expand this, it exists to prevent account enumeration.

Auth is in `src/contexts/AuthContext.tsx`. Use `useAuth()` for `user`, `profile`, `signOut`, `signInWithEmail`, `signInWithGoogle`, `refreshProfile`.

### Idle session timeout

`src/components/auth/IdleLogoutGuard.tsx` is mounted once inside `AuthProvider` and runs whenever a user is signed in (staff CRM **and** client portal — anything that goes through Firebase Auth). After **60 minutes of no activity** it calls `signOut()`. At **58 minutes** it opens an `AlertDialog` with a live "Sign out in MM:SS — Stay signed in" countdown. Activity events tracked: `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart` (throttled to 1s). Tabs coordinate via `localStorage` key `bh:lastActivity` so activity in one tab keeps all tabs alive. The timers tear down immediately when `user` becomes null, so there's zero overhead on `/`, `/auth`, and `/waiver/:token`.

### OrganizationProtectedRoute fallback states

The `/admin` route guards are `ProtectedRoute → OrganizationProtectedRoute → RoleProtectedRoute`. `OrganizationProtectedRoute` (`src/components/OrganizationProtectedRoute.tsx`) has three distinct non-OK states that you'll see instead of the dashboard, each with a Sign Out button:

- **Loading skeleton + 12-second backstop**: while `authLoading || orgLoading`. If still loading after 12s, an amber "This is taking longer than expected" banner appears with a Sign Out button — never leave the user staring at a frozen skeleton.
- **"Account profile not found"**: `user` exists but `profile` is null after auth resolved. Means the Firebase Auth account is real but `users/{uid}` doesn't exist in Firestore. Recovery: sign out, or have an admin create the user via `adminCreateUser`.
- **"Organization unavailable"**: `profile.organizationId` is set but `currentOrganization` couldn't be loaded. The org doc was deleted, renamed, or rule-blocked. Recovery: sign out and try a different account.

Do not re-introduce the old `Boolean(user) && !profile` clause to `stillLoading` — `AuthContext` only sets `authLoading=false` after the `users/{uid}` fetch resolves, so a null profile at that point is a genuine "no profile" state, not a race.

### Client Portal Auth

The client portal is separate from staff CRM access. The public routes are:

- `/client` — preferred white-label URL; resolves the organization from `window.location.hostname`
- `/client/:orgSlug` — explicit slug fallback

For production white-label domains, share:

```
https://crm.lumiereut.com/client
```

The organization document should include:

```js
crm_domain: "crm.lumiereut.com"
```

Supported alternatives are `custom_domain`, `domain`, or `portal_domains: ["crm.lumiereut.com"]`. The resolver also falls back to slug candidates inferred from `crm.<brand>...`, but explicit `crm_domain` is the reliable setup.

### Provisioning the client portal for a new org

Every org gets a client portal automatically via slug URL (`beautyhubpro.com/client/{slug}`). For a white-label custom domain (`crm.theirbrand.com/client`):

1. Set `crm_domain: "crm.theirbrand.com"` on the org's Firestore document — this is what `getClientPortalOrg` (`functions/src/clientPortal.ts`) uses to resolve the org.
2. Add the custom domain to Firebase Hosting (see Adding a new white-label client domain below).
3. Add the domain to Firebase Auth authorized domains.

Without `crm_domain` set, the portal returns "Portal not found" even if DNS and hosting are correct.

Portal users sign in with Google or Firebase phone OTP. The callable `linkClientPortalAccount` compares the signed-in email/phone to active `organizations/{orgId}/clients` records. On match it writes:

```
clientPortalAccess/{uid}/organizations/{orgId}
```

Firestore rules use that mapping to grant client-scoped reads only. Do not add client users to `users/{uid}` with staff roles.

Portal booking is request-based:

1. `createClientBookingRequest` validates the portal user, active purchase, treatment eligibility, and preferred slot.
2. Staff review requests in `src/components/appointments/BookingRequestsPanel.tsx`.
3. `updateClientBookingRequest` approves/rejects. Approval creates an appointment, decrements the package session, and attempts Acuity sync.
4. Acuity sync requires `acuitySyncConfig.client_portal_acuity_mappings` with CRM treatment IDs mapped to Acuity appointment type IDs and CRM staff IDs mapped to Acuity calendar IDs.

---

## Role-Based Access Control

Roles: `admin` | `staff` | `reception` | `beautician`

Permission matrix:
- **admin** — full access to everything
- **staff** — clients, appointments, treatments, packages, products
- **reception** — view clients/appointments, manage appointments
- **beautician** — view clients, appointments, treatments

Client portal users do not use these CRM roles. Their access is controlled by `clientPortalAccess` and narrower Firestore rules.

Role is stored in `users/{uid}.role` in Firestore and enforced both:
- **Client-side:** via `useSecurityValidation` hook and `RoleProtectedRoute`
- **Server-side:** via `firestore.rules` (reads `users/{uid}` on every guarded operation)

---

## Context Providers

Each domain has a React context provider. They are stacked in `App.tsx`:

| Context | Hook | What it manages |
|---|---|---|
| `AuthContext` | `useAuth()` | Firebase user + Firestore profile |
| `OrganizationContext` | `useOrganization()` | Current org, org list, switching |
| `ClientsContext` | `useClients()` | Client list for current org |
| `AppointmentContext` | `useAppointments()` | Appointments |
| `StaffContext` | `useStaff()` | Staff members |
| `TreatmentContext` | `useTreatments()` | Treatments |
| `PackageContext` | `usePackages()` | Packages |
| `BusinessHoursContext` | `useBusinessHours()` | Operating hours |
| `SchedulingConfigContext` | `useSchedulingConfig()` | Appointment slot config |
| `DropdownDataContext` | `useDropdownData()` | Reference data (categories, etc.) |

---

## Cloud Functions

All functions use Firebase Functions **v2 API** (`firebase-functions/v2/https`). Import pattern:

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
```

Callable functions receive a `CallableRequest` — access data via `request.data`, auth via `request.auth`.

| Function | Type | Purpose |
|---|---|---|
| `adminCreateUser` | `onCall` | Admin-only user creation (Auth + Firestore doc) |
| `sendClientEmail` | `onCall` | Send email via Resend; per-org daily rate limit |
| `sendWaiver` | `onCall` | Send waiver/intake/agreement link via SMS/email/device; issues a 30-day TTL token; per-org daily rate limit. Accepts optional `purchaseId` — when present, snapshots `packageName`, `packagePrice`, `packageSessions`, `purchaseDate`, `expiryDate` onto the `clientWaivers` doc so the agreement form prefills package info. |
| `notifyOrgOnWaiverSigned` | `onDocumentUpdated` | Firestore trigger: emails org admins the signed PDF + photos. Also **backfills empty client card fields** (name, email, phone, address, city, date_of_birth, gender, referral_source) from the signed form's signer fields + answer-by-label matching. Never overwrites non-empty fields. Runs for all kinds (waiver, intake, agreement). |
| `acuitySync` | `onCall` | Manual Acuity Scheduling sync |
| `acuityWebhook` | `onRequest` | Acuity webhook receiver (HMAC-verified with per-org `webhook_secret`) |
| `packageExpiryNotifications` | scheduled | Periodic reminders for expiring packages |
| `createInvoice` | `onCall` | Admin-only invoice generation; atomic counter + frozen snapshots + computed totals; idempotent per `purchase_id`; rate-limited 100/day |
| `voidInvoice` | `onCall` | Admin-only; flips an issued invoice's status to `void` and stamps `voided_at` / `voided_by`. Idempotent via `failed-precondition` on an already-voided invoice; rate-limited 50/day. Invoice numbers never reused. |
| `getClientPortalOrg` | `onCall` | Resolves org from hostname (`crm_domain`, `custom_domain`, `domain`, `portal_domains`) or slug. No auth required. |
| `linkClientPortalAccount` | `onCall` | Links a signed-in portal user to a client card by email/phone match. |
| `createClientBookingRequest` | `onCall` | Portal user creates a booking request against an active purchase. |
| `updateClientBookingRequest` | `onCall` | Staff approves/rejects a booking request; approval creates appointment + decrements session. |

All callables validate `request.auth` + verify the caller's `users/{uid}.organizationId` matches `request.data.organizationId` and check role before doing work. Rate-limited actions use `consumeRateLimit(orgId, action, limit)` from `rateLimit.ts` — never skip this on new functions that spend external budget (Twilio, Resend).

---

## Key Patterns

### Querying Firestore
Always filter by `organizationId` — current org comes from `useOrganization()`:
```typescript
const { currentOrganization } = useOrganization();
const q = query(
  collection(db, 'organizations', currentOrganization.id, 'clients'),
  where('deletedAt', '==', null),
  orderBy('name')
);
```

### Calling Cloud Functions
```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const sendEmail = httpsCallable(functions, 'sendClientEmail');
await sendEmail({ to, subject, message, clientId, organizationId });
```

### Soft deletes
Clients use soft deletes — set `deletedAt` field instead of deleting the document. Always filter `where('deletedAt', '==', null)` in active client queries.

### Data sanitization
All data from Firestore passes through `src/lib/dataSanitization.ts` before being used in the UI. Don't skip this.

### Date formatting
All date rendering goes through `safeFormatters` from `src/lib/safeDateFormatter.ts` (`shortDate`, `longDate`, `monthYear`, `dayMonth`). The underlying `validateDate` in `src/lib/timeUtils.ts` accepts **Firestore Timestamps, Dates, ISO strings, and numeric millis** and returns a real `Date` or `null`. Do not call `new Date(x).toLocaleDateString()` directly on anything that may be a Firestore Timestamp — `new Date(timestamp)` produces "Invalid Date". On invalid input, `safeFormatters` returns `''`; render `' || '—'` in the JSX so empty fields display a dash instead of nothing.

### Client aggregates (Clients page)
The Clients page stats — **Total Revenue**, **VIP Clients**, and the per-row **Visits** / **Revenue** / **Last Visit** columns — are computed in `src/hooks/usePaginatedClients.ts`. One parallel fetch pulls clients + completed appointments + active/completed purchases, then joins them by `client_id` in memory. `totalVisits` = count of completed appointments; `totalRevenue` = sum of `purchases.total_amount`; `lastVisit` = most recent `appointment_date`. If you add a new revenue source (e.g. standalone product sales), add it to the aggregation here so every downstream consumer sees the same number.

`usePaginatedClients` also tracks `hasActivePackage` / `hasCompletedPackage` per client so it can derive a 3-state membership status (see next section). Don't drop those flags — multiple UI surfaces depend on them.

**VIP** is defined as `has_membership === true`. If the business wants a richer definition (e.g. lifetime revenue threshold), change `ClientStatsCards.tsx` — but keep the aggregation input in `usePaginatedClients`.

### Membership status — derived, not stored

Stored: `client.has_membership: boolean` (user-editable manual override).

Displayed: derived in `usePaginatedClients` and rendered via `StatusBadge variant="client"`. Three states:

- **Have Membership** (green) — `has_membership === true` OR client has a `payment_status: 'active'` purchase.
- **Membership Ended** (red, **read-only badge**) — no active purchase AND `has_membership === false` AND client has at least one `payment_status: 'completed'` purchase (i.e. all packages they bought are used up).
- **Don't Have Membership** (gray) — none of the above.

In `ClientsCards.tsx` the "Membership Ended" state renders as a read-only badge, not the editable dropdown — staff can't transition into Ended manually (it's derived). To flip a client back, assign a new package or toggle `has_membership` from the client details modal.

`MembershipHistoryTab.tsx` independently shows `Active` iff `activePurchasesCount > 0` for the per-tab card. Keep this aligned with the `usePaginatedClients` derivation if you change either.

### Package + product + appointment linkage

The `purchases` doc is the per-client instance of a package. Beyond the catalog fields (name, price, total_sessions, treatments), the purchase carries:

- `sessions_remaining: number` — aggregate counter (the source for "X / Y sessions used" displays).
- `sessions_by_treatment?: [{ treatment_id, total, remaining }]` — per-treatment slot tracking for multi-treatment packages (e.g. "5 hydra + 4 microneedling"). When this array is present, aggregate `sessions_remaining = sum(slots[].remaining)`. `decrementSessionForAppointment` (`src/lib/sessionDecrement.ts`) and the `PurchaseManagementModal` save path both keep these in sync.
- `product_snapshot?: [{ product_id, product_name, quantity, price }]` — products bundled with the package.
- `description_override?: string | null` — per-purchase description override. Reads should be `purchase.description_override ?? package.description ?? ''`. Implemented in `useClientPackages.ts`. Edits in `PurchaseManagementModal.tsx` write only to the purchase doc — never mutate the catalog `packages/{id}` template, which would affect every client holding that package.

The `productAssignments` doc has an optional `purchase_id: string | null` that links a product delivery to the package it came from. The Packages tab on the client card joins on this to compute "X / Y given" and "N owed" per product. `ManageClientProductsModal.tsx` has a "From package" select that writes this field.

The `appointments` doc has these package-linkage fields (all optional, set when the appointment consumes a package session):

- `purchase_id: string | null` — points at the purchase whose session was used. Presence = the appointment is "from a package".
- `package_id: string | null` and `package_name: string | null` — denormalized at write time so history rows can render "From {package_name}" even after the package is renamed or expired. Both `AppointmentFormModal` (Book Treatment) and the past-log dialog in `EnhancedClientDetailsModal` set these.
- `session_used: boolean` — true when this appointment counted against a package. Drives the badge rendering and the conditional decrement in `handleStatusChange`.
- `is_manual_entry: boolean` — only true for "Log Past Treatment" entries.

The past-log save path uses `runTransaction` to write the appointment + decrement the purchase atomically. Don't replace it with sequential writes — a partial failure leaves the package counter wrong.

### Invoice flow — Edit → Preview → Issue + Drafts

`CreateInvoiceDialog.tsx` runs in three internal modes:

- **Edit** — line items, client, payment method, notes. "Save as Draft" persists state to `organizations/{orgId}/invoiceDrafts/{id}` via `useInvoiceDrafts`; "Drafts" drawer in the footer lists, continues, or deletes existing drafts.
- **Preview** — builds a synthetic `Invoice`-shaped object client-side (totals + tax from `config/businessInfo`, snapshots from selected client + business). Renders the same `buildInvoicePdf` blob into an `<iframe>` alongside a line-item summary. **No Firestore write happens at this step.**
- **Issuing** — calls the existing `createInvoice` Cloud Function unchanged (sequential numbering, atomic counter, idempotency by `purchase_id` or `idempotency_key` all preserved). On success, `deleteDraft(currentDraftId)` if applicable, then `buildInvoicePdf` + `uploadInvoicePdf` as before.

Drafts deliberately exclude `invoice_number`, `issued_at`, totals, and snapshots — those are computed server-side at issue time. The server is still the source of truth; preview is purely a client-side dry run that may differ slightly if the tax rate changes between preview and issue.

### Add Client dedup

`AddClientModal.tsx` matches against the in-memory `useClients().clients` list as staff type:

- Name: case-insensitive `includes`/`startsWith`, requires ≥2 chars. Soft match → amber alert.
- Email: exact match on normalized email. Hard match → red alert + confirm prompt on submit.
- Phone: exact match on digits-only. Hard match → red alert + confirm prompt on submit.

The "Open" button on each match closes the Add modal and opens the existing client's details via `onOpenExistingClient` (wired through `ClientsModals.tsx` and `Clients.tsx` to `handleViewDetails`). Submit is never hard-blocked — the dedup is advisory; a confirm dialog appears for red-level matches but staff can always choose "Add Anyway".

### Field naming — snake_case vs camelCase
The codebase has two naming conventions, left over from the Supabase → Firebase migration. Honor the convention already used by the collection; do not mix.

- **snake_case** (migrated-from-Supabase hooks): `appointments` (`appointment_date`, `appointment_time`), `treatments` (`is_active`, `category`), `staff` (`is_active`, `name`), `dropdownData` (`is_active`, `sort_order`, `category`, `value`), `schedulingConfig` (`is_active`, `day_of_week`, `start_time`), `purchases` (`client_id`, `payment_status`), `productAssignments` (`client_id`, `assigned_at`), `clients` (`deleted_at`, `created_at`), `businessHours` (`day_of_week`), session docs (`session_token`, `created_at`, `is_active`).
- **camelCase** (newer code): `users` (`isActive`, `fullName`, `organizationId`, `organizationRole`, `createdAt`), `organizations` (`isActive`, `createdAt`, `updatedAt`, `logo_url`, `crm_domain`).

When you add a multi-field query, check the collection's existing field names first, then add the matching index to `firestore.indexes.json`. Wrong case = empty results with no error.

**Critical trap:** `organizations` uses `isActive` (camelCase). Any Firestore query filtering on org active status must use `.where('isActive', '==', true)` — not `is_active`. This has caused "Portal not found" bugs before.

---

## Routes

```
/                     Public landing page
/auth                 Login / sign up
/waiver/:token        Public waiver signing (no auth required)
/admin                Dashboard (requires auth + organization)
/admin/appointments   Appointments
/admin/clients        Active clients
/admin/clients/trash  Deleted clients
/admin/marketing      Marketing campaigns
/admin/settings       Settings (admin or staff role only)
*                     404
```

Route guards: `ProtectedRoute` → `OrganizationProtectedRoute` → `RoleProtectedRoute`

---

## Security Invariants

These were hardened in the 2026-04-21 audit pass. Do not weaken any of them without explicit discussion.

- **`users/{uid}` field immutability.** `role`, `email`, `uid`, `createdAt` are **never** writable from the client. `organizationId` is write-once (null → value); it can never be *changed* from the client. Role/org changes must go through an admin Cloud Function. `allow create` on `/users` is `false` — only `adminCreateUser` (Admin SDK) makes user docs.
- **Tenant-subcollection writes are split** `create` / `update` / `delete`. Clients, purchases, communications, membership history are *never* hard-deletable. Prefer soft-delete via `deleted_at` for clients.
- **`waiverTokens`**: `allow get: true / list: false`. Tokens are not enumerable. They carry `expiresAt` (30 days); both the client and rules check it. Unauthenticated signing of a `clientWaivers` doc requires a valid, pending, unexpired `waiverTokens` entry whose `waiverId` + `organizationId` match the path. Do not loosen this — it is the only thing stopping arbitrary orgId/waiverId enumeration on the public form.
- **`marketingIntegrations`**: `get` only, `list` denied. These docs store third-party API keys (Twilio, Resend). Never add a list query.
- **`auditLogs`, `acuitySyncLogs`, `campaignRecipients`, `rateLimits`**: `allow write: if false`. These are written exclusively via the Admin SDK.
- **Storage `waivers/`**: size + MIME enforced in `storage.rules`. PDFs only on the top-level path; images under `/{token}/photos/`. Default deny elsewhere.
- **Callable functions**: always check `request.auth`, load the caller's `users/{uid}`, verify `organizationId` + role, then call `consumeRateLimit(org, action, limit)` before side-effects that cost money (SMS/email/external API).
- **Webhook endpoints** (`acuityWebhook`): HMAC-verify the signature with `crypto.timingSafeEqual` **before** processing payload. Each org must configure its own `webhook_secret` in `acuitySyncConfig`.
- **Invoices**: `create: false` (CF-only), `delete: false` (audit trail), `update` allows admins to set **only** `pdf_url` + `pdf_storage_path` and only while `pdf_url` is currently `null`. All monetary fields + snapshots are frozen at issue time. Invoice numbers are per-org sequential (`INV-00001`), managed by `createInvoice`. Gaps are expected (voided invoices don't renumber).
- **`invoiceDrafts`**: admin-only CRUD; create requires `created_by == request.auth.uid`. No invoice number is assigned to drafts — they're pre-issue scratch state that gets deleted when the user clicks "Issue Invoice". Drafts do NOT bypass the immutability guarantees of `invoices/{id}` — issue still goes through `createInvoice`.
- **`config/invoiceCounter`**: `write: if false` at rule level (via `configId != 'invoiceCounter'` exclusion in the general config rule). Only the `createInvoice` Admin-SDK Cloud Function may increment it.
- **Storage `invoices/{orgId}/`**: admin-only read + write, PDFs only, 5MB cap.

### Logo storage

Org logos are uploaded to Firebase Storage at `organizations/{orgId}/logo/logo.{ext}` and the download URL is saved to the org document as `logo_url`. `LogoManagement.tsx` handles upload/remove. Do not use `localStorage` for logo storage — it is device-local and was replaced with Storage + Firestore in the 2026-04-28 audit.

## Do Not Change

- `src/components/ui/` — shadcn/ui components, regenerate with `shadcn` CLI if needed
- `tailwind.config.ts` — design tokens
- `src/lib/dataSanitization.ts` — data cleaning logic, changes here affect the whole app
- `src/lib/validation.ts` — Zod schemas used across forms
- `firestore.rules` / `storage.rules` — security rules, test with the emulator before deploying

---

## Hosting & Domains

One Firebase Hosting site (`beauty-hub-pro-app`) serves every domain. The React SPA handles both marketing and app routing — hostname determines what the root `/` route shows.

### Domain model (white-label SaaS)

| Domain | Root `/` behavior | Purpose |
|---|---|---|
| `beautyhubpro.com` | Renders `PublicHome` (marketing) | SaaS marketing / public landing |
| `www.beautyhubpro.com` | Renders `PublicHome` (marketing) | Same as apex |
| `app.beautyhubpro.com` | Redirects to `/auth` | CRM login under the Beauty Hub Pro brand |
| `crm.lumiereut.com` | Redirects to `/auth` | CRM login under **Lumière's brand** (white-label) |
| Future `crm.<any-brand>.com` | Redirects to `/auth` | Any future white-label client |

The host check lives in `src/pages/Index.tsx`: `app.beautyhubpro.com` and any `crm.*` host skip `PublicHome` to prevent marketing-brand leak on white-label domains. All white-label client domains MUST follow the `crm.<brand>.com` convention so this check keeps working.

Every domain serves the exact same React app against the same Firestore data — the white-label effect is purely the URL bar + the hostname-gated Index behavior.

### Adding a new white-label client domain

1. Firebase Console → Hosting → `beauty-hub-pro-app` site → Add custom domain → `crm.theirbrand.com`.
2. Give the client the A / CNAME records Firebase shows. They set them at their own registrar.
3. Firebase Console → Authentication → Settings → Authorized domains → add `crm.theirbrand.com`. Without this, Google sign-in fails with `auth/unauthorized-domain`.
4. Wait 15min–2h for SSL cert issuance, test in incognito.
5. Confirm the domain uses the `crm.` prefix — the `isAppOnlyHost` check in `src/pages/Index.tsx` hides marketing on `crm.*` hosts. A non-conforming subdomain (e.g., `app.theirbrand.com`) would leak the Beauty Hub Pro marketing page.

### DNS gotcha — Cloudflare Proxy must be OFF

For any domain routed through Cloudflare (including our apex `beautyhubpro.com` and `app.beautyhubpro.com`), the DNS records **must** be set to "DNS only" (grey cloud), not "Proxied" (orange cloud). Proxy mode breaks Firebase's automatic cert renewal — the site keeps working for ~90 days on Cloudflare's Universal SSL, then silently fails when Firebase's own cert expires without being renewable. Flip to DNS only once, then forget about it.

Firebase requires **two A records** on the apex for redundancy: `199.36.158.100` and `199.36.158.101`.

## Manual Firebase Console Setup Required

These cannot be done via CLI and must be completed in the [Firebase Console](https://console.firebase.google.com/project/beauty-hub-pro-app):

1. **Enable Email/Password and Google providers** → Authentication → Sign-in methods
2. **Add authorized domains** → Authentication → Settings → Authorized domains (add production domain)
3. **Firestore location** — set to `us-central1` during init
4. **Storage** — enabled; bucket is `beauty-hub-pro-app.appspot.com`. Rules are managed via `storage.rules` in the repo.
