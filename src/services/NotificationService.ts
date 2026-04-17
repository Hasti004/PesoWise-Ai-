import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";

export type NotificationType = 
  | "expense_verified" 
  | "expense_approved" 
  | "expense_submitted" 
  | "expense_rejected"
  | "balance_added";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  expenseId?: string;
  /** When set, used for RLS: inserter must be a member of this org (expense org is always correct for expense flows). */
  organizationId?: string;
}

/**
 * Get organization_id for a user (single membership — ambiguous if multi-org)
 */
async function getUserOrganizationId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user organization:", error);
      return null;
    }

    return data?.organization_id || null;
  } catch (error) {
    console.error("Error fetching user organization:", error);
    return null;
  }
}

/** Org where both users have active membership (required for notification INSERT RLS: auth.uid() must belong to organization_id). */
async function getSharedOrganizationId(
  userIdA: string,
  userIdB: string
): Promise<string | null> {
  const { data: aRows, error: aErr } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userIdA)
    .eq("is_active", true);
  if (aErr || !aRows?.length) return null;
  const { data: bRows, error: bErr } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userIdB)
    .eq("is_active", true);
  if (bErr || !bRows?.length) return null;
  const aSet = new Set(aRows.map((r) => r.organization_id));
  for (const r of bRows) {
    if (aSet.has(r.organization_id)) return r.organization_id;
  }
  return null;
}

async function resolveNotificationOrganizationId(
  params: CreateNotificationParams
): Promise<string | null> {
  if (params.organizationId) return params.organizationId;

  if (params.expenseId) {
    const { data: exp, error } = await supabase
      .from("expenses")
      .select("organization_id")
      .eq("id", params.expenseId)
      .maybeSingle();
    if (error) {
      console.warn("resolveNotificationOrganizationId (expense):", error);
    }
    if (exp?.organization_id) return exp.organization_id;
  }

  const { data: sessionData } = await supabase.auth.getUser();
  const actorId = sessionData.user?.id;
  if (actorId) {
    const shared = await getSharedOrganizationId(actorId, params.userId);
    if (shared) return shared;
    const actorOrg = await getUserOrganizationId(actorId);
    if (actorOrg) return actorOrg;
  }

  return getUserOrganizationId(params.userId);
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const organizationId = await resolveNotificationOrganizationId(params);

    if (!organizationId) {
      console.error("Cannot create notification: could not resolve organization_id");
      return;
    }

    // @ts-ignore - notifications table exists but not in types
    const { error } = await (supabase as any)
      .from("notifications")
      .insert({
        user_id: params.userId,
        organization_id: organizationId,
        type: params.type,
        title: params.title,
        message: params.message,
        expense_id: params.expenseId || null,
      });

    if (error) {
      console.error("Error creating notification:", error);
      // Don't throw - notifications are non-critical
    }
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Create notification when expense is verified
 */
export async function notifyExpenseVerified(
  expenseId: string,
  expenseTitle: string,
  employeeUserId: string,
  engineerName: string
): Promise<void> {
  await createNotification({
    userId: employeeUserId,
    type: "expense_verified",
    title: "Expense Verified",
    message: `Your expense "${expenseTitle}" has been verified by ${engineerName}`,
    expenseId,
  });
}

/**
 * Create notification when expense is approved
 */
export async function notifyExpenseApproved(
  expenseId: string,
  expenseTitle: string,
  employeeUserId: string,
  approverName: string,
  amount: number
): Promise<void> {
  await createNotification({
    userId: employeeUserId,
    type: "expense_approved",
    title: "Expense Approved",
    message: `Your expense "${expenseTitle}" (${formatINR(amount)}) has been approved by ${approverName}`,
    expenseId,
  });
}

/**
 * Create notification when new expense is submitted (for engineers/admins)
 */
export async function notifyExpenseSubmitted(
  expenseId: string,
  expenseTitle: string,
  employeeName: string,
  engineerUserId?: string | null,
  adminUserIds?: string[]
): Promise<void> {
  // Notify assigned engineer
  if (engineerUserId) {
    await createNotification({
      userId: engineerUserId,
      type: "expense_submitted",
      title: "New Expense Claim",
      message: `${employeeName} has submitted a new expense: "${expenseTitle}"`,
      expenseId,
    });
  }

  // Notify all admins if no engineer assigned (engineer expenses go to admin)
  if (adminUserIds && adminUserIds.length > 0) {
    const notifications = adminUserIds.map(adminId =>
      createNotification({
        userId: adminId,
        type: "expense_submitted",
        title: "New Expense Claim",
        message: `${employeeName} has submitted a new expense: "${expenseTitle}"`,
        expenseId,
      })
    );
    await Promise.all(notifications);
  }
}

/**
 * Create notification when cashier adds money to account
 */
export async function notifyBalanceAdded(
  userId: string,
  amount: number,
  cashierName: string,
  organizationId?: string | null
): Promise<void> {
  await createNotification({
    userId,
    type: "balance_added",
    title: "Balance Updated",
    message: `Your balance has been updated. ${formatINR(amount)} has been added to your account by ${cashierName}`,
    organizationId: organizationId ?? undefined,
  });
}

/**
 * Create notification when engineer's expense is approved by admin
 */
export async function notifyEngineerExpenseApproved(
  expenseId: string,
  expenseTitle: string,
  engineerUserId: string,
  adminName: string,
  amount: number
): Promise<void> {
  await createNotification({
    userId: engineerUserId,
    type: "expense_approved",
    title: "Expense Approved",
    message: `Your expense "${expenseTitle}" (${formatINR(amount)}) has been approved by ${adminName}`,
    expenseId,
  });
}

/**
 * Create notification when expense is rejected
 */
export async function notifyExpenseRejected(
  expenseId: string,
  expenseTitle: string,
  employeeUserId: string,
  rejectorName: string,
  comment?: string
): Promise<void> {
  await createNotification({
    userId: employeeUserId,
    type: "expense_rejected",
    title: "Expense Rejected",
    message: `Your expense "${expenseTitle}" has been rejected by ${rejectorName}${comment ? `. Reason: ${comment}` : ''}`,
    expenseId,
  });
}

/**
 * Create notification when expense is verified above threshold (notify admins)
 */
export async function notifyExpenseVerifiedToAdmin(
  expenseId: string,
  expenseTitle: string,
  employeeName: string,
  engineerName: string,
  amount: number,
  adminUserIds: string[]
): Promise<void> {
  if (adminUserIds.length === 0) return;
  
  const notifications = adminUserIds.map(adminId =>
    createNotification({
      userId: adminId,
      type: "expense_submitted",
      title: "Expense Verified - Awaiting Approval",
      message: `${engineerName} has verified "${expenseTitle}" (${formatINR(amount)}) from ${employeeName}. Please review and approve.`,
      expenseId,
    })
  );
  
  await Promise.all(notifications);
}

