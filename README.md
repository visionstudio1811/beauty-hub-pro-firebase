# Beauty Hub Pro

A multi-tenant salon and spa management platform for appointments, clients, staff, treatments, packages, waivers, and marketing.

**Live URL:** https://beauty-hub-pro-app.web.app
**GitHub:** https://github.com/visionstudio1811/beauty-hub-pro-firebase
**Firebase project:** `beauty-hub-pro-app`

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **UI:** shadcn/ui + Radix UI + Tailwind CSS
- **Database:** Firebase Firestore
- **Auth:** Firebase Auth (phone OTP via Twilio)
- **Backend:** Firebase Cloud Functions v2 (Node.js 20)
- **Hosting:** Firebase Hosting
- **Email:** Resend API
- **SMS/OTP:** Twilio Verify
- **Scheduling sync:** Acuity Scheduling

---

## Client Portal

Each white-label spa has a client-facing PWA portal that clients can save to their phone home screen.

For white-label CRM domains, use:

```
https://crm.CLIENTDOMAIN.com/client
```

Example:

```
https://crm.lumiereut.com/client
```

Fallback URL with an explicit organization slug:

```
https://crm.CLIENTDOMAIN.com/client/ORG-SLUG
```

The portal resolves the organization by domain first. For reliable white-label routing, set one of these fields on the organization document:

```js
crm_domain: "crm.lumiereut.com"
```

Supported alternatives are `custom_domain`, `domain`, or `portal_domains: ["crm.lumiereut.com"]`.

Client access is not a staff CRM account. Clients sign in with Google or phone OTP, and the backend grants portal access only when the signed-in email or phone matches an active CRM client card in that organization. After matching, clients can view their own active packages, assigned products, issued invoices, appointments, and booking requests.

Booking from the portal is request-based. A client submits a preferred slot and optional backup time; staff approve or reject the request in the CRM Appointments page. Only after approval does the system create the CRM appointment, decrement package sessions, and attempt Acuity sync.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`

### Local setup

```bash
# Clone the repo
git clone https://github.com/visionstudio1811/beauty-hub-pro-firebase.git
cd beauty-hub-pro-firebase

# Install frontend dependencies
npm install

# Install Cloud Functions dependencies
cd functions && npm install && cd ..

# Copy env file and fill in your Firebase config
cp .env.example .env
```

Fill `.env` with values from [Firebase Console → Project Settings → Your apps](https://console.firebase.google.com/project/beauty-hub-pro-app/settings/general):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=beauty-hub-pro-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=beauty-hub-pro-app
VITE_FIREBASE_STORAGE_BUCKET=beauty-hub-pro-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Run locally

```bash
npm run dev          # Frontend dev server → http://localhost:8080
firebase emulators:start  # Firebase emulators (Auth, Firestore, Functions, Hosting)
```

---

## Deployment

```bash
# Build frontend
npm run build

# Build Cloud Functions
cd functions && npm run build && cd ..

# Deploy everything
firebase deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

After client portal changes, deploy at least:

```bash
npm run build
firebase deploy --only hosting,functions,firestore:rules
```

---

## Cloud Function Secrets

Set these once via the Firebase CLI (stored in Google Secret Manager):

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_VERIFY_SERVICE_SID
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set ACUITY_API_USER_ID   # optional
firebase functions:secrets:set ACUITY_API_KEY        # optional
```

---

## Project Structure

```
beauty-hub-pro-app/
├── src/
│   ├── components/       # UI components
│   ├── contexts/         # React context providers (one per domain)
│   ├── hooks/            # Data access hooks
│   ├── lib/
│   │   ├── firebase.ts   # Firebase client init
│   │   ├── validation.ts # Zod schemas
│   │   └── dataSanitization.ts
│   ├── pages/            # Route-level page components
│   ├── types/
│   │   └── firestore.ts  # TypeScript interfaces for Firestore collections
│   └── App.tsx
├── functions/
│   └── src/              # Cloud Functions (TypeScript)
├── firebase.json         # Firebase config
├── firestore.rules       # Firestore security rules
├── firestore.indexes.json
└── .env.example
```

---

## Manual Firebase Console Steps

Before first deploy, complete these in the [Firebase Console](https://console.firebase.google.com/project/beauty-hub-pro-app):

1. **Enable Phone Authentication** → Authentication → Sign-in methods → Phone → Enable
2. **Enable Google Authentication** → Authentication → Sign-in methods → Google → Enable
3. **Add authorized domains** → Authentication → Settings → Authorized domains
   - Add each white-label CRM host, e.g. `crm.lumiereut.com`
   - Add the Firebase hosting host, e.g. `beauty-hub-pro-app.web.app`
4. **Register a web app** → Project Settings → Add app → Web → copy config into `.env`
5. **Set organization portal domain** → Firestore → `organizations/{orgId}`:
   ```js
   crm_domain: "crm.lumiereut.com"
   ```
