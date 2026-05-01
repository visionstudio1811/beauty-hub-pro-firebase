# AI Voice Agent — Appointment Confirmation Calls

## Context

Beauty Hub Pro currently confirms appointments via SMS waivers and manual staff effort. We want an AI voice agent that places outbound calls to clients before their appointment, asks them to confirm, and either updates the appointment status or offers to reschedule. This reduces no-shows (the highest-leverage metric for salon revenue) and removes the receptionist task of dialing every client the day before.

The user wants something "like Grok" but after researching the realistic options, **ElevenLabs Conversational AI is the right pick** — best voice quality, native Infobip SIP trunking (the salon already has Infobip credentials per-org for SMS), and a 2+ year mature platform. Grok's API is 1 week old with no Twilio/Infobip reference repo and no published voice-API SLA — too new for revenue-critical confirmation calls.

## Final scope (locked decisions)

| Decision | Answer |
|---|---|
| Voice AI provider | **ElevenLabs Agents** (`grok-voice-think-fast-1.0` reconsidered in ~6 months) |
| Telephony | **Infobip SIP trunking** — reuse per-org `marketingIntegrations/infobip`, extend with SIP creds |
| Caller ID | Each salon's existing Infobip number (no platform-shared number) |
| Triggers | Manual "Call to confirm" button **and** scheduled 2h-before sweep for unconfirmed |
| Outcomes | Confirm yes/no + offer to reschedule (propose only — staff confirms the rebook) |
| Voicemail | TTS message + SMS text-back link via existing Infobip SMS path |
| Language | English only (v1) |
| Compliance | TCPA AI disclosure as agent's first sentence; recording **off** by default |

## Architecture overview

```
Staff clicks "Call to confirm"  ──►  triggerConfirmationCall (callable)
                                          │
                                          ▼
                            POST /v1/convai/sip-trunk/outbound-call ─► ElevenLabs
                                          │                                │
                                          ▼                                ▼
                                  voiceCalls/{id}             SIP INVITE → Infobip → client phone
                                  status: ringing                          │
                                                                           ▼
                                                              Mid-call: agent invokes tools
                                                              ─► voiceAgentTool (HTTP, JWT-scoped)
                                                                  /confirm  /cancel
                                                                  /lookupRescheduleSlots
                                                                  /requestReschedule
                                                                           │
                                                                           ▼
                                                              Post-call: ElevenLabs webhook
                                                              ─► elevenlabsWebhook (HMAC-verified)
                                                                  Updates appointment + voiceCalls
                                                                  + clientCommunications + auditLogs
                                                                  If voicemail → SMS via Infobip
```

## Data model

### New fields on `organizations/{orgId}/appointments/{id}` (snake_case to match existing convention)
- `confirmation_status`: `'pending' | 'confirmed_by_voice' | 'confirmed_by_sms_reply' | 'declined' | 'reschedule_requested' | 'voicemail_left' | 'no_answer' | 'failed'`
- `confirmation_method`: `'voice' | 'sms_reply' | 'manual_staff'`
- `confirmation_attempted_at`: Timestamp
- `confirmation_confirmed_at`: Timestamp | null
- `voice_call_id`: ref to `voiceCalls/{id}`
- `voice_call_attempts`: number (cap at 2)
- `reschedule_proposals`: array of `{ date, time, staff_id }` (set by agent tool)
- `reschedule_proposed_at`: Timestamp | null
- `sms_fallback_token`: string | null (links to `voiceConfirmTokens/{token}`)

When `confirmation_status === 'confirmed_by_voice'` → also flip `status: 'scheduled' → 'confirmed'`. When `'declined'` → flip `status: 'cancelled'`.

### New collection: `organizations/{orgId}/voiceCalls/{id}`
Audit trail of every call. Fields: `appointment_id, client_id, client_phone, agent_id, agent_phone_number_id, elevenlabs_call_id, conversation_id, trigger ('manual_button' | 'sweep_2h' | 'retry'), triggered_by_uid, status, outcome, ended_reason, duration_seconds, cost_usd, recording_url, transcript_url, transcript_summary, disclosure_played, recording_consent, created_at, started_at, ended_at, error_message`.

Rules: staff read, **CF-only write**.

### New collection: `voiceConfirmTokens/{token}` (top-level)
Mirrors `waiverTokens` exactly — public token redemption for the SMS-fallback "tap to confirm" link. 24h TTL. `get: true`, `list: false`.

### New `marketingIntegrations/elevenlabs` doc
`configuration`: `{ apiKey, agentId, agentPhoneNumberId, webhookSecret, voiceId, agentPromptVersion, defaultLanguage: 'en', recordingEnabled: false, consentLine }`. Inherits existing rules (admin-only `get`).

### Extension of `marketingIntegrations/infobip.configuration`
Add `sipTrunkUri, sipUsername, sipPassword, sipFromNumber, sipEnabled`. Existing SMS fields untouched.

## Cloud Functions to add (under `functions/src/voice/`)

| File | Type | Purpose |
|---|---|---|
| `sharedHelpers.ts` | helpers | Refactor `sendInfobipSms`, `sendTwilioSms` out of `sendWaiver.ts`; add `getElevenLabsConfig`, `writeAuditLog`, `writeClientCommunication` |
| `triggerConfirmationCall.ts` | onCall | Manual-button trigger. Auth + role + rate-limit + quiet-hours + DNC + concurrent-call guard, then ElevenLabs API + voiceCalls write |
| `confirmationCallSweep.ts` | onSchedule (every 15min) | Per-org timezone math; finds appts with status='scheduled' & confirmation_status in (null/'pending'/'no_answer') in 1h45m–2h15m window; cap 25 calls/org/tick |
| `elevenlabsWebhook.ts` | onRequest | HMAC-verified post-call webhook. Idempotent. Updates appt + voiceCalls + clientCommunications + auditLogs. Triggers SMS fallback on voicemail |
| `agentTools.ts` | onRequest (router) | Mid-call tools: `/confirm`, `/cancel`, `/lookupRescheduleSlots`, `/requestReschedule`. JWT-authenticated per call |
| `confirmViaToken.ts` | onCall (no auth) | Public `/confirm/:token` redemption — sets `status='confirmed'` |
| `markAppointmentConfirmedManual.ts` | onCall | Wrapper around existing manual-confirm so it stamps `confirmation_method='manual_staff'` |
| `approveReschedule.ts` | onCall | Staff one-click approves an agent-proposed slot; rebooks + Acuity sync |
| `testElevenLabsConnection.ts` | onCall (admin) | "Test connection" button on integration page |

Add exports to `functions/src/index.ts`.

## Frontend changes

| File | Change |
|---|---|
| `src/components/AppointmentModal.tsx` | Add "Call to confirm" button (role-gated reception+) next to existing actions; embed `VoiceCallStatusBadge`; embed reschedule panel if `confirmation_status === 'reschedule_requested'` |
| `src/components/AppointmentLayouts.tsx` | Phone icon button per scheduled appt card |
| `src/components/appointments/VoiceCallStatusBadge.tsx` (new) | onSnapshot subscription to `voiceCalls/{id}`; live status chip |
| `src/components/appointments/ReschedulePanel.tsx` (new) | Lists proposed slots; "Approve & rebook" calls `approveReschedule` |
| `src/components/marketing/ElevenLabsIntegration.tsx` (new) | Mirror `InfobipIntegration.tsx` shape — API key, agent ID, voice picker, webhook secret, prompt template, "Test connection" |
| `src/components/marketing/MarketingIntegrations.tsx` | Add `elevenlabs` to hard-coded fetch list (line 33-37), tab, and status card |
| `src/components/clients/ClientDetailsModal.tsx` | Add "Call history" widget |
| `src/pages/VoiceConfirmPage.tsx` (new) | Public `/confirm/:token` page; calls `confirmViaToken` |
| `src/App.tsx` | Add `/confirm/:token` route |

## Firestore rules updates (`firestore.rules`)

- Add `voiceCalls/{id}` block: `read: belongsToOrg(orgId) && isReception()`, `write: false`
- Add top-level `voiceConfirmTokens/{token}` block (mirror `waiverTokens` line 337-346, 24h expiry)
- **Lock new appointment fields** from client writes: extend the existing `appointments` `update` rule with `unchanged('confirmation_status')`, `unchanged('voice_call_id')`, `unchanged('voice_call_attempts')`, etc. — only CFs (Admin SDK) can set these
- `marketingIntegrations/elevenlabs` covered by existing rule (no change)

## New composite indexes (`firestore.indexes.json`)

- `voiceCalls(appointment_id ASC, created_at DESC)` — call history per appointment
- `voiceCalls(client_id ASC, created_at DESC)` — call history per client
- `voiceCalls(status ASC, created_at DESC)` — admin "in-flight calls" view
- `appointments(status ASC, appointment_date ASC, appointment_time ASC)` — required for the 2h sweep
- `appointments(confirmation_status ASC, appointment_date ASC)` — "Action needed" reschedule panel

## Security model

**ElevenLabs → our agent-tool callables**: short-lived JWT minted per call.
- New CF secret: `VOICE_TOOL_JWT_SECRET` (HS256, set via `firebase functions:secrets:set`)
- `triggerConfirmationCall` mints token at call init: `{ org_id, appointment_id, voice_call_id, exp: now+30min }`
- Token passed to ElevenLabs in `dynamic_variables.tool_auth_token`; ElevenLabs forwards as `Authorization: Bearer` header on every tool call
- Each tool endpoint verifies signature + exp + matches body params + checks `voiceCalls.status` is in (`ringing`, `in_progress`)
- Rationale: per-call scope, expiring, scope-limited — same pattern as `waiverTokens`

**ElevenLabs → post-call webhook**: HMAC-SHA256 with per-org `webhookSecret`. Mirror `acuityWebhook.ts:29-42` (constant-time compare via `crypto.timingSafeEqual`). Resolve org from `dynamic_variables.organization_id` in payload (only after HMAC verifies — secret is bound to that org so forgery isn't possible).

**API key + SIP password storage**: admin-only `get`, `list:false` (existing rules cover this). Never logged. UI shows `••••` after save; rotation = re-enter.

## Compliance + safety guards

- **TCPA AI disclosure**: agent's first sentence is *"Hi, this is an AI assistant calling on behalf of [SalonName] about your appointment."* Validated on integration save (regex check on prompt template); blocks save if missing
- **Recording disclosure** (CA / two-party-consent states): off by default. If org enables recording, agent's second turn asks consent; declining marks `recording_consent: 'declined'` and stops recording
- **Quiet hours**: no calls outside 9am–8pm in org's local timezone (manual button blocked, sweep skips)
- **Do-not-call**: new `clients/{id}.communication_preferences.voice_calls: false` opt-out — `triggerConfirmationCall` rejects with `failed-precondition`
- **Concurrent-call guard**: transactional check — refuse if another `voiceCalls` doc for same `appointment_id` is in `queued/ringing/in_progress`
- **Per-call retry policy**: 1st no-answer → retry once after 30min; 2nd no-answer → voicemail-to-SMS path; voicemail → SMS, no further calls; confirmed/cancelled → terminal

## Rate limiting (reuses `consumeRateLimit` helper)

- `voiceCallsDaily`: 200/org/day
- `voiceToolPerCall`: 6/voiceCallId (caps agent loops; new helper variant keyed per voice_call_id)

## Audit log entries

`CALL_INITIATED, CALL_FAILED_TO_INITIATE, CALL_COMPLETED, CALL_CONFIRMED_YES, CALL_CONFIRMED_NO, CALL_VOICEMAIL_LEFT, CALL_NO_ANSWER, RESCHEDULE_PROPOSED, RESCHEDULE_APPROVED, CALL_CONFIRMED_BY_SMS, INTEGRATION_TEST, RECORDING_DECLINED_BY_CLIENT`. All written from CFs via Admin SDK. **No PII in `details`** (use IDs and outcome enums; phones live in voiceCalls/clientCommunications already).

## Phasing

### v1 — MVP (1.5–2 weeks)
- Manual "Call to confirm" button + status badge
- Confirm yes/no flow → status updates + Acuity sync
- Voicemail detection → public `/confirm/:token` SMS link via Infobip
- ElevenLabs integration UI + test connection
- HMAC-verified post-call webhook (idempotent)
- Agent tool callables: `/confirm`, `/cancel` only
- voiceCalls audit + per-client/per-appointment call history view
- Firestore rules + 5 new indexes
- TCPA disclosure baked into agent prompt + save-time validation
- Quiet hours guard + DNC check + concurrent-call guard
- Per-org `voice_agent_enabled: boolean` flag for staged rollout (default `false`)

### v2 — Sweep + Reschedule (1 week)
- Scheduled 2h-before sweep (every 15min cron)
- Reschedule proposals panel + agent tools (`/lookupRescheduleSlots`, `/requestReschedule`, `approveReschedule`)
- Voice usage meter chart on integration page
- "Action needed" dashboard tile

### v3 — defer
- Recording opt-in flow + transcript UI
- Inbound SMS via Infobip webhook (true two-way SMS confirmation)
- Multi-language (Spanish first; ElevenLabs supports it)
- Daily aggregation docs for usage meter
- Per-org spend caps + alert emails

**Why v1 skips the sweep:** the manual button gives a controlled cohort to QA voice quality, prompt accuracy, and webhook plumbing on real clients without 50+ calls firing the moment you flip it on. Once 30+ manual calls feel good, turn on the sweep. The user requested both, so v2 is committed — not optional.

## Critical files to modify or reference

- `functions/src/sendWaiver.ts:78-129` — extract Infobip/Twilio SMS helpers into `voice/sharedHelpers.ts`
- `functions/src/acuityWebhook.ts:29-42, 148-247` — HMAC verification template for `voice/elevenlabsWebhook.ts`
- `functions/src/packageExpiryNotifications.ts:20-50, 146-160` — scheduled-function template for `voice/confirmationCallSweep.ts`; per-org timezone iteration
- `functions/src/clientPortal.ts:200-210` — slot-conflict detection logic to reuse in `voice/agentTools.ts` reschedule lookup
- `functions/src/rateLimit.ts` — `consumeRateLimit(orgId, action, limit)` reused as-is
- `firestore.rules:283-288` — existing `marketingIntegrations` rules cover `elevenlabs` automatically
- `firestore.rules:111-117` — existing `appointments` update rule needs to be extended with `unchanged()` checks for new voice fields
- `firestore.rules:337-346` — `waiverTokens` block is the template for `voiceConfirmTokens`
- `src/components/marketing/InfobipIntegration.tsx` — UI shape to mirror for `ElevenLabsIntegration.tsx`
- `src/components/marketing/MarketingIntegrations.tsx:33-37, 81-126, 130-156` — three sites to add the new integration tab

## Verification

End-to-end test scenarios:

| # | Trigger | Expected |
|---|---|---|
| 1 | Manual button, client picks up, says "yes" | `appointments.status='confirmed'`, `confirmation_status='confirmed_by_voice'`, voiceCalls doc with `outcome='confirm_yes'`, audit log present, Acuity synced |
| 2 | Manual button, client says "no" | `status='cancelled'`, staff notification surfaces |
| 3 | Manual button, voicemail | SMS sent via Infobip, voiceConfirmToken created, `/confirm/:token` works |
| 4 | Manual button, no answer | `confirmation_status='no_answer'`, retry available after 30min |
| 5 | API key wrong on integration save | Test connection fails with clear error message |
| 6 | Webhook with bad HMAC | 401 returned, no DB writes |
| 7 | Tool call with expired JWT | 401 returned, agent gracefully recovers |
| 8 | Same call's webhook fired twice | Idempotent — no duplicate writes |
| 9 | Daily rate limit hit | `resource-exhausted` returned, button shows toast |
| 10 | Manual button at 4am org time | Blocked with "Quiet hours" message |
| 11 | Manual button on appt with `voice_calls: false` opt-out | Blocked with "Client opted out" message |
| 12 | Two staff click button simultaneously | Second one fails with "Call already in progress" |

Each gets a Vitest unit test for the CF and a manual UI walkthrough for the frontend.

**Voice quality QA — first 10 calls**: pick 1 friendly pilot org, listen to all 10 calls with the org owner. Look for: pace, naturalness, awkward pauses on tool calls (CFs going silent during long fetches — keep them <500ms or have agent say "give me one moment").

**Rollback**: per-org `voice_agent_enabled: false` flag instantly disables the button + sweep without a code deploy. Default `false` until pilot validated.

## Risks (don't ship without addressing)

1. **STIR/SHAKEN spam labeling** — calls from a salon's number may show as "Spam Likely" without carrier registration. **Without it, voicemail rate ~80%.** Each pilot org must register their Infobip number with their carrier's CallerID-trust program.
2. **Tool-call latency** — when agent calls `lookupRescheduleSlots`, user hears silence. Set `minInstances: 1` on `voiceAgentTool` (~$5/month) to avoid 2s cold starts.
3. **Acuity sync after voice confirm** — appointments with `acuity_appointment_id` need status pushed to Acuity too. Add `syncAppointmentStatusToAcuity()` call after confirm/cancel.
4. **Webhook ordering** — tool calls can arrive AFTER the post-call webhook in rare network scenarios. Webhook handler must tolerate `confirmation_status` already being set.
5. **GDPR DPA** — ElevenLabs as a sub-processor needs to be in your DPA with each org. Required if any org has EU clients.
6. **CCPA deletion** — when a client is deleted, also call ElevenLabs' delete-conversation API for their transcripts. Wire into existing client deletion flow.
7. **Cancellation policy enforcement** — if agent confirms a cancellation, salon's cancellation fee policy applies. Surface this in agent flow (v2).
8. **Carrier rate limits** — 200 calls/day to one geographic area can auto-flag the number as spam. Sweep should jitter 1h45m–2h15m, not exactly 2h.
9. **Outage detection** — if ElevenLabs is down, sweep silently fails and appointments remain unconfirmed. Build dead-man-switch alert: if no successful call in 24h for an active org, email admin "voice system not running, please call clients manually."
