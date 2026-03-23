# Beauty Hub Pro — Claude Code Guide

## Project Overview

Beauty Hub Pro is a multi-tenant salon and spa management platform. It handles appointments, client records, staff, treatments, packages, products, waivers, marketing campaigns, and Acuity Scheduling sync.

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
- **Auth:** Firebase Auth (phone OTP → custom token)
- **Backend:** Cloud Functions v2 (Node.js 20, TypeScript)
- **Hosting:** Firebase Hosting (SPA)
- **Email:** Resend API (via Cloud Function)
- **SMS/OTP:** Twilio Verify API (via Cloud Function)
- **Scheduling sync:** Acuity Scheduling API (via Cloud Function)

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
npx firebase-tools@latest deploy              # Deploy everything
npx firebase-tools@latest deploy --only hosting
npx firebase-tools@latest deploy --only functions
npx firebase-tools@latest deploy --only firestore:rules
npx firebase-tools@latest emulators:start    # Run all emulators locally
```

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
│   │   ├── index.ts      # Exports all functions
│   │   ├── sendVerification.ts
│   │   ├── verifyOtp.ts
│   │   ├── sendClientEmail.ts
│   │   ├── sendWaiver.ts
│   │   ├── acuitySync.ts
│   │   ├── acuityWebhook.ts
│   │   └── adminCreateUser.ts
│   ├── lib/              # Compiled JS output (git-ignored)
│   └── package.json
├── firebase.json         # Hosting + Functions + Firestore + emulators config
├── firestore.rules       # Security rules
├── firestore.indexes.json
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
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_VERIFY_SERVICE_SID
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set ACUITY_API_USER_ID   # optional
firebase functions:secrets:set ACUITY_API_KEY        # optional
```

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
  /waiverTemplates/{id}
  /clientWaivers/{id}
  /clientCommunications/{id}
  /auditLogs/{id}                    ← written by Cloud Functions only
  /marketingCampaigns/{id}
  /marketingTemplates/{id}
  /marketingAutomations/{id}
  /campaignRecipients/{id}
  /marketingIntegrations/{id}        ← stores Resend/Twilio API keys
  /acuitySyncConfig/{id}
  /acuitySyncLogs/{id}
waiverTokens/{token}                 ← public token lookup for waiver signing
```

---

## Authentication Flow

1. User enters phone number → calls `sendVerification` Cloud Function → Twilio sends SMS OTP
2. User enters OTP → calls `verifyOtp` Cloud Function → Twilio validates → returns Firebase custom token
3. Client calls `signInWithCustomToken(auth, token)` → Firebase session established
4. `onAuthStateChanged` fires → `AuthContext` loads user profile from `users/{uid}`
5. Profile contains `organizationId` and `role` used for all subsequent access control

Auth is in `src/contexts/AuthContext.tsx`. Use `useAuth()` to access `user`, `profile`, `signOut`, `refreshProfile`.

---

## Role-Based Access Control

Roles: `admin` | `staff` | `reception` | `beautician`

Permission matrix:
- **admin** — full access to everything
- **staff** — clients, appointments, treatments, packages, products
- **reception** — view clients/appointments, manage appointments
- **beautician** — view clients, appointments, treatments

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
| `sendVerification` | `onCall` | Send Twilio SMS OTP |
| `verifyOtp` | `onCall` | Verify OTP, return Firebase custom token |
| `sendClientEmail` | `onCall` | Send email via Resend API |
| `sendWaiver` | `onCall` | Send waiver link via SMS |
| `acuitySync` | `onCall` | Manual Acuity Scheduling sync |
| `acuityWebhook` | `onRequest` | Acuity webhook receiver |
| `adminCreateUser` | `onCall` | Admin-only user creation |

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

## Do Not Change

- `src/components/ui/` — shadcn/ui components, regenerate with `shadcn` CLI if needed
- `tailwind.config.ts` — design tokens
- `src/lib/dataSanitization.ts` — data cleaning logic, changes here affect the whole app
- `src/lib/validation.ts` — Zod schemas used across forms
- `firestore.rules` — security rules, test changes with the emulator before deploying

---

## Manual Firebase Console Setup Required

These cannot be done via CLI and must be completed in the [Firebase Console](https://console.firebase.google.com/project/beauty-hub-pro-app):

1. **Enable Phone Authentication** → Authentication → Sign-in methods → Phone → Enable
2. **Add authorized domains** → Authentication → Settings → Authorized domains (add production domain)
3. **Set Firestore location** — already set to `us-central1` during init
4. **Storage** — if file uploads are added later, enable Firebase Storage
