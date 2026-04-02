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

type ParseExpenseBody = {
  // Conversational format
  messages?: ConversationMessage[];
  image?: { data: string; mimeType: string };
  // Legacy single-message format
  message?: string;
};

type ParsedExpense = {
  title: string;
  destination: string;
  amount: number | null;
  category: ExpenseCategory;
  expense_date: string | null;
  purpose: string | null;
  missingInfo: string | null;
};

type ConversationalResponse =
  | { status: "collecting"; question: string }
  | { status: "complete"; expense: ParsedExpense };

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-exp",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

const MAX_MESSAGE_LENGTH = 1500;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB base64

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: corsHeaders });

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

function extractGeminiText(result: any): string {
  const partText = result?.candidates?.[0]?.content?.parts
    ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    ?.trim();
  return partText || "";
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
  const destination = normalizeDestination(parsed?.destination);
  const category = normalizeCategory(parsed?.category);
  const expense_date = normalizeDate(parsed?.expense_date);
  const purpose = normalizeText(parsed?.purpose);
  const title = normalizeTitle(parsed?.title, fallbackMessage);

  let missingInfo = normalizeText(parsed?.missingInfo);
  if (!amount && !missingInfo) missingInfo = "Amount is missing or unclear.";
  if (destination === "Not-Specified" && !missingInfo) missingInfo = "Destination or vendor was not detected.";

  return { title, destination, amount, category, expense_date, purpose, missingInfo };
}

// ─── Legacy single-turn prompt ────────────────────────────────────────────────

function buildLegacyPrompt(message: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are an expense extraction assistant.",
    "Return ONLY raw JSON. No markdown. No code fences. No extra text.",
    `Today's date is ${today}. Resolve relative dates like 'today', 'yesterday', 'last Friday' accordingly.`,
    "Output schema:",
    "{",
    '  "title": "short descriptive title",',
    '  "destination": "location mentioned or Not-Specified",',
    '  "amount": number or null,',
    '  "category": "travel" | "lodging" | "food" | "other",',
    '  "expense_date": "YYYY-MM-DD" or null,',
    '  "purpose": "brief purpose" or null,',
    '  "missingInfo": "string" or null',
    "}",
    "Rules:",
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

function buildSystemInstruction(today: string, ocrText?: string): string {
  const lines = [
    "You are a friendly AI assistant helping users log expense claims through conversation.",
    `Today's date is ${today}.`,
    "",
    "Your goal is to collect these fields through natural conversation:",
    "- title: short descriptive title (REQUIRED – auto-generate from context if not stated)",
    "- destination: vendor or location name (default to Not-Specified if not mentioned)",
    "- amount: total expense amount in Indian Rupees (REQUIRED)",
    "- category: one of travel | lodging | food | other (default other)",
    `- expense_date: date in YYYY-MM-DD format (default to ${today} if not mentioned)`,
    "- purpose: brief reason for the expense (optional)",
    "",
  ];

  if (ocrText) {
    lines.push(
      "A bill/receipt image was uploaded. The following text was extracted from it (may include handwriting):",
      "--- BEGIN BILL TEXT ---",
      ocrText.slice(0, 1500),
      "--- END BILL TEXT ---",
      "",
      "Use this extracted text as your primary source for the expense fields.",
      "If numbers are marked with '?' they were uncertain – ask the user to confirm them.",
      "",
    );
  }

  lines.push(
    "Instructions:",
    "1. Analyse the full conversation history and any extracted bill text above.",
    "2. Extract every field that has already been mentioned or visible in the bill text.",
    "3. If AMOUNT is still missing or uncertain, ask for it.",
    "4. Once you have at minimum: amount + a reasonable title, return status complete.",
    "5. Ask only ONE short, friendly question at a time when collecting missing info.",
    "6. Be concise and warm in tone.",
    "",
    "IMPORTANT: Return ONLY raw JSON. No markdown, no code fences, no extra text.",
    "",
    "If you still need information:",
    '{"status": "collecting", "question": "Your single friendly question here"}',
    "",
    "When you have enough information (at minimum: amount and title):",
    '{"status": "complete", "expense": {"title": "...", "destination": "...", "amount": 1234, "category": "food", "expense_date": "YYYY-MM-DD", "purpose": "..."}}',
  );

  return lines.join("\n");
}

// ─── OCR pre-pass for handwritten / printed bill images ──────────────────────
//
// Gemini vision alone often fails to extract structured numbers from handwriting.
// We run a dedicated OCR prompt first to pull raw text, then feed that into the
// conversational context so the parser has a clean text signal to work from.

const OCR_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];

async function extractTextFromImage(
  apiKey: string,
  image: { data: string; mimeType: string },
): Promise<string> {
  const ocrPrompt = [
    "Carefully examine this bill or receipt image.",
    "It may be printed, typed, or entirely handwritten.",
    "Your only job is to extract ALL text and numbers you can see.",
    "",
    "Instructions:",
    "- Read every line, including handwritten text.",
    "- If handwriting is unclear, give your best interpretation followed by a '?' (e.g. '500?').",
    "- Include: amounts, totals, dates, vendor/shop name, item names, taxes, any numbers.",
    "- Output ONLY the raw extracted text, line by line.",
    "- Do NOT add any explanation or commentary.",
  ].join("\n");

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  for (const model of OCR_MODELS) {
    try {
      const response = await fetch(
        `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
            generationConfig: { temperature: 0, maxOutputTokens: 600 },
          }),
        },
      );

      if (response.ok) {
        const body = await response.json();
        const text = extractGeminiText(body);
        if (text) return text;
      }
    } catch {
      // silently try next model
    }
  }

  return ""; // OCR failed – conversational flow will ask the user for details
}

// ─── Gemini API helpers ───────────────────────────────────────────────────────

async function callGeminiLegacy(apiKey: string, message: string) {
  const prompt = buildLegacyPrompt(message);
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  const retryableStatus = new Set([429, 500, 502, 503, 504]);
  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await fetch(
          `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
            }),
          },
        );

        if (response.ok) {
          const body = await response.json();
          const text = extractGeminiText(body);
          if (!text) { errors.push(`${model}: empty response`); break; }
          return { model, text };
        }

        if (response.status === 404) { errors.push(`${model}: not found`); break; }

        if (retryableStatus.has(response.status) && attempt < 2) {
          await sleep(400 * (attempt + 1));
          continue;
        }

        const failText = await response.text().catch(() => "");
        errors.push(`${model}: ${response.status} ${failText.slice(0, 160)}`);
        break;
      } catch {
        if (attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        errors.push(`${model}: network error`);
      }
    }
  }

  throw new Error(`All Gemini models failed. ${errors.join(" | ")}`);
}

async function callGeminiConversational(
  apiKey: string,
  messages: ConversationMessage[],
  image?: { data: string; mimeType: string },
): Promise<ConversationalResponse> {
  const today = new Date().toISOString().slice(0, 10);

  // ── OCR pre-pass for bill images (handles handwritten bills) ──────────────
  // Run a dedicated text-extraction prompt before the main conversation call.
  // The extracted text is injected into the system instruction so the parser
  // always has a clean textual signal even when handwriting is involved.
  let ocrText: string | undefined;
  if (image) {
    ocrText = await extractTextFromImage(apiKey, image);
  }

  const systemInstruction = buildSystemInstruction(today, ocrText);
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  const retryableStatus = new Set([429, 500, 502, 503, 504]);

  // Build Gemini contents array
  const contents: any[] = [];

  // Always include the raw image too so Gemini can cross-reference visually,
  // but the OCR text in systemInstruction is the primary text signal.
  if (image) {
    contents.push({
      role: "user",
      parts: [
        { inline_data: { mime_type: image.mimeType, data: image.data } },
        { text: ocrText ? "Here is the bill image (OCR text is provided separately)." : "Here is the bill or receipt image." },
      ],
    });
    contents.push({
      role: "model",
      parts: [{ text: ocrText ? "Got it. I've read the extracted text from your bill and will use it to fill the expense." : "I can see the bill. I'll extract the expense details from it." }],
    });
  }

  for (const msg of messages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content || "(no text)" }],
    });
  }

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await fetch(
          `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
            }),
          },
        );

        if (response.ok) {
          const body = await response.json();
          const text = extractGeminiText(body);
          if (!text) { errors.push(`${model}: empty response`); break; }

          let parsed: any;
          try {
            parsed = JSON.parse(cleanupJsonText(text));
          } catch {
            errors.push(`${model}: JSON parse failed`);
            break;
          }

          if (parsed.status === "collecting" && typeof parsed.question === "string") {
            return { status: "collecting", question: parsed.question };
          }

          if (parsed.status === "complete" && parsed.expense) {
            return {
              status: "complete",
              expense: normalizeParsedExpense(parsed.expense, "Expense"),
            };
          }

          // Gemini didn't follow the new schema – treat as a legacy expense blob
          const normalized = normalizeParsedExpense(parsed, "Expense");
          if (normalized.amount !== null) {
            return { status: "complete", expense: normalized };
          }

          // Still missing amount – treat as collecting
          return {
            status: "collecting",
            question: normalized.missingInfo || "What was the total amount spent?",
          };
        }

        if (response.status === 404) { errors.push(`${model}: not found`); break; }

        if (retryableStatus.has(response.status) && attempt < 2) {
          await sleep(400 * (attempt + 1));
          continue;
        }

        const failText = await response.text().catch(() => "");
        errors.push(`${model}: ${response.status} ${failText.slice(0, 160)}`);
        break;
      } catch {
        if (attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        errors.push(`${model}: network error`);
      }
    }
  }

  throw new Error(`All Gemini models failed. ${errors.join(" | ")}`);
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
        if (data.length > MAX_IMAGE_BYTES) {
          return json(400, { error: "INVALID_BODY", message: "Image is too large. Please use an image smaller than 4 MB." });
        }
        image = { data, mimeType };
      }

      try {
        const result = await callGeminiConversational(apiKey, messages, image);
        return json(200, result as unknown as Record<string, unknown>);
      } catch (err) {
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
