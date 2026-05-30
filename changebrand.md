# Rebrand: Beauty Hub Pro → The Golden Circle CRM

## Context

Current brand: **Beauty Hub Pro**, master domain `beautyhubpro.com`, Firebase project `beauty-hub-pro-app`. Target brand: **The Golden Circle CRM**. Domain swap deferred until a new domain is registered.

## What is NOT changing

- **Firebase project ID** `beauty-hub-pro-app` stays. It's the internal infrastructure name (Cloud Functions URLs, default Auth domain, Storage bucket, default hosting URL). End users never see it; only admins in the Firebase Console do. Changing it requires a full project migration (Firestore export/import, Auth user re-creation — all UIDs change so every client has to re-login, Storage file copy, redeploy all 40+ functions, OAuth re-config). Standard practice is to leave it.
- **Master domain `beautyhubpro.com`** stays in Phase 1. Phase 2 (later) will swap it once a new domain is registered.
- **White-label client domains** (`crm.lumiereut.com`, `crm.gayabeautyspa.com`, etc.) are entirely unaffected. Each org carries its own `crm_domain` field in Firestore and the host-routing code already handles them via a `crm.*` pattern match, not a hard-coded list.
- **`info@beautyhubpro.com` / `leads@beautyhubpro.com`** sender email addresses stay until Phase 2 (they're tied to the current domain's Resend setup).

Outcome of Phase 1: wherever a real user saw "Beauty Hub Pro" or "BeautyHub", they now see "The Golden Circle CRM". URLs and email addresses are unchanged.

---

## Phase 1 — Brand-name strings

### Group A — User-visible UI text (5 files)

These appear on screens end users actually look at.

| File | Line(s) | Change |
|---|---|---|
| `src/pages/Auth.tsx` | 124 | Login hero heading `"BeautyHub Pro"` → `"The Golden Circle CRM"` |
| `src/components/AppSidebar.tsx` | 87 | Fallback workspace name `'Beauty Hub'` → `'The Golden Circle'` (shown only when an org has no name set) |
| `src/components/AcuityIntegration.tsx` | 299 | Settings card copy "Connect your Beauty Hub Pro system with..." → "Connect your Golden Circle CRM with..." (reflow grammar so "The" doesn't double up) |
| `src/components/marketing/GoogleDriveIntegration.tsx` | 189, 214 | Default Drive folder display name `"Beauty Hub Pro Backups"` → `"The Golden Circle CRM Backups"` |
| `index.html` | 7, 21 | `<title>` and OpenGraph `og:title` → `"The Golden Circle CRM"` |

### Group B — PWA manifest (1 file)

| File | Change |
|---|---|
| `public/manifest.webmanifest` | `"name": "BeautyHub Client Portal"` → `"The Golden Circle CRM Client Portal"`; `"short_name": "BeautyHub"` → `"Golden Circle"` |

### Group C — Email sender display names (8 files)

These are the fallback `fromName` used when an org's `marketingIntegrations.resend.configuration.fromName` is unset. **In practice most existing orgs already have their own** (Lumière sends as "Lumière Beauty & Spa Murray", etc.), so this only affects orgs that haven't configured Resend yet — but the strings need updating for correctness and future onboarding.

Replace `'Beauty Hub Pro'` with `'The Golden Circle CRM'` in:

- `functions/src/lib/orgEmail.ts` line 66 — the shared helper used by multiple senders
- `functions/src/sendClientEmail.ts` line 118
- `functions/src/sendWaiver.ts` line 185
- `functions/src/notifyOrgOnWaiverSigned.ts` lines 21, 75
- `functions/src/sendMarketingCampaign.ts` lines 163, 170
- `functions/src/appointmentScheduledNotification.ts` line 190 — existing post-approval email
- `functions/src/scheduling/bookingEmailSend.ts` — new shared booking-email helper (fallback inside `renderAndSend`)
- `functions/src/testResendIntegration.ts` line 45 — dev-only, low priority but worth doing for consistency
- `functions/src/oauth/driveOAuthCallback.ts` — Google Drive backup folder name created by the OAuth callback

### Group D — Docs (2 files, recommended)

| File | Why update |
|---|---|
| `README.md` | Top-of-repo brand; first thing any new dev sees |
| `CLAUDE.md` | Long-form project guide. Mentions "Beauty Hub Pro" in the Project Overview + Hosting & Domains sections. Update only the brand-name references; **leave the `beautyhubpro.com` domain references alone for Phase 2** |

Optionally also: `INFOBIP_INTEGRATION.md`, `planaivoice.md`, `.claude/skills/onboard-white-label-client/guide.md`, `.claude/skills/onboard-white-label-client/SKILL.md` — internal dev docs.

### Deploy Phase 1

```bash
npm run build
npm --prefix functions run build
npx firebase-tools@latest deploy --only functions,hosting:app
```

---

## Phase 2 — Master domain swap (when a new domain is registered)

### Code (6 small edits)

1. `src/pages/Index.tsx` line 10 — replace `'app.beautyhubpro.com'` with `'app.<newdomain>'`
2. `src/components/settings/SchedulerLinks.tsx` line 69 — replace fallback `'beautyhubpro.com'`
3. `functions/src/scheduling/createSchedulerLink.ts` line 43 — replace fallback URL `'https://beautyhubpro.com'`
4. `functions/src/oauth/driveOAuth.ts` lines 13–18 — add new domain(s) to the OAuth return-origin allowlist (keep the old ones during transition)
5. `functions/src/sendWaiver.ts` line 173 — update fallback site URL `'https://beauty-hub-pro-app.web.app'`
6. (Optional) `info@…` and `leads@…` email addresses across the 5 functions, if email is moved to the new domain: `functions/src/lib/orgEmail.ts:67`, `functions/src/sendMarketingCampaign.ts:164`, `functions/src/sendClientEmail.ts:119`, `functions/src/submitQuoteRequest.ts:14`

### Infrastructure

- **DNS** at registrar: A records pointing apex `<newdomain>` to Firebase's two IPs (`199.36.158.100`, `199.36.158.101`) + CNAME for `app.<newdomain>` to Firebase Hosting. If going through Cloudflare, DNS records **must** be "DNS only" (grey cloud), not "Proxied" — this has bitten before (Firebase cert renewal breaks under proxy).
- **Firebase Console → Hosting → site `beauty-hub-pro-app`** — add `<newdomain>` and `app.<newdomain>` as custom domains
- **Firebase Console → Authentication → Settings → Authorized domains** — add both new domains; without this Google sign-in fails with `auth/unauthorized-domain`
- **Google OAuth Console** (for Drive backup) — add new redirect URI(s) if you want OAuth to return to the new domain
- **Resend / email DNS** — if you want `*@<newdomain>` to send/receive, verify the domain in Resend and update DKIM/SPF records
- Wait 15min–2h for SSL cert issuance after Firebase Hosting custom domain is verified

Phase 2 effort: ~1 hour of code + DNS work + ~24h propagation/cert issuance. **No Firestore data migration required.** White-label client domains continue working unchanged.

---

## Verification

### After Phase 1 deploy

1. Open `https://beauty-hub-pro-app.web.app/auth` → login page shows "The Golden Circle CRM" hero header
2. Open `https://beauty-hub-pro-app.web.app/` → browser tab title shows "The Golden Circle CRM"
3. Install the client portal as a PWA → app shortcut name is "The Golden Circle CRM Client Portal"
4. Log in as a user whose org has no name set → sidebar header shows "The Golden Circle" instead of "Beauty Hub". (For Lumière / Gaya / Beauty Hub Pro orgs this is unchanged because they have names set.)
5. Settings → Acuity → card copy reads naturally with the new brand
6. Trigger a test email through a flow that uses a fallback `fromName` (e.g. via an org that hasn't set its own Resend config) → email's "From" field shows "The Golden Circle CRM \<info@beautyhubpro.com\>". Old email address is fine in Phase 1; just the display name updates.
7. Re-run lint + type-check + functions build to catch any string usage missed

### Regression checks (existing orgs)

- Lumière, Gaya, and any other org with their own `name` + own Resend `fromName` should be **entirely unaffected**. UI, emails, and sender names continue as they were.
- White-label client portals at `crm.lumiereut.com/client`, `crm.gayabeautyspa.com/client` etc. continue working — they read org branding from Firestore, not from any compiled-in string.
- Existing scheduler links + booking flow: unchanged. URLs in `schedulerLinkTokens` and `schedulerLinks` still resolve under `beautyhubpro.com` until Phase 2.

### Risk

- **Low.** Phase 1 is mostly string replacement in fallback paths. The only place a real production email's display name changes is when an org hasn't configured its own `fromName` — and most active orgs have.
- Biggest cosmetic risk: grammar. "The Golden Circle CRM" is a longer noun phrase than "Beauty Hub Pro" and may read awkwardly inside sentences ("Connect your **The Golden Circle CRM** system..."). During edits, lightly reflow surrounding copy so "The" doesn't double up or sound clunky.
