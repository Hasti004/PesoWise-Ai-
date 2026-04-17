import { supabase } from "@/integrations/supabase/client";

export interface CustomFieldDef {
  template_id: string;
  name: string;
  field_type: string;
  required: boolean;
  options?: string[];
  help_text?: string;
}

export type OrgFormSchema = Record<string, CustomFieldDef[]>;

export interface AIParsedExpense {
  title: string;
  destination: string;
  /** Origin place — populated only when category is "travel" */
  trip_from?: string | null;
  /** Destination place — populated only when category is "travel" */
  trip_to?: string | null;
  amount: number | null;
  category: "travel" | "lodging" | "food" | "other";
  expense_date: string | null;
  purpose: string | null;
  missingInfo: string | null;
  /** Custom field values keyed by field name */
  custom_fields?: Record<string, string>;
}

export interface AIParseError {
  error: string;
}

export interface AIConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type AIConversationalResponse =
  | { status: "collecting"; question: string }
  | { status: "complete"; expense: AIParsedExpense };

type EdgeErrorPayload = {
  error?: string;
  message?: string;
  details?: unknown;
};

/**
 * Returns the current access token, refreshing if the session is missing.
 * The edge function (deployed with verify_jwt=false) handles its own JWT
 * validation, so we just need a token to send. On 401 the caller retries
 * with a fresh token via refreshSession().
 */
async function getValidToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (session?.access_token) {
    return session.access_token;
  }

  // No session in storage — attempt a refresh
  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error || !refreshed.session?.access_token) throw new Error("SESSION_EXPIRED");
  return refreshed.session.access_token;
}

async function extractEdgeError(error: any): Promise<{ status?: number; payload?: EdgeErrorPayload }> {
  // supabase-js wraps the HTTP status in error.status (newer versions) or
  // error.context.status (older FunctionsHttpError shape).
  const status: number | undefined = error?.status ?? error?.context?.status;

  // Try to extract the JSON body Supabase attaches as error.context
  if (error?.context) {
    try {
      // context is sometimes a Response object (has .clone / .json)
      if (typeof error.context.clone === "function") {
        const payload = (await error.context.clone().json()) as EdgeErrorPayload;
        return { status, payload };
      }
      // context is sometimes already a plain object
      if (typeof error.context === "object") {
        return { status, payload: error.context as EdgeErrorPayload };
      }
    } catch {
      // ignore – return status only
    }
  }

  return { status };
}

function detailsText(payload?: EdgeErrorPayload): string {
  const d = payload?.details;
  if (typeof d === "string") return d.toLowerCase();
  return "";
}

function friendlyError(status?: number, payload?: EdgeErrorPayload): string {
  if (status === 400) return payload?.message || "Please enter a more complete expense description.";
  if (status === 422) return payload?.message || "Failed to parse response. Please try with clearer details.";

  if (payload?.error === "GEMINI_QUOTA_EXCEEDED") {
    return (
      payload.message ||
      "Gemini quota/billing error: set GEMINI_API_KEY in Supabase Edge Function secrets. Check function logs for the key prefix versus AI Studio."
    );
  }

  if (payload?.error === "GEMINI_RATE_LIMIT") {
    return (
      payload.message ||
      "Too many Gemini requests in a short time. Wait a minute and retry, or confirm the correct GEMINI_API_KEY in Supabase Edge secrets."
    );
  }

  const low = detailsText(payload);
  const looksLikeQuota =
    low.includes("quota") ||
    low.includes("billing") ||
    low.includes("exceeded your current quota") ||
    low.includes("resource exhausted");
  if ((status === 502 || status === 503) && looksLikeQuota) {
    return "Google Gemini quota or billing limit was reached (error 429 from Google). This is not a network timeout — ask your admin to check the API key and billing in Google AI Studio, then try again later.";
  }

  if (status === 502 || status === 503) {
    const timeoutOnly = low.includes("timeout") || low.includes("timed out");
    const hint =
      payload?.error === "GEMINI_FAILURE" && timeoutOnly
        ? " If this keeps happening, try a shorter message or retry once."
        : payload?.error === "GEMINI_FAILURE"
          ? " If the problem continues, ask your admin to check the Gemini API key and quotas."
          : "";
    return (payload?.message || "AI is temporarily unavailable. Please try again.") + hint;
  }
  if (status === 404) return "AI service is not deployed yet. Please redeploy backend functions.";
  return "Unable to process expense details right now. Please try again.";
}

/** Call the edge function with an explicit Bearer token so we bypass the
 *  Supabase client's internal getSession() inside functions.invoke(). */
function invokeWithToken(token: string, body: Record<string, unknown>) {
  return supabase.functions.invoke("parse-expense", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export class AIService {
  /**
   * Legacy single-turn: send one message, get a filled expense.
   */
  static async parseExpenseFromChat(message: string): Promise<AIParsedExpense | AIParseError> {
    try {
      let token = await getValidToken();
      let { data, error } = await invokeWithToken(token, { message });

      if (error) {
        const { status, payload } = await extractEdgeError(error);
        console.error("[AIService] parse-expense invoke failed", { status, backendError: payload?.error });

        if (status === 401) {
          // Token was rejected even after getValidToken() – force another refresh
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed.session?.access_token) {
            const retry = await invokeWithToken(refreshed.session.access_token, { message });
            data = retry.data;
            error = retry.error;
          }
          if (error) return { error: "Your session expired. Please sign in again." };
        }

        if (!error && data && typeof data === "object") return data as AIParsedExpense;
        return { error: friendlyError(status, payload) };
      }

      if (!data || typeof data !== "object") {
        return { error: "Failed to parse response. Please try again." };
      }

      return data as AIParsedExpense;
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        return { error: "Your session expired. Please sign in again." };
      }
      console.error("[AIService] parse-expense unexpected error", err);
      return { error: "Unable to reach AI service. Please check your connection and retry." };
    }
  }

  /**
   * Multi-turn conversational mode.
   * Sends the full conversation history (and optional bill image) to Gemini.
   * Returns either a follow-up question or the complete parsed expense.
   */
  static async sendConversationalMessage(
    messages: AIConversationMessage[],
    image?: { data: string; mimeType: string },
    orgFormSchema?: OrgFormSchema,
  ): Promise<AIConversationalResponse | AIParseError> {
    try {
      let token = await getValidToken();

      const body: Record<string, unknown> = { messages };
      if (image) body.image = image;
      if (orgFormSchema) body.orgFormSchema = orgFormSchema;

      let { data, error } = await invokeWithToken(token, body);

      if (error) {
        const { status, payload } = await extractEdgeError(error);
        console.error("[AIService] conversational invoke failed", { status, backendError: payload?.error });

        if (status === 401) {
          // Force another refresh and retry once more
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed.session?.access_token) {
            const retry = await invokeWithToken(refreshed.session.access_token, body);
            data = retry.data;
            error = retry.error;
          }
          if (error) return { error: "Your session expired. Please sign in again." };
        }

        if (!error && data && typeof data === "object") return data as AIConversationalResponse;
        if ((status === 502 || status === 503) && payload?.details && import.meta.env?.DEV) {
          console.warn("[AIService] GEMINI details:", payload.details);
        }
        return { error: friendlyError(status, payload) };
      }

      if (!data || typeof data !== "object") {
        return { error: "Failed to parse response. Please try again." };
      }

      return data as AIConversationalResponse;
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        return { error: "Your session expired. Please sign in again." };
      }
      console.error("[AIService] conversational unexpected error", err);
      return { error: "Unable to reach AI service. Please check your connection and retry." };
    }
  }
}
