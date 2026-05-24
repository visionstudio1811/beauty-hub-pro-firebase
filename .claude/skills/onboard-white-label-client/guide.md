# White-Label Client Onboarding Guide

Step-by-step process to add a new salon/spa to Beauty Hub Pro under their own brand domain (`crm.<brand>.com`). Every step is required unless marked optional.

**Time:** ~30 min hands-on + 15 min – 2 hr waiting for SSL cert.

---

## Prerequisites

You should have:

- The client's brand slug (e.g. `lumiereut`, `glowspa`) — used in `crm.<brand>.com`
- The client's `organizationId` in Firestore (look it up in `organizations` collection)
- Access to the Firebase Console for `beauty-hub-pro-app`
- Access to the client's DNS provider (or be ready to send them DNS records to add themselves)

**Naming convention:** the subdomain MUST be `crm.<brand>.com`. The `isAppOnlyHost` check in `src/pages/Index.tsx` only hides the Beauty Hub Pro marketing page on `crm.*` hosts. A non-conforming subdomain like `app.theirbrand.com` would leak the wrong brand on their root URL.

---

## Step 1 — Firebase Hosting (custom domain)

1. Open https://console.firebase.google.com/project/beauty-hub-pro-app/hosting/sites
2. Select the `beauty-hub-pro-app` site
3. Click **Add custom domain** → enter `crm.<brand>.com`
4. Firebase shows DNS records (an A record + sometimes a TXT verification record)
5. Either add them yourself (if you manage their DNS) or send them to the client

**Cloudflare gotcha:** if the domain is behind Cloudflare, the DNS record MUST be set to "DNS only" (grey cloud), not "Proxied" (orange cloud). Proxy mode breaks Firebase's SSL cert renewal — the site silently fails ~90 days later when the cert can't renew.

**Apex domain note (only if they want the apex too, not just `crm.`):** Firebase requires two A records on the apex: `199.36.158.100` and `199.36.158.101`.

Wait for Firebase to show "Connected" status (15 min – 2 hr while SSL cert is provisioned).

---

## Step 2 — Firebase Auth (authorized domains)

Without this, Google sign-in fails with `auth/unauthorized-domain`.

1. Open https://console.firebase.google.com/project/beauty-hub-pro-app/authentication/settings
2. Scroll to **Authorized domains**
3. Click **Add domain** → enter `crm.<brand>.com`
4. Save

Takes effect immediately.

---

## Step 3 — Firestore org doc (`crm_domain`)

The `getClientPortalOrg` Cloud Function (and the host check in `src/pages/Index.tsx`) resolve the org by hostname. If `crm_domain` is not set on the org doc, the client portal at `crm.<brand>.com/client` returns "Portal not found" even if DNS and hosting are correct.

In Firestore Console:

1. Open `organizations/{orgId}` for the new client
2. Add field `crm_domain` (string) → value `crm.<brand>.com` (no `https://`, no path)
3. Save

Alternative field names also supported: `custom_domain`, `domain`, or `portal_domains` (array). But `crm_domain` is the recommended one.

---

## Step 4 — Drive backup OAuth allowlist

The `getDriveAuthUrl` callable validates the `returnTo` origin against a hardcoded allowlist (anti-redirect attack protection). Without this step, when the client clicks "Connect Google Drive" the callable rejects with `returnTo origin not allowed`.

1. Open `functions/src/oauth/driveOAuth.ts`
2. Find `ALLOWED_RETURN_ORIGINS` (around line 12)
3. Add the new origin:

   ```ts
   const ALLOWED_RETURN_ORIGINS = [
     'https://crm.lumiereut.com',
     'https://crm.<brand>.com',  // ← new client
     'https://app.beautyhubpro.com',
     'https://beauty-hub-pro-app.web.app',
     'https://beautyhubpro.com',
     'https://www.beautyhubpro.com',
   ];
   ```

4. Deploy only the OAuth functions:

   ```bash
   cd /Users/davidelkobey/Downloads/beauty-hub-pro-firebase
   npx firebase-tools@latest deploy --only \
     functions:getDriveAuthUrl,functions:driveOAuthCallback,functions:disconnectDriveBackup
   ```

5. Commit the change to git so it's not lost on the next deploy.

**You do NOT need to touch:**
- Google Cloud Console OAuth client (the redirect URI is fixed and shared)
- OAuth secrets (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET` — all shared)
- Drive API enablement (already on)
- The client's own Google account or Drive (they connect themselves through the UI)

---

## Step 5 — Seed default waiver templates

Every new org needs the standard intake and agreement-of-purchase templates. The masters live in the top-level `defaultWaiverTemplates` Firestore collection and use `{{ORG_NAME}}` as the brand token. The `seedOrgDefaultTemplates` callable substitutes the new org's name and copies them into `organizations/{orgId}/waiverTemplates/`.

The callable is admin-only and enforces `caller.organizationId == request.organizationId`, so the easiest path is to seed via Admin SDK from a local script using the org ID directly. Run from the project root:

```bash
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const db = admin.firestore();
(async () => {
  const ORG_ID = '<paste new org ID>';
  const orgSnap = await db.collection('organizations').doc(ORG_ID).get();
  const orgName = orgSnap.data().name;
  const masters = await db.collection('defaultWaiverTemplates').get();
  const target = db.collection('organizations').doc(ORG_ID).collection('waiverTemplates');
  const existing = await target.get();
  const haveKinds = new Set(existing.docs.map(d => d.data().kind));
  for (const m of masters.docs) {
    const data = m.data();
    if (haveKinds.has(data.kind)) { console.log('skip', data.kind, '(exists)'); continue; }
    const branded = JSON.parse(JSON.stringify(data).split('{{ORG_NAME}}').join(orgName));
    branded.organization_id = ORG_ID;
    branded.created_at = admin.firestore.FieldValue.serverTimestamp();
    branded.updated_at = admin.firestore.FieldValue.serverTimestamp();
    branded.updated_at_ts = Date.now();
    branded.seeded_from = m.id;
    const ref = await target.add(branded);
    console.log('seeded', data.kind, '→', ref.id);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"
```

The seed is idempotent — if a template of that kind already exists, it skips (won't overwrite).

After seeding, verify in Firestore that `organizations/<orgId>/waiverTemplates/` contains one `kind: 'intake'` and one `kind: 'agreement'`, and that the brand name reads correctly inside `content[].value` and `content[].label` strings.

---

## Step 6 (optional) — DNS sanity check

If the client uses Cloudflare, double-check before handing off:

```bash
dig crm.<brand>.com
```

The answer should resolve to Firebase's hosting IPs (`151.101.x.x` range or similar), not Cloudflare's `104.x.x.x`. If you see Cloudflare IPs, the proxy is still on — flip to grey cloud.

---

## Verification checklist

Run all of these in incognito (to avoid stale auth):

1. **Marketing page hidden:** `https://crm.<brand>.com/` should redirect to `/auth`. If it shows the Beauty Hub Pro marketing landing, Step 1 succeeded but the subdomain isn't `crm.*` — re-check Step 1.
2. **Login works:** sign in with a staff account on the new domain. If you get `auth/unauthorized-domain`, Step 2 was skipped.
3. **Client portal resolves:** `https://crm.<brand>.com/client` should show the client portal login (not "Portal not found"). If it errors, Step 3 was skipped or the field name is wrong.
4. **Drive Connect works:** Marketing → Integrations → Drive Backup → **Connect Google Drive** → complete OAuth → should redirect back to `crm.<brand>.com` with a success toast. If you see `returnTo origin not allowed`, Step 4 was skipped or not deployed.
5. **Templates seeded:** Settings → Waivers → there should be one "Intake" and one "Agreement of Purchase" template, both showing the new brand's name inside the body text (not Lumière). If they're missing, Step 5 was skipped.

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Portal not found" on `/client` | `crm_domain` field missing on org doc | Step 3 |
| `auth/unauthorized-domain` on Google sign-in | Domain not in Auth allowlist | Step 2 |
| Marketing page shows on root URL | Subdomain doesn't start with `crm.` | Use `crm.<brand>.com` only |
| `returnTo origin not allowed` on Drive Connect | Not in `ALLOWED_RETURN_ORIGINS` or not deployed | Step 4 + deploy |
| Site works for ~90 days then breaks | Cloudflare proxy on (orange cloud) | Flip to "DNS only" (grey cloud) |
| SSL cert never issues | DNS records wrong or Cloudflare proxy on | Check `dig` output, fix DNS |
