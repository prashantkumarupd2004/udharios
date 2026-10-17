# Udhari OS — Deep Codebase Analysis Report

**Repo:** `~/workspace/udharios` · **Stack:** Next.js 16.3.8 (App Router, Turbopack), React 19, TypeScript, Prisma 5 + Postgres, Tailwind 4, next-pwa · **Date:** 16 Oct 2026

> What it is: "Udhari OS" (branded "Ugaahi" in places) — a B2B SaaS for Indian merchants (kirana/general stores) to manage *udhaari* (credit given to customers). It automates debt collection via multi-stage reminders (WhatsApp → AI Hindi voice calls → merchant escalation), generates payment links (Razorpay/Cashfree/PayU/PhonePe/UPI VPA), ingests bills from Tally, and runs customer background checks via Karza.

---

## 1. Architecture Overview & End-to-End Data Flow

### High-level layers

```
┌──────────────────────────── Merchant Browser (Next.js client pages) ─────┐
│ login / onboarding / dashboard / customers / outstandings / settings /    │
│ admin/* (separate cookie, separate layout)                               │
└──────────────┬──────────────────────────────┬───────────────────────────┘
               │ fetch /api/* (JWT session)   │ fetch /api/admin/* (admin JWT)
┌──────────────▼──────────────┐   ┌─────────────▼────────────────────┐
│ Merchant API (App Router)   │   │ Admin API + crons + webhooks      │
│ auth, customers, outstand-  │   │ (public prefixes guarded by       │
│ ings, payment-links,        │   │  CRON_SECRET or signatures)       │
│ disputes, promises, reports │   └─────────────┬────────────────────┘
└──────────────┬──────────────┘                 │
┌──────────────▼──────────────────────────────▼────────────────────┐
│ Postgres (Prisma) — ~22 models: Merchant, User, Customer,        │
│ Outstanding, ReminderRule/Log, PaymentLink, Payment, Promise,    │
│ Dispute, Call, AuditLog, Subscription, AccessRequest, Bill,      │
│ TallyConnection, VoiceCallSession, Verification                  │
└──────┬──────────────┬──────────────┬───────────────┬─────────────┘
       │              │              │               │
   Inngest        WhatsApp        Exotel          Payment
   (bg jobs)      (AiSensy /      (voice)         gateways
                  Meta Cloud)                    (5 adapters)
```

### Lifecycle: onboarding → collection → oversight

1. **Access gate (onboarding funnel):** visitor hits `/request-access` → public `POST /api/access-requests` (3/phone/24h limit) → admin approves in `/admin/access-requests` → `provisionMerchant()` creates the merchant (`plan:'trial'`, +14 days), an owner user, and a **default 7-stage reminder rule** (WhatsApp t1@t+1d, t2+link@t+3d, T3@t+5d, voice@t+7d, voice@t+10d, T4_final@t+14d, escalate@t+15d).
2. **Login:** `/login` → `check-access` (blocks unapproved numbers *before* OTP is sent) → MSG91 6-digit OTP (5-min expiry) → jose HS256 JWT in HttpOnly `udhari_session` cookie (30-day). Google OAuth is a manual no-NextAuth flow; a dev OTP-skip exists only when `NODE_ENV !== 'production'`.
3. **Customer import:** manual add (with mandatory WhatsApp-consent checkbox), Quick Add natural-language entry ("Ramesh 5000 9876543210"), CSV import API, **or Tally** (XML/CSV upload, or the Windows sync-agent that polls Tally Prime's local XML API every 30 min and pushes JSON to `/api/integrations/tally/sync`). Dedup: phone match → name match → create; consent auto-set `true` for Tally-sourced ("implied consent").
4. **Outstanding creation:** bills become `Outstanding` rows (`status: upcoming/overdue`, `invoiceNo = billRef`, upsert key = `(merchantId, billRef, partyName)`). Tally receipts (Receipt/Credit/Debit notes) auto-reconcile FIFO-oldest against bills; pending→0 ⇒ `paid` (stops calls).
5. **Reminder pipeline (two parallel systems):**
   - **Inngest engine:** daily 04:00 UTC (09:30 IST) `nightlyReminderScan` picks outstandings `dueDate <= today` and fires each due stage via `step.invoke` → `sendStagedReminder` (WhatsApp templates via AiSensy/Meta; voice via `calls/trigger` event → `voiceCall` fn → Exotel with Sarvam-Hindi TTS; escalate → `escalateToMerchant` → `MerchantNotification`). `currentStage` pointer advances only after a successful send. Promise creation pauses reminders (`status='promised'` excluded from scan); `promiseFollowUp` sleeps until the promised date 10:00 IST, then marks promise kept/broken.
   - **Vercel crons (bypass Inngest):** `auto-call-overdue` (2× daily), `pre-due-reminders?phase=morning|afternoon`, `retry-failed-calls` (retry schedule 2h/4h/12h, max 3). They dial/query inline. ⚠️ They can double-dial the same customer the engine already called.
6. **Payment collection:** reminder T2 auto-creates a payment link via the merchant's configured gateway (or falls back to UPI-VPA/bank-details text). The WhatsApp button points to `/p/[id]` → 307 redirect to the gateway URL. Webhooks (per-gateway or legacy Razorpay) verify signatures, mark outstanding `paid`, audit-log. UPI-VPA mode has **no reconciliation** — merchant marks paid manually.
7. **Voice calls:** Exotel places the call with `CustomField` JSON → production "TTS flow" hits `/api/exotel/flow-script`, which returns pre-generated Sarvam TTS audio (`bulbul:v3`, voice `priya`, 8kHz WAV) cached in Supabase Storage bucket `voice-audio`, served via `/api/voice/audio/*`. Webhook updates call status; keyword/DTMF handling exists mostly in a test-only conversational loop (`/api/voice/exoml` + `exoml/record` with Sarvam `saaras:v1` STT).
8. **Admin oversight:** separate email+password login (bcrypt), `Merchant.isKillSwitched` kill-switch (checked by engine + crons), trial extension, revenue dashboard (platform MRR from `Subscription`), health alerts, audit log (append-only, SHA-256 hashed).

**Quiet hours:** per-merchant `quietStart/quietEnd` (default 21:00–09:00 IST); the engine sleeps steps until the window opens; calls are 9AM–9PM only.

---

## 2. Reminder Engine (Inngest + crons)

**Trigger:** nightly Inngest cron `0 4 * * *` (`nightlyReminderScan`, concurrency 1) — *not* an event; `reminders/scan.nightly` is typed but dead. Query: `Outstanding.status ∈ (upcoming, overdue)`, `dueDate <= today`, `take: 500` (no pagination — >500 eligible outstandings silently drop the tail). Per row it loads the merchant's default `ReminderRule` and fires stages whose `dayOffset <= overdueDays` and `stageIndex >= currentStage`, via `step.invoke` to child functions.

**Stage logic (`sendStagedReminder`, concurrency 10):** guard cascade — (1) status still `upcoming|overdue` (this is also the paid/promised stop: no event listener for payment; purely DB-guard based), (2) `customer.optedOut`, (3) quiet hours → `step.sleep` until window, re-check once, (4) kill-switch, (5) valid `91[6-9]XXXXXXXX` phone. Then per-channel:
- **WhatsApp:** template builders `buildT1Polite` / `buildT2WithLink` / `buildT2WithUpiOrBank` / `buildT3Firm` / `buildT4Final`. For `t2_with_link`, an `ensure-payment-link` step auto-creates a gateway payment link (or falls back to UPI/bank-details text, then to plain T1).
- **Voice:** `step.sendEvent('calls/trigger')` → `voiceCall` function re-applies guards, creates `Call` row, `placeCall()` with `useTtsFlow`.
- **Escalate:** engine invokes `escalateToMerchant` directly (the escalate branch inside `reminderSend` is unreachable in practice). Creates a `MerchantNotification`.
Then: `ReminderLog` create + `currentStage++` + audit log — *but only counted when sendStatus === 'sent'*. Voice marks "sent" when the trigger event is merely *emitted*, not when the call succeeds — a skipped/failed call still consumes the stage.

**Promise follow-up:** `promiseFollowUp` sleeps until promised-date 10:00 IST → paid ⇒ promise `kept`; unpaid ⇒ promise `broken`, outstanding back to `overdue`, merchant notified. Reminders pause via the `promised` status.

**⚠️ Critical bug — WhatsApp promise path:** the WhatsApp webhook fires `promises/follow-up` with `promiseId: ''` ("will be retrieved in the function") — the function does `findUniqueOrThrow({ id: '' })` → throws → 2 retries → dies. The outstanding stays `promised` **forever** → reminders never resume. The manual `/api/promises` route passes the real id.

**⚠️ Duplicate escalation nightly:** `escalateToMerchant` never advances `currentStage`, so the next scan re-fires escalation → one merchant notification per night until payment.

**⚠️ Dead payment events:** `payments/received` (Razorpay webhook) and typo'd `payment.received` (generic webhook) have **zero listeners**; `promises/created` typed but never sent. Cancellation relies only on runtime status guards.

**Other bugs:** `sms` channel is a silent no-op (logs `sent`, advances stage, sends nothing); template-name matching is case-sensitive with silent fallback (`seed.ts` uses `T1_polite` vs code's `t1_polite` → degrades to default T1, no payment link); `nowIST()` just returns `new Date()` (misleading name, OK on UTC hosts); `step.invoke` payload carries `channel`/`templateName` not in the `UdhariEvents` type (ignored at runtime).

---

## 3. Hindi AI Voice Call System

**Production path (TTS flow):** merchant UI/cron → `POST /api/calls/trigger` or cron → `placeCall()` (`src/lib/exotel.ts`): `POST https://{SUBDOMAIN}/v1/Accounts/{SID}/Calls/connect.json` with `From` = customer (normalized `0XXXXXXXXXX`), `To` = Exotel virtual number (`CallerId=`), `Url` = `start_voice/{EXOTEL_TTS_APP_ID}` (custom `voiceUrl` is supported in code but "Exotel allow nahi karta — call drop"), `TimeLimit=300s`, `TimeOut=60s`, `Record=true`, `CustomField` = JSON `{callId, merchantName, customerName, amountINR}` (~400-char truncation limit noted). Right after placement, `pregenerateGreetingAudio()` fire-and-forget-synthesizes the turn-0 greeting via **Sarvam TTS `bulbul:v3`, voice `priya`** (8kHz WAV for telephony, loudness 1.5), uploads base64 audio to Supabase Storage `voice-audio` (`x-upsert`, service-role REST), content-addressed `tts-greeting-<md5(script)>.wav`. On answer, the Exotel flow's dynamic-TTS applet hits `GET /api/exotel/flow-script?CustomField=…` → builds the script via `tts-greeting.ts`, returns the pre-generated audio URL (or generates inline 6–7s, or falls back to Exotel's own Hindi TTS text). Audio is proxied same-domain through `GET /api/voice/audio/<flat .wav>` (strict filename regex, `Cache-Control: max-age=86400`) so provider URLs stay hidden.

**Test/dev conversational loop:** `/api/voice/exoml` serves code-built ExoML `<Play><url></Play>` + `<Record action=…/exoml/record?ctx=<callId>&turn=N …/>`; `record` downloads `RecordingUrl`, transcribes with **Sarvam STT `saaras:v1`** (`hi-IN`), runs `processVoiceAgentTurn` keyword intents — angry (bakwaas/gaali/police) → `Dispute` + merchant notification; dispute keywords → dispute; payment-confirm → WhatsApp T2 with link; Hindi date expressions (`kal`, `parso`, `tarikh` regexes) → creates `Promise` (`source='voice'`), outstanding → `promised`. `MAX_TURNS = 8`, then `<Play>` closing + `<Hangup/>`. Trace JSONL per call is written to Storage with no retention.

**DTMF — designed, dead:** `voice-dtmf.ts` synthesizes 4 personalized Hindi WAVs (1=pay now, 2=dispute, 3=callback later) uploaded to `dynamic/` and returns `/api/voice/audio/dynamic/*.wav` URLs — but the audio route **rejects subpaths** (flat-filename regex) → 400s, no route exists to consume digit presses, and production triggers never call it. It's only reachable from `/api/voice/test-call`.

**Webhook (`POST /api/webhooks/exotel`):** always updates `Call.status` (+`recordingUrl`, `durationSec`); on `in-progress`/`completed` calls `processVoiceAgentTurn(null, …)` — **audio is null so it always returns the turn-0 opening script**, appending fake "opening script" transcript entries regardless of turn. On `completed` → audit `CALL_COMPLETED`; on `no-answer/busy/failed` → `outcome='no_answer'`; after 2 failures → merchant escalation notification. Always 200.

**⚠️ Security:** `verifyExotelWebhook` returns `true` unconditionally (TODO: HMAC-SHA1) and is never called — anyone can POST fake call-status updates.

**Other issues:** `amountINR` format inconsistent (`"5400"` vs `"₹5,400"` — survives via digit-stripping, but DTMF greeting interpolates raw); hardcoded fallback domains (`udharios.vercel.app` vs typo'd `udharios1.vercel.app` in test-call); test-call uses fake non-UUID ids that would break FK constraints if promise/dispute creation fired; per-turn WAVs are unique per timestamp → Storage garbage accumulates; a legacy `voicebot-url` route points at a hardcoded WSS endpoint (parallel experiment with the TTS flow).

---

## 4. Auth, Sessions & Access Control

**Flows:**
- **Phone OTP (MSG91 v5):** `check-access` (public — approved/pending lookup, an enumeration oracle) → `otp/send` (3/hr + 45s cooldown, in-memory per instance) → `otp/verify` (5/15min) → gated: merchant must exist **and** `isApproved`, else 403. No auto-provisioning (except allowlisted admin phones). Session JWT set, `redirectTo` = `/onboarding` if no businessName else `/dashboard`. `retry-voice` (MSG91 `/otp/retry` voice) has **zero rate limiting** — unlimited voice-OTP cost abuse.
- **Google OAuth (manual, no NextAuth):** `state` = unsigned base64 `{redirectTo}` (no CSRF token — login-CSRF style); `ADMIN_EMAILS` auto-provision to admin; others need an approved merchant with matching email or bounce to `/request-access` prefilled. `safeRedirectTo` blocks `//` open redirects.
- **Dev login:** 404s in production (`NODE_ENV==='production'`), needs approved merchant.
- **Access requests:** public POST (3/phone/24h), 409 dedupe; admin approve runs `provisionMerchant()` in a transaction (approved + owner user + 14-day trial + default rule); reject = plain status update, **no audit log** (asymmetry).

**Sessions:** custom jose HS256 JWT `{merchantId, userId, role}`, 30-day expiry, cookie `udhari_session` (`HttpOnly`, `SameSite=Lax`, `Secure` in prod). **No shared `requireAuth` helper** — 23 routes each hand-roll `getSession()` checks (drift risk). `proxy.ts` (Next.js 16 middleware rename) guards `/admin*` first (`/admin/login` + `/api/admin/auth/*` public) then merchant session. Public prefixes include `/api/webhooks`, `/api/cron`, `/api/test` ("temporary — remove before production"), `/api/integrations/tally/*`, `/api/voice`, `/api/exotel/*`, `/api/inngest`.

**Admin auth:** env `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt), 10-attempt/15min per-IP in-memory throttle, `ugaahi_admin_session` cookie 7-day. **⚠️ `getSecret()` falls back to hardcoded `'dev-secret-change-me'`** if secrets unset → admin cookie forgery. `requireAdmin()` also accepts legacy merchant sessions on allowlisted phones; but routes mix `getAdminSession` (401) vs `requireAdmin` (403) inconsistently.

**Other issues:** `ADMIN_TEST_OTP` static-OTP backdoor for admin phones (marked TEMPORARY); `resetVerifyAttempts` dead code (verify counter never resets); `/api/test/send-whatsapp` guard is `if (cronSecret && …)` → **auth skipped entirely when `CRON_SECRET` unset**; check-access is an unauthenticated membership oracle.

---

## 5. Payments

**Gateways (5):** `razorpay`, `cashfree`, `payu`, `phonepe`, `upi_vpa` under `src/lib/payments/`. Common `PaymentGateway` interface (`createPaymentLink`, `verifyWebhookSignature`, `parseWebhookEvent`, `getCredentialFields` → drives settings UI); factory `getGateway(id)` + `REGISTRY`; all money in paise (Cashfree/PayU take rupees, adapters convert). Merchant config = 3 columns on `Merchant` (`paymentGateway` default `upi_vpa`, `gatewayCredentials` AES-256-GCM encrypted via `crypto.ts` with `GATEWAY_ENCRYPTION_KEY`, `gatewayTestMode`) — no separate config model.

**Two Razorpay modules:** `src/lib/razorpay.ts` = legacy platform-level (env `RAZORPAY_KEY_ID/SECRET`, used for the SaaS's *own* subscriptions: `createSubscription/cancelSubscription`), vs `src/lib/payments/razorpay.ts` = per-merchant adapter. Two webhook routes mirror this: `POST /api/webhooks/razorpay` (legacy: platform secrets, `payment_link.paid`, `payment.captured`, **and subscription events** `activated/charged/cancelled/halted`; only route that writes a `Payment` row, marks promises `kept`, notifies merchant) vs `POST /api/webhooks/payment/[gateway]` (new generic: per-merchant secrets; **no `Payment` record created**, promises not closed, no merchant notification).

**Link generation:** manual `POST /api/payment-links` (returns existing `created` link; no regeneration of expired) or auto inside `reminderSend`'s `ensure-payment-link` for T2. Payload: amount paise, `referenceId = outstandingId`, notes `{merchant_id, outstanding_id, invoice_no}`, expiry +30d, `callbackUrl = /payment/success` (**page doesn't exist → 404 after payment**). Gateway quirks: Cashfree `link_id = ref_timestamp`; PayU tries `create_invoice`, silently falls back to signed `/_payment` checkout; PhonePe v2 PAY_PAGE; PhonePe **ignores expiryDate**. Delivery: WhatsApp button URL = `{appUrl}/p/{paymentLink.id}` → 307 redirect to gateway URL (link-swappable). No SMS/voice link delivery.

**Webhook reconciliation:** all signatures use `timingSafeEqual` — Razorpay HMAC-SHA256 hex; Cashfree HMAC-SHA256(`timestamp` + body) base64; PhonePe `SHA256(base64resp + saltKey)###saltIndex` vs `x-verify`; PayU reverse SHA512 over form body (two variants). Amount mismatch (>±₹1): generic route logs a warning and **doesn't mark paid** — but logs it under the wrong audit action `PAYMENT_LINK_CREATED` instead of `PAYMENT_MISMATCH` (legacy route records `needsReview=true` + notification instead). Idempotency: legacy via `Payment.razorpayPaymentId` unique; generic only via early-return if already `paid`.

**UPI VPA mode (default, 0% fee):** builds `upi://pay?pa=…&am=…&tn=…`; `verifyWebhookSignature` always false / `parseWebhookEvent` unknown — **no reconciliation; merchant marks paid manually.**

**⚠️ PayU broken on generic route:** route reads `arrayBuffer()` then `JSON.parse` fails on form-encoded body → 400 (and PayU's signature is in-body, no header → 401); plus txnid≠invoice_id lookup mismatch → 404. PayU server-side confirmation effectively doesn't work. Also: Inngest event `payment.received` (singular) vs schema `payments/received` (plural), no listeners either way; `isGatewayReady` is a tautology (registry always has the adapter); stray unused `phonepeGateway` singleton export.

---

## 6. Tally Integration

**Flow A — file upload:** `POST /api/integrations/tally/upload` (≤10MB; handles Tally's UTF-16LE BOM). `tally-parse.ts` (fast-xml-parser, tolerant recursive scan): bill tags `BILLNAME/BILLREF/INVOICENO/VCHNO…`, party tags `PARTYNAME/LEDGERNAME…`, amount/pending/date/phone/voucher-type tag sets, `BILLFIXED` sibling-merge, dates from `YYYYMMDD`/`12-Oct-2024`/`1-Apr-26`. CSV variant with downloadable template (`GET /template`). Ledger master scan keeps only ledgers whose parent contains "Sundry Debtor" (also handles `NAME=` attributes). Receipts classified by voucher type → `applyTallyReceipts`.

**Flow B — desktop sync agent:** `tally-sync-agent/sync-agent.js` (588 lines, zero-dep Node, Windows) polls Tally Prime's local XML API (`localhost:9000`) every 30 min via **TDL Collection queries injected in the XML envelope** (sales vouchers filter, ledger list, 7-day receipts) → regex-extracts voucher blocks → POSTs JSON to `/api/integrations/tally/sync` with `x-tally-api-key` (only SHA-256 hash stored; issued once by `/connect`, key prefix `tally_`). Caps: 5000 bills / 10000 customers / 5000 receipts per sync. **Phone-number workaround:** `ugaahi.tdl` (7-line Tally collection exporting `Address.Phone`/`Address.Mobile` as computed P6/P7), with fallback chain P1–P7 → UGAAHIPHONE tags → ADDRESS.LIST → 10-digit regex. An experimental `sync-agent-odbc.js` (+`ODBC-SETUP.md`) exists for ODBC access. No true ODBC in the primary agent.

**Bill→Customer/Outstanding (`tally.ts`):** customer dedup phone→name→create (missing phones get `tally-ledger-…` placeholders; Tally-sourced consent auto-`true`, with `/backfill-customers` repair route for old records). Bill upsert key `(merchantId, billRef, partyName)` → mirrors into `outstandings` (`invoiceNo=billRef`, `overdue`/`upcoming` by dueDate) so the reminder engine picks them up unchanged. Receipts match by billRef, else FIFO-oldest-pending for the party; Receipt/Credit Note subtract, Debit Note adds; pending→0 ⇒ outstanding `paid`, writes `Payment` with `razorpayPaymentId = tally_<Type>_<ref>_<ts>`, method `tally_receipt`.

---

## 7. WhatsApp

**Provider abstraction** (`WhatsappProvider.ts`, `IWhatsAppProvider`: `sendTemplate`/`sendText`): three backends — **AiSensy (default BSP)**, Gupshup, **Meta Cloud API** (`graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages`) — selected by `WHATSAPP_PROVIDER` (default `aisensy`; Meta Cloud supported but *not* default). Templates (language `hi`): `t1_polite` (customer, merchant, amount, due), `t2_with_link` (customer, amount, invoiceNo + **dynamic URL-button payment link**), `t3_firm`, `t4_final` (customer, amount, overdueDays, merchant); plus `T2_upi_bank` variant for merchants without a gateway (body carries UPI VPA or A/c+Bank+IFSC+Name via `buildMerchantPaymentInfo`). AiSensy path uses its campaign API.

**Webhook** (`/api/webhooks/whatsapp`, force-dynamic): GET answers Meta `hub.challenge`; POST normalizes Meta (`entry.changes.value.messages/statuses`) and AiSensy/Gupshup payloads. Handling: **delivery receipts** (`delivered/read/failed/sent`) → update `ReminderLog` status + `deliveredAt`/`readAt` by external message id; **opt-out** (`stop`/`band karo`/`unsubscribe`/`nahi chahiye`…) → `customer.optedOut=true` + mandatory Hindi confirmation + audit; **button replies** `PAY_NOW` (resend link), `DATE_DO` (ask for date), `PROBLEM_HAI` (create dispute); **dispute keywords** → dispute + outstanding `disputed` + merchant notify; **Hindi date promises** (`parseHindiDateExpression`: "5 tarikh", "shukravaar", "kal") → `Promise` (`source='whatsapp'`), outstanding `promised`, fires follow-up event — **with the broken empty-`promiseId`** (§2 bug). Always 200 to avoid retry loops.

**Open items:** confirm which provider the merchant actually runs on (code default AiSensy); no `Payment`/`costPaise` billing for WhatsApp sends (only Karza checks record costs — and nothing debits them; informational).

---

## 8. Background Check / Verification (Karza)

`src/lib/verification/`: `VerificationProvider` interface (swappable), `karza.ts` → Karza v3 API (`x-karza-key`), all POSTs with `consent:'Y'`. **Mock fallback** when `KARZA_API_KEY` unset: realistic sample data tagged `_mock: true`, zero cost, amber "Test mode" banner in UI. 7 checks: `pan_check` (₹4), `pan_to_contact` (₹8), `mobile_to_pan` (₹10), `mobile_to_address` (₹12), `company_check`/MCA (₹15), `profile_360` (₹20), `credit_report` (₹75). `POST /api/verification/check` persists to `Verification` (result JSON, `costPaise`); GET = history (50). UI (`dashboard/background-check`): hero stats, 7 service cards, input panel, JSON result grid, history list, compliance note (consent; RBI note for credit reports).

---

## 9. Admin Panel

**Auth:** email+password (bcrypt, `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`), 10/15min per-IP in-memory throttle (useless across serverless), 7-day `ugaahi_admin_session` JWT. Routes inconsistently use `getAdminSession` (401) vs `requireAdmin` (403, also accepts legacy admin-phone merchant sessions). ⚠️ Hardcoded `'dev-secret-change-me'` fallback secret.

**Capabilities:** merchant list (search, ≤100, usage counts) + detail (profile, dues agg, subscription, recent customers/calls/reminders/payments); **kill-switch** `Merchant.isKillSwitched` via `POST /merchants/[id]/suspend` (two-click UI confirm, audit `admin.kill_switch.activated/deactivated`); trial extension (`{days: 1–90}`, audit via raw string, inconsistent); **revenue** — 30-day buckets from `Payment.paidAt`, trial→paid conversion, plan breakdown (platform revenue only); **health** — 24h failed calls/reminders, success/delivery rates, Hinglish alerts ("Exotel check karo"); **access-request** approve (transactional `provisionMerchant`, audit-logged) / reject (no audit); **audit log** — append-only, SHA-256 payload hash, `?limit&action-prefix` filter (only 4 actions have friendly UI labels).

**Admin UI (5 pages):** login card; dashboard home (combined `/api/admin/dashboard` to avoid cold starts: stats grid, revenue bar chart, health alerts, inline approve/reject with optimistic rollback, recent + top-by-usage merchants); merchants list (debounced search); merchant detail; access-requests tabs; audit timeline.

---

## 10. Frontend / Dashboard

**Pages** (`src/app/(dashboard)/dashboard`): home (KPI hero, quick actions, 30d trend chart 7/30D + CSV export, rule-based "AI Insights", collection ring, aging buckets, 90+ defaulters, top debtors, activity feed, Tally mini-card; polls 60s); `customers` (search, tabs, add modal w/ consent checkbox; **Import button → dead link** to nonexistent `/dashboard/customers/import`); `customers/[id]` (360° view, **AI Call** button, **Mark Paid** via `window.prompt` for method, phone-edit modal; **🧪 Test call (bypass quiet hours)** button visible to all merchants); `outstandings` (filters, **Quick Add** NL entry — **broken for new customers**: sends `phone:'quick-<ts>'` with no consent → zod fails → alert); `promises` (open/kept/broken tabs); `disputes` (resolve inline); `activity` (audit timeline, paginated); `background-check` (§8); `integrations` (Tally connect key, XML/CSV upload, bills table); `settings` (Business incl. UPI VPA + bank details, PaymentGatewaySettings incl. test-mode secrets, quiet hours; **dead Upgrade link** to `/dashboard/billing`).

**Auth pages** (`(auth)`): `/login` (check-access gate → OTP or Google; dev-login bypass in dev only), `/login/otp` (6-box, paste, auto-submit, 45s resend, voice-OTP fallback), `/onboarding` (6 screens → `POST /api/merchant/onboard`). Plus `/request-access`, `/privacy`, `/terms`, `/services`.

**Architecture:** everything is `'use client'` + `fetch('/api/...')` — no Server Components, no React Query/SWR. Styling: Tailwind + custom classes (`btn-primary`, `field`, `glass-card`); Radix installed but barely used; no shared component library (only `SiteNav`, `SiteFooter`, `PaymentGatewaySettings` + landing components). i18n: `en.ts`/`hi.ts` nested dicts via `useLanguage()` context (`{lang, t, toggleLang}`), but usage is inconsistent (ternaries + local `copy` objects on auth pages), Hinglish Roman script, **not persisted**, and the provider initializes `'en'` while `hi.ts` claims Hinglish is default. Layout: dark-navy sidebar (desktop) + mobile bottom nav (5 items only).

**Supabase role:** Postgres-via-Prisma is the app DB (may be Supabase-hosted Postgres, but that's all). Supabase **Auth/SSR helpers are imported by nothing** (dead wrappers); `User.supabaseId` is a legacy fossil; privacy policy still says "Supabase (database)" (stale). Real usage = **Storage only**: `voice-audio` bucket for Sarvam TTS WAVs + voice traces, via direct REST with the service-role key.

---

## 11. Misc Utilities & Config

- **`quick-add.ts`** — natural-language entry parser ("Ramesh 5000 9876543210"); broken for new customers (§10).
- **`rateLimit.ts`** — in-memory per-instance counters; notes its own serverless weakness. Used by OTP send/verify; `retry-voice` not covered.
- **`audit.ts`** — append-only `AuditLog` with `payloadHash` (SHA-256); inconsistent action naming (constants vs raw strings).
- **`logger.ts`** — structured logging helper; phones masked in logs (`91*****1234`).
- **`validations/index.ts`** — zod schemas (phone regex `^91[6-9]\d{9}$`-ish, VPA, GST).
- **`OcrProvider.ts`** — **stub**: default `OcrStubProvider` returns empty extraction; Google Vision impl returns `{}` silently on non-OK. Bill OCR is non-functional.
- **`next.config.js`** — next-pwa (offline cache), security headers (nosniff, DENY, XSS, Permissions-Policy), `serverExternalPackages: ['@prisma/client','prisma']`. ⚠️ `runtimeCaching: NetworkFirst` on `/^https?.*/` can serve **stale API JSON** offline.
- **`vercel.json`** — 4 crons: `auto-call-overdue` 04:30 & 10:30 UTC, `retry-failed-calls` 06:00 UTC, `pre-due-reminders?phase=morning` 04:00 UTC, `?phase=afternoon` 09:30 UTC.
- **Migrations** — `migration-payment-gateways.sql` (gateway columns on Merchant, `payment_links`), `migration-access-requests.sql`, `migration-merchant-email.sql`. Prisma migrations folder not reviewed (SQL files suggest some schema applied out-of-band).
- **`prisma/seed.ts`** — demo merchant (Gupta General Store), template-casing bug (`T1_polite` vs `t1_polite`).

---

## 12. Consolidated Bug / Security / TODO List

### Critical (fix now)
1. **WhatsApp promise event has empty `promiseId`** → `promiseFollowUp` throws/retries/dies; outstanding stuck `promised` forever; reminders never resume. (`webhooks/whatsapp` vs `promiseFollowUp.ts`)
2. **Escalation repeats nightly** — `escalateToMerchant` doesn't advance `currentStage` → merchant spammed with one notification/night. Add terminal stage advance or idempotency.
3. **`verifyExotelWebhook` returns `true` always** and is never called — fake call-status webhooks accepted.
4. **Admin secret fallback** `'dev-secret-change-me'` — admin JWT forgery if `SESSION_SECRET` unset.
5. **`ADMIN_TEST_OTP` static-OTP backdoor** — marked temporary; verify route skips rate limits for it.
6. **`retry-voice` OTP has no rate limit** — unlimited MSG91 voice-call cost abuse.
7. **`/api/test/*` public via proxy.ts** ("remove before production"); `send-whatsapp` auth is skipped entirely when `CRON_SECRET` unset.

### High
8. PayU broken on the generic webhook route (form body 400 / in-body signature 401 / txnid lookup 404).
9. Generic payment webhook creates **no `Payment` record**, doesn't close promises, sends no merchant notification (legacy Razorpay route does all three).
10. Dead Inngest events (`payments/received` vs `payment.received`, `promises/created`, `reminders/scan.nightly`) — no listeners; cancellation only via DB status guards.
11. `payment/success` callbackUrl page doesn't exist → post-payment 404.
12. Cron routes and Inngest engine can double-dial the same customer same day (independent retry counters).
13. Voice stage marked `sent`/stage consumed when only the `calls/trigger` event was emitted.
14. `sms` channel is a silent no-op that still advances the stage.
15. OCR provider is a stub — bill-OCR feature non-functional.

### Medium / hygiene
16. Template-name case sensitivity silently degrades (seed uses `T1_polite`).
17. `upi_vpa` mode has zero reconciliation — merchant must mark paid manually.
18. `PhonePe` ignores `expiryDate`; `getGateway` readiness check is tautological; wrong audit action on amount mismatch.
19. In-memory rate limits (OTP, access requests, admin login) don't survive multi-instance serverless.
20. No shared auth helper — 23 routes hand-roll session checks; `check-access` is a membership-enumeration oracle; Google OAuth `state` unsigned (login-CSRF).
21. Quick Add broken for new customers; dead Import/billing page links; test-call bypass button visible to merchants; language not persisted + default contradiction; `nowIST()` misleading name; nightly scan cap 500 no pagination; PWA `NetworkFirst` can cache stale API JSON; Supabase-SSR wrappers dead; per-turn TTS WAVs accumulate in Storage with no cleanup; admin audit strings inconsistent; reject-access-request not audited.

---

## 13. Key Files Quick Reference

| Concern | Files |
|---|---|
| Reminder orchestration | `src/lib/inngest/functions/reminderEngine.ts`, `reminderSend.ts`, `escalate.ts`, `promiseFollowUp.ts`, `voiceCall.ts`, `src/lib/inngest/client.ts`, `src/app/api/inngest/route.ts`, `src/app/api/cron/*.ts` |
| Voice | `src/lib/voice-agent.ts`, `voice-ctx.ts`, `voice-dtmf.ts`, `voice-audio.ts`, `voice-trace.ts`, `sarvam.ts`, `exotel.ts`, `tts-greeting.ts`, `src/app/api/voice/**`, `src/app/api/exotel/**`, `src/app/api/calls/trigger/route.ts` |
| Auth | `src/app/api/auth/**`, `src/lib/session.ts`, `msg91.ts`, `google-oauth.ts`, `proxy.ts`, `admin-auth.ts`, `src/app/api/merchant/onboard/route.ts` |
| Payments | `src/lib/payments/*` (5 adapters), `src/lib/razorpay.ts` (legacy), `src/app/api/payment-links/route.ts`, `src/app/api/webhooks/payment/[gateway]/route.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/app/p/[id]/route.ts` |
| Tally | `src/lib/tally.ts`, `tally-parse.ts`, `src/app/api/integrations/tally/*`, `tally-sync-agent/` |
| WhatsApp | `src/lib/providers/WhatsappProvider.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| Verification | `src/lib/verification/*`, `src/app/api/verification/check/route.ts` |
| Admin | `src/app/api/admin/**`, `src/lib/admin.ts`, `admin-auth.ts`, `src/app/admin/*` |
| Frontend | `src/app/(dashboard)/dashboard/**`, `src/app/(auth)/**`, `src/components`, `src/i18n`, `src/hooks/useLanguage.tsx` |
