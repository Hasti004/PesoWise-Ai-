import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAllowCashierExpenseSubmission } from "@/hooks/useAllowCashierExpenseSubmission";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Download, ArrowLeft, MoreVertical, Edit, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { formatINR, parseLocalDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Expense {
  id: string;
  user_id?: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
  isResubmitted?: boolean;
}

export default function Expenses() {
  const { user, userRole } = useAuth();
  const { allowCashierExpenseSubmission } = useAllowCashierExpenseSubmission();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("trip_start");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [returnMoneyDialogOpen, setReturnMoneyDialogOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [returningMoney, setReturningMoney] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchExpenses();
      fetchUserBalance();
      
      // Set up real-time balance subscription
      const balanceChannel = supabase
        .channel(`expenses-balance-${user.id}`)
        .on('postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Balance updated via realtime:', payload);
            const newBalance = (payload.new as any)?.balance ?? 0;
            setUserBalance(newBalance);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(balanceChannel);
      };
    }
  }, [user]);

  const fetchUserBalance = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;
      setUserBalance(data?.balance ?? 0);
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  useEffect(() => {
    filterAndSortExpenses();
  }, [expenses, searchTerm, statusFilter, sortBy, sortOrder]);

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Check which expenses have been resubmitted by checking audit logs
      const expenseIds = (data || []).map(e => e.id);
      if (expenseIds.length > 0) {
        const { data: resubmitLogs } = await supabase
          .from("audit_logs")
          .select("expense_id")
          .in("expense_id", expenseIds)
          .eq("action", "expense_resubmitted");
        
        const resubmittedIds = new Set(resubmitLogs?.map(log => log.expense_id) || []);
        
        // Mark expenses as resubmitted
        const expensesWithResubmit = (data || []).map(expense => ({
          ...expense,
          isResubmitted: resubmittedIds.has(expense.id)
        }));
        
        setExpenses(expensesWithResubmit);
      } else {
        setExpenses(data || []);
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortExpenses = () => {
    let filtered = [...expenses];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(expense =>
        expense.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.destination.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(expense => expense.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "destination":
          aValue = a.destination.toLowerCase();
          bValue = b.destination.toLowerCase();
          break;
        case "total_amount":
          aValue = a.total_amount;
          bValue = b.total_amount;
          break;
        case "trip_start":
          aValue = (parseLocalDate(a.trip_start) ?? new Date(a.trip_start)).getTime();
          bValue = (parseLocalDate(b.trip_start) ?? new Date(b.trip_start)).getTime();
          break;
        case "created_at":
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    setFilteredExpenses(filtered);
  };

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

  const exportExpenses = () => {
    const csvContent = [
      ["Transaction #", "Title", "Destination", "Start Date", "End Date", "Amount (INR)", "Status", "Created Date"],
      ...filteredExpenses.map(expense => [
        escapeCSV((expense as any).transaction_number || ''),
        escapeCSV(expense.title),
        escapeCSV(expense.destination),
        format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "yyyy-MM-dd"),
        format(parseLocalDate(expense.trip_end) ?? new Date(expense.trip_end), "yyyy-MM-dd"),
        Number(expense.total_amount).toFixed(2), // Raw number without formatting
        escapeCSV(expense.status),
        format(new Date(expense.created_at), "yyyy-MM-dd")
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleReturnMoney = async () => {
    if (!user || !userRole || userBalance === null) return;

    const amount = parseFloat(returnAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
      });
      return;
    }

    if (amount > userBalance) {
      toast({
        variant: "destructive",
        title: "Insufficient Balance",
        description: `You only have ${formatINR(userBalance)}. Cannot return ${formatINR(amount)}`,
      });
      return;
    }

    try {
      setReturningMoney(true);

      // Determine target role and find target user
      let targetRole: "cashier" | "admin" | null = null;
      let targetUserId: string | null = null;

      if (userRole === "engineer" || userRole === "employee") {
        targetRole = "cashier";
        
        // For employees: Find cashier assigned to their manager (engineer)
        // For engineers: Find cashier assigned to them
        let managerId: string | null = null;
        
        if (userRole === "employee") {
          // Get employee's reporting engineer (manager)
          const { data: employeeProfile, error: profileError } = await supabase
            .from("profiles")
            .select("reporting_engineer_id")
            .eq("user_id", user.id)
            .single();

          if (profileError) throw profileError;
          managerId = (employeeProfile as any)?.reporting_engineer_id || null;
          
          if (!managerId) {
            throw new Error("You don't have a manager assigned. Please contact an administrator.");
          }
        } else if (userRole === "engineer") {
          // For engineers, they are their own manager
          managerId = user.id;
        }

        // Find cashier assigned to this manager using location-based or direct assignment
        // This function prioritizes location-based assignment and falls back to direct assignment
        const { data: cashierUserId, error: cashierError } = await supabase
          .rpc('get_cashier_for_engineer', { engineer_user_id: managerId });

        if (cashierError) {
          console.error("Error finding cashier:", cashierError);
          throw cashierError;
        }

        if (!cashierUserId) {
          throw new Error("Your manager doesn't have a cashier assigned. Please contact an administrator.");
        }

        targetUserId = cashierUserId;
      } else if (userRole === "cashier") {
        targetRole = "admin";
        
        // For cashier returning to admin, find any admin
        const { data: targetRoles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", targetRole)
          .limit(1);

        if (rolesError) {
          console.error("Error finding target role:", rolesError);
          if (rolesError.message?.includes("permission") || rolesError.message?.includes("policy")) {
            throw new Error(`Permission denied. Please ensure the database migration for return money feature has been applied.`);
          }
          throw rolesError;
        }

        if (!targetRoles || targetRoles.length === 0) {
          throw new Error(`No ${targetRole} found in the system. Please contact an administrator.`);
        }

        targetUserId = targetRoles[0].user_id;
      }

      if (!targetRole || !targetUserId) {
        throw new Error("Invalid role for returning money or target user not found");
      }

      // For employees/engineers returning to cashier, create a return request (requires approval)
      if ((userRole === "engineer" || userRole === "employee") && targetRole === "cashier") {
        // Create a return request (requires cashier approval)
        const { MoneyReturnService } = await import("@/services/MoneyReturnService");
        await MoneyReturnService.createReturnRequest(user.id, targetUserId, amount);

        // Refresh balance (request doesn't change balance yet)
        fetchUserBalance();

        // Update local state
        setReturnAmount("");
        setReturnMoneyDialogOpen(false);

        toast({
          title: "Return Request Submitted",
          description: `Your return request of ${formatINR(amount)} has been sent to your cashier for approval. You will be notified once it's approved.`,
        });
        return;
      }

      // For cashiers returning to admin, process immediately (no approval needed)
      // Get target user's current balance
      const { data: targetProfile, error: targetError } = await supabase
        .from("profiles")
        .select("balance, name")
        .eq("user_id", targetUserId)
        .single();

      if (targetError) throw targetError;

      // Deduct from current user's balance
      const newUserBalance = userBalance - amount;
      const { error: userBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newUserBalance })
        .eq("user_id", user.id);

      if (userBalanceError) throw userBalanceError;

      // Add to target user's balance
      const newTargetBalance = (targetProfile.balance || 0) + amount;
      const { error: targetBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newTargetBalance })
        .eq("user_id", targetUserId);

      if (targetBalanceError) throw targetBalanceError;

      // Update local state
      setUserBalance(newUserBalance);
      setReturnAmount("");
      setReturnMoneyDialogOpen(false);

      toast({
        title: "Money Returned Successfully",
        description: `Returned ${formatINR(amount)} to ${targetProfile.name || targetRole}. Your new balance: ${formatINR(newUserBalance)}`,
      });
    } catch (error: any) {
      console.error("Error returning money:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to return money. Please try again.",
      });
    } finally {
      setReturningMoney(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete || !user) return;

    try {
      setDeleting(true);

      // Verify expense belongs to user and is submitted
      const { data: expenseData, error: fetchError } = await supabase
        .from("expenses")
        .select("id, status, user_id")
        .eq("id", expenseToDelete.id)
        .single();

      if (fetchError) throw fetchError;

      // Verify ownership
      if (expenseData.user_id !== user.id) {
        throw new Error("You don't have permission to delete this expense");
      }

      // Verify status is submitted
      if (expenseData.status !== "submitted") {
        throw new Error("Only submitted expenses can be deleted");
      }

      // Delete attachments from storage
      const { data: attachments } = await supabase
        .from("attachments")
        .select("file_url")
        .eq("expense_id", expenseToDelete.id);

      if (attachments && attachments.length > 0) {
        // Extract file paths from URLs and delete from storage
        for (const attachment of attachments) {
          try {
            // Extract path from URL (format: /storage/v1/object/public/receipts/{path})
            const url = attachment.file_url;
            if (url) {
              const urlMatch = url.match(/\/storage\/v1\/object\/public\/receipts\/(.+)$/);
              if (urlMatch) {
                const filePath = urlMatch[1];
                await supabase.storage
                  .from("receipts")
                  .remove([filePath]);
              }
            }
          } catch (error) {
            console.error("Error deleting attachment file:", error);
            // Continue even if file deletion fails
          }
        }
      }

      // Delete attachment records
      await supabase
        .from("attachments")
        .delete()
        .eq("expense_id", expenseToDelete.id);

      // Delete expense logs (table is named audit_logs in the database)
      await supabase
        .from("audit_logs")
        .delete()
        .eq("expense_id", expenseToDelete.id);

      // Delete the expense itself
      const { error: deleteError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseToDelete.id);

      if (deleteError) {
        console.error("Delete error details:", deleteError);
        // Check if it's an RLS policy error
        if (deleteError.message?.includes("policy") || deleteError.message?.includes("permission")) {
          throw new Error("You don't have permission to delete this expense. Please ensure the expense is in 'submitted' status and belongs to you. If the issue persists, you may need to apply the database migration: 20250119000000_allow_users_delete_submitted_expenses.sql");
        }
        throw deleteError;
      }

      toast({
        title: "Expense Deleted",
        description: `Expense "${expenseToDelete.title}" has been deleted successfully`,
      });

      // Refresh expenses list
      await fetchExpenses();
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    } catch (error: any) {
      console.error("Error deleting expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete expense",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Expenses</h1>
          <p className="text-muted-foreground">
            Manage and track your expense submissions
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {userRole === "admin" && (
            <Button variant="outline" onClick={exportExpenses}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          {(userRole === "employee" || userRole === "admin" || userRole === "engineer" || (userRole === "cashier" && allowCashierExpenseSubmission === true)) && (
            <Button onClick={() => navigate("/expenses/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          )}
          {(userRole === "engineer" || userRole === "employee" || userRole === "cashier") && (
            <Dialog open={returnMoneyDialogOpen} onOpenChange={setReturnMoneyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return Money
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Return Money</DialogTitle>
                  <DialogDescription>
                    {userRole === "cashier" 
                      ? "Return money to admin. The amount will be deducted from your balance and added to an admin's account."
                      : "Return money to cashier. The amount will be deducted from your balance and added to a cashier's account."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="return-amount">Amount to Return (INR)</Label>
                    <Input
                      id="return-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={returnAmount}
                      onChange={(e) => setReturnAmount(e.target.value)}
                      placeholder="0.00"
                    />
                    {userBalance !== null && (
                      <p className="text-sm text-muted-foreground">
                        Your current balance: <span className="font-semibold">{formatINR(userBalance)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReturnMoneyDialogOpen(false);
                      setReturnAmount("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleReturnMoney} disabled={returningMoney || !returnAmount}>
                    {returningMoney ? "Returning..." : "Return Money"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or destination..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trip_start">Date of Expense</SelectItem>
                  <SelectItem value="created_at">Date Created</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="destination">Destination</SelectItem>
                  <SelectItem value="total_amount">Amount</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
          <CardDescription>View and manage your expense claims</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground">
              No expenses yet. Create your first expense claim to get started.
            </p>
          ) : filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground">
              No expenses match your current filters. Try adjusting your search criteria.
            </p>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {filteredExpenses.length} of {expenses.length} expenses
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[80px] whitespace-nowrap">Txn #</TableHead>
                        <TableHead className="min-w-[140px] sm:min-w-[140px]">Title / Destination</TableHead>
                        <TableHead className="w-[140px] max-w-[140px] hidden sm:table-cell">Destination</TableHead>
                        <TableHead className="min-w-[90px] whitespace-nowrap">Amount</TableHead>
                        <TableHead className="min-w-[100px] hidden sm:table-cell">Status</TableHead>
                        <TableHead className="min-w-[100px] hidden sm:table-cell">Expense Date</TableHead>
                        <TableHead className="text-right min-w-[120px]">Status / Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-xs sm:text-sm font-mono font-semibold text-blue-600 whitespace-nowrap">
                      {(expense as any).transaction_number || '-'}
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      <div className="font-medium">{expense.title}</div>
                      <div className="text-xs text-muted-foreground sm:hidden mt-1">{expense.destination}</div>
                      <div className="text-xs text-muted-foreground sm:hidden mt-1">
                        {format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}
                      </div>
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
                    <TableCell className="whitespace-nowrap text-xs sm:text-sm hidden sm:table-cell">
                      {format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col sm:flex-row items-end gap-2 sm:gap-0">
                        <div className="sm:hidden">
                          {(expense as any).isResubmitted && expense.status === "submitted" ? (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              Resubmitted
                            </Badge>
                          ) : (
                            <StatusBadge status={expense.status as any} />
                          )}
                        </div>
                        <div className="flex justify-end shrink-0 gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 px-2 text-xs font-normal whitespace-nowrap"
                            onClick={() => navigate(`/expenses/${expense.id}`)}
                          >
                            View
                          </Button>
                          {(expense.status === "submitted" || expense.status === "rejected") && (userRole !== "cashier" || (userRole === "cashier" && allowCashierExpenseSubmission === true && expense.user_id === user?.id)) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">More actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/expenses/${expense.id}/edit`)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  {expense.status === "rejected" ? "Edit & Resubmit" : "Edit"}
                                </DropdownMenuItem>
                                {expense.status === "submitted" && (
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setExpenseToDelete(expense);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
              </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Expense Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the expense "{expenseToDelete?.title}"?
              <br /><br />
              This action cannot be undone. All attachments and related data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setExpenseToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
