import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Users,
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  Coins,
  Eye,
  UserPlus,
  Settings,
  TrendingUp,
  Filter,
  Search,
  Download,
  Database,
  RotateCcw
} from "lucide-react";
import { fetchOrgBackup, downloadBackup, downloadBackupWithReceipts, fetchReceiptBlobs } from "@/lib/backupData";
import { useToast } from "@/hooks/use-toast";
import { ExpenseService } from "@/services/ExpenseService";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MobileExpenseTable } from "@/components/MobileExpenseTable";
import { formatINR, parseLocalDate } from "@/lib/format";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  is_active: boolean;
  balance?: number | null;
  reporting_engineer_id?: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
}

interface Expense {
  id: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_balance: number;
  assigned_engineer_id?: string;
  admin_comment?: string;
  isResubmitted?: boolean;
  category?: string | null;
  purpose?: string | null;
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, userRole, organizationId } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [engineers, setEngineers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Array<{ action: string; user_name: string; comment?: string; created_at: string }>>([]);
  const [formFieldValues, setFormFieldValues] = useState<Array<{
    template_id: string;
    template_name: string;
    field_type: string;
    field_value: string;
  }>>([]);
  const reviewDialogContentRef = useRef<HTMLDivElement>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [includeReceipts, setIncludeReceipts] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const REVIEWABLE_STATUSES = new Set(["submitted", "verified", "under_review"]);

  const applyExpenseStatusLocally = (expenseIds: string[], nextStatus: "approved" | "rejected") => {
    if (expenseIds.length === 0) return;
    setExpenses((prev) =>
      prev.map((e) =>
        expenseIds.includes(e.id)
          ? { ...e, status: nextStatus, updated_at: new Date().toISOString() }
          : e
      )
    );
    if (statusFilter !== "all" && statusFilter !== nextStatus) {
      setStatusFilter("all");
      toast({
        title: `Moved to ${nextStatus}`,
        description: "Status filter reset to All so updated expenses remain visible.",
      });
    }
  };

  useEffect(() => {
    console.log("🔄 [AdminPanel] useEffect triggered");
    console.log("🔄 [AdminPanel] userRole:", userRole);
    console.log("🔄 [AdminPanel] organizationId:", organizationId);
    console.log("🔄 [AdminPanel] user:", user?.id);

    if (userRole === "admin" && organizationId) {
      console.log("✅ [AdminPanel] Conditions met, calling fetchData");
      fetchData();
    } else {
      console.warn("⚠️ [AdminPanel] Conditions not met - userRole:", userRole, "organizationId:", organizationId);
    }
  }, [userRole, organizationId, user?.id]);

  // Fix blank white page: scroll review dialog content to top when opened
  useEffect(() => {
    if (dialogOpen && selectedExpense) {
      const scrollEl = reviewDialogContentRef.current;
      if (scrollEl) {
        const scrollToTop = () => { scrollEl.scrollTop = 0; };
        scrollToTop();
        requestAnimationFrame(scrollToTop);
        const t = setTimeout(scrollToTop, 50);
        return () => clearTimeout(t);
      }
    }
  }, [dialogOpen, selectedExpense?.id]);

  // Log expenses state changes
  useEffect(() => {
    console.log("📊 [AdminPanel] Expenses state changed:");
    console.log("  - expenses.length:", expenses.length);
    console.log("  - expenses:", expenses);
    console.log("  - filteredExpenses.length:", expenses.filter(e => {
      const matchesSearch = searchTerm === "" ||
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((e as any).transaction_number || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).length);
  }, [expenses, searchTerm, statusFilter]);

  const fetchData = async () => {
    console.log("🚀 [AdminPanel] fetchData called");
    console.log("🚀 [AdminPanel] Current organizationId:", organizationId);
    console.log("🚀 [AdminPanel] Current user:", user?.id);
    try {
      setLoading(true);
      await Promise.all([
        fetchUsers(),
        fetchExpenses(),
        fetchEngineers()
      ]);
      console.log("✅ [AdminPanel] All data fetched successfully");
    } catch (error) {
      console.error("❌ [AdminPanel] Error fetching data:", error);
    } finally {
      setLoading(false);
      console.log("🏁 [AdminPanel] fetchData completed, loading set to false");
    }
  };

  const normalizeReceiptUrl = (url: string): string => {
    console.log("🔍 [AdminPanel] normalizeReceiptUrl called with:", url);
    try {
      // If it's already a receipts public URL, keep as is
      if (url.startsWith("http")) {
        console.log("  - URL starts with http");
        // Try to extract a key from known bucket paths and rebuild with receipts
        if (url.includes("/storage/v1/object/public/receipts/")) {
          console.log("  - Already a receipts URL, returning as-is");
          return url;
        }
        const expenseAttachmentsIdx = url.indexOf("/storage/v1/object/public/expense-attachments/");
        if (expenseAttachmentsIdx !== -1) {
          const key = url.substring(expenseAttachmentsIdx + "/storage/v1/object/public/expense-attachments/".length);
          console.log("  - Found expense-attachments URL, extracting key:", key);
          const { data } = supabase.storage.from("receipts").getPublicUrl(key);
          console.log("  - Generated receipts URL:", data.publicUrl);
          return data.publicUrl;
        }
        // Check for signed URL pattern
        if (url.includes("/storage/v1/object/sign/")) {
          console.log("  - Found signed URL, extracting path...");
          // Extract the path from signed URL
          try {
            const urlObj = new URL(url);
            const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/sign\/receipts\/(.+)/);
            if (pathMatch) {
              const key = decodeURIComponent(pathMatch[1].split('?')[0]);
              console.log("  - Extracted key from signed URL:", key);
              const { data } = supabase.storage.from("receipts").getPublicUrl(key);
              console.log("  - Generated public URL:", data.publicUrl);
              return data.publicUrl;
            }
          } catch (e) {
            console.error("  - Error parsing signed URL:", e);
          }
        }
        console.log("  - Fallback: returning original URL");
        return url;
      }
      // Path-only stored (e.g., "{expenseId}/filename" or "temp/{userId}/filename")
      console.log("  - Path-only URL, generating public URL");
      const { data } = supabase.storage.from("receipts").getPublicUrl(url);
      console.log("  - Generated public URL:", data.publicUrl);
      return data.publicUrl;
    } catch (error) {
      console.error("❌ [AdminPanel] Error normalizing URL:", error);
      return url;
    }
  };

  const fetchAttachments = async (expenseId: string) => {
    try {
      if (!organizationId) return;

      const { data, error } = await supabase
        .from("attachments")
        .select("id, filename, content_type, file_url, created_at")
        .eq("expense_id", expenseId)
        .eq("organization_id", organizationId)
        .order("created_at");

      if (error) throw error;

      const normalized = (data || []).map(a => {
        const normalizedUrl = normalizeReceiptUrl(a.file_url || "");
        console.log("🔍 [AdminPanel] Normalizing attachment URL:");
        console.log("  - Original:", a.file_url);
        console.log("  - Normalized:", normalizedUrl);
        return {
          ...a,
          file_url: normalizedUrl,
        };
      });

      console.log("✅ [AdminPanel] Normalized attachments:", normalized);
      setAttachments(normalized);
    } catch (e) {
      console.error("Error fetching attachments:", e);
      setAttachments([]);
    }
  };

  const fetchAuditLogs = async (expenseId: string) => {
    try {
      if (!organizationId) return;

      const { data: logsData, error: logsError } = await supabase
        .from("audit_logs")
        .select("user_id, action, comment, created_at")
        .eq("expense_id", expenseId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;

      // Fetch user profiles for audit logs
      const auditLogsWithNames = await Promise.all(
        (logsData || []).map(async (log) => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", log.user_id)
            .single();

          return {
            ...log,
            user_name: profileData?.name || "Unknown User"
          };
        })
      );

      setAuditLogs(auditLogsWithNames);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    if (selectedExpense) {
      fetchAttachments(selectedExpense.id);
      fetchAuditLogs(selectedExpense.id);
      fetchFormFieldValues(selectedExpense.id);
    } else {
      setAttachments([]);
      setAuditLogs([]);
      setFormFieldValues([]);
    }
  }, [selectedExpense]);

  const fetchFormFieldValues = async (expenseId: string) => {
    try {
      if (!organizationId) return;

      const { data: fieldValuesData, error: fieldValuesError } = await supabase
        .from("expense_form_field_values")
        .select(`
          template_id,
          field_value,
          expense_form_field_templates(name, field_type)
        `)
        .eq("expense_id", expenseId)
        .eq("organization_id", organizationId);

      if (!fieldValuesError && fieldValuesData) {
        const transformed = fieldValuesData.map((fv: any) => ({
          template_id: fv.template_id,
          template_name: fv.expense_form_field_templates?.name || "Unknown",
          field_type: fv.expense_form_field_templates?.field_type || "text",
          field_value: fv.field_value,
        }));
        setFormFieldValues(transformed);
      }
    } catch (e: any) {
      console.error("Failed to fetch form field values:", e);
    }
  };

  const fetchUsers = async () => {
    if (!organizationId) return;

    // First get profiles (filtered by organization_id)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, created_at, is_active, balance, reporting_engineer_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (profilesError) throw profilesError;

    // Then get roles for each user
    const userIds = profiles.map(p => p.user_id);
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    if (rolesError) throw rolesError;

    // Combine the data
    const usersWithRoles = profiles.map(profile => {
      const userRole = roles.find(r => r.user_id === profile.user_id);
      return {
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: userRole?.role || "employee",
        created_at: profile.created_at,
        is_active: profile.is_active,
        balance: profile.balance ?? 0,
        reporting_engineer_id: profile.reporting_engineer_id ?? null
      };
    });

    setUsers(usersWithRoles);
  };

  const fetchExpenses = async () => {
    console.log("🔍 [AdminPanel] fetchExpenses called");
    console.log("🔍 [AdminPanel] organizationId:", organizationId);
    console.log("🔍 [AdminPanel] user:", user?.id);

    if (!organizationId) {
      console.error("❌ [AdminPanel] No organizationId, returning early");
      return;
    }

    // Admin should see ALL expenses in their organization
    // First, let's check if there are ANY expenses at all (without org filter for debugging)
    console.log("🔍 [AdminPanel] Checking total expenses in database (no filter)...");
    const { data: allExpensesNoFilter, error: noFilterError } = await supabase
      .from("expenses")
      .select("id, title, organization_id, user_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    console.log("🔍 [AdminPanel] All expenses (no filter):", allExpensesNoFilter);
    console.log("🔍 [AdminPanel] All expenses count:", allExpensesNoFilter?.length || 0);
    if (allExpensesNoFilter && allExpensesNoFilter.length > 0) {
      console.log("🔍 [AdminPanel] Sample expense organization_ids:", allExpensesNoFilter.map(e => ({ id: e.id, org_id: e.organization_id })));
    }

    // Now fetch expenses filtered by organization_id
    console.log("🔍 [AdminPanel] Fetching expenses for organization:", organizationId);
    const { data: allExpenses, error: expensesError } = await supabase
      .from("expenses")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    console.log("🔍 [AdminPanel] Expenses query result (with org filter):");
    console.log("  - Data:", allExpenses);
    console.log("  - Error:", expensesError);
    console.log("  - Count:", allExpenses?.length || 0);

    // Also try without RLS to see if that's the issue
    console.log("🔍 [AdminPanel] Checking RLS - trying to fetch with service role...");
    if (expensesError) {
      console.error("❌ [AdminPanel] RLS Error details:", {
        message: expensesError.message,
        details: expensesError.details,
        hint: expensesError.hint,
        code: expensesError.code
      });
    }

    if (expensesError) {
      console.error("❌ [AdminPanel] Error fetching expenses:", expensesError);
      throw expensesError;
    }

    const expensesData = allExpenses || [];
    console.log("✅ [AdminPanel] Expenses data to process:", expensesData.length);
    console.log("✅ [AdminPanel] Raw expenses:", expensesData);

    if (!expensesData || expensesData.length === 0) {
      console.warn("⚠️ [AdminPanel] No expenses found, setting empty array");
      setExpenses([]);
      return;
    }

    // Get user profiles for the expenses
    const userIds = [...new Set(expensesData.map(e => e.user_id))];
    console.log("🔍 [AdminPanel] Fetching profiles for user IDs:", userIds);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, name, email, balance")
      .eq("organization_id", organizationId)
      .in("user_id", userIds);

    console.log("🔍 [AdminPanel] Profiles query result:");
    console.log("  - Data:", profiles);
    console.log("  - Error:", profilesError);
    console.log("  - Count:", profiles?.length || 0);

    if (profilesError) {
      console.error("❌ [AdminPanel] Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Check which expenses have been resubmitted by checking audit logs
    const expenseIds = expensesData.map(e => e.id);
    let resubmittedIds = new Set<string>();
    if (expenseIds.length > 0) {
      const { data: resubmitLogs } = await supabase
        .from("audit_logs")
        .select("expense_id")
        .in("expense_id", expenseIds)
        .eq("action", "expense_resubmitted")
        .eq("organization_id", organizationId);

      resubmittedIds = new Set(resubmitLogs?.map(log => log.expense_id) || []);
    }

    // Combine expenses with profile data
    console.log("🔍 [AdminPanel] Combining expenses with profiles...");
    const expensesWithProfiles = expensesData.map(expense => {
      const profile = profiles?.find(p => p.user_id === expense.user_id);
      const combined = {
        ...expense,
        user_name: profile?.name || "Unknown User",
        user_email: profile?.email || "unknown@example.com",
        user_balance: profile?.balance ?? 0,
        total_amount: Number(expense.total_amount),
        isResubmitted: resubmittedIds.has(expense.id)
      };
      console.log("  - Combined expense:", combined.id, "with user:", combined.user_name);
      return combined;
    });

    console.log("✅ [AdminPanel] Final expenses with profiles:", expensesWithProfiles.length);
    console.log("✅ [AdminPanel] Final expenses array:", expensesWithProfiles);
    setExpenses(expensesWithProfiles);
  };

  const fetchEngineers = async () => {
    if (!organizationId) return;

    // Get engineers from organization_memberships (filtered by organization_id)
    const { data: engineerMemberships, error: membershipsError } = await supabase
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "engineer")
      .eq("is_active", true);

    if (membershipsError) throw membershipsError;

    if (!engineerMemberships || engineerMemberships.length === 0) {
      setEngineers([]);
      return;
    }

    // Get profiles for engineers (filtered by organization_id)
    const engineerIds = engineerMemberships.map(m => m.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, name, email")
      .eq("organization_id", organizationId)
      .in("user_id", engineerIds);

    if (profilesError) throw profilesError;

    setEngineers(profiles.map(profile => ({
      id: profile.user_id,
      name: profile.name,
      email: profile.email
    })));
  };

  const approveExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);

      toast({
        title: "Expense Approved",
        description: "The expense has been approved successfully",
      });
      applyExpenseStatusLocally([selectedExpense.id], "approved");

      setSelectedExpense(null);
      setAdminComment("");
      await fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    }
  };


  const assignToEngineer = async () => {
    if (!selectedExpense || !selectedEngineer || !user) return;

    try {
      await ExpenseService.assignToEngineer(selectedExpense.id, selectedEngineer, user.id);

      toast({
        title: "Expense Assigned",
        description: "The expense has been assigned to a manager for review",
      });

      setSelectedExpense(null);
      setSelectedEngineer("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign expense",
      });
    }
  };

  const verifyExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      // Automatically update status to "verified"
      const updateData: any = {
        status: "verified",
        updated_at: new Date().toISOString()
      };

      if (adminComment) {
        updateData.admin_comment = adminComment;
      }

      const { error } = await supabase
        .from("expenses")
        .update(updateData)
        .eq("id", selectedExpense.id);

      if (error) throw error;

      // Log the action
      await supabase
        .from("audit_logs")
        .insert({
          expense_id: selectedExpense.id,
          user_id: user.id,
          action: "Status changed to verified",
          comment: adminComment || null
        });

      toast({
        title: "Expense Verified",
        description: "Expense has been verified successfully",
      });

      // Close dialog and reset
      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to verify expense",
      });
    }
  };

  const rejectExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      await ExpenseService.rejectExpense(selectedExpense.id, user.id, adminComment);

      toast({
        title: "Expense Rejected",
        description: "Expense has been rejected successfully",
      });
      applyExpenseStatusLocally([selectedExpense.id], "rejected");

      setSelectedExpense(null);
      setAdminComment("");
      setAttachments([]);
      setDialogOpen(false);
      await fetchExpenses();
    } catch (error: any) {
      console.error("Error rejecting expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  // Get expenses that can be bulk processed (submitted or verified status)
  const getSelectableExpenses = () => {
    return filteredExpenses.filter((e) => REVIEWABLE_STATUSES.has((e.status || "").toLowerCase()));
  };

  const handleSelectExpense = (expenseId: string, checked: boolean) => {
    const newSelected = new Set(selectedExpenseIds);
    if (checked) {
      newSelected.add(expenseId);
    } else {
      newSelected.delete(expenseId);
    }
    setSelectedExpenseIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const selectableIds = new Set(getSelectableExpenses().map((e) => e.id));
      setSelectedExpenseIds(selectableIds);
    } else {
      setSelectedExpenseIds(new Set());
    }
  };

  const handleBulkApprove = async () => {
    if (!user || selectedExpenseIds.size === 0) return;

    const expenseIds = Array.from(selectedExpenseIds);
    const expensesToApprove = filteredExpenses.filter(
      (e) =>
        expenseIds.includes(e.id) &&
        REVIEWABLE_STATUSES.has((e.status || "").toLowerCase())
    );

    if (expensesToApprove.length === 0) {
      toast({
        variant: "destructive",
        title: "No Valid Expenses",
        description:
          "Selected expenses cannot be approved. Only submitted or verified expenses can be approved.",
      });
      return;
    }

    try {
      setBulkActionLoading(true);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const expense of expensesToApprove) {
        try {
          await ExpenseService.approveExpense(expense.id, user.id, "Bulk approved");
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(
            `${expense.title || expense.id}: ${error.message || "Failed to approve"}`
          );
        }
      }

      if (successCount > 0) {
        applyExpenseStatusLocally(expensesToApprove.map((e) => e.id), "approved");
        toast({
          title: "Bulk Approval Complete",
          description: `Successfully approved ${successCount} expense(s).${errorCount > 0 ? ` ${errorCount} failed.` : ""}`,
        });
      }

      if (errorCount > 0 && errors.length > 0) {
        console.error("Bulk approval errors:", errors);
        toast({
          variant: "destructive",
          title: "Some Approvals Failed",
          description: `${errorCount} expense(s) could not be approved. Check console for details.`,
        });
      }

      setSelectedExpenseIds(new Set());
      await fetchExpenses();
    } catch (error: any) {
      console.error("Error in bulk approve:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expenses",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkReject = async () => {
    if (!user || selectedExpenseIds.size === 0) return;

    const expenseIds = Array.from(selectedExpenseIds);
    const expensesToReject = filteredExpenses.filter(
      (e) =>
        expenseIds.includes(e.id) &&
        REVIEWABLE_STATUSES.has((e.status || "").toLowerCase())
    );

    if (expensesToReject.length === 0) {
      toast({
        variant: "destructive",
        title: "No Valid Expenses",
        description:
          "Selected expenses cannot be rejected. Only submitted or verified expenses can be rejected.",
      });
      return;
    }

    try {
      setBulkActionLoading(true);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const expense of expensesToReject) {
        try {
          await ExpenseService.rejectExpense(expense.id, user.id, "Bulk rejected");
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(
            `${expense.title || expense.id}: ${error.message || "Failed to reject"}`
          );
        }
      }

      if (successCount > 0) {
        applyExpenseStatusLocally(expensesToReject.map((e) => e.id), "rejected");
        toast({
          title: "Bulk Rejection Complete",
          description: `Successfully rejected ${successCount} expense(s).${errorCount > 0 ? ` ${errorCount} failed.` : ""}`,
        });
      }

      if (errorCount > 0 && errors.length > 0) {
        console.error("Bulk rejection errors:", errors);
        toast({
          variant: "destructive",
          title: "Some Rejections Failed",
          description: `${errorCount} expense(s) could not be rejected. Check console for details.`,
        });
      }

      setSelectedExpenseIds(new Set());
      await fetchExpenses();
    } catch (error: any) {
      console.error("Error in bulk reject:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject expenses",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const approveExpenseDirect = async () => {
    if (!selectedExpense || !user) return;

    try {
      // Use ExpenseService to approve (this handles balance deduction)
      await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);

      toast({
        title: "Expense Approved",
        description: `Expense approved and ${formatINR(selectedExpense.total_amount)} deducted from employee balance.`,
      });

      // Close dialog and reset
      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    }
  };

  const updateExpenseStatus = async () => {
    if (!selectedExpense || !selectedStatus || !user) return;

    try {
      // Use proper service methods for approve/reject
      if (selectedStatus === "approved") {
        await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);
        toast({
          title: "Expense Approved",
          description: `Expense approved and ₹${selectedExpense.total_amount} deducted from employee balance.`,
        });
      } else if (selectedStatus === "submitted" || selectedStatus === "verified") {
        // Only assign to engineer if one is selected
        if (selectedEngineer && selectedEngineer !== "none") {
          await ExpenseService.assignToEngineer(selectedExpense.id, selectedEngineer, user.id);
          toast({
            title: "Expense Assigned",
            description: "The expense has been assigned to a manager for review",
          });
        } else {
          // Just update the status without assigning to engineer
          const updateData: any = {
            status: selectedStatus,
            updated_at: new Date().toISOString()
          };

          if (adminComment) {
            updateData.admin_comment = adminComment;
          }

          const { error } = await supabase
            .from("expenses")
            .update(updateData)
            .eq("id", selectedExpense.id);

          if (error) throw error;

          // Log the action
          await supabase
            .from("audit_logs")
            .insert({
              expense_id: selectedExpense.id,
              user_id: user.id,
              action: `Status changed to ${selectedStatus}`,
              comment: adminComment || null
            });

          toast({
            title: "Success",
            description: "Expense status updated successfully",
          });
        }
      } else {
        // For other status changes, use direct update
        const updateData: any = {
          status: selectedStatus,
          updated_at: new Date().toISOString()
        };

        if (selectedEngineer && selectedEngineer !== "none") {
          updateData.assigned_engineer_id = selectedEngineer;
        } else if (selectedEngineer === "none") {
          updateData.assigned_engineer_id = null;
        }

        if (adminComment) {
          updateData.admin_comment = adminComment;
        }

        const { error } = await supabase
          .from("expenses")
          .update(updateData)
          .eq("id", selectedExpense.id);

        if (error) throw error;

        // Log the action
        await supabase
          .from("audit_logs")
          .insert({
            expense_id: selectedExpense.id,
            user_id: user.id,
            action: `Status changed to ${selectedStatus}`,
            comment: adminComment || null
          });

        toast({
          title: "Success",
          description: "Expense status updated successfully",
        });
      }

      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      setSelectedStatus("");
      setSelectedEngineer("");
      fetchExpenses();
    } catch (error: any) {
      console.error("Error updating expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update expense",
      });
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .upsert({
          user_id: userId,
          role: newRole
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User role updated successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user role:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update user role",
      });
    }
  };

  // Filter and search functions
  const filteredExpenses = expenses.filter(expense => {
    console.log("🔍 [AdminPanel] Filtering expense:", expense.id, expense.title);
    const matchesSearch = searchTerm === "" ||
      expense.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ((expense as any).transaction_number || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || expense.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Helper function to escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportExpenses = async () => {
    try {
      // Build CSV with all requested fields
      const csvContent = [
        ["Date of Transaction", "Category", "Amount", "Petty Cash", "Transaction ID", "Employee Name", "Location"],
        ...filteredExpenses.map(expense => [
          format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "yyyy-MM-dd"), // Date of transaction (expense date)
          escapeCSV((expense as any).category || "N/A"), // Category
          Number(expense.total_amount).toFixed(2), // Amount
          "petty cash", // Petty Cash - always "petty cash" for each transaction
          escapeCSV((expense as any).transaction_number || ''), // Transaction ID
          escapeCSV(expense.user_name), // Employee name
          escapeCSV(expense.destination || "Unassigned") // Location of the expense (not employee location)
        ])
      ].map(row => row.join(",")).join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting expenses:", error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export expenses. Please try again.",
      });
    }
  };

  const handleDownloadBackup = async () => {
    if (!organizationId) return;
    try {
      setBackupLoading(true);
      const payload = await fetchOrgBackup(supabase, organizationId);
      if (includeReceipts && payload.attachments.length > 0) {
        const receiptBlobs = await fetchReceiptBlobs(supabase, payload.attachments);
        await downloadBackupWithReceipts(payload, receiptBlobs);
        toast({ title: "Backup downloaded", description: `Data and ${receiptBlobs.length} receipt file(s) saved.` });
      } else {
        downloadBackup(payload);
        toast({ title: "Backup downloaded", description: "Your organization data has been saved." });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "Failed to prepare backup.",
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const getStats = () => {
    const totalExpenses = expenses.length;
    const pendingExpenses = expenses.filter(e => ["submitted", "verified"].includes(e.status)).length;
    const approvedExpenses = expenses.filter(e => e.status === "approved").length;
    const totalAmount = expenses.reduce((sum, e) => sum + e.total_amount, 0);

    return {
      totalExpenses,
      pendingExpenses,
      approvedExpenses,
      totalAmount,
      totalUsers: users.length
    };
  };

  const stats = getStats();

  if (userRole !== "admin") {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Mobile-optimized Header Section */}
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl sm:rounded-2xl shadow-lg">
          <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          Admin Panel
        </h1>
        <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto px-4">
          Manage users, expenses, and system settings with comprehensive oversight
        </p>
      </div>

      {/* Mobile-optimized Stats Cards */}
      <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Users</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap">{stats.totalUsers}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ml-2">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Expenses</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap">{stats.totalExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ml-2">
                <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Pending</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap">{stats.pendingExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ml-2">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Approved</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap">{stats.approvedExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ml-2">
                <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Amount</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis">{formatINR(stats.totalAmount)}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ml-2">
                <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Search and Filter Controls */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Search & Filter Expenses</CardTitle>
                <CardDescription className="text-blue-100">Find and filter expenses by various criteria</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <label className="text-xs sm:text-sm font-medium text-gray-700">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by title, destination, employee, transaction #..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10 sm:h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-gray-700">Status Filter</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 sm:h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 text-sm">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-gray-700">Actions</label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="admin-include-receipts"
                    checked={includeReceipts}
                    onCheckedChange={(v) => setIncludeReceipts(v === true)}
                  />
                  <Label htmlFor="admin-include-receipts" className="text-xs font-normal cursor-pointer">Include receipts</Label>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={exportExpenses}
                    className="w-full h-10 sm:h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Export CSV</span>
                    <span className="sm:hidden">Export</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadBackup}
                    disabled={backupLoading || !organizationId}
                    className="w-full h-10 sm:h-12 text-sm"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {backupLoading ? "Preparing…" : includeReceipts ? "Download backup (ZIP)" : "Download backup"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/settings")}
                    className="w-full h-10 sm:h-12 text-sm"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore from backup
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-600">
              Showing {filteredExpenses.length} of {expenses.length} expenses
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl font-bold">All Expenses</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Review and manage expense submissions from all users</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {loading ? (
              <div className="min-h-[400px] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-2 text-gray-600">Loading expenses...</span>
              </div>
            ) : (
              <>
                {selectedExpenseIds.size > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-sm font-medium text-blue-900">
                      {selectedExpenseIds.size} expense(s) selected
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleBulkApprove}
                        disabled={bulkActionLoading}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Bulk Approve
                      </Button>
                      <Button
                        onClick={handleBulkReject}
                        disabled={bulkActionLoading}
                        variant="destructive"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Bulk Reject
                      </Button>
                      <Button
                        onClick={() => setSelectedExpenseIds(new Set())}
                        variant="outline"
                        size="sm"
                        disabled={bulkActionLoading}
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow className="border-gray-200">
                        <TableHead className="font-semibold w-[50px]">
                          <Checkbox
                            checked={
                              getSelectableExpenses().length > 0 &&
                              getSelectableExpenses().every((e) => selectedExpenseIds.has(e.id))
                            }
                            onCheckedChange={(v) => handleSelectAll(v === true)}
                            disabled={getSelectableExpenses().length === 0}
                          />
                        </TableHead>
                        <TableHead className="font-semibold min-w-[80px] whitespace-nowrap">Txn #</TableHead>
                        <TableHead className="font-semibold min-w-[140px] sm:min-w-[140px]">Employee / Title</TableHead>
                        <TableHead className="font-semibold min-w-[100px] hidden sm:table-cell">Title</TableHead>
                        <TableHead className="font-semibold min-w-[100px] hidden md:table-cell">Category</TableHead>
                        <TableHead className="font-semibold w-[140px] max-w-[140px] hidden sm:table-cell">Destination</TableHead>
                        <TableHead className="font-semibold min-w-[90px] whitespace-nowrap">Amount</TableHead>
                        <TableHead className="font-semibold min-w-[90px] hidden md:table-cell">Balance</TableHead>
                        <TableHead className="font-semibold min-w-[100px] hidden sm:table-cell">Status</TableHead>
                        <TableHead className="font-semibold min-w-[100px] whitespace-nowrap text-right pr-2 sm:pr-4 hidden sm:table-cell">Expense Date</TableHead>
                        <TableHead className="text-right font-semibold min-w-[120px]">Status / Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => {
                        const isSelectable = REVIEWABLE_STATUSES.has((expense.status || "").toLowerCase());
                        const isSelected = selectedExpenseIds.has(expense.id);
                        return (
                        <TableRow key={expense.id}>
                          <TableCell className="w-[50px]">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleSelectExpense(expense.id, checked as boolean)
                              }
                              disabled={!isSelectable || bulkActionLoading}
                            />
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm font-mono font-semibold text-blue-600 whitespace-nowrap">
                            {(expense as any).transaction_number || '-'}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            <div>
                              <div className="font-medium truncate">{expense.user_name}</div>
                              <div className="text-xs text-muted-foreground truncate sm:hidden">{expense.user_email}</div>
                              <div className="font-medium text-xs sm:text-sm mt-1 line-clamp-1 break-words">{expense.title}</div>
                              <div className="text-xs text-muted-foreground sm:hidden mt-1">{expense.destination}</div>
                              <div className="text-xs text-muted-foreground sm:hidden mt-1">
                                {format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-xs sm:text-sm hidden sm:table-cell">
                            <div className="line-clamp-2 break-words">{expense.title}</div>
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm hidden md:table-cell capitalize">{expense.category ?? "-"}</TableCell>
                          <TableCell className="text-xs sm:text-sm truncate hidden sm:table-cell max-w-[140px]" title={expense.destination}>{expense.destination}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs sm:text-sm font-medium">{formatINR(expense.total_amount)}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                            <div className={`font-medium whitespace-nowrap ${expense.user_balance >= expense.total_amount
                              ? 'text-green-600'
                              : 'text-red-600'
                              }`}>
                              {formatINR(expense.user_balance)}
                            </div>
                            {expense.user_balance < expense.total_amount && (
                              <div className="text-xs text-red-500 whitespace-nowrap">
                                Insufficient balance
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {(expense as any).isResubmitted && expense.status === "submitted" ? (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                Resubmitted
                              </Badge>
                            ) : (
                              <StatusBadge status={expense.status as any} />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs sm:text-sm text-right pr-2 sm:pr-4 hidden sm:table-cell">
                            {format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col sm:flex-row items-end gap-2 sm:gap-0">
                              <div className="sm:hidden mb-2">
                                {(expense as any).isResubmitted && expense.status === "submitted" ? (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    Resubmitted
                                  </Badge>
                                ) : (
                                  <StatusBadge status={expense.status as any} />
                                )}
                              </div>
                              <div className="flex justify-end shrink-0">
                                <Button
                                  variant={(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected" ? "secondary" : "default"}
                                  size="sm"
                                  className={(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected"
                                    ? "h-8 px-2 text-xs font-normal whitespace-nowrap"
                                    : "h-8 px-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                                  }
                                  onClick={() => {
                                    setSelectedExpense(expense);
                                    setDialogOpen(true);
                                  }}
                                >
                                  {(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected" ? "View" : "View/Approve"}
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              </>
            )}

        {/* Review Expense Dialog - single instance outside table for reliable rendering */}
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedExpense(null);
            setAdminComment("");
            setSelectedStatus("");
          }
        }}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-4xl max-h-[95vh] sm:max-h-[85vh] overflow-hidden flex flex-col p-0">
            <div ref={reviewDialogContentRef} className="overflow-y-auto flex-1 p-4 sm:p-6 min-h-0">
              <DialogHeader>
                <DialogTitle>Review and manage this expense submission</DialogTitle>
              </DialogHeader>

              {selectedExpense && (
                                        <div className="space-y-4">
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                              <label className="text-sm font-medium">Employee</label>
                                              <p className="text-sm">{selectedExpense.user_name}</p>
                                              <p className="text-xs text-muted-foreground">{selectedExpense.user_email}</p>
                                            </div>
                                            <div>
                                              <label className="text-sm font-medium">Amount</label>
                                              <p className="text-lg font-semibold">{formatINR(selectedExpense.total_amount)}</p>
                                            </div>
                                          </div>

                                          <div>
                                            <label className="text-sm font-medium">Title</label>
                                            <p className="text-sm">{selectedExpense.title}</p>
                                          </div>

                                          <div>
                                            <label className="text-sm font-medium">Destination</label>
                                            <p className="text-sm">{selectedExpense.destination}</p>
                                          </div>

                                          {selectedExpense.category && (
                                            <div>
                                              <label className="text-sm font-medium">Category</label>
                                              <p className="text-sm capitalize">{selectedExpense.category}</p>
                                            </div>
                                          )}

                                          {selectedExpense.purpose && (
                                            <div>
                                              <label className="text-sm font-medium">Purpose</label>
                                              <p className="text-sm">{selectedExpense.purpose}</p>
                                            </div>
                                          )}

                                          <div>
                                            <label className="text-sm font-medium">Date of Expense</label>
                                            <p className="text-sm">{format(parseLocalDate(selectedExpense.trip_start) ?? new Date(selectedExpense.trip_start), "MMM d, yyyy")}</p>
                                          </div>

                                          <div>
                                            <label className="text-sm font-medium">Current Status</label>
                                            <div className="mt-1">
                                              <StatusBadge status={selectedExpense.status as any} />
                                            </div>
                                          </div>

                                          {/* Form Field Values */}
                                          {formFieldValues.length > 0 && (
                                            <div className="space-y-3 pt-2 border-t">
                                              <label className="text-sm font-medium">Additional Information</label>
                                              {formFieldValues.map((field) => (
                                                <div key={field.template_id} className="space-y-1">
                                                  <div className="text-xs text-muted-foreground">
                                                    {field.template_name}
                                                  </div>
                                                  <div className="text-sm">
                                                    {field.field_type === 'checkbox' ? (
                                                      <Badge variant={field.field_value === 'true' ? 'default' : 'outline'}>
                                                        {field.field_value === 'true' ? 'Yes' : 'No'}
                                                      </Badge>
                                                    ) : (
                                                      <span className="font-medium">{field.field_value}</span>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* For submitted expenses, show both Verify and Approve buttons */}
                                          {selectedExpense.status === "submitted" ? (
                                            <div>
                                              <label className="text-sm font-medium">Admin Comment (Optional)</label>
                                              <Textarea
                                                value={adminComment}
                                                onChange={(e) => setAdminComment(e.target.value)}
                                                placeholder="Add a comment about this expense..."
                                                className="mt-1"
                                              />
                                            </div>
                                          ) : selectedExpense.status === "verified" ? (
                                            <div>
                                              <label className="text-sm font-medium">Admin Comment (Optional)</label>
                                              <Textarea
                                                value={adminComment}
                                                onChange={(e) => setAdminComment(e.target.value)}
                                                placeholder="Add a comment about this expense..."
                                                className="mt-1"
                                              />
                                            </div>
                                          ) : (
                                            <>
                                              <div>
                                                <label className="text-sm font-medium">Update Status</label>
                                                <Select
                                                  value={selectedStatus}
                                                  onValueChange={setSelectedStatus}
                                                  disabled={selectedExpense.status === 'approved'}
                                                >
                                                  <SelectTrigger className="mt-1">
                                                    <SelectValue placeholder="Select new status" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="submitted">Submitted</SelectItem>
                                                    <SelectItem value="verified">Verified</SelectItem>
                                                    <SelectItem value="approved">Approved</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </div>

                                              <div>
                                                <label className="text-sm font-medium">Admin Comment</label>
                                                <Textarea
                                                  value={adminComment}
                                                  onChange={(e) => setAdminComment(e.target.value)}
                                                  placeholder="Add a comment about this expense..."
                                                  className="mt-1"
                                                />
                                              </div>
                                            </>
                                          )}

                                          {attachments.length > 0 && (
                                            <div className="space-y-2">
                                              <label className="text-sm font-medium">Receipts & Attachments</label>
                                              <div className="space-y-2">
                                                {attachments.map((a) => (
                                                  <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                      {a.content_type?.startsWith("image/") ? (
                                                        <img
                                                          src={a.file_url}
                                                          alt={a.filename}
                                                          className="h-14 w-14 object-cover rounded"
                                                          onError={(e) => {
                                                            console.error("❌ [AdminPanel] Image failed to load:", a.file_url);
                                                            console.error("❌ [AdminPanel] Error event:", e);
                                                          }}
                                                          onLoad={() => {
                                                            console.log("✅ [AdminPanel] Image loaded successfully:", a.file_url);
                                                          }}
                                                        />
                                                      ) : (
                                                        <div className="h-14 w-14 flex items-center justify-center bg-gray-100 rounded text-xs">FILE</div>
                                                      )}
                                                      <div>
                                                        <p className="font-medium text-sm">{a.filename}</p>
                                                        <p className="text-xs text-muted-foreground">{a.content_type} • {format(new Date(a.created_at), "MMM d, yyyy")}</p>
                                                      </div>
                                                    </div>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => {
                                                        console.log("🖼️ [AdminPanel] Setting image preview URL:", a.file_url);
                                                        setImagePreviewUrl(a.file_url);
                                                        setPreviewContentType(a.content_type);
                                                        setImagePreviewOpen(true);
                                                      }}
                                                    >
                                                      View
                                                    </Button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Expense Timeline */}
                                          {auditLogs.length > 0 && (
                                            <div className="space-y-2 border-t pt-4 mt-4">
                                              <label className="text-sm font-medium">Expense Timeline</label>
                                              <div className="space-y-3 mt-2">
                                                {auditLogs.map((log, index) => {
                                                  // Determine colors based on action type
                                                  const getStatusColors = (action: string) => {
                                                    const actionLower = action.toLowerCase();
                                                    if (actionLower.includes('approved')) {
                                                      return {
                                                        dot: 'bg-green-500',
                                                        line: 'bg-green-200',
                                                        text: 'text-green-700',
                                                        bg: 'bg-green-50',
                                                        border: 'border-green-200'
                                                      };
                                                    } else if (actionLower.includes('verified')) {
                                                      return {
                                                        dot: 'bg-yellow-500',
                                                        line: 'bg-yellow-200',
                                                        text: 'text-yellow-700',
                                                        bg: 'bg-yellow-50',
                                                        border: 'border-yellow-200'
                                                      };
                                                    } else if (actionLower.includes('rejected')) {
                                                      return {
                                                        dot: 'bg-red-500',
                                                        line: 'bg-red-200',
                                                        text: 'text-red-700',
                                                        bg: 'bg-red-50',
                                                        border: 'border-red-200'
                                                      };
                                                    } else if (actionLower.includes('resubmitted')) {
                                                      return {
                                                        dot: 'bg-blue-500',
                                                        line: 'bg-blue-200',
                                                        text: 'text-blue-700',
                                                        bg: 'bg-blue-50',
                                                        border: 'border-blue-200'
                                                      };
                                                    } else if (actionLower.includes('submitted')) {
                                                      return {
                                                        dot: 'bg-indigo-500',
                                                        line: 'bg-indigo-200',
                                                        text: 'text-indigo-700',
                                                        bg: 'bg-indigo-50',
                                                        border: 'border-indigo-200'
                                                      };
                                                    } else if (actionLower.includes('created')) {
                                                      return {
                                                        dot: 'bg-gray-500',
                                                        line: 'bg-gray-200',
                                                        text: 'text-gray-700',
                                                        bg: 'bg-gray-50',
                                                        border: 'border-gray-200'
                                                      };
                                                    } else {
                                                      return {
                                                        dot: 'bg-purple-500',
                                                        line: 'bg-purple-200',
                                                        text: 'text-purple-700',
                                                        bg: 'bg-purple-50',
                                                        border: 'border-purple-200'
                                                      };
                                                    }
                                                  };

                                                  const colors = getStatusColors(log.action);
                                                  const displayText = log.action === "expense_resubmitted"
                                                    ? "Expense Resubmitted"
                                                    : log.action.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

                                                  return (
                                                    <div key={index} className={`flex gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
                                                      <div className="flex flex-col items-center">
                                                        <div className={`w-3 h-3 ${colors.dot} rounded-full ring-2 ring-white shadow-sm`}></div>
                                                        {index < auditLogs.length - 1 && (
                                                          <div className={`w-0.5 h-10 ${colors.line} mt-2`}></div>
                                                        )}
                                                      </div>
                                                      <div className="flex-1 space-y-1">
                                                        <p className={`text-sm font-semibold ${colors.text}`}>
                                                          {displayText}
                                                        </p>
                                                        {log.comment && (
                                                          <p className={`text-xs ${colors.text} opacity-80`}>{log.comment}</p>
                                                        )}
                                                        <p className="text-xs text-muted-foreground">
                                                          by <span className="font-medium">{log.user_name}</span> • {format(new Date(log.created_at), "MMM d, h:mm a")}
                                                        </p>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      <DialogFooter>
                                        <Button variant="outline" onClick={() => {
                                          setDialogOpen(false);
                                          setSelectedExpense(null);
                                          setAdminComment("");
                                          setSelectedStatus("");
                                        }}>
                                          Cancel
                                        </Button>
                                        {selectedExpense?.status === "rejected" ? (
                                          // No action buttons for rejected expenses - they are final
                                          null
                                        ) : selectedExpense?.status === "submitted" ? (
                                          <>
                                            <Button
                                              variant="destructive"
                                              onClick={rejectExpense}
                                              disabled={reviewLoading || selectedExpense?.status === 'approved' || selectedExpense?.status === 'rejected'}
                                            >
                                              Reject
                                            </Button>
                                            <Button variant="outline" onClick={verifyExpense}>
                                              Verify
                                            </Button>
                                            <Button onClick={approveExpenseDirect}>
                                              Approve
                                            </Button>
                                          </>
                                        ) : selectedExpense?.status === "verified" ? (
                                          <>
                                            <Button
                                              variant="destructive"
                                              onClick={rejectExpense}
                                              disabled={reviewLoading || selectedExpense?.status === 'approved' || selectedExpense?.status === 'rejected'}
                                            >
                                              Reject
                                            </Button>
                                            <Button onClick={approveExpenseDirect}>
                                              Approve
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            onClick={updateExpenseStatus}
                                            disabled={!selectedStatus || selectedExpense?.status === 'approved'}
                                          >
                                            Update Status
                                          </Button>
                                        )}
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

          </CardContent>
        </Card>
        {/* Image/PDF Preview Dialog - outside the table */}
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {imagePreviewUrl && (
              previewContentType === 'application/pdf' || imagePreviewUrl.toLowerCase().endsWith('.pdf') ? (
                <div className="w-full" style={{ height: '80vh' }}>
                  <iframe
                    src={imagePreviewUrl}
                    className="w-full h-full rounded border"
                    title="PDF Preview"
                    style={{ minHeight: '600px' }}
                  />
                </div>
              ) : (
                <img
                  src={imagePreviewUrl}
                  alt="Attachment preview"
                  className="w-full h-auto rounded"
                  onError={(e) => {
                    console.error("❌ [AdminPanel] Preview image failed to load:", imagePreviewUrl);
                    console.error("❌ [AdminPanel] Error event:", e);
                  }}
                  onLoad={() => {
                    console.log("✅ [AdminPanel] Preview image loaded successfully:", imagePreviewUrl);
                  }}
                />
              )
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
