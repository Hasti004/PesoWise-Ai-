import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { formatINR } from "@/lib/format";
import { 
  notifyExpenseVerified, 
  notifyExpenseApproved, 
  notifyExpenseSubmitted,
  notifyEngineerExpenseApproved,
  notifyExpenseRejected,
  notifyExpenseVerifiedToAdmin
} from "./NotificationService";

// Helper function to get user's organization_id
async function getUserOrganizationId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  
  if (error || !data) return null;
  return data.organization_id;
}

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
type LineItem = Database["public"]["Tables"]["expense_line_items"]["Row"];
type LineItemInsert = Database["public"]["Tables"]["expense_line_items"]["Insert"];

export interface ExpenseWithLineItems extends Expense {
  expense_line_items: LineItem[];
}

export interface CreateExpenseData {
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  purpose?: string;
  amount: number;
  category: string;
}

export interface UpdateExpenseData {
  title?: string;
  destination?: string;
  trip_start?: string;
  trip_end?: string;
  purpose?: string;
  status?: "submitted" | "verified" | "approved";
  admin_comment?: string;
  assigned_engineer_id?: string;
  amount?: number;
  category?: string;
}

export class ExpenseService {
  /**
   * Update an expense and return the row. If UPDATE ... RETURNING yields no rows (RLS),
   * refetch by id so callers never hit PGRST116 from .single().
   */
  private static async updateExpenseRowReturning(
    expenseId: string,
    patch: ExpenseUpdate,
    organizationIdForFilter: string | null
  ): Promise<Expense> {
    let q = supabase.from("expenses").update(patch).eq("id", expenseId);
    if (organizationIdForFilter) {
      q = q.eq("organization_id", organizationIdForFilter);
    }
    const { data: rows, error } = await q.select("*");
    if (error) throw error;
    if (rows?.length) return rows[0] as Expense;
    const { data: row, error: fetchErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) {
      throw new Error("Expense not found or you do not have permission to update it.");
    }
    return row as Expense;
  }

  /**
   * Create a new expense with line items
   * Automatically computes total amount from line items
   */
  static async createExpense(
    userId: string,
    data: CreateExpenseData
  ): Promise<ExpenseWithLineItems> {
    // Get user's organization_id
    const organizationId = await getUserOrganizationId(userId);
    if (!organizationId) {
      throw new Error("User is not associated with an organization");
    }

    // No line items in creation flow; use provided amount as total
    const totalAmount = Number(data.amount || 0);

    // Start transaction
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        organization_id: organizationId,
        title: data.title,
        destination: data.destination,
        trip_start: data.trip_start,
        trip_end: data.trip_end,
        purpose: data.purpose,
        category: data.category,
        total_amount: totalAmount,
        status: data.status || "submitted",
      })
      .select()
      .single();

    if (expenseError) {
      console.error("Expense creation error:", expenseError);
      throw new Error(`Failed to create expense: ${expenseError.message || 'Unknown error'}`);
    }

    // No line items to insert
    const lineItems: LineItem[] = [];

    // Log the action
    await this.logAction(expense.id, userId, organizationId, "expense_created", "Expense created");

    return {
      ...expense,
      expense_line_items: lineItems,
    };
  }

  /**
   * Update an existing expense
   * Recalculates total amount if line items are updated
   */
  static async updateExpense(
    expenseId: string,
    userId: string,
    data: UpdateExpenseData
  ): Promise<ExpenseWithLineItems> {
    // Get user's organization_id
    const organizationId = await getUserOrganizationId(userId);
    if (!organizationId) {
      throw new Error("User is not associated with an organization");
    }

    // Check if user can edit this expense
    const canEdit = await this.canUserEditExpense(expenseId, userId, organizationId);
    console.log('🔍 [ExpenseService] Can edit check:', {
      expenseId,
      userId,
      organizationId,
      canEdit
    });
    if (!canEdit) {
      // Get expense details for better error message
      const { data: expenseCheck } = await supabase
        .from("expenses")
        .select("user_id, status, organization_id")
        .eq("id", expenseId)
        .single();
      console.error('❌ [ExpenseService] Cannot edit expense:', {
        expenseUserId: expenseCheck?.user_id,
        expenseStatus: expenseCheck?.status,
        expenseOrgId: expenseCheck?.organization_id,
        currentUserId: userId,
        currentOrgId: organizationId
      });
      throw new Error("You don't have permission to edit this expense");
    }

    // Get current expense (filtered by organization)
    const { data: currentExpense, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();

    if (fetchError) throw fetchError;

    // Check if expense can be edited (submitted or rejected expenses can be edited, not verified or approved)
    if (currentExpense.status !== "submitted" && currentExpense.status !== "rejected" && currentExpense.status !== "draft" && !data.status) {
      throw new Error("Only draft, submitted, or rejected expenses can be edited. Verified or approved expenses cannot be modified.");
    }

    const totalAmount = typeof data.amount === 'number' ? data.amount : currentExpense.total_amount;

    // Update expense - exclude 'amount' from spread since expenses table uses 'total_amount'
    const { amount, ...dataWithoutAmount } = data;
    const updateData: ExpenseUpdate = {
      ...dataWithoutAmount,
      total_amount: totalAmount,
      updated_at: new Date().toISOString(),
    };

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      updateData,
      organizationId
    );

    // No line item updates; fetch none
    const lineItems: LineItem[] = [];

    // Log the action
    const action = data.status ? `status_changed_to_${data.status}` : "expense_updated";
    await this.logAction(expenseId, userId, organizationId, action, data.admin_comment);

    return {
      ...updatedExpense,
      expense_line_items: lineItems,
    };
  }

  /**
   * Submit an expense for review
   * If user is admin, automatically approves and deducts from their balance
   */
  static async submitExpense(expenseId: string, userId: string): Promise<Expense> {
    // Load expense by id; RLS restricts what the user can see.
    // Use this row's organization_id — do not use getUserOrganizationId() here, or multi-org
    // users can mismatch LIMIT-1 membership vs the org on the expense they just created.
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (fetchError) throw fetchError;
    if (!expense?.organization_id) {
      throw new Error("Expense has no organization");
    }

    const organizationId = expense.organization_id;

    // Check if attachments are required based on amount (from organization_settings).
    // Use maybeSingle: many orgs have no row yet; .single() throws "Cannot coerce...JSON object".
    const { data: orgSettings, error: orgSettingsError } = await supabase
      .from("organization_settings")
      .select("attachment_required_above_amount")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (orgSettingsError) {
      console.warn("organization_settings (attachment limit):", orgSettingsError);
    }

    const attachmentLimit = Number(orgSettings?.attachment_required_above_amount ?? 50);
    const expenseAmount = Number(expense.total_amount);
    const requiresAttachment = expenseAmount > attachmentLimit;

    if (requiresAttachment) {
      // Heal: file may exist under receipts/{expenseId}/ but row missing (insert/RLS/list quirks)
      await this.syncAttachmentsFromStorageIfEmpty(expenseId, organizationId, userId);

      const { data: attachments, error: attachmentsError } = await supabase
        .from("attachments")
        .select("id")
        .eq("expense_id", expenseId)
        .limit(1);

      if (attachmentsError) {
        console.error("Error checking attachments:", attachmentsError);
        throw new Error(
          `Failed to verify attachments. Please try again or contact support.`
        );
      } else if (!attachments || attachments.length === 0) {
        throw new Error(
          `Bill photos are required for expenses above ₹${attachmentLimit}. ` +
          `This expense (₹${expenseAmount}) exceeds the limit. Please upload at least one photo of your receipt or bill.`
        );
      }
    }

    // Check if user is an admin and this is their own expense - if so, auto-approve and auto-deduct
    const isAdmin = await this.hasOrgRole(userId, organizationId, "admin");
    
    if (isAdmin && expense.user_id === userId) {
      // Admin's own expense - auto-approve and auto-deduct (allows negative balance)
      // First ensure status is "submitted" so approveExpense can handle it
      if (expense.status !== "submitted") {
        await supabase
          .from("expenses")
          .update({ status: "submitted" })
          .eq("id", expenseId);
      }
      // Auto-approve admin expenses (this will deduct from their balance, allowing negative)
      return await this.approveExpense(expenseId, userId, "Auto-approved: Admin expense");
    }

    // Check if user can submit this expense
    const canEdit = await this.canUserEditExpense(expenseId, userId, organizationId);
    if (!canEdit) {
      throw new Error("You don't have permission to submit this expense");
    }

    // Allow resubmitting rejected expenses
    const isResubmission = expense.status === "rejected";
    if (expense.status !== "submitted" && expense.status !== "rejected" && expense.status !== "draft") {
      throw new Error("Only draft, submitted, or rejected expenses can be submitted");
    }

    // Line items are not required anymore for submission

    // Check if user is an engineer
    const isEngineer = await this.hasOrgRole(userId, organizationId, "engineer");

    if (isEngineer) {
      // Engineers' expenses go directly to admin (no engineer assignment)
      const updatePayload: any = {
        status: "submitted",
        assigned_engineer_id: null, // No engineer assignment - goes to admin
        updated_at: new Date().toISOString(),
      };

      const updatedExpense = await this.updateExpenseRowReturning(
        expenseId,
        updatePayload,
        organizationId
      );

      // Log the action
      const actionType = isResubmission ? "expense_resubmitted" : "expense_submitted";
      const logMsg = isResubmission
        ? `Expense resubmitted after rejection by engineer - sent directly to admin`
        : `Expense submitted by engineer - sent directly to admin`;
      await this.logAction(expenseId, userId, organizationId, actionType, logMsg);

      // Get expense title and employee name (filtered by organization)
      const { data: expenseData } = await supabase
        .from("expenses")
        .select("title")
        .eq("id", expenseId)
        .eq("organization_id", organizationId)
        .single();

      const { data: employeeProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", userId)
        .single();

      // Get all admin user IDs in this organization
      const { data: adminMemberships } = await supabase
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "admin")
        .eq("is_active", true);

      const adminUserIds = adminMemberships?.map(m => m.user_id) || [];

      // Notify all admins
      if (expenseData && adminUserIds.length > 0) {
        await notifyExpenseSubmitted(
          expenseId,
          expenseData.title,
          employeeProfile?.name || "Engineer",
          null, // No engineer assigned
          adminUserIds
        );
      }

      return updatedExpense;
    }

    // For employees: Find employee's reporting engineer
    const { data: profileRaw, error: profileError } = await supabase
      .from("profiles")
      .select("reporting_engineer_id")
      .eq("user_id", userId)
      .single();

    const profile = profileRaw as unknown as { reporting_engineer_id: string | null } | null;

    if (profileError) throw profileError;

    // If employee has a reporting engineer, assign to them
    // If not, send directly to admin (assigned_engineer_id = null)
    const updatePayload: any = {
      status: "submitted",
      assigned_engineer_id: profile?.reporting_engineer_id || null, // null if no engineer assigned
      updated_at: new Date().toISOString(),
    };

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      updatePayload,
      organizationId
    );

    // Get expense title and employee name
    const { data: expenseData } = await supabase
      .from("expenses")
      .select("title")
      .eq("id", expenseId)
      .single();

    const { data: employeeProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", userId)
      .single();

    // Log resubmission if this was a rejected expense
    const actionType = isResubmission ? "expense_resubmitted" : "expense_submitted";
    
    if (profile?.reporting_engineer_id) {
      // Employee has reporting engineer - assign to engineer and notify them
      const logMsg = isResubmission 
        ? `Expense resubmitted after rejection and auto-assigned to engineer ${profile.reporting_engineer_id}`
        : `Expense submitted and auto-assigned to engineer ${profile.reporting_engineer_id}`;
      await this.logAction(expenseId, userId, organizationId, actionType, logMsg);

      // Notify assigned engineer
      if (expenseData) {
        await notifyExpenseSubmitted(
          expenseId,
          expenseData.title,
          employeeProfile?.name || "Employee",
          profile.reporting_engineer_id
        );
      }
    } else {
      // Employee has no reporting engineer - send directly to admin
      const logMsg = isResubmission
        ? `Expense resubmitted after rejection by employee without assigned engineer - sent directly to admin`
        : `Expense submitted by employee without assigned engineer - sent directly to admin`;
      await this.logAction(expenseId, userId, organizationId, actionType, logMsg);

      // Get all admin user IDs in this organization
      const { data: adminMemberships } = await supabase
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "admin")
        .eq("is_active", true);

      const adminUserIds = adminMemberships?.map(m => m.user_id) || [];

      // Notify all admins
      if (expenseData && adminUserIds.length > 0) {
        await notifyExpenseSubmitted(
          expenseId,
          expenseData.title,
          employeeProfile?.name || "Employee",
          null, // No engineer assigned
          adminUserIds
        );
      }
    }

    return updatedExpense;
  }

  /**
   * Assign expense to an engineer
   */
  static async assignToEngineer(
    expenseId: string,
    engineerId: string,
    adminId: string
  ): Promise<Expense> {
    const { data: expenseRow, error: expErr } = await supabase
      .from("expenses")
      .select("id, organization_id")
      .eq("id", expenseId)
      .single();
    if (expErr) throw expErr;
    const organizationId = expenseRow.organization_id;
    if (!organizationId) {
      throw new Error("Expense has no organization");
    }

    // Check if admin has permission
    const isAdmin = await this.hasOrgRole(adminId, organizationId, "admin");
    if (!isAdmin) {
      throw new Error("Only administrators can assign expenses to engineers");
    }

    // Check if engineer exists and has engineer role in same organization
    const isEngineer = await this.hasOrgRole(engineerId, organizationId, "engineer");
    if (!isEngineer) {
      throw new Error("Assigned user must have engineer role in your organization");
    }

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      {
        assigned_engineer_id: engineerId,
        status: "submitted",
        updated_at: new Date().toISOString(),
      },
      organizationId
    );

    // Log the action
    await this.logAction(expenseId, adminId, organizationId, "expense_assigned", `Assigned to engineer ${engineerId}`);

    return updatedExpense;
  }

  /**
   * Verify expense (engineer action)
   */
  static async verifyExpense(
    expenseId: string,
    engineerId: string,
    comment?: string
  ): Promise<Expense> {
    const { data: expenseOrgRow, error: orgErr } = await supabase
      .from("expenses")
      .select("organization_id")
      .eq("id", expenseId)
      .single();
    if (orgErr) throw orgErr;
    const organizationId = expenseOrgRow.organization_id;
    if (!organizationId) {
      throw new Error("Expense has no organization");
    }

    // Check if engineer has permission
    const canReview = await this.canEngineerReviewExpense(expenseId, engineerId, organizationId);
    if (!canReview) {
      throw new Error("You don't have permission to review this expense");
    }

    // Ensure expense is not finalized (filtered by organization)
    const { data: current, error: curErr } = await supabase
      .from("expenses")
      .select("status")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();
    if (curErr) throw curErr;
    if (current.status === "approved") {
      throw new Error("This expense is already approved and cannot be updated");
    }
    if (current.status !== "submitted") {
      throw new Error("Only submitted expenses can be verified");
    }

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      {
        status: "verified",
        updated_at: new Date().toISOString(),
      },
      organizationId
    );

    // Log the action
    await this.logAction(expenseId, engineerId, organizationId, "expense_verified", comment);

    // Get expense details and employee info for notification (filtered by organization)
    const { data: expenseData, error: expenseFetchError } = await supabase
      .from("expenses")
      .select("title, user_id, total_amount")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();

    if (!expenseFetchError && expenseData) {
      // Get engineer name
      const { data: engineerProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", engineerId)
        .single();

      // Get employee name
      const { data: employeeProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", expenseData.user_id)
        .single();

      // Create notification for employee
      await notifyExpenseVerified(
        expenseId,
        expenseData.title,
        expenseData.user_id,
        engineerProfile?.name || "Engineer"
      );

      // Check if expense is above threshold - if so, notify admins (from organization_settings)
      const { data: orgSettings } = await supabase
        .from("organization_settings")
        .select("engineer_approval_limit")
        .eq("organization_id", organizationId)
        .maybeSingle();
      
      const approvalLimit = orgSettings?.engineer_approval_limit || 50000;
      const expenseAmount = Number(expenseData.total_amount);
      
      // If expense is at or above threshold, notify all admins in organization
      if (expenseAmount >= approvalLimit) {
        const { data: adminMemberships } = await supabase
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", organizationId)
          .eq("role", "admin")
          .eq("is_active", true);
        
        const adminUserIds = adminMemberships?.map(m => m.user_id) || [];
        
        if (adminUserIds.length > 0) {
          await notifyExpenseVerifiedToAdmin(
            expenseId,
            expenseData.title,
            employeeProfile?.name || "Employee",
            engineerProfile?.name || "Engineer",
            expenseAmount,
            adminUserIds
          );
        }
      }
    }

    return updatedExpense;
  }

  /**
   * Approve expense (admin or engineer action)
   */
  static async approveExpense(
    expenseId: string,
    approverId: string,
    comment?: string
  ): Promise<Expense> {
    // Load expense by id (RLS). Use its organization_id — not getUserOrganizationId(), which can
    // pick a different org when the user has multiple memberships (same bug as submit).
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("id, user_id, total_amount, title, status, organization_id")
      .eq("id", expenseId)
      .single();

    if (fetchError) throw fetchError;
    if (!expense?.organization_id) {
      throw new Error("Expense has no organization");
    }

    const organizationId = expense.organization_id;

    const isAdmin = await this.hasOrgRole(approverId, organizationId, "admin");
    const isEngineer = await this.hasOrgRole(approverId, organizationId, "engineer");
    if (!isAdmin && !isEngineer) {
      throw new Error("Only administrators or engineers can approve expenses");
    }

    // Check if expense is already approved
    if (expense.status === "approved") {
      throw new Error("This expense is already approved");
    }
    
    // Engineers can approve submitted expenses (below limit)
    // Admins can approve both submitted and verified expenses (auto-verifies submitted expenses)
    if (isEngineer && expense.status !== "submitted" && expense.status !== "under_review") {
      throw new Error("Engineers can only approve submitted or under-review expenses");
    }
    
    // Check engineer approval limit if engineer is trying to approve
    if (isEngineer) {
      const { data: orgSettings, error: limitError } = await supabase
        .from("organization_settings")
        .select("engineer_approval_limit")
        .eq("organization_id", organizationId)
        .maybeSingle();
      
      if (limitError) {
        console.error("Error fetching engineer approval limit:", limitError);
        throw new Error("Unable to verify approval limit. Please contact administrator.");
      }
      
      const approvalLimit = orgSettings?.engineer_approval_limit || 50000; // Default to 50000 if not set
      const expenseAmount = Number(expense.total_amount);
      
      console.log("Manager approval check:", { 
        expenseAmount, 
        approvalLimit, 
        exceeds: expenseAmount > approvalLimit,
        expenseId: expense.id
      });
      
      // Engineers can only approve if expense amount <= limit
      // If expense amount > limit, they must verify instead
      if (expenseAmount > approvalLimit) {
        throw new Error(
          `This expense (${formatINR(expenseAmount)}) exceeds the manager approval limit of ${formatINR(approvalLimit)}. ` +
          `Please verify this expense instead. It will be sent to admin for final approval.`
        );
      }
    }
    
    if (isAdmin && expense.status !== "submitted" && expense.status !== "verified" && expense.status !== "under_review") {
      throw new Error("Admins can only approve submitted, under-review, or verified expenses");
    }
    
    // If admin is approving a submitted expense, auto-verify it first
    if (isAdmin && (expense.status === "submitted" || expense.status === "under_review")) {
      // Auto-verify: Update status to verified first (filtered by organization)
      const { error: verifyError } = await supabase
        .from("expenses")
        .update({
          status: "verified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", expenseId)
        .eq("organization_id", organizationId);
      
      if (verifyError) throw verifyError;
      
      // Log the auto-verification
      await this.logAction(expenseId, approverId, organizationId, "expense_verified", "Auto-verified by admin during approval");
      
      // Get admin name for notification
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", approverId)
        .single();
      
      // Send verification notification to employee
      await notifyExpenseVerified(
        expenseId,
        expense.title,
        expense.user_id,
        adminProfile?.name || "Admin"
      );
      
      // Update expense status for the rest of the function
      expense.status = "verified";
    }

    // Get current balance before approval
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('balance, name')
      .eq('user_id', expense.user_id)
      .single();

    if (profError) throw profError;

    const currentBalance = Number(profile?.balance ?? 0);
    const expenseAmount = Number(expense.total_amount);
    
    // Allow negative balances - expense can be approved even if balance is insufficient
    // The balance will go negative and can be compensated later when balance is added

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      {
        status: "approved",
        admin_comment: comment,
        updated_at: new Date().toISOString(),
      },
      organizationId
    );

    // Deduct employee balance (allows negative balance)
    const newBalance = currentBalance - expenseAmount;
    const { error: balanceUpdateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('user_id', expense.user_id);

    if (balanceUpdateError) {
      // If balance update fails, revert expense status
      await supabase
        .from("expenses")
        .update({
          status: "verified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", expenseId);
      
      throw new Error("Failed to deduct balance. Expense approval reverted.");
    }

    // Log the action with balance information (handles negative balances)
    const balanceStatus = newBalance < 0 ? `Negative balance: ${formatINR(Math.abs(newBalance))}` : `Remaining balance: ${formatINR(newBalance)}`;
    const logComment = `${comment || ''} Balance deducted: ${formatINR(expenseAmount)}. ${balanceStatus}`.trim();
    await this.logAction(expenseId, approverId, organizationId, "expense_approved", logComment);

    // Get approver name for notification
    const { data: approverProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", approverId)
      .single();

    // Check if the expense owner is an engineer in this organization
    const expenseOwnerIsEngineer = await this.hasOrgRole(expense.user_id, organizationId, "engineer");

    if (expenseOwnerIsEngineer) {
      // Notify engineer that their expense was approved
      await notifyEngineerExpenseApproved(
        expenseId,
        expense.title,
        expense.user_id,
        approverProfile?.name || (isAdmin ? "Admin" : "Engineer"),
        expenseAmount
      );
    } else {
      // Notify employee that their expense was approved
      await notifyExpenseApproved(
        expenseId,
        expense.title,
        expense.user_id,
        approverProfile?.name || (isAdmin ? "Admin" : "Engineer"),
        expenseAmount
      );
    }

    return updatedExpense;
  }

  /**
   * Reject expense (admin or engineer action)
   */
  static async rejectExpense(
    expenseId: string,
    rejectorId: string,
    comment?: string
  ): Promise<Expense> {
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("id, user_id, title, status, organization_id")
      .eq("id", expenseId)
      .single();

    if (fetchError) throw fetchError;
    const organizationId = expense.organization_id;
    if (!organizationId) {
      throw new Error("Expense has no organization");
    }

    // Check if rejector has permission (admin or engineer) in this organization
    const isAdmin = await this.hasOrgRole(rejectorId, organizationId, "admin");
    const isEngineer = await this.hasOrgRole(rejectorId, organizationId, "engineer");
    if (!isAdmin && !isEngineer) {
      throw new Error("Only administrators or engineers can reject expenses");
    }

    // Check if expense can be rejected (not already approved or rejected)
    if (expense.status === "approved") {
      throw new Error("Approved expenses cannot be rejected");
    }
    if (expense.status === "rejected") {
      throw new Error("This expense is already rejected");
    }

    // For engineers, check if they can review this expense
    if (isEngineer) {
      const canReview = await this.canEngineerReviewExpense(expenseId, rejectorId, organizationId);
      if (!canReview) {
        throw new Error("You don't have permission to reject this expense");
      }
    }

    const updatedExpense = await this.updateExpenseRowReturning(
      expenseId,
      {
        status: "rejected",
        admin_comment: comment,
        updated_at: new Date().toISOString(),
      },
      organizationId
    );

    // Log the action
    await this.logAction(expenseId, rejectorId, organizationId, "expense_rejected", comment);

    // Get rejector name for notification
    const { data: rejectorProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", rejectorId)
      .single();

    // Send notification to expense owner
    await notifyExpenseRejected(
      expenseId,
      expense.title,
      expense.user_id,
      rejectorProfile?.name || (isAdmin ? "Admin" : "Engineer"),
      comment
    );

    return updatedExpense;
  }

  /**
   * Get expense with line items
   */
  static async getExpense(expenseId: string, userId: string): Promise<ExpenseWithLineItems | null> {
    // Get user's organization_id
    const organizationId = await getUserOrganizationId(userId);
    if (!organizationId) return null;

    // Get expense (filtered by organization)
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();

    if (expenseError) return null;

    // Get line items (filtered by organization)
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("expense_line_items")
      .select("*")
      .eq("expense_id", expenseId)
      .eq("organization_id", organizationId);

    if (lineItemsError) return null;

    return {
      ...expense,
      expense_line_items: lineItems || [],
    };
  }

  /**
   * Check if user can edit expense
   */
  private static async canUserEditExpense(expenseId: string, userId: string, organizationId?: string): Promise<boolean> {
    // Get organization_id if not provided
    if (!organizationId) {
      organizationId = await getUserOrganizationId(userId);
      if (!organizationId) return false;
    }

    // Check if user is admin in this organization
    const isAdmin = await this.hasOrgRole(userId, organizationId, "admin");
    if (isAdmin) return true;

    // Check if user is engineer (manager) - they can submit their own expenses
    const isEngineer = await this.hasOrgRole(userId, organizationId, "engineer");
    
    // Check if user owns the expense (filtered by organization)
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("user_id, status, organization_id")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();

    if (error) {
      console.error('❌ [ExpenseService] Error fetching expense for edit check:', error);
      return false;
    }

    if (!expense) {
      console.error('❌ [ExpenseService] Expense not found:', expenseId);
      return false;
    }

    console.log('🔍 [ExpenseService] Expense ownership check:', {
      expenseUserId: expense.user_id,
      currentUserId: userId,
      expenseStatus: expense.status,
      expenseOrgId: expense.organization_id,
      currentOrgId: organizationId,
      isOwner: expense.user_id === userId,
      allowedStatuses: ['submitted', 'draft', 'rejected'],
      statusMatches: ['submitted', 'draft', 'rejected'].includes(expense.status)
    });

    // Users can edit/submit their own expenses if:
    // 1. They own it AND status is "submitted" or "rejected" (for editing/resubmitting)
    // 2. They own it AND status is "draft" (for editing)
    // 3. They are engineer/admin (already checked above)
    const canEdit = expense.user_id === userId && (expense.status === "submitted" || expense.status === "draft" || expense.status === "rejected");
    console.log('✅ [ExpenseService] Final canEdit result:', canEdit);
    return canEdit;
  }

  /**
   * Check if manager can review expense
   */
  private static async canEngineerReviewExpense(expenseId: string, engineerId: string, organizationId: string): Promise<boolean> {
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("assigned_engineer_id")
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .single();

    if (error) return false;

    return expense.assigned_engineer_id === engineerId;
  }

  /**
   * Check if user has specific role in organization
   */
  private static async hasOrgRole(userId: string, organizationId: string, role: "admin" | "engineer" | "employee" | "cashier"): Promise<boolean> {
    // Return false if userId is empty or invalid
    if (!userId || userId.trim() === "") {
      return false;
    }

    const { data, error } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .eq("role", role)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return false;

    return !!data;
  }

  /**
   * When storage already has objects under receipts/{expenseId}/ but attachments table is empty,
   * insert one row so submission and RLS checks succeed (covers copy-without-insert edge cases).
   */
  private static async syncAttachmentsFromStorageIfEmpty(
    expenseId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const { data: existing, error: existingError } = await supabase
      .from("attachments")
      .select("id")
      .eq("expense_id", expenseId)
      .limit(1);

    if (existingError || (existing && existing.length > 0)) return;

    const { data: files, error: listError } = await supabase.storage
      .from("receipts")
      .list(expenseId, { limit: 100 });

    if (listError || !files?.length) return;

    for (const f of files) {
      if (!f.name) continue;
      const path = `${expenseId}/${f.name}`;
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
      const ext = f.name.split(".").pop()?.toLowerCase();
      const contentType =
        ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
      const { error: insertError } = await supabase.from("attachments").insert({
        expense_id: expenseId,
        organization_id: organizationId,
        file_url: urlData.publicUrl,
        filename: f.name,
        content_type: contentType,
        uploaded_by: userId,
      });
      if (!insertError) return;
    }
  }

  /**
   * Log action in audit trail
   */
  private static async logAction(
    expenseId: string,
    userId: string,
    organizationId: string,
    action: string,
    comment?: string
  ): Promise<void> {
    await supabase
      .from("audit_logs")
      .insert({
        expense_id: expenseId,
        user_id: userId,
        organization_id: organizationId,
        action,
        comment,
      });
  }
}
