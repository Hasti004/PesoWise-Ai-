import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bot, CheckCircle2, ImageIcon, Loader2, LogIn, Send, Sparkles, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AIParsedExpense, AIConversationMessage, AIService, OrgFormSchema, CustomFieldDef } from "@/services/AIService";
import { ExpenseService } from "@/services/ExpenseService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  imagePreview?: string;
};

type Phase = "chatting" | "confirming" | "submitting" | "done";

interface AIAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExpenseParsed: (expense: AIParsedExpense) => void;
}

const WELCOME_MESSAGE =
  "Hi! Describe your expense or upload a bill photo (printed or handwritten) and I'll help you log it. I'll ask for any missing details along the way.";

const MAX_ORIGINAL_FILE_BYTES = 12 * 1024 * 1024; // before resize; server limit is 4 MB decoded after base64

type ConversationBillImage = {
  data: string;
  mimeType: string;
};

/** Downscale large photos so the edge function/Gemini get a smaller payload (avoids timeouts & 413). */
async function prepareBillImageForAi(file: File): Promise<{
  data: string;
  mimeType: string;
  preview: string;
}> {
  const asDataUrl = (): Promise<{ data: string; mimeType: string; preview: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const mimeType = dataUrl.match(/:(.*?);/)?.[1] || "image/jpeg";
        const data = dataUrl.split(",")[1];
        resolve({ data, mimeType, preview: dataUrl });
      };
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_ORIGINAL_FILE_BYTES) {
    throw new Error("Image is too large. Use a photo under 12 MB.");
  }

  const tryCanvasJpeg = async (): Promise<{ data: string; mimeType: string; preview: string } | null> => {
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return null;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      const maxDim = 2048;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) return null;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.88),
      );
      if (!blob || blob.size > 4 * 1024 * 1024) return null;
      const preview = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      });
      return {
        data: preview.split(",")[1],
        mimeType: "image/jpeg",
        preview,
      };
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const resized = await tryCanvasJpeg();
  if (resized) return resized;

  return asDataUrl();
}

function extFromMimeType(mimeType: string): string {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "image/jpeg" });
}

function formatExpenseSummary(expense: AIParsedExpense): string {
  const amount = expense.amount != null
    ? `₹${expense.amount.toLocaleString("en-IN")}`
    : "Not specified";
  const date = expense.expense_date
    ? new Date(expense.expense_date + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Today";
  const category =
    expense.category.charAt(0).toUpperCase() + expense.category.slice(1);

  const lines = [
    "I've collected all the details. Here's what I'll submit:",
    "",
    `📋 Title: ${expense.title}`,
  ];

  if (expense.category === "travel" && expense.trip_from && expense.trip_to) {
    lines.push(`🚗 From: ${expense.trip_from}`);
    lines.push(`📍 To: ${expense.trip_to}`);
  } else {
    lines.push(`📍 Location: ${expense.destination}`);
  }

  lines.push(
    `💰 Amount: ${amount}`,
    `📅 Date: ${date}`,
    `🏷️ Category: ${category}`,
  );
  if (expense.purpose) lines.push(`📝 Purpose: ${expense.purpose}`);

  if (expense.custom_fields && Object.keys(expense.custom_fields).length > 0) {
    lines.push("", "--- Additional Details ---");
    for (const [name, value] of Object.entries(expense.custom_fields)) {
      if (value) lines.push(`   ${name}: ${value}`);
    }
  }

  lines.push("", "Tap Submit Expense to send directly, or Review in Form to make changes first.");
  return lines.join("\n");
}

export function AIAssistantModal({
  open,
  onOpenChange,
  onExpenseParsed,
}: AIAssistantModalProps) {
  const { user, organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [conversationHistory, setConversationHistory] = useState<AIConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("chatting");

  // Bill image persisted across the whole conversation
  const [conversationImage, setConversationImage] = useState<{
    data: string;
    mimeType: string;
  } | null>(null);

  // Image selected but not yet sent
  const [pendingImage, setPendingImage] = useState<{
    data: string;
    mimeType: string;
    preview: string;
  } | null>(null);

  const [pendingExpense, setPendingExpense] = useState<AIParsedExpense | null>(null);
  const [loadingHint, setLoadingHint] = useState("");
  const [orgFormSchema, setOrgFormSchema] = useState<OrgFormSchema | null>(null);

  // Reset everything when the modal opens
  useEffect(() => {
    if (open) {
      setMessages([{ role: "assistant", content: WELCOME_MESSAGE }]);
      setConversationHistory([]);
      setInput("");
      setLoading(false);
      setPhase("chatting");
      setConversationImage(null);
      setPendingImage(null);
      setPendingExpense(null);
      setSessionExpired(false);
      setOrgFormSchema(null);

      // Fetch all custom form fields for the organization upfront
      if (organizationId) {
        (async () => {
          try {
            const { data, error } = await supabase
              .from("expense_category_form_fields")
              .select(`
                template:expense_form_field_templates!inner(id, name, field_type, required, options, help_text),
                required,
                category:expense_categories!inner(name)
              `)
              .eq("organization_id", organizationId);

            if (error || !data) return;

            const schema: OrgFormSchema = {};
            for (const row of data as any[]) {
              const catName = row.category?.name;
              if (!catName) continue;
              const lowerCat = catName.toLowerCase();
              if (!schema[lowerCat]) schema[lowerCat] = [];
              schema[lowerCat].push({
                template_id: row.template?.id,
                name: row.template?.name,
                field_type: row.template?.field_type,
                required: row.required ?? row.template?.required ?? false,
                options: row.template?.options ?? undefined,
                help_text: row.template?.help_text ?? undefined,
              });
            }
            setOrgFormSchema(Object.keys(schema).length > 0 ? schema : null);
          } catch {
            // Non-critical — AI will just work without custom field awareness
          }
        })();
      }
    }
  }, [open, organizationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      setLoadingHint("");
      return;
    }
    const slow = window.setTimeout(() => setLoadingHint("Still working…"), 7000);
    const slower = window.setTimeout(() => setLoadingHint("Large images or long chats take longer. You can retry if this stalls."), 20000);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(slower);
    };
  }, [loading]);

  const onImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const prepared = await prepareBillImageForAi(file);
      const estDecoded = Math.floor((prepared.data.length * 3) / 4);
      if (estDecoded > 4 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Image still too large",
          description: "Try a smaller photo or screenshot the receipt.",
        });
        return;
      }
      setPendingImage(prepared);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not use this image",
        description: err instanceof Error ? err.message : "Try JPEG or PNG.",
      });
    }
  };

  const removePendingImage = () => setPendingImage(null);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !pendingImage) || loading || phase !== "chatting") return;

    // Build new user display message
    const userDisplayMsg: ChatMessage = {
      role: "user",
      content: text || (pendingImage ? "Here is my bill photo." : ""),
      imagePreview: pendingImage?.preview,
    };

    // If there's a pending image, lock it in as the conversation image
    const imageToSend = pendingImage
      ? { data: pendingImage.data, mimeType: pendingImage.mimeType }
      : conversationImage;

    if (pendingImage && !conversationImage) {
      setConversationImage({ data: pendingImage.data, mimeType: pendingImage.mimeType });
    }
    setPendingImage(null);
    setInput("");

    // The API history for this turn
    const newUserHistoryMsg: AIConversationMessage = {
      role: "user",
      content: userDisplayMsg.content,
    };
    const updatedHistory: AIConversationMessage[] = [...conversationHistory, newUserHistoryMsg];

    // Paint user message immediately so the UI feels responsive before the edge function runs.
    flushSync(() => {
      setMessages((prev) => [...prev, userDisplayMsg]);
      setConversationHistory(updatedHistory);
      setLoading(true);
    });

    const result = await AIService.sendConversationalMessage(
      updatedHistory,
      imageToSend ?? undefined,
      orgFormSchema ?? undefined,
    );

    if ("error" in result) {
      const isSessionError =
        result.error.toLowerCase().includes("session") ||
        result.error.toLowerCase().includes("sign in");
      if (isSessionError) setSessionExpired(true);
      setMessages((prev) => [...prev, { role: "assistant", content: result.error }]);
      setLoading(false);
      return;
    }

    if (result.status === "collecting") {
      const assistantMsg: AIConversationMessage = {
        role: "assistant",
        content: result.question,
      };
      setConversationHistory((prev) => [...prev, assistantMsg]);
      setMessages((prev) => [...prev, { role: "assistant", content: result.question }]);
    } else {
      // Complete – show summary
      const expense = result.expense;
      setPendingExpense(expense);
      setPhase("confirming");

      const summary = formatExpenseSummary(expense);
      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
    }

    setLoading(false);
  };

  const attachConversationBillToExpense = async (
    expenseId: string,
    expenseOrgId: string,
    image: ConversationBillImage,
  ) => {
    if (!user?.id) throw new Error("User not authenticated.");
    const ext = extFromMimeType(image.mimeType);
    const filename = `ai-bill-${Date.now()}.${ext}`;
    const storagePath = `${expenseId}/${filename}`;
    const blob = base64ToBlob(image.data, image.mimeType);
    const file = new File([blob], filename, { type: image.mimeType || "image/jpeg" });

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });
    if (uploadError) {
      throw new Error(`Failed to upload AI bill image: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(storagePath);
    const fileUrl = urlData?.publicUrl;
    if (!fileUrl) {
      throw new Error("Failed to generate bill image URL.");
    }

    const { error: attachmentError } = await supabase
      .from("attachments")
      .insert({
        expense_id: expenseId,
        organization_id: expenseOrgId,
        file_url: fileUrl,
        filename,
        content_type: file.type || "image/jpeg",
        uploaded_by: user.id,
        file_size: file.size,
      });

    if (attachmentError) {
      throw new Error(`Failed to create attachment record: ${attachmentError.message}`);
    }
  };

  const onSubmitExpense = async () => {
    if (!pendingExpense || !user) return;
    setPhase("submitting");

    try {
      const today = new Date();
      const todayStr = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");

      const expenseDate = pendingExpense.expense_date || todayStr;

      const newExpense = await ExpenseService.createExpense(user.id, {
        title: pendingExpense.title,
        destination: pendingExpense.destination || "Not-Specified",
        trip_start: expenseDate,
        trip_end: expenseDate,
        purpose: pendingExpense.purpose || undefined,
        amount: pendingExpense.amount!,
        category: pendingExpense.category,
      });

      // If user already uploaded bill image in AI chat, reuse it as the official receipt attachment.
      if (conversationImage) {
        const expenseOrgId = (newExpense as any).organization_id || organizationId;
        if (!expenseOrgId) {
          throw new Error("Expense organization not found for receipt attachment.");
        }
        await attachConversationBillToExpense(newExpense.id, expenseOrgId, conversationImage);
      }

      await ExpenseService.submitExpense(newExpense.id, user.id);

      setPhase("done");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Expense submitted successfully! You can view it in your Expenses list.",
        },
      ]);

      toast({ title: "Submitted!", description: "Your expense has been submitted." });

      setTimeout(() => onOpenChange(false), 1800);
    } catch (err: any) {
      const msg: string = err?.message || "Failed to submit expense.";
      const isAttachmentError =
        msg.toLowerCase().includes("bill photo") ||
        msg.toLowerCase().includes("attachment");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isAttachmentError
            ? `A bill photo is required for this amount. Please use "Review in Form" below to upload a receipt and then submit.`
            : `Sorry, I couldn't submit the expense: ${msg}`,
        },
      ]);
      // Stay on confirming phase so user can still choose "Review in Form"
      setPhase("confirming");
    }
  };

  const onReviewInForm = () => {
    if (!pendingExpense) return;
    onExpenseParsed(pendingExpense);
    onOpenChange(false);
  };

  const isInputDisabled = loading || phase === "submitting" || phase === "done";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            AI Expense Assistant
          </DialogTitle>
          <DialogDescription>
            Chat with AI to log your expense. Upload a bill photo or describe it in words.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[460px] flex-col gap-3">
          {/* ── Chat area ── */}
          <div className="flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-2",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" && (
                  <div className="shrink-0 rounded-full bg-indigo-100 p-1.5 text-indigo-700">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background shadow-sm",
                  )}
                >
                  {message.imagePreview && (
                    <img
                      src={message.imagePreview}
                      alt="Bill"
                      className="mb-2 max-h-32 w-auto rounded object-contain"
                    />
                  )}
                  <span className="whitespace-pre-line">{message.content}</span>
                </div>

                {message.role === "user" && (
                  <div className="shrink-0 rounded-full bg-muted p-1.5 text-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Thinking…</span>
                </div>
                {loadingHint ? (
                  <p className="pl-6 text-xs text-muted-foreground/90">{loadingHint}</p>
                ) : null}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Session expired banner ── */}
          {sessionExpired && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>Your session has expired.</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await supabase.auth.signOut(); // clear the bad session from localStorage
                  onOpenChange(false);
                  navigate("/auth");
                }}
              >
                <LogIn className="mr-1.5 h-3.5 w-3.5" />
                Sign In Again
              </Button>
            </div>
          )}

          {/* ── Confirm / Done action buttons ── */}
          {(phase === "confirming" || phase === "submitting") && pendingExpense && (
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={onSubmitExpense}
                disabled={phase === "submitting"}
              >
                {phase === "submitting" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Submit Expense
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={onReviewInForm} disabled={phase === "submitting"}>
                Review in Form
              </Button>
            </div>
          )}

          {phase === "done" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}

          {/* ── Pending image preview + handwriting hint ── */}
          {pendingImage && (
            <div className="flex items-start gap-2">
              <div className="relative w-fit shrink-0">
                <img
                  src={pendingImage.preview}
                  alt="Selected bill"
                  className="h-16 w-auto rounded border object-contain"
                />
                <button
                  type="button"
                  onClick={removePendingImage}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-snug pt-1">
                <span className="font-medium">Tip:</span> For handwritten bills, I'll try OCR first. If I miss anything (like the amount or date), just type it in the chat.
              </p>
            </div>
          )}

          {/* ── Input bar ── */}
          {phase === "chatting" && (
            <form onSubmit={onSend} className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onImageSelect}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isInputDisabled}
                title="Upload bill photo"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  conversationHistory.length === 0
                    ? "e.g. Used ₹500 today for renting a driver"
                    : "Type your reply…"
                }
                disabled={isInputDisabled}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isInputDisabled || (!input.trim() && !pendingImage)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
