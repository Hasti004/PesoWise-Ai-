# AI Autofill Incident Report (`parse-expense`)

## Overview

This document captures the full debugging timeline for the **Auto-Fill with AI** issue in the expense form, including:

- what broke
- what was fixed in code
- why the issue continued
- exact runtime architecture/logic
- final deployment/config actions required

---

## Symptoms Seen

From browser/UI logs and screenshots:

- `Edge Function returned a non-2xx status code`
- `POST .../functions/v1/parse-expense 500`
- then `502 (Bad Gateway)`
- now `404 (Not Found)` for `.../functions/v1/parse-expense`
- UI message: `Upstream AI provider returned an error`

Also unrelated startup noise appeared at times:

- `profiles?select=is_master_admin&limit=0` -> `400`

---

## Root Causes (Chronological)

## 1) Edge function runtime errors (initial)

The original edge function path returned generic `500` for multiple conditions (missing key, malformed AI output, upstream errors), making diagnosis hard.

## 2) Invalid Gemini API key

Provider logs showed:

- `API_KEY_INVALID`
- `"API key not valid. Please pass a valid API key."`

So the key in function secrets was invalid (or not from correct Google project/API setup).

## 3) Project mismatch (current blocking issue)

Most important current blocker:

- Frontend Supabase project URL:
  - `VITE_SUPABASE_URL=https://avrbgpmzabktqwyzqibq.supabase.co`
- `.env` also contains:
  - `SUPABASE_PROJECT_REF=yttrgclcrfrvlvtpfiso`

This mismatch caused function deployment/config to be done on one project while app calls another.

That is why current error is:

- `404 Not Found` on `.../functions/v1/parse-expense`

Meaning: **function not deployed on active frontend project**.

---

## Code Changes Completed

## A) Edge function hardening

File:

- `supabase/functions/parse-expense/index.ts`

Changes made:

1. Added multi-key fallback for function secret:
   - `GEMINI_API_KEY`
   - `GOOGLE_AI_API_KEY`
   - `GOOGLE_API_KEY`
2. Missing key now returns structured `503` response (instead of opaque `500`).
3. Added resilient JSON extraction from Gemini output:
   - handles fenced ```json blocks
   - handles raw object extraction fallback
4. Upstream AI error handling improved:
   - includes upstream status/message/payload
   - preserves 4xx where appropriate
   - includes `requestId` for traceability

## B) Frontend error parsing improvements

File:

- `src/services/AIService.ts`

Changes made:

1. Reads `FunctionsHttpError.context` response body from Supabase.
2. Maps status-specific failures to clear user-facing messages:
   - 400 -> invalid payload
   - 404 -> function not deployed on active project
   - 422 -> malformed AI output
   - 503 -> server AI key not configured
3. Surfaces server `requestId` where available for faster log lookup.

## C) Removed noisy schema probe that produced 400s

File:

- `src/services/CapabilityService.ts`

Changes made:

1. Stopped runtime probing for `profiles.is_master_admin` via REST in environments where migration may be missing.
2. Prevents avoidable 400 noise unrelated to AI autofill.

---

## Current Status

### App behavior

The app now reports clearer errors and the AI pipeline code is hardened.

### Still failing reason

Current hard blocker is infrastructure/deployment, not parsing logic:

- `parse-expense` endpoint returns `404`
- function is not present on frontend project `avrbgpmzabktqwyzqibq`

---

## Runtime Flow (Code Logic)

## 1) UI entrypoint

`AIAssistantModal` sends user chat text to:

- `AIService.parseExpenseFromChat(message)`

## 2) Function invoke

`AIService` calls:

- `supabase.functions.invoke("parse-expense", { body: { message } })`

If error:

- reads structured payload from `error.context`
- maps status to user-friendly error text

## 3) Edge function parse pipeline

`parse-expense/index.ts`:

1. CORS + request validation (`zod`)
2. Load Gemini key from function secrets
3. Build system prompt with schema constraints
4. Call Gemini with retry + backoff
5. Parse response text -> JSON extraction
6. Validate response with output schema (`zod`)
7. Return structured parsed expense JSON

## 4) UI apply

On successful parsed payload:

- `ExpenseForm.handleAiExtraction(...)` maps fields to form state
- user can submit expense
- normal expense save flow persists to DB

---

## Required Fix Actions (Must Do)

Run these against the **same project your frontend uses**:

- project ref: `avrbgpmzabktqwyzqibq`

```bash
supabase secrets set GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_KEY --project-ref avrbgpmzabktqwyzqibq
supabase functions deploy parse-expense --project-ref avrbgpmzabktqwyzqibq
```

Then restart frontend/dev server and test again.

---

## Configuration Alignment Recommendation

Make environment consistent to avoid cross-project drift:

- Keep `VITE_SUPABASE_URL` and deployment `--project-ref` pointing to same project.
- Update `.env` `SUPABASE_PROJECT_REF` to match the frontend project if this repo is intended to use one project only.

---

## Validation Checklist

After deploy, confirm all:

1. `POST /functions/v1/parse-expense` returns `200`.
2. AI assistant returns parsed expense object (not generic error).
3. Click `Fill Form` populates title, amount, category, date, destination.
4. Submit creates expense row successfully in DB.
5. No `404` for `parse-expense` in browser network tab.

---

## Security Note

Sensitive secrets were present in local `.env` during debugging (service role key / DB password / API keys). Rotate exposed credentials if shared outside secure channels.

