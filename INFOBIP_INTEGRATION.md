# Infobip SMS Integration — Process & Status

**Last updated:** 2026-05-20
**Owner:** David (visionyourbrand@gmail.com)
**Status:** 🟡 Code complete — waiting on TCR campaign approval before production sends

---

## 1. Goal

Wire Infobip as an SMS provider for Beauty Hub Pro's marketing feature, first
client being **Lumière** (`crm.lumiereut.com`). Twilio is kept as a parallel
option — each organization chooses its own provider.

---

## 2. Key decisions made

| Decision | Choice | Reason |
|---|---|---|
| Credential model | **Per-organization** | Each org brings its own Infobip account; matches existing Twilio pattern |
| Credential storage | `organizations/{orgId}/marketingIntegrations/infobip` | Reuses existing admin-only, get-only, no-list rules |
| Twilio | **Kept as an option** | Orgs can choose Twilio or Infobip; disabling an integration removes it from the campaign dropdown |
| Email provider | **Unchanged (Resend)** | Infobip scoped to SMS only |
| Channels in scope | **Marketing SMS only** | No OTP/2FA for now — revisit later |

### Infobip API key scopes (tell each org's admin to tick ONLY these)

```
sms:message:send     ← campaigns + automations
sms:logs:read        ← delivery status
```

Do NOT enable: `*:manage`, `web:sdk`, `2fa:sdk`, email, WhatsApp, platform,
or billing scopes. When OTP is added later, add `2fa:message:send` +
`2fa:application:read` to the same key.

---

## 3. US SMS regulation — why alphanumeric sender failed

US carriers (Verizon/AT&T/T-Mobile) **do not allow alphanumeric sender IDs**
("Lumiere"). US A2P marketing SMS requires a **10DLC number registered with
The Campaign Registry (TCR)**. This is a carrier rule, not an Infobip rule —
same on Twilio.

### TCR registration details used

- **Vertical:** Professional Services (or Health & Wellness if offered)
- **Use case:** Mixed (Marketing + Account Notifications + Customer Care)
- **Brand:** ✅ Registered and **approved**
- **10DLC number:** ✅ Provisioned
- **Campaign:** ⏳ Submitted — **awaiting TCR approval** (1–7 days typical)

Campaign sample messages, opt-in description, HELP/STOP responses, and the
privacy-policy SMS clause were all drafted during setup. Every marketing SMS
must end with `Reply STOP to unsubscribe.`

---

## 4. Current status (2026-05-20)

| Item | Status |
|---|---|
| TCR brand registration | ✅ Approved |
| 10DLC number | ✅ Provisioned |
| TCR campaign | ⏳ **Waiting for approval** |
| Code (backend + frontend) | ✅ Complete, compiles clean |
| Code deployed to Firebase | ❌ Not yet — see Section 6 |
| Infobip key saved in CRM | ❌ Not yet — do after deploy |
| Production smoke test | ❌ Blocked on TCR approval |

**Blocker:** TCR campaign approval. Until carriers approve the campaign,
sends from the 10DLC number get filtered. Nothing else is blocking.

---

## 5. What was built

### Backend (`functions/src/`)

- **`lib/smsProviders.ts`** (new) — shared `sendViaTwilio`, `sendViaInfobip`,
  `sendSms`, `resolveProvider`, `ensureOptOutSuffix`, `normalizePhoneE164`.
  All SMS goes through `sendSms`, which normalizes phone numbers to E.164
  (`+1XXXXXXXXXX`) and appends the STOP suffix.
- **`sendMarketingCampaign.ts`** (new) — `executeCampaign()` core + admin-only
  `onCall` wrapper. Resolves audience (all/active/inactive/birthday/expiring),
  sends SMS/email, writes per-recipient `campaignRecipients` rows, updates
  campaign counters. Rate limit: 20 campaign sends/day/org. Supports `dryRun`.
- **`scheduledCampaigns.ts`** (new) — `runScheduledCampaigns`, sweeps every
  15 min for `status == 'scheduled' && scheduled_at <= now()` and runs them.
- **`sendWaiver.ts`** (edited) — refactored to use the shared SMS lib; waiver
  SMS now gets E.164 normalization for free.
- **`index.ts`** (edited) — exports `sendMarketingCampaign`, `runScheduledCampaigns`.

### Frontend (`src/`)

- **`pages/Marketing.tsx`** — live `onSnapshot` campaign list (was a
  placeholder). Per-campaign **Preview** (dry-run) and **Send Now** buttons.
- **`components/marketing/CampaignCreationModal.tsx`** — SMS provider selector
  (Infobip/Twilio, only enabled ones shown); persists `sms_provider`. New
  campaigns save as `draft`.
- **`components/clients/EnhancedClientDetailsModal.tsx`** — `sms_opt_out` /
  `email_opt_out` checkboxes in the client edit form.

### Config

- **`firestore.indexes.json`** — added composite index
  `marketingCampaigns (status ASC, scheduled_at ASC)` for the scheduler sweep.
- **`firestore.rules`** — no change needed (existing rules already correct).

### Compliance baked in

- `Reply STOP to unsubscribe.` auto-appended to marketing SMS when missing.
- Phone numbers auto-normalized to E.164 before sending.
- `client.sms_opt_out` / `client.email_opt_out` respected at send time.
- Per-org daily rate limit on campaign sends.

---

## 6. Deployment (do this once, can be done before TCR approval)

From the project root:

```bash
npx firebase-tools@latest deploy --only firestore:indexes,functions
```

The new `marketingCampaigns` composite index builds in the background (~5 min).
Until it finishes, the scheduler sweep throws "missing index" — harmless, it
self-resolves once the index is built.

---

## 7. Testing checklist

### Phase 1 — can do now (before TCR approval)

- [ ] Deploy code (Section 6)
- [ ] `npx firebase-tools@latest functions:list` — confirm `sendMarketingCampaign`
      and `runScheduledCampaigns` are listed
- [ ] Check Infobip portal → SMS → Numbers → 10DLC status
- [ ] curl test to own phone (see command below)
- [ ] Save Infobip key + sender + base URL in CRM → Marketing → Integrations
- [ ] Verify in Firestore: `organizations/{orgId}/marketingIntegrations/infobip`
      has `is_enabled: true` and config fields filled

**curl smoke test** (replace the 4 placeholders):

```bash
curl -X POST 'https://YOUR_BASE_URL/sms/2/text/advanced' \
  -H 'Authorization: App YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"from":"+1YOUR10DLC","destinations":[{"to":"+1YOURPHONE"}],"text":"Lumiere test"}]}'
```

Expect `messageId` + `status.groupName: PENDING/DELIVERED`.
- `40101 Unauthorized` → wrong key or base URL
- `Sender not allowed` → TCR not approved yet (expected pre-approval)

### Phase 2 — after TCR approval (production test)

- [ ] Create a test client with your own phone + email
- [ ] Create an SMS campaign, audience "All Clients", content with `{first_name}`
- [ ] Click **Preview** — confirm recipient count + sample
- [ ] Click **Send Now** — SMS arrives < 60s, ends with STOP suffix
- [ ] Reply STOP from your phone — confirm Infobip gateway unsubscribe
- [ ] Tick "Opted out of SMS marketing" on the test client → Preview again →
      count drops by 1
- [ ] (Optional) Schedule a campaign 5 min out → confirm it fires within 15 min

⚠️ **Send Now contacts every client with a phone.** Until you have real
clients segmented, test only with an empty client list + one test client,
or narrow the target audience.

---

## 8. Known gaps (parked — not blocking launch)

- **Marketing automations** — `AutomationCreationModal.tsx` still only
  `console.log`s; automations are not persisted or run. Separate feature.
- **Inbound STOP webhook** — Infobip handles STOP at the gateway (compliant),
  but opt-outs don't sync back into client docs. Add `inbound-message:read`
  scope + an HMAC-verified webhook when clean opt-out data is wanted.
- **Email open/click tracking** — no Resend webhook / UTM tracking yet.
- **Branded marketing email templates** — campaign emails use a plain HTML
  wrapper; `sendClientEmail.ts` has a richer template engine to reuse later.

---

## 9. Next session — pick up here

When the TCR approval email arrives:

1. Run the Phase 1 curl test → should now succeed.
2. Make sure code is deployed (Section 6).
3. Save / re-confirm the Infobip credentials in the CRM.
4. Run the full Phase 2 checklist.
5. If a send fails: check `organizations/{orgId}/campaignRecipients/{id}` →
   `errors` field for the exact provider error.
6. Once smoke test passes, disable Twilio for Lumière (optional) and create
   the first real campaign.
