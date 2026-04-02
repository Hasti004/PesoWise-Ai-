import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, ImageIcon, Loader2, Send, Sparkles, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AIParsedExpense, AIConversationMessage, AIService } from "@/services/AIService";
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
    `📍 Location: ${expense.destination}`,
    `💰 Amount: ${amount}`,
    `📅 Date: ${date}`,
    `🏷️ Category: ${category}`,
  ];
  if (expense.purpose) lines.push(`📝 Purpose: ${expense.purpose}`);
  lines.push("", "Tap Submit Expense to send directly, or Review in Form to make changes first.");
  return lines.join("\n");
}

export function AIAssistantModal({
  open,
  onOpenChange,
  onExpenseParsed,
}: AIAssistantModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    }
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const onImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Image too large",
        description: "Please select an image smaller than 4 MB.",
      });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const mimeType = dataUrl.match(/:(.*?);/)?.[1] || "image/jpeg";
      const data = dataUrl.split(",")[1];
      setPendingImage({ data, mimeType, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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

    setMessages((prev) => [...prev, userDisplayMsg]);
    setConversationHistory(updatedHistory);
    setLoading(true);

    const result = await AIService.sendConversationalMessage(updatedHistory, imageToSend ?? undefined);

    if ("error" in result) {
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

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
