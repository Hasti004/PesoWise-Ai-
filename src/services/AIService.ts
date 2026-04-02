import { supabase } from "@/integrations/supabase/client";

export interface AIParsedExpense {
  title: string;
  destination: string;
  amount: number | null;
  category: "travel" | "lodging" | "food" | "other";
  expense_date: string | null;
  purpose: string | null;
  missingInfo: string | null;
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

async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token || !data.session.user) {
    throw new Error("SESSION_EXPIRED");
  }
  return data.session;
}

async function extractEdgeError(error: any): Promise<{ status?: number; payload?: EdgeErrorPayload }> {
  const status = error?.status ?? error?.context?.status;
  if (!error?.context || typeof error.context.clone !== "function") {
    return { status };
  }
  try {
    const payload = (await error.context.clone().json()) as EdgeErrorPayload;
    return { status, payload };
  } catch {
    return { status };
  }
}

function friendlyError(status?: number, payload?: EdgeErrorPayload): string {
  if (status === 400) return payload?.message || "Please enter a more complete expense description.";
  if (status === 422) return payload?.message || "Failed to parse response. Please try with clearer details.";
  if (status === 502 || status === 503) return payload?.message || "AI is temporarily unavailable. Please try again.";
  if (status === 404) return "AI service is not deployed yet. Please redeploy backend functions.";
  return "Unable to process expense details right now. Please try again.";
}

export class AIService {
  /**
   * Legacy single-turn: send one message, get a filled expense.
   * Still used by the old AIAssistantModal flow.
   */
  static async parseExpenseFromChat(message: string): Promise<AIParsedExpense | AIParseError> {
    try {
      await ensureSession();

      const invoke = () => supabase.functions.invoke("parse-expense", { body: { message } });
      let { data, error } = await invoke();

      if (error) {
        const { status, payload } = await extractEdgeError(error);
        console.error("[AIService] parse-expense invoke failed", { status, backendError: payload?.error });

        if (status === 401) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            const retry = await invoke();
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
  ): Promise<AIConversationalResponse | AIParseError> {
    try {
      await ensureSession();

      const body: Record<string, unknown> = { messages };
      if (image) body.image = image;

      const invoke = () => supabase.functions.invoke("parse-expense", { body });
      let { data, error } = await invoke();

      if (error) {
        const { status, payload } = await extractEdgeError(error);
        console.error("[AIService] conversational invoke failed", { status, backendError: payload?.error });

        if (status === 401) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            const retry = await invoke();
            data = retry.data;
            error = retry.error;
          }
          if (error) return { error: "Your session expired. Please sign in again." };
        }

        if (!error && data && typeof data === "object") return data as AIConversationalResponse;
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
