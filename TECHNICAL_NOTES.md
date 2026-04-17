# Technical Reliability Notes

This document summarizes the root causes and permanent fixes implemented to stabilize the production environment and eliminate console noise.

## 1. Supabase Schema Mismatch (400/404 Errors)

### Root Cause
The frontend was aggressively querying the `Master Admin` feature (e.g., checking `profiles.is_master_admin` and `master_admin_memberships`). However, these schema objects only exist in recent local migrations and have not yet been applied to the remote Supabase project.

### Permanent Fix
Implemented a **Capability Detection Pattern** via `CapabilityService.ts`. 
- The app now performs a single, silent probe on startup to identify which database features are available.
- `AuthContext` consumes this service and only initializes features (like Master Admin checks) if the database explicitly supports them.
- **Benefit**: No more 400/404 errors on startup for any environment, regardless of migration state.

### Required Action
To enable Master Admin features, run the following migration in your Supabase SQL Editor:
- `supabase/migrations/20250201000000_create_master_admin_system.sql`

---

## 2. AI Expense Parsing (500/422 Errors)

### Root Cause
The `parse-expense` Edge Function lacked input validation and retry logic. Transient timeouts from the Gemini API or malformed AI responses caused the function to crash or return generic 500 errors to the frontend.

### Permanent Fix
- **Zod Validation**: Strict schemas for both request input and AI JSON output.
- **Exponential Backoff**: Automatic retries (up to 3 attempts) for transient Google API failures.
- **Structured Error Contract**: Returns specific HTTP codes (400 for bad input, 422 for AI hallucinations, 502 for upstream failures) with descriptive JSON messages.
- **Frontend Hardening**: `AIService.ts` now parses these structured errors to provide meaningful feedback (e.g., "AI returned malformed data") instead of a generic failure message.

---

## 3. Stale Domain DNS Errors (`spendingcalculator.xyz`)

### Root Cause
The browser was attempting to fetch data from `backend.spendingcalculator.xyz`. Exhaustive searches confirmed this URL is **not** in the source code. It is being loaded dynamically from the database (likely an old Organization Logo URL or a system notification).

### Permanent Fix
- **URL Safety Layer**: Implemented `UrlSafety.ts` with a domain blocklist.
- **Sanitization**: Added a sanitization pass to all dynamic `logo_url` rendering (Auth page, Sidebar, Contexts).
- **Benefit**: If a database record contains a dead legacy domain, the app will now catch it and fall back to the default `HERO.png` logo before the browser even attempts a DNS lookup.

### Recommendation
Run the following SQL to find and update any stale references in your database:
```sql
UPDATE organizations SET logo_url = NULL WHERE logo_url LIKE '%spendingcalculator%';
UPDATE profiles SET avatar_url = NULL WHERE avatar_url LIKE '%spendingcalculator%';
```
