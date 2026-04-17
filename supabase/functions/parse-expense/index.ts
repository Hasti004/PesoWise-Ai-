// @ts-nocheck
// @ts-ignore Deno edge runtime import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_CATEGORIES = ["travel", "lodging", "food", "other"] as const;
type ExpenseCategory = (typeof ALLOWED_CATEGORIES)[number];

type ConversationMessage = { role: "user" | "assistant"; content: string };

type CustomFieldDef = {
  template_id: string;
  name: string;
  field_type: string;
  required: boolean;
  options?: string[];
  help_text?: string;
};

type OrgFormSchema = Record<string, CustomFieldDef[]>;

type ParseExpenseBody = {
  // Conversational format
  messages?: ConversationMessage[];
  image?: { data: string; mimeType: string };
  orgFormSchema?: OrgFormSchema;
  // Legacy single-message format
  message?: string;
};

type ParsedExpense = {
  title: string;
  destination: string;
  trip_from: string | null;
  trip_to: string | null;
  amount: number | null;
  category: ExpenseCategory;
  expense_date: string | null;
  purpose: string | null;
  missingInfo: string | null;
  custom_fields?: Record<string, string>;
};

type ConversationalResponse =
  | { status: "collecting"; question: string }
  | { status: "complete"; expense: ParsedExpense };

/** Legacy single-message mode: flash-first, then slower fallbacks. */
const GEMINI_LEGACY_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-exp",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

/**
 * Multi-turn chat: use ONLY fast Flash models by default.
 * Trying many models × many retries often exceeds the edge gateway (~60s) → 502 GEMINI_FAILURE.
 * Override with env GEMINI_CONVERSATIONAL_MODEL or GEMINI_MODEL (single id).
 */
const GEMINI_CONVERSATIONAL_FLASH = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

/** One slow fallback only if every flash model failed (optional). */
const GEMINI_CONVERSATIONAL_FALLBACK = ["gemini-2.5-pro"];

const MAX_MESSAGE_LENGTH = 1500;
/** Decoded (binary) image size limit; base64 is ~4/3 larger — do not compare raw char length to this. */
const MAX_IMAGE_BINARY_BYTES = 4 * 1024 * 1024;
/** Stay under typical edge / CDN limits; fail fast and try next model. */
const GEMINI_REQUEST_TIMEOUT_MS = 48_000;
const MAX_CONVERSATION_MESSAGES = 18;

/** Raised when Google returns quota/billing exhaustion — retrying other models won't help. */
class GeminiQuotaExceededError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "GeminiQuotaExceededError";
  }
}

/** Too many requests in a short window (RPM) — distinct from daily quota / billing. */
class GeminiRateLimitedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "GeminiRateLimitedError";
  }
}

/** Pull message string from Gemini REST error JSON (`{ "error": { "message": "..." } }`). */
function parseGeminiErrorMessage(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText);
    const m = j?.error?.message;
    if (typeof m === "string") return m;
  } catch {
    /* plain text */
  }
  return bodyText;
}

/**
 * True when Google explicitly indicates plan/daily quota/billing (not just RPM throttling).
 * "resource exhausted" alone is used for per-minute limits too — do NOT treat as hard quota.
 */
function isHardGeminiQuotaExceeded(bodyText: string): boolean {
  const t = parseGeminiErrorMessage(bodyText).toLowerCase();
  return (
    t.includes("exceeded your current quota") ||
    t.includes("quota exceeded") ||
    t.includes("check your plan and billing") ||
    (t.includes("billing") &&
      (t.includes("enable") || t.includes("not been enabled") || t.includes("details"))) ||
    t.includes("generate_requests_per_day") ||
    (t.includes("free tier") && t.includes("limit"))
  );
}

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: corsHeaders });

/**
 * User-facing help when Google returns 429. New API keys often confuse this:
 * - Keys must live in Supabase Edge secrets, not Vite .env.
 * - Keys in the same Google Cloud / AI Studio project share one quota bucket.
 */
const USER_MESSAGE_GEMINI_QUOTA =
  "Google says this API key exceeded quota or billing limits (not a “random” 429). " +
  "The key that actually runs in production is only GEMINI_API_KEY in Supabase → Project Settings → Edge Functions → Secrets. " +
  "If you switched Google accounts: open the function logs for parse-expense right after a failure — we log the first 10 characters of the key in use; they must match your new key from AI Studio. " +
  "If they match and you still see this, enable billing or raise limits: https://ai.google.dev/gemini-api/docs/rate-limits";

const USER_MESSAGE_GEMINI_RATE_LIMIT =
  "Gemini returned too many requests in a short time (HTTP 429 rate limit). Wait about one minute and try again. " +
  "If it happens on every first message, check Supabase Edge secrets: the app may still be using an old GEMINI_API_KEY.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function cleanupJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/** Upper bound on decoded byte size from base64 string (ignoring padding nuance). */
function approxDecodedBase64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

/** Gemini expects image/jpeg, image/png, etc. */
function normalizeImageMimeType(mime: string): string {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "image/pjpeg") return "image/jpeg";
  if (
    m === "image/jpeg" ||
    m === "image/png" ||
    m === "image/webp" ||
    m === "image/gif"
  ) {
    return m;
  }
  return "image/jpeg";
}

/** Vision models often prepend text; find first balanced JSON object. */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonFromModelText(raw: string): any | null {
  const cleaned = cleanupJsonText(raw);
  const candidates: string[] = [cleaned];
  const balanced = extractBalancedJsonObject(cleaned);
  if (balanced && balanced !== cleaned) candidates.push(balanced);
  for (const s of candidates) {
    try {
      return JSON.parse(s);
    } catch {
      /* try next */
    }
  }
  return null;
}

function extractGeminiText(result: any): string {
  const partText = result?.candidates?.[0]?.content?.parts
    ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    ?.trim();
  return partText || "";
}

function geminiBlockedReason(result: any): string | null {
  const fr = result?.candidates?.[0]?.finishReason;
  // Truncated output may still contain parseable JSON — try parsing before failing.
  if (fr === "MAX_TOKENS") return null;
  if (fr && fr !== "STOP") return `finish:${fr}`;
  const br = result?.promptFeedback?.blockReason;
  if (br) return `blocked:${br}`;
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function normalizeCategory(value: unknown): ExpenseCategory {
  if (typeof value !== "string") return "other";
  const normalized = value.toLowerCase().trim();
  return (ALLOWED_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as ExpenseCategory)
    : "other";
}

function normalizeDestination(value: unknown): string {
  if (typeof value !== "string") return "Not-Specified";
  const trimmed = value.trim();
  return trimmed ? trimmed : "Not-Specified";
}

/** True when we should keep collecting — model/user gave no usable place/vendor/city. */
function isDestinationUnset(destination: string): boolean {
  const d = destination.trim().toLowerCase();
  if (!d) return true;
  return (
    d === "not-specified" ||
    d === "not specified" ||
    d === "n/a" ||
    d === "na" ||
    d === "unknown" ||
    d === "none" ||
    d === "unspecified"
  );
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeTitle(value: unknown, fallbackMessage: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  return fallbackMessage.slice(0, 120);
}

function normalizeParsedExpense(parsed: any, fallbackMessage: string): ParsedExpense {
  const amount = normalizeAmount(parsed?.amount);
  const category = normalizeCategory(parsed?.category);
  const expense_date = normalizeDate(parsed?.expense_date);
  const purpose = normalizeText(parsed?.purpose);
  const title = normalizeTitle(parsed?.title, fallbackMessage);
  const trip_from = normalizeText(parsed?.trip_from);
  const trip_to = normalizeText(parsed?.trip_to);

  // For travel, build destination from trip_from/trip_to when not already set
  let destination = normalizeDestination(parsed?.destination);
  if (category === "travel" && trip_from && trip_to && isDestinationUnset(destination)) {
    destination = `${trip_from} to ${trip_to}`;
  }

  let missingInfo = normalizeText(parsed?.missingInfo);
  if (!amount && !missingInfo) missingInfo = "Amount is missing or unclear.";
  if (destination === "Not-Specified" && !missingInfo) missingInfo = "Destination or vendor was not detected.";

  // Preserve custom_fields if present
  let custom_fields: Record<string, string> | undefined;
  if (parsed?.custom_fields && typeof parsed.custom_fields === "object") {
    custom_fields = {};
    for (const [key, val] of Object.entries(parsed.custom_fields)) {
      if (val != null && String(val).trim()) {
        custom_fields[key] = String(val).trim();
      }
    }
    if (Object.keys(custom_fields).length === 0) custom_fields = undefined;
  }

  return { title, destination, trip_from, trip_to, amount, category, expense_date, purpose, missingInfo, custom_fields };
}

// ─── Legacy single-turn prompt ────────────────────────────────────────────────

function buildLegacyPrompt(message: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are an expense extraction assistant.",
    "Return ONLY raw JSON. No markdown. No code fences. No extra text.",
    `Today's date is ${today}. Resolve relative dates like 'today', 'yesterday', 'last Friday' accordingly.`,
    "Categories: travel = ANY transport (driver hire, cab, fuel, flight, train, bus, auto, toll); lodging = hotel/accommodation; food = meals/restaurant; other = everything else.",
    "Output schema:",
    "{",
    '  "title": "short descriptive title",',
    '  "destination": "for travel: \'From to To\'; for others: vendor/location or Not-Specified",',
    '  "trip_from": "origin city/place if travel, else null",',
    '  "trip_to": "destination city/place if travel, else null",',
    '  "amount": number or null,',
    '  "category": "travel" | "lodging" | "food" | "other",',
    '  "expense_date": "YYYY-MM-DD" or null,',
    '  "purpose": "brief purpose" or null,',
    '  "missingInfo": "string" or null',
    "}",
    "Rules:",
    "- For travel: set trip_from and trip_to if mentioned; set destination = trip_from + ' to ' + trip_to.",
    "- If destination is not explicit, set destination to Not-Specified.",
    "- If amount is not explicit, set amount to null.",
    "- If category is unclear, set category to other.",
    "- If key information is missing, set missingInfo to a short explanation, else null.",
    "- Keep title concise and practical.",
    "",
    `User message: "${message}"`,
  ].join("\n");
}

// ─── Conversational system instruction ────────────────────────────────────────

function buildSystemInstruction(today: string, ocrText?: string, orgFormSchema?: OrgFormSchema): string {
  const lines = [
    "You help users log expense claims (INR). Be brief and warm.",
    `Today: ${today}. Resolve relative dates to YYYY-MM-DD.`,
    "",
    "CATEGORIES — classify strictly:",
    "- travel: ANY transport/movement expense — driver hire, car/auto/cab/taxi rental, Ola/Uber/rickshaw, fuel/petrol/diesel, flight, train, bus, toll, parking, vehicle hire, commute",
    "- lodging: overnight stay — hotel, hostel, guest house, dharamshala, accommodation, room booking",
    "- food: meals, snacks, drinks — restaurant, canteen, cafeteria, dhaba, food delivery, tea/coffee shop",
    "- other: everything else (stationery, medical, miscellaneous, shopping)",
    "",
    "FIELDS to collect:",
    "- title: short descriptive title (infer from context; e.g. 'Driver Hire – Mumbai to Pune')",
    "- destination: main location/vendor. For travel: use 'FromPlace to ToPlace' format. For others: restaurant/shop name or city.",
    "- trip_from: origin place — ONLY for travel category (city, area, or landmark). Set null for all other categories.",
    "- trip_to: destination place — ONLY for travel category. Set null for all other categories.",
    "- amount: INR number (required)",
    "- category: travel|lodging|food|other",
    "- expense_date: YYYY-MM-DD (default today if not specified)",
    "- purpose: brief reason (optional)",
    "",
    "TRAVEL RULE: When category is travel you MUST collect BOTH trip_from and trip_to before completing. If either is missing, ask: 'Where did you travel from, and where to?' Do not mark complete until both are provided.",
    "DESTINATION RULE: For travel set destination = trip_from + ' to ' + trip_to. For food/lodging/other use the vendor or location name — never 'Not-Specified' unless user explicitly says unknown.",
  ];

  if (ocrText) {
    lines.push(
      "",
      "Bill OCR text (prefer this for amounts and dates):",
      ocrText.slice(0, 1200),
      "",
      "If an OCR number is unclear (marked '?'), ask one short confirm question.",
    );
  }

  // Inject organization custom fields if available
  if (orgFormSchema && Object.keys(orgFormSchema).length > 0) {
    lines.push(
      "",
      "ORGANIZATION CUSTOM FIELDS (by category):",
      "These are additional fields the organization requires. After determining the category, check its custom fields below.",
      "Extract values from the OCR text or user messages when possible. For REQUIRED custom fields you cannot determine, ASK the user.",
      "Do NOT guess or make up values — only fill what you are confident about from the bill or conversation.",
      "For optional fields you cannot determine, skip them (do not ask).",
    );
    for (const [cat, fields] of Object.entries(orgFormSchema)) {
      if (fields.length === 0) continue;
      lines.push(`  ${cat}:`);
      for (const f of fields) {
        let desc = `    - "${f.name}" (${f.field_type}${f.required ? ", REQUIRED" : ", optional"})`;
        if (f.options?.length) desc += ` [options: ${f.options.join(", ")}]`;
        if (f.help_text) desc += ` — ${f.help_text}`;
        lines.push(desc);
      }
    }
    lines.push(
      "",
      'When complete, include "custom_fields" in the expense JSON mapping field names to values:',
      '"custom_fields": {"Field Name": "value", ...}',
      "Only include fields you have values for. Do NOT include fields with empty or unknown values.",
    );
  }

  lines.push(
    "",
    "Rules: Ask ONE short question at a time. Do NOT return complete until you have: amount, title, specific destination, AND for travel: both trip_from and trip_to. Also ensure all REQUIRED custom fields (if any) for the detected category are filled before completing.",
    "",
    "Output ONLY raw JSON — no markdown, no code fences:",
    'Need info → {"status":"collecting","question":"..."}',
    `Travel done → {"status":"complete","expense":{"title":"Driver Hire","destination":"Ahmedabad to Surat","trip_from":"Ahmedabad","trip_to":"Surat","amount":1200,"category":"travel","expense_date":"${today}","purpose":null,"custom_fields":{"Vehicle Number":"MH-01-AB-1234"}}}`,
    `Food done → {"status":"complete","expense":{"title":"Dinner at Cafe","destination":"Cafe Name","trip_from":null,"trip_to":null,"amount":450,"category":"food","expense_date":"${today}","purpose":null}}`,
  );

  return lines.join("\n");
}

// ─── OCR pre-pass for handwritten / printed bill images ──────────────────────
//
// Gemini vision alone often fails to extract structured numbers from handwriting.
// We run a dedicated OCR prompt first to pull raw text, then feed that into the
// conversational context so the parser has a clean text signal to work from.

/** Single fast OCR attempt (+ one backup) to save latency; main chat still sees the image. */
const OCR_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash"];

async function extractTextFromImage(
  apiKey: string,
  image: { data: string; mimeType: string },
): Promise<string> {
  const ocrPrompt = [
    "Extract all visible text and numbers from this receipt/bill (printed or handwritten).",
    "Uncertain digits: add '?'. Lines only, no commentary.",
  ].join("\n");

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  for (const model of OCR_MODELS) {
    try {
      const response = await fetch(
        `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inline_data: { mime_type: image.mimeType, data: image.data } },
                  { text: ocrPrompt },
                ],
              },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 512 },
          }),
        },
      );

      if (response.ok) {
        const body = await response.json();
        const blocked = geminiBlockedReason(body);
        if (blocked) continue;
        const text = extractGeminiText(body);
        if (text) return text;
      } else if (response.status === 429) {
        const t = await response.text().catch(() => "");
        console.warn("[parse-expense] Gemini 429 (OCR), configured key prefix:", apiKey.slice(0, 10));
        if (isHardGeminiQuotaExceeded(t)) {
          throw new GeminiQuotaExceededError(t.slice(0, 300));
        }
      }
    } catch (e) {
      if (e instanceof GeminiQuotaExceededError) throw e;
      // try next model
    }
  }

  return ""; // OCR failed – conversational flow will ask the user for details
}

// ─── Gemini API helpers ───────────────────────────────────────────────────────

async function callGeminiLegacy(apiKey: string, message: string) {
  const prompt = buildLegacyPrompt(message);
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  const retryOnce = new Set([503, 504]);
  const errors: string[] = [];

  for (const model of GEMINI_LEGACY_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
            }),
          },
        );

        if (response.ok) {
          const body = await response.json();
          const blocked = geminiBlockedReason(body);
          if (blocked) {
            errors.push(`${model}: ${blocked}`);
            break;
          }
          const text = extractGeminiText(body);
          if (!text) { errors.push(`${model}: empty response`); break; }
          return { model, text };
        }

        if (response.status === 404) { errors.push(`${model}: not found`); break; }

        if (response.status === 429) {
          const failText = await response.text().catch(() => "");
          console.warn("[parse-expense] Gemini 429 (legacy), configured key prefix:", apiKey.slice(0, 10));
          if (isHardGeminiQuotaExceeded(failText)) {
            throw new GeminiQuotaExceededError(failText.slice(0, 300));
          }
          if (attempt === 0) {
            await sleep(2200);
            continue;
          }
          if (attempt === 1) {
            await sleep(5500);
            continue;
          }
          errors.push(`${model}: 429 ${parseGeminiErrorMessage(failText).slice(0, 120)}`);
          break;
        }

        if (retryOnce.has(response.status) && attempt === 0) {
          await sleep(500);
          continue;
        }

        const failText = await response.text().catch(() => "");
        errors.push(`${model}: ${response.status} ${failText.slice(0, 160)}`);
        break;
      } catch (e) {
        if (e instanceof GeminiQuotaExceededError) throw e;
        const name = e instanceof Error ? e.name : "";
        if ((name === "TimeoutError" || name === "AbortError") && attempt === 0) {
          errors.push(`${model}: timeout`);
          break;
        }
        if (attempt === 0) { await sleep(400); continue; }
        errors.push(`${model}: network error`);
        break;
      }
    }
  }

  const legacyJoined = errors.join(" | ");
  if (/\b429\b/.test(legacyJoined)) {
    if (isHardGeminiQuotaExceeded(legacyJoined)) {
      throw new GeminiQuotaExceededError(legacyJoined.slice(0, 400));
    }
    throw new GeminiRateLimitedError(legacyJoined.slice(0, 400));
  }

  throw new Error(`All Gemini models failed. ${legacyJoined}`);
}

function conversationalModelOrder(): string[] {
  const pinned =
    Deno.env.get("GEMINI_CONVERSATIONAL_MODEL")?.trim() ||
    Deno.env.get("GEMINI_MODEL")?.trim();
  if (pinned) return [pinned];
  const useFallback = Deno.env.get("GEMINI_USE_PRO_FALLBACK") === "1";
  return useFallback
    ? [...GEMINI_CONVERSATIONAL_FLASH, ...GEMINI_CONVERSATIONAL_FALLBACK]
    : [...GEMINI_CONVERSATIONAL_FLASH];
}

function trimConversation(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length <= MAX_CONVERSATION_MESSAGES) return messages;
  return messages.slice(-MAX_CONVERSATION_MESSAGES);
}

const ASK_DESTINATION_QUESTION =
  "Where was this — which restaurant, shop, city, or neighbourhood?";
const ASK_TRAVEL_FROM_TO_QUESTION =
  "Where did you travel from, and where to?";

function getMissingRequiredCustomFields(expense: ParsedExpense, orgFormSchema?: OrgFormSchema): string[] {
  if (!orgFormSchema) return [];
  const catFields = orgFormSchema[expense.category];
  if (!catFields?.length) return [];
  const filled = expense.custom_fields || {};
  return catFields
    .filter((f) => f.required)
    .filter((f) => {
      const val = filled[f.name];
      return !val || !val.trim();
    })
    .map((f) => f.name);
}

function parseConversationalGeminiJson(
  text: string,
  model: string,
  errors: string[],
  orgFormSchema?: OrgFormSchema,
): ConversationalResponse | null {
  const parsed = parseJsonFromModelText(text);
  if (!parsed) {
    errors.push(`${model}: JSON parse failed`);
    return null;
  }

  if (parsed.status === "collecting" && typeof parsed.question === "string") {
    return { status: "collecting", question: parsed.question };
  }

  if (parsed.status === "complete" && parsed.expense) {
    const expense = normalizeParsedExpense(parsed.expense, "Expense");
    // For travel: require both trip_from and trip_to before completing
    if (expense.category === "travel" && (!expense.trip_from || !expense.trip_to)) {
      return { status: "collecting", question: ASK_TRAVEL_FROM_TO_QUESTION };
    }
    if (isDestinationUnset(expense.destination)) {
      return { status: "collecting", question: ASK_DESTINATION_QUESTION };
    }
    // Check required custom fields
    const missingCustom = getMissingRequiredCustomFields(expense, orgFormSchema);
    if (missingCustom.length > 0) {
      const fieldList = missingCustom.join(", ");
      return {
        status: "collecting",
        question: missingCustom.length === 1
          ? `I also need: what is the ${fieldList}?`
          : `I still need a few details: ${fieldList}. Could you provide these?`,
      };
    }
    return { status: "complete", expense };
  }

  const normalized = normalizeParsedExpense(parsed, "Expense");
  if (normalized.amount !== null) {
    if (normalized.category === "travel" && (!normalized.trip_from || !normalized.trip_to)) {
      return { status: "collecting", question: ASK_TRAVEL_FROM_TO_QUESTION };
    }
    if (isDestinationUnset(normalized.destination)) {
      return { status: "collecting", question: ASK_DESTINATION_QUESTION };
    }
    const missingCustom = getMissingRequiredCustomFields(normalized, orgFormSchema);
    if (missingCustom.length > 0) {
      const fieldList = missingCustom.join(", ");
      return {
        status: "collecting",
        question: missingCustom.length === 1
          ? `I also need: what is the ${fieldList}?`
          : `I still need a few details: ${fieldList}. Could you provide these?`,
      };
    }
    return { status: "complete", expense: normalized };
  }

  return {
    status: "collecting",
    question: normalized.missingInfo || "What was the total amount spent?",
  };
}

async function callGeminiConversational(
  apiKey: string,
  messages: ConversationMessage[],
  image?: { data: string; mimeType: string },
  orgFormSchema?: OrgFormSchema,
): Promise<ConversationalResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const recentMessages = trimConversation(messages);

  // OCR pre-pass only with image (short path — max 2 small models)
  let ocrText: string | undefined;
  if (image) {
    ocrText = await extractTextFromImage(apiKey, image);
  }

  const systemInstruction = buildSystemInstruction(today, ocrText, orgFormSchema);
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  const contents: any[] = [];

  if (image) {
    contents.push({
      role: "user",
      parts: [
        { inline_data: { mime_type: image.mimeType, data: image.data } },
        {
          text: ocrText
            ? "Bill image (OCR in system instruction)."
            : "Bill / receipt image.",
        },
      ],
    });
    contents.push({
      role: "model",
      parts: [{
        text: ocrText
          ? "Using extracted bill text from system prompt."
          : "Reviewing the bill image.",
      }],
    });
  }

  for (const msg of recentMessages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content || "(no text)" }],
    });
  }

  const errors: string[] = [];
  const models = conversationalModelOrder();
  /** Quota hits the API key — don't burn time cycling every model. */
  const retryTransient = new Set([503, 504]);

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: {
                temperature: 0.05,
                // Vision + JSON needs headroom; truncated output breaks JSON.parse.
                maxOutputTokens: image ? 1024 : 450,
              },
            }),
          },
        );

        if (response.ok) {
          const body = await response.json();
          const blocked = geminiBlockedReason(body);
          if (blocked) {
            errors.push(`${model}: ${blocked}`);
            break;
          }
          const text = extractGeminiText(body);
          if (!text) {
            errors.push(`${model}: empty response`);
            break;
          }
          const parsed = parseConversationalGeminiJson(text, model, errors, orgFormSchema);
          if (parsed) return parsed;
          break;
        }

        if (response.status === 404) {
          errors.push(`${model}: not found`);
          break;
        }

        if (response.status === 429) {
          const failText = await response.text().catch(() => "");
          console.warn("[parse-expense] Gemini 429 (chat), configured key prefix:", apiKey.slice(0, 10));
          if (isHardGeminiQuotaExceeded(failText)) {
            throw new GeminiQuotaExceededError(failText.slice(0, 300));
          }
          if (attempt === 0) {
            await sleep(2200);
            continue;
          }
          if (attempt === 1) {
            await sleep(5500);
            continue;
          }
          errors.push(`${model}: 429 ${parseGeminiErrorMessage(failText).slice(0, 120)}`);
          break;
        }

        if (retryTransient.has(response.status) && attempt === 0) {
          await sleep(450);
          continue;
        }

        const failText = await response.text().catch(() => "");
        errors.push(`${model}: ${response.status} ${failText.slice(0, 160)}`);
        break;
      } catch (e) {
        if (e instanceof GeminiQuotaExceededError) throw e;
        const name = e instanceof Error ? e.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          errors.push(`${model}: timeout`);
          break;
        }
        if (attempt === 0) {
          await sleep(350);
          continue;
        }
        errors.push(`${model}: network error`);
        break;
      }
    }
  }

  const joined = errors.join(" | ");
  if (/\b429\b/.test(joined)) {
    if (isHardGeminiQuotaExceeded(joined)) {
      throw new GeminiQuotaExceededError(joined.slice(0, 400));
    }
    throw new GeminiRateLimitedError(joined.slice(0, 400));
  }

  throw new Error(`All Gemini models failed. ${joined}`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED", message: "Only POST is supported." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "SERVER_MISCONFIGURED", message: "Supabase auth config is missing." });
    }

    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return json(401, { error: "UNAUTHORIZED", message: "Authorization token is required." });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return json(401, { error: "INVALID_JWT", message: "Invalid or expired session token." });
    }

    const body = (await req.json().catch(() => ({}))) as ParseExpenseBody;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json(503, { error: "AI_CONFIG_MISSING", message: "AI service is temporarily unavailable." });
    }

    // ── Conversational mode (new) ──────────────────────────────────────────
    if (Array.isArray(body.messages)) {
      const messages = body.messages as ConversationMessage[];

      if (messages.length === 0) {
        return json(400, { error: "INVALID_BODY", message: "messages array cannot be empty." });
      }

      // Validate each message
      for (const msg of messages) {
        if (msg.role !== "user" && msg.role !== "assistant") {
          return json(400, { error: "INVALID_BODY", message: "Each message role must be 'user' or 'assistant'." });
        }
        if (typeof msg.content !== "string") {
          return json(400, { error: "INVALID_BODY", message: "Each message must have a string content." });
        }
      }

      // Validate image if provided
      let image: { data: string; mimeType: string } | undefined;
      if (body.image) {
        const { data, mimeType } = body.image as any;
        if (typeof data !== "string" || typeof mimeType !== "string") {
          return json(400, { error: "INVALID_BODY", message: "image must have data and mimeType string fields." });
        }
        if (approxDecodedBase64Bytes(data) > MAX_IMAGE_BINARY_BYTES) {
          return json(400, {
            error: "INVALID_BODY",
            message: "Image is too large. Please use a photo under 4 MB or send a smaller shot.",
          });
        }
        image = { data, mimeType: normalizeImageMimeType(mimeType) };
      }

      // Extract org form schema if provided (custom fields per category)
      const orgFormSchema: OrgFormSchema | undefined =
        body.orgFormSchema && typeof body.orgFormSchema === "object"
          ? (body.orgFormSchema as OrgFormSchema)
          : undefined;

      try {
        const result = await callGeminiConversational(apiKey, messages, image, orgFormSchema);
        return json(200, result as unknown as Record<string, unknown>);
      } catch (err) {
        if (err instanceof GeminiQuotaExceededError) {
          return json(503, {
            error: "GEMINI_QUOTA_EXCEEDED",
            message: USER_MESSAGE_GEMINI_QUOTA,
            details: err.message.slice(0, 400),
          });
        }
        if (err instanceof GeminiRateLimitedError) {
          return json(503, {
            error: "GEMINI_RATE_LIMIT",
            message: USER_MESSAGE_GEMINI_RATE_LIMIT,
            details: err.message.slice(0, 400),
          });
        }
        const msg = err instanceof Error ? err.message : "Gemini request failed.";
        return json(502, { error: "GEMINI_FAILURE", message: "AI parsing failed. Please try again.", details: msg.slice(0, 400) });
      }
    }

    // ── Legacy single-message mode ─────────────────────────────────────────
    if (typeof body.message !== "string") {
      return json(400, { error: "INVALID_BODY", message: "Provide either 'messages' array or 'message' string." });
    }

    const message = body.message.trim();
    if (!message) {
      return json(400, { error: "INVALID_BODY", message: "message cannot be empty." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json(400, { error: "INVALID_BODY", message: `message cannot exceed ${MAX_MESSAGE_LENGTH} characters.` });
    }

    let parsed: unknown;
    try {
      const gemini = await callGeminiLegacy(apiKey, message);
      parsed = JSON.parse(cleanupJsonText(gemini.text));
    } catch (err) {
      if (err instanceof GeminiQuotaExceededError) {
        return json(503, {
          error: "GEMINI_QUOTA_EXCEEDED",
          message: USER_MESSAGE_GEMINI_QUOTA,
          details: err.message.slice(0, 400),
        });
      }
      if (err instanceof GeminiRateLimitedError) {
        return json(503, {
          error: "GEMINI_RATE_LIMIT",
          message: USER_MESSAGE_GEMINI_RATE_LIMIT,
          details: err.message.slice(0, 400),
        });
      }
      const messageText = err instanceof Error ? err.message : "Gemini request failed.";
      if (messageText.toLowerCase().includes("json")) {
        return json(422, { error: "INVALID_AI_RESPONSE", message: "AI returned malformed structured data." });
      }
      return json(502, { error: "GEMINI_FAILURE", message: "AI parsing failed. Please try again.", details: messageText.slice(0, 400) });
    }

    const normalized = normalizeParsedExpense(parsed, message);
    if (!normalized.title) {
      return json(422, { error: "INVALID_AI_RESPONSE", message: "AI response could not be normalized." });
    }

    return json(200, normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected internal error.";
    return json(500, { error: "INTERNAL_ERROR", message: "Internal server error.", details: message.slice(0, 300) });
  }
});
