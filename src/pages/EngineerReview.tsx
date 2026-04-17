import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Receipt, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Coins,
  Eye,
  FileText,
  User,
  Search,
  Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExpenseService } from "@/services/ExpenseService";
import { format, subDays, subMonths, subYears } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { formatINR, parseLocalDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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
  purpose?: string;
  admin_comment?: string;
}

// Local state for image preview

interface LineItem {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
}

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
}

export default function ManagerReview() {
  const { user, userRole, organizationId } = useAuth();
  const { toast } = useToast();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [engineerComment, setEngineerComment] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [engineerApprovalLimit, setEngineerApprovalLimit] = useState<number>(50000);
  const [timePeriod, setTimePeriod] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{action: string; user_name: string; comment?: string; created_at: string}>>([]);
  const [formFieldValues, setFormFieldValues] = useState<Array<{
    template_id: string;
    template_name: string;
    field_type: string;
    field_value: string;
  }>>([]);

  useEffect(() => {
    if (userRole === "engineer" && organizationId) {
      fetchEngineerApprovalLimit();
    }
  }, [userRole, user, organizationId]);

  useEffect(() => {
    if (userRole === "engineer") {
      fetchAssignedExpenses();
      // Set up real-time subscription for new expenses
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [userRole, user, timePeriod]);

  useEffect(() => {
    // Apply filters when any filter changes
    applyFilters(allExpenses);
  }, [searchTerm, statusFilter, sortOrder, allExpenses]);

  const fetchEngineerApprovalLimit = async () => {
    try {
      if (!organizationId) return;
      
      // Read from organization_settings table (not settings table)
      const { data, error } = await supabase
        .from("organization_settings")
        .select("engineer_approval_limit")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching approval limit:", error);
        console.error("Error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        // Use default if there's an error
        setEngineerApprovalLimit(50000);
        return;
      }

      if (data && data.engineer_approval_limit !== null && data.engineer_approval_limit !== undefined) {
        const limitValue = Number(data.engineer_approval_limit);
        if (isNaN(limitValue)) {
          console.error("Invalid limit value:", data.engineer_approval_limit);
          setEngineerApprovalLimit(50000);
        } else {
          setEngineerApprovalLimit(limitValue);
          console.log("Engineer approval limit loaded:", limitValue);
        }
      } else {
        console.warn("No limit data found, using default 50000");
        setEngineerApprovalLimit(50000);
      }
    } catch (error) {
      console.error("Error fetching approval limit:", error);
      setEngineerApprovalLimit(50000);
    }
  };

  const fetchAssignedExpenses = async () => {
    try {
      setLoading(true);
      
      if (!organizationId) return;
      
      // Calculate date filter based on time period
      let dateFilter: Date | null = null;
      if (timePeriod === "week") {
        dateFilter = subDays(new Date(), 7);
      } else if (timePeriod === "month") {
        dateFilter = subMonths(new Date(), 1);
      } else if (timePeriod === "year") {
        dateFilter = subYears(new Date(), 1);
      }

      // First, get all employees currently assigned to this engineer (filtered by organization_id)
      const { data: employeeProfiles, error: employeesError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("reporting_engineer_id", user?.id);

      if (employeesError) throw employeesError;

      const employeeIds = (employeeProfiles || []).map(p => p.user_id);
      
      if (employeeIds.length === 0) {
        setAllExpenses([]);
        setExpenses([]);
        return;
      }

      // Get ALL expenses from employees currently assigned to this engineer (filtered by organization_id)
      // This includes historical expenses even if they were reviewed/approved by a different engineer
      let query = supabase
        .from("expenses")
        .select("*")
        .eq("organization_id", organizationId)
        .in("user_id", employeeIds)
        .in("status", ["submitted", "verified", "approved", "rejected"]);

      // Apply date filter if time period is selected
      if (dateFilter) {
        query = query.gte("created_at", dateFilter.toISOString());
      }

      const { data: expenses, error: expensesError } = await query
        .order("created_at", { ascending: false });

      if (expensesError) throw expensesError;

      if (!expenses || expenses.length === 0) {
        setAllExpenses([]);
        setExpenses([]);
        return;
      }

      // Fetch related profiles separately and merge client-side (filtered by organization_id)
      const userIds = [...new Set(expenses.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("organization_id", organizationId)
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Check which expenses have been resubmitted
      const expenseIds = expenses.map(e => e.id);
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

      const merged = expenses.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "unknown@example.com",
          total_amount: Number(expense.total_amount),
          isResubmitted: resubmittedIds.has(expense.id)
        } as any;
      });

      setAllExpenses(merged);
      
      // Apply search filter
      applyFilters(merged);
    } catch (error) {
      console.error("Error fetching assigned expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user?.id || userRole !== "engineer") return () => {};

    // Get employee IDs assigned to this engineer
    const getEmployeeIds = async () => {
      const { data: employeeProfiles } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("reporting_engineer_id", user.id);
      return (employeeProfiles || []).map(p => p.user_id);
    };

    let employeeIds: string[] = [];
    
    // Initialize employee IDs
    getEmployeeIds().then(ids => {
      employeeIds = ids;
    });

    const channel = supabase
      .channel(`engineer-expenses-${user.id}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'expenses',
        }, 
        async (payload) => {
          const newExpense = payload.new as any;
          
          // Check if this expense belongs to an employee assigned to this engineer
          // Refresh employee IDs in case assignments changed
          employeeIds = await getEmployeeIds();
          
          if (employeeIds.includes(newExpense.user_id) && 
              (newExpense.status === "submitted" || newExpense.status === "verified")) {
            console.log('New expense assigned to engineer:', newExpense);
            // Refresh the expenses list
            fetchAssignedExpenses();
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'expenses',
        },
        async (payload) => {
          const updatedExpense = payload.new as any;
          
          // Refresh employee IDs
          employeeIds = await getEmployeeIds();
          
          // If expense status changed or it was assigned to this engineer's employee
          if (employeeIds.includes(updatedExpense.user_id)) {
            console.log('Expense updated for engineer:', updatedExpense);
            fetchAssignedExpenses();
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotif = payload.new as any;
          if (newNotif.type === "expense_submitted" || newNotif.type === "expense_assigned") {
            console.log('New notification for engineer:', newNotif);
            // Refresh expenses when notification arrives
            fetchAssignedExpenses();
          }
        }
      )
      .subscribe((status) => {
        console.log('Engineer expenses subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const applyFilters = (expensesList: Expense[]) => {
    let filtered = expensesList;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(exp => 
        exp.title?.toLowerCase().includes(search) ||
        exp.destination?.toLowerCase().includes(search) ||
        exp.user_name?.toLowerCase().includes(search) ||
        exp.user_email?.toLowerCase().includes(search) ||
        exp.total_amount?.toString().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(exp => exp.status === statusFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    setExpenses(filtered);
  };

  const fetchExpenseDetails = async (expenseId: string) => {
    try {
      // Fetch line items
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", expenseId)
        .order("date");

      if (lineItemsError) throw lineItemsError;

      // Fetch attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at");

      if (attachmentsError) throw attachmentsError;

      setLineItems(lineItemsData || []);
      setAttachments(attachmentsData || []);
      
      // Fetch form field values
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
      } else {
        setFormFieldValues([]);
      }
      
      // Fetch audit logs to show approval/rejection history
      const { data: logsData, error: logsError } = await supabase
        .from("audit_logs")
        .select("user_id, action, comment, created_at")
        .eq("expense_id", expenseId)
        .in("action", ["expense_approved", "expense_rejected", "expense_verified", "expense_submitted", "expense_created"])
        .order("created_at", { ascending: false });

      if (logsError) {
        console.error("Error fetching audit logs:", logsError);
      } else if (logsData && logsData.length > 0) {
        // Fetch user profiles for audit logs
        const userIds = [...new Set(logsData.map(log => log.user_id))];
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", userIds);

        if (!profilesError && profiles) {
          const logsWithNames = logsData.map(log => {
            const profile = profiles.find(p => p.user_id === log.user_id);
            return {
              action: log.action,
              user_name: profile?.name || "Unknown User",
              comment: log.comment,
              created_at: log.created_at
            };
          });
          setAuditLogs(logsWithNames);
        } else {
          setAuditLogs(logsData.map(log => ({
            action: log.action,
            user_name: "Unknown User",
            comment: log.comment,
            created_at: log.created_at
          })));
        }
      } else {
        setAuditLogs([]);
      }
    } catch (error) {
      console.error("Error fetching expense details:", error);
    }
  };

  const verifyExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      await ExpenseService.verifyExpense(
        selectedExpense.id, 
        user.id, 
        engineerComment
      );

      toast({
        title: "Success",
        description: "Expense verified successfully",
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      setAuditLogs([]);
      fetchAssignedExpenses();
    } catch (error: any) {
      console.error("Error verifying expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to verify expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const approveExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      // Use ExpenseService to approve (this handles balance deduction)
      await ExpenseService.approveExpense(selectedExpense.id, user.id, engineerComment);

      toast({
        title: "Expense Approved",
        description: `Expense approved and ${formatINR(selectedExpense.total_amount)} deducted from employee balance.`,
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      setAuditLogs([]);
      fetchAssignedExpenses();
    } catch (error: any) {
      console.error("Error approving expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const rejectExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      await ExpenseService.rejectExpense(selectedExpense.id, user.id, engineerComment);

      toast({
        title: "Expense Rejected",
        description: "Expense has been rejected successfully",
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      setAuditLogs([]);
      fetchAssignedExpenses();
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

  const isActionDisabled = (exp?: Expense | null) => {
    if (!exp) return true;
    // Allow action on "submitted" expenses (engineers can verify, approve, or reject)
    // Disable action if already "approved" or "rejected"
    if (exp.status === "approved") return true;
    if (exp.status === "rejected") return true;
    if (exp.status === "verified" && Number(exp.total_amount) >= Number(engineerApprovalLimit)) return true;
    return false;
  };

  const getStats = () => {
    const totalAssigned = allExpenses.length;
    const pendingReview = allExpenses.filter(e => e.status === "submitted").length;
    const verified = allExpenses.filter(e => e.status === "verified").length;
    const approved = allExpenses.filter(e => e.status === "approved").length;
    const totalAmount = allExpenses.reduce((sum, e) => sum + e.total_amount, 0);

    return {
      totalAssigned,
      pendingReview,
      verified,
      approved,
      totalAmount
    };
  };

  const stats = getStats();

  if (userRole !== "engineer") {
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
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Expense Review</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Review and verify assigned expense submissions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned to Me</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAssigned}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReview}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.verified}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(stats.totalAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Assigned Expenses</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Review and verify expense submissions assigned to you</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Search and Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by title or destination..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status Filter */}
            <div className="w-full sm:w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Sorter */}
            <div className="w-full sm:w-40">
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger>
                  <SelectValue placeholder="Date Created" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Date Created (Newest)</SelectItem>
                  <SelectItem value="asc">Date Created (Oldest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Time Period Dropdown */}
            <div className="w-full sm:w-40">
              <Select value={timePeriod} onValueChange={setTimePeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Past Week</SelectItem>
                  <SelectItem value="month">Past Month</SelectItem>
                  <SelectItem value="year">Past Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No assigned expenses</h3>
              <p className="text-muted-foreground">
                You don't have any expenses assigned for review at the moment.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                      <TableHead className="min-w-[80px] whitespace-nowrap">Txn #</TableHead>
                      <TableHead className="min-w-[140px] sm:min-w-[140px]">Employee / Title</TableHead>
                      <TableHead className="min-w-[100px] hidden sm:table-cell">Title</TableHead>
                      <TableHead className="w-[140px] max-w-[140px] hidden sm:table-cell">Destination</TableHead>
                      <TableHead className="min-w-[90px] whitespace-nowrap">Amount</TableHead>
                      <TableHead className="min-w-[100px] hidden sm:table-cell">Status</TableHead>
                      <TableHead className="min-w-[100px] whitespace-nowrap text-right pr-2 sm:pr-4 hidden sm:table-cell">Expense Date</TableHead>
                      <TableHead className="min-w-[120px] text-right">Status / Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
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
                    <TableCell className="text-xs sm:text-sm truncate hidden sm:table-cell max-w-[140px]" title={expense.destination}>{expense.destination}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs sm:text-sm font-medium">{formatINR(expense.total_amount)}</TableCell>
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
                          <StatusBadge status={expense.status as any} />
                        </div>
                      <div className="flex justify-end shrink-0">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                              variant={(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected" ? "secondary" : "default"}
                                size="sm"
                              className={(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected" 
                                ? "h-8 px-2 text-xs font-normal whitespace-nowrap"
                                : "h-8 px-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                              }
                                onClick={async () => {
                                  setSelectedExpense(expense);
                                  fetchExpenseDetails(expense.id);
                                  // Refresh the approval limit to get the latest value from admin settings
                                  await fetchEngineerApprovalLimit();
                                }}
                              >
                              {(expense.status || "").toLowerCase() === "approved" || (expense.status || "").toLowerCase() === "rejected" ? "View" : "View/Approve"}
                              </Button>
                            </DialogTrigger>
                        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                          <DialogHeader>
                            <DialogTitle className="text-lg sm:text-xl">Expense Review</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">
                              Review expense details and verify the submission
                            </DialogDescription>
                          </DialogHeader>
                          
                          {selectedExpense && (
                            <div className="space-y-6">
                              {/* Basic Info */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Employee Information</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{selectedExpense.user_name}</span>
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {selectedExpense.user_email}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Expense Summary</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <Coins className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-semibold">
                                          {formatINR(selectedExpense.total_amount)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <StatusBadge status={selectedExpense.status as any} />
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Trip Details */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">Trip Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  <div>
                                    <label className="text-sm font-medium">Title</label>
                                    <p className="text-sm">{selectedExpense.title}</p>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Destination</label>
                                    <p className="text-sm">{selectedExpense.destination}</p>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Date of Expense</label>
                                    <p className="text-sm">{format(parseLocalDate(selectedExpense.trip_start) ?? new Date(selectedExpense.trip_start), "MMM d, yyyy")}</p>
                                  </div>
                                  {selectedExpense.purpose && (
                                    <div>
                                      <label className="text-sm font-medium">Purpose</label>
                                      <p className="text-sm">{selectedExpense.purpose}</p>
                                    </div>
                                  )}
                                  
                                  {/* Form Field Values */}
                                  {formFieldValues.length > 0 && (
                                    <div className="space-y-3 pt-3 border-t">
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
                                </CardContent>
                              </Card>

                              {/* Line Items */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Expense Line Items
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  {lineItems.length === 0 ? (
                                    <p className="text-muted-foreground">No line items found</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Date</TableHead>
                                          <TableHead>Category</TableHead>
                                          <TableHead>Description</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {lineItems.map((item) => (
                                          <TableRow key={item.id}>
                                            <TableCell>
                                              {format(new Date(item.date), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                              <Badge variant="outline" className="capitalize">
                                                {item.category}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>{item.description}</TableCell>
                                            <TableCell className="text-right">
                                              {formatINR(item.amount)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Attachments */}
                              {attachments.length > 0 && (
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Receipts & Attachments</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      {attachments.map((attachment) => (
                                        <div
                                          key={attachment.id}
                                          className="flex items-center justify-between p-3 border rounded-lg"
                                        >
                                          <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                              <p className="font-medium text-sm">{attachment.filename}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {attachment.content_type} • {format(new Date(attachment.created_at), "MMM d, yyyy")}
                                              </p>
                                            </div>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              setImagePreviewUrl(attachment.file_url);
                                              setPreviewContentType(attachment.content_type);
                                              setImagePreviewOpen(true);
                                            }}
                                          >
                                            View
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Admin Comments */}
                              {selectedExpense.admin_comment && (
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Admin Comments</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-sm">{selectedExpense.admin_comment}</p>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Manager Review */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">Manager Review</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">Review Comment</label>
                                    <Textarea
                                      value={engineerComment}
                                      onChange={(e) => setEngineerComment(e.target.value)}
                                      placeholder="Add your review comments..."
                                      className="mt-1"
                                    />
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}

                          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setSelectedExpense(null);
                                setEngineerComment("");
                                setLineItems([]);
                                setAttachments([]);
                                setAuditLogs([]);
                              }}
                              className="w-full sm:w-auto"
                            >
                              Cancel
                            </Button>
                            {selectedExpense && (() => {
                              // Don't show any action buttons for rejected expenses
                              if (selectedExpense.status === "rejected") {
                                return null;
                              }
                              
                              const expenseAmount = Number(selectedExpense.total_amount);
                              const limit = Number(engineerApprovalLimit);
                              const canTakeAction = !isActionDisabled(selectedExpense);
                              
                              // If expense amount <= limit: Show Approve and Reject buttons
                              // If expense amount > limit: Show Verify and Reject buttons
                              if (expenseAmount <= limit) {
                                return (
                                  <>
                                    <Button 
                                      onClick={() => rejectExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      variant="destructive"
                                      className="w-full sm:w-auto"
                                    >
                                      Reject
                                    </Button>
                                    <Button 
                                      onClick={() => approveExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      className="w-full sm:w-auto"
                                    >
                                      Approve
                                    </Button>
                                  </>
                                );
                              } else {
                                return (
                                  <>
                                    <Button 
                                      onClick={() => rejectExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      variant="destructive"
                                      className="w-full sm:w-auto"
                                    >
                                      Reject
                                    </Button>
                                    <Button 
                                      onClick={() => verifyExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      className="bg-blue-500 hover:bg-blue-600 w-full sm:w-auto"
                                    >
                                      Verify
                                    </Button>
                                  </>
                                );
                              }
                            })()}
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Image/PDF Preview Dialog */}
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
              <img src={imagePreviewUrl} alt="Attachment preview" className="w-full h-auto rounded" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
