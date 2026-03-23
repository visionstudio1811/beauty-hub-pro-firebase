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
2. **Add authorized domains** → Authentication → Settings → Authorized domains
3. **Register a web app** → Project Settings → Add app → Web → copy config into `.env`
