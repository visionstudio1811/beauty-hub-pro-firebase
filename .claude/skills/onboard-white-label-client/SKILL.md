---
name: onboard-white-label-client
description: Onboard a new white-label salon/spa to Beauty Hub Pro — set up custom CRM domain, Firebase Auth, Firestore org doc, and Google Drive backup allowlist.
---

# Onboard White-Label Client

When the user asks to onboard a new client (e.g. "add new client", "onboard a salon", "set up crm.<brand>.com"), follow the full process in `guide.md` in this skill's directory.

## Quick reference

The process has four required steps and one optional step:

1. **Firebase Hosting** — add custom domain `crm.<brand>.com`
2. **Firebase Auth** — add `crm.<brand>.com` to authorized domains
3. **Firestore org doc** — set `crm_domain: "crm.<brand>.com"` on `organizations/{orgId}`
4. **Drive backup allowlist** — add `https://crm.<brand>.com` to `ALLOWED_RETURN_ORIGINS` in `functions/src/oauth/driveOAuth.ts`, then deploy the OAuth functions
5. *(Optional)* DNS sanity check if the client uses Cloudflare — proxy must be OFF (grey cloud)

Read `guide.md` for the detailed steps, gotchas, and verification checklist.

## What information to gather first

Before starting, get these from the user:

- The client's brand name (used to generate `crm.<brand>.com` and decide if the convention works)
- The client's `organizationId` in Firestore (or the org's display name to look up)
- Whether the client manages their own DNS or you're sending them DNS records

## Verification

After completing the steps, verify by:

1. Opening `https://crm.<brand>.com/auth` in incognito → should show the CRM login (not the Beauty Hub Pro marketing page)
2. Logging in with a staff account → should land on the admin dashboard
3. Going to Marketing → Integrations → Drive Backup → clicking **Connect Google Drive** → completing OAuth → should redirect back to `crm.<brand>.com` with a success toast (not "returnTo origin not allowed")
