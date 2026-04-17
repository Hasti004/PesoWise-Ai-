import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { createNotification } from "./NotificationService";

export interface MoneyReturnRequest {
  id: string;
  requester_id: string;
  cashier_id: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at?: string;
  rejected_at?: string;
  approved_by?: string;
  rejected_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export class MoneyReturnService {
  /**
   * Create a money return request (requires cashier approval)
   */
  static async createReturnRequest(
    requesterId: string,
    cashierId: string,
    amount: number
  ): Promise<MoneyReturnRequest> {
    // First, verify the requester has sufficient balance
    const { data: requesterProfile, error: profileError } = await supabase
      .from("profiles")
      .select("balance, name")
      .eq("user_id", requesterId)
      .single();

    if (profileError) throw profileError;

    const currentBalance = Number(requesterProfile?.balance ?? 0);
    if (amount > currentBalance) {
      throw new Error(`Insufficient balance. You only have ${formatINR(currentBalance)}`);
    }

    // Create the return request
    const { data: request, error: requestError } = await supabase
      .from("money_return_requests")
      .insert({
        requester_id: requesterId,
        cashier_id: cashierId,
        amount: amount,
        status: "pending",
      })
      .select()
      .single();

    if (requestError) throw requestError;

    // Get requester name for notification
    const requesterName = requesterProfile?.name || "User";

    // Notify cashier about the return request
    await createNotification({
      userId: cashierId,
      type: "balance_added", // Reusing this type, or we can add a new type
      title: "Money Return Request",
      message: `${requesterName} wants to return ${formatINR(amount)} to you. Please approve or reject this request.`,
    });

    return request as MoneyReturnRequest;
  }

  /**
   * Approve a money return request (cashier action)
   */
  static async approveReturnRequest(
    requestId: string,
    cashierId: string
  ): Promise<void> {
    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from("money_return_requests")
      .select("*")
      .eq("id", requestId)
      .eq("cashier_id", cashierId)
      .eq("status", "pending")
      .single();

    if (fetchError) throw fetchError;
    if (!request) throw new Error("Return request not found or already processed");

    // Verify requester still has sufficient balance
    const { data: requesterProfile, error: requesterError } = await supabase
      .from("profiles")
      .select("balance, name")
      .eq("user_id", request.requester_id)
      .single();

    if (requesterError) throw requesterError;

    const requesterBalance = Number(requesterProfile?.balance ?? 0);
    const amount = Number(request.amount);

    if (amount > requesterBalance) {
      // Reject the request if insufficient balance
      await supabase
        .from("money_return_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_by: cashierId,
          rejection_reason: "Insufficient balance at time of approval",
        })
        .eq("id", requestId);

      throw new Error("Requester has insufficient balance. Request has been rejected.");
    }

    // Get cashier's current balance
    const { data: cashierProfile, error: cashierError } = await supabase
      .from("profiles")
      .select("balance, name")
      .eq("user_id", cashierId)
      .single();

    if (cashierError) throw cashierError;

    // Start transaction: Deduct from requester and add to cashier
    const newRequesterBalance = requesterBalance - amount;
    const newCashierBalance = (Number(cashierProfile?.balance ?? 0)) + amount;

    // Update requester balance
    const { error: requesterUpdateError } = await supabase
      .from("profiles")
      .update({ balance: newRequesterBalance })
      .eq("user_id", request.requester_id);

    if (requesterUpdateError) throw requesterUpdateError;

    // Update cashier balance
    const { error: cashierUpdateError } = await supabase
      .from("profiles")
      .update({ balance: newCashierBalance })
      .eq("user_id", cashierId);

    if (cashierUpdateError) {
      // Rollback requester balance if cashier update fails
      await supabase
        .from("profiles")
        .update({ balance: requesterBalance })
        .eq("user_id", request.requester_id);
      throw cashierUpdateError;
    }

    // Mark request as approved
    const { error: updateError } = await supabase
      .from("money_return_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: cashierId,
      })
      .eq("id", requestId);

    if (updateError) {
      // Rollback both balances if update fails
      await supabase
        .from("profiles")
        .update({ balance: requesterBalance })
        .eq("user_id", request.requester_id);
      await supabase
        .from("profiles")
        .update({ balance: Number(cashierProfile?.balance ?? 0) })
        .eq("user_id", cashierId);
      throw updateError;
    }

    // Mark money assignments as returned (FIFO)
    let remainingAmount = amount;
    const { data: assignments, error: assignmentsError } = await supabase
      .from("money_assignments")
      .select("id, amount")
      .eq("recipient_id", request.requester_id)
      .eq("cashier_id", cashierId)
      .eq("is_returned", false)
      .order("assigned_at", { ascending: true });

    if (!assignmentsError && assignments && assignments.length > 0) {
      for (const assignment of assignments) {
        if (remainingAmount <= 0) break;
        
        const assignmentAmount = Number(assignment.amount);
        if (assignmentAmount <= remainingAmount) {
          await supabase
            .from("money_assignments")
            .update({
              is_returned: true,
              returned_at: new Date().toISOString(),
              return_transaction_id: requestId,
            })
            .eq("id", assignment.id);
          remainingAmount -= assignmentAmount;
        }
      }
    }

    // Notify requester that request was approved
    const cashierName = cashierProfile?.name || "Cashier";
    await createNotification({
      userId: request.requester_id,
      type: "balance_added",
      title: "Money Return Approved",
      message: `Your return request of ${formatINR(amount)} has been approved by ${cashierName}. Amount deducted from your balance.`,
    });
  }

  /**
   * Reject a money return request (cashier action)
   */
  static async rejectReturnRequest(
    requestId: string,
    cashierId: string,
    reason?: string
  ): Promise<void> {
    const { data: request, error: fetchError } = await supabase
      .from("money_return_requests")
      .select("*")
      .eq("id", requestId)
      .eq("cashier_id", cashierId)
      .eq("status", "pending")
      .single();

    if (fetchError) throw fetchError;
    if (!request) throw new Error("Return request not found or already processed");

    // Mark request as rejected
    const { error: updateError } = await supabase
      .from("money_return_requests")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by: cashierId,
        rejection_reason: reason || null,
      })
      .eq("id", requestId);

    if (updateError) throw updateError;

    // Get cashier name for notification
    const { data: cashierProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", cashierId)
      .single();

    // Notify requester that request was rejected
    const cashierName = cashierProfile?.name || "Cashier";
    await createNotification({
      userId: request.requester_id,
      type: "expense_rejected", // Reusing this type
      title: "Money Return Rejected",
      message: `Your return request of ${formatINR(Number(request.amount))} has been rejected by ${cashierName}${reason ? `. Reason: ${reason}` : ''}`,
    });
  }

  /**
   * Get pending return requests for a cashier
   */
  static async getPendingRequests(cashierId: string): Promise<MoneyReturnRequest[]> {
    const { data, error } = await supabase
      .from("money_return_requests")
      .select("*")
      .eq("cashier_id", cashierId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (error) throw error;
    return (data || []) as MoneyReturnRequest[];
  }

  /**
   * Get return requests for a requester
   */
  static async getRequesterRequests(requesterId: string): Promise<MoneyReturnRequest[]> {
    const { data, error } = await supabase
      .from("money_return_requests")
      .select("*")
      .eq("requester_id", requesterId)
      .order("requested_at", { ascending: false });

    if (error) throw error;
    return (data || []) as MoneyReturnRequest[];
  }
}

