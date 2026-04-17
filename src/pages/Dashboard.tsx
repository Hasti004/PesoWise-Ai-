import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Coins, Clock, CheckCircle, XCircle, TrendingUp, Users, Receipt, Wallet, Bell, CheckCircle as CheckCircleIcon, XCircle as XCircleIcon, AlertCircle, ArrowRight, UserPlus, ArrowLeft } from "lucide-react";
import { formatINR } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAllowCashierExpenseSubmission } from "@/hooks/useAllowCashierExpenseSubmission";

interface DashboardStats {
  totalExpenses: number;
  pendingAmount: number;
  approvedAmount: number;
  currentBalance: number;
  pendingReviews?: number;
  pendingReviewsAmount?: number;
  pendingApprovals?: number;
  pendingApprovalsAmount?: number;
  totalEmployeeBalance?: number;
  totalEngineerBalance?: number;
  totalCashierBalance?: number;
}

interface Notification {
  id: string;
  type: "expense_submitted" | "expense_approved" | "expense_rejected" | "expense_assigned" | "expense_verified" | "balance_added";
  title: string;
  message: string;
  expense_id: string | null;
  expense_title?: string;
  created_at: string;
  read: boolean;
}

export default function Dashboard() {
  const { user, userRole, organizationId } = useAuth();
  const { allowCashierExpenseSubmission } = useAllowCashierExpenseSubmission();
  const navigate = useNavigate();

  // Master admins use the dedicated Master Admin Dashboard
  useEffect(() => {
    if (userRole === "master_admin") {
      navigate("/master", { replace: true });
    }
  }, [userRole, navigate]);

  const [stats, setStats] = useState<DashboardStats>({
    totalExpenses: 0,
    pendingAmount: 0,
    approvedAmount: 0,
    currentBalance: 0,
    pendingReviews: 0,
    pendingReviewsAmount: 0,
    pendingApprovals: 0,
    pendingApprovalsAmount: 0,
    totalEmployeeBalance: 0,
    totalEngineerBalance: 0,
    totalCashierBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [returnMoneyDialogOpen, setReturnMoneyDialogOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [returningMoney, setReturningMoney] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [returnRequests, setReturnRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (userRole === "master_admin") return; // redirecting to /master
    if (user) {
      if (userRole === "admin" && !organizationId) return;
      try {
        fetchStats();
        fetchNotifications();
        if (userRole === "employee" || userRole === "engineer" || userRole === "cashier") {
          fetchUserBalance();
        }
        if (userRole === "cashier") {
          fetchReturnRequests();
        }
      } catch (error) {
        console.error("Error in Dashboard useEffect:", error);
        // Don't crash the page, just log the error
      }
    }
  }, [user, userRole, organizationId]);

  const fetchReturnRequests = async () => {
    if (!user?.id || userRole !== "cashier") return;
    try {
      setLoadingRequests(true);
      // Try to import the service, but don't crash if it fails
      try {
        const { MoneyReturnService } = await import("@/services/MoneyReturnService");
        const requests = await MoneyReturnService.getPendingRequests(user.id);
        
        // Fetch requester names for all requests
        const requesterIds = requests.map(r => r.requester_id);
        if (requesterIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, name")
            .in("user_id", requesterIds);
          
          const nameMap = new Map(profiles?.map(p => [p.user_id, p.name]) || []);
          const requestsWithNames = requests.map(r => ({
            ...r,
            requesterName: nameMap.get(r.requester_id) || "Unknown"
          }));
          setReturnRequests(requestsWithNames);
        } else {
          setReturnRequests(requests);
        }
      } catch (importError) {
        // If the service or table doesn't exist yet, just set empty array
        console.warn("MoneyReturnService not available yet:", importError);
        setReturnRequests([]);
      }
    } catch (error) {
      console.error("Error fetching return requests:", error);
      setReturnRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!user?.id) return;
    try {
      setLoadingRequests(true);
      try {
        const { MoneyReturnService } = await import("@/services/MoneyReturnService");
        await MoneyReturnService.approveReturnRequest(requestId, user.id);
        toast({
          title: "Request Approved",
          description: "Money has been transferred successfully.",
        });
        fetchReturnRequests();
        fetchUserBalance();
        fetchStats();
      } catch (importError: any) {
        toast({
          variant: "destructive",
          title: "Error",
          description: importError.message || "Service not available. Please ensure the database migration has been run.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve request.",
      });
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleRejectRequest = async (requestId: string, reason?: string) => {
    if (!user?.id) return;
    try {
      setLoadingRequests(true);
      try {
        const { MoneyReturnService } = await import("@/services/MoneyReturnService");
        await MoneyReturnService.rejectReturnRequest(requestId, user.id, reason);
        toast({
          title: "Request Rejected",
          description: "The return request has been rejected.",
        });
        fetchReturnRequests();
      } catch (importError: any) {
        toast({
          variant: "destructive",
          title: "Error",
          description: importError.message || "Service not available. Please ensure the database migration has been run.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject request.",
      });
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchUserBalance = async () => {
    try {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      setUserBalance(data?.balance ?? 0);
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    try {
      console.log('🔄 Initializing dashboard notification subscription...');
      const cleanup = setupRealtimeSubscription();
      
      // Polling fallback - check for new notifications every 5 seconds
      // This ensures notifications appear even if realtime isn't working
      const pollInterval = setInterval(() => {
        try {
          console.log('🔄 Polling for new notifications...');
          fetchNotifications();
        } catch (error) {
          console.warn("Error polling notifications:", error);
        }
      }, 5000); // Poll every 5 seconds

      // Set up real-time balance subscription for employees, engineers, and cashiers
      let balanceCleanup = () => {};
      if (userRole === "employee" || userRole === "engineer" || userRole === "cashier") {
        try {
          balanceCleanup = setupBalanceRealtimeSubscription();
        } catch (error) {
          console.warn("Could not set up balance subscription:", error);
        }
      }

      // Set up real-time subscription for return requests (cashiers only)
      let requestsCleanup = () => {};
      if (userRole === "cashier") {
        try {
          const requestsChannel = supabase
            .channel(`cashier-return-requests-${user.id}`)
            .on('postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'money_return_requests',
                filter: `cashier_id=eq.${user.id}`
              },
              () => {
                console.log('Return request updated, refreshing...');
                fetchReturnRequests();
              }
            )
            .subscribe();
          
          requestsCleanup = () => {
            try {
              supabase.removeChannel(requestsChannel);
            } catch (error) {
              console.warn("Error removing requests channel:", error);
            }
          };
        } catch (error) {
          console.warn("Could not set up return requests subscription:", error);
        }
      }

      return () => {
        try {
          console.log('Cleaning up dashboard subscription and polling');
          cleanup();
          clearInterval(pollInterval);
          balanceCleanup();
          requestsCleanup();
        } catch (error) {
          console.warn("Error during cleanup:", error);
        }
      };
    } catch (error) {
      console.error("Error setting up dashboard subscriptions:", error);
      // Return empty cleanup function to prevent errors
      return () => {};
    }
  }, [user?.id, userRole]);

  const fetchStats = async () => {
    try {
      // For admins, fetch ALL expenses. For others, fetch only their expenses
      let expenses: any[] = [];
      if (userRole === "admin") {
        const { data: allExpenses, error: expensesError } = await supabase
          .from("expenses")
          .select("*");
        
        if (expensesError) throw expensesError;
        expenses = allExpenses || [];
      } else {
        const { data: userExpenses, error: expensesError } = await supabase
          .from("expenses")
          .select("*")
          .eq("user_id", user?.id);
        
        if (expensesError) throw expensesError;
        expenses = userExpenses || [];
      }

      // Fetch user profile for balance
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user?.id)
        .single();

      if (profileError) throw profileError;

      // For managers, fetch expenses assigned to them that need review
      // Using the same logic as ManagerReview page - only count "submitted" status for pending reviews
      let pendingReviews = 0;
      let pendingReviewsAmount = 0;
      
      if (userRole === "engineer" && user?.id) {
        const { data: assignedExpenses, error: assignedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("assigned_engineer_id", user.id)
          .eq("status", "submitted"); // Only "submitted" status counts as pending review

        if (assignedError) {
          console.error("Error fetching assigned expenses:", assignedError);
        } else {
          // Filter to only count "submitted" expenses (same as ManagerReview page)
          const pendingExpenses = assignedExpenses?.filter(e => e.status === "submitted") || [];
          pendingReviews = pendingExpenses.length;
          pendingReviewsAmount = pendingExpenses.reduce(
            (sum, e) => sum + Number(e.total_amount || 0),
            0
          );
        }
      }

      // For admins, fetch expenses that need approval
      // This includes: submitted expenses with no engineer assigned, and verified expenses
      let pendingApprovals = 0;
      let pendingApprovalsAmount = 0;
      
      // Initialize balance totals (for admin only)
      let totalEmployeeBalance = 0;
      let totalEngineerBalance = 0;
      let totalCashierBalance = 0;
      
      if (userRole === "admin") {
        // Fetch expenses that need admin approval:
        // 1. Verified expenses (need admin approval)
        const { data: verifiedExpenses, error: verifiedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("status", "verified");

        // 2. Submitted expenses with no assigned engineer (go directly to admin)
        const { data: submittedExpenses, error: submittedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("status", "submitted")
          .is("assigned_engineer_id", null);

        if (verifiedError || submittedError) {
          console.error("Error fetching pending approvals:", verifiedError || submittedError);
        } else {
          // Combine both types of expenses
          const allPendingExpenses = [
            ...(verifiedExpenses || []),
            ...(submittedExpenses || [])
          ];
          
          // Deduplicate by expense ID
          const uniqueExpenses = Array.from(
            new Map(allPendingExpenses.map(exp => [exp.id, exp])).values()
          );
          
          pendingApprovals = uniqueExpenses.length;
          pendingApprovalsAmount = uniqueExpenses.reduce(
            (sum, e) => sum + Number(e.total_amount || 0),
            0
          );
        }

        // Calculate total balances from profiles (actual wallet balances) grouped by org role
        try {
          if (!organizationId) throw new Error("Organization not found for balance totals");

          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id, balance")
            .eq("organization_id", organizationId);

          if (profilesError) throw profilesError;

          const profileIds = (profilesData || []).map((p) => p.user_id);
          if (profileIds.length > 0) {
            const { data: membershipsData, error: membershipsError } = await supabase
              .from("organization_memberships")
              .select("user_id, role")
              .eq("organization_id", organizationId)
              .eq("is_active", true)
              .in("user_id", profileIds);

            if (membershipsError) throw membershipsError;

            const roleByUserId = new Map((membershipsData || []).map((m) => [m.user_id, m.role]));

            (profilesData || []).forEach((profile) => {
              const role = roleByUserId.get(profile.user_id);
              const balance = Number(profile.balance || 0);

              if (role === "employee") {
                totalEmployeeBalance += balance;
              } else if (role === "engineer") {
                totalEngineerBalance += balance;
              } else if (role === "cashier") {
                totalCashierBalance += balance;
              }
            });
          }
        } catch (error) {
          console.error("Error calculating role balance totals:", error);
        }
      }

      // Calculate totals from expenses
      const totalExpensesAmount = expenses.reduce(
        (sum, e) => sum + Number(e.total_amount || 0),
        0
      );
      
      const pendingAmountTotal = expenses
        .filter((e) => ["submitted", "verified"].includes(e.status))
        .reduce((sum, e) => sum + Number(e.total_amount || 0), 0);

      const stats: DashboardStats = {
        totalExpenses: userRole === "admin" ? totalExpensesAmount : expenses.length,
        pendingAmount: pendingAmountTotal,
        approvedAmount: expenses
          .filter((e) => e.status === "approved")
          .reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
        currentBalance: profile?.balance ?? 0,
        pendingReviews,
        pendingReviewsAmount,
        pendingApprovals,
        pendingApprovalsAmount,
        totalEmployeeBalance: userRole === "admin" ? totalEmployeeBalance : undefined,
        totalEngineerBalance: userRole === "admin" ? totalEngineerBalance : undefined,
        totalCashierBalance: userRole === "admin" ? totalCashierBalance : undefined,
      };

      setStats(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      if (!user?.id) return;

      // Fetch 2 most recent notifications
      const { data: notificationsData, error: notificationsError } = await supabase
        .from("notifications")
        .select(`
          *,
          expenses(title)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);

      if (notificationsError) {
        console.error("Error fetching notifications:", notificationsError);
        return;
      }

      // Convert to notification format
      const notificationData = (notificationsData || []).map(notif => ({
        id: notif.id,
        type: notif.type as Notification["type"],
        title: notif.title,
        message: notif.message,
        expense_id: notif.expense_id || null,
        expense_title: notif.expenses?.title || "",
        created_at: notif.created_at,
        read: notif.read,
      }));

      // Only update if notifications actually changed to avoid unnecessary re-renders
      setNotifications(prev => {
        const prevIds = prev.map(n => n.id).sort().join(',');
        const newIds = notificationData.map(n => n.id).sort().join(',');
        if (prevIds !== newIds) {
          console.log('📬 Dashboard: New notifications detected, updating...');
          return notificationData;
        }
        return prev;
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user?.id) {
      console.log('No user ID, skipping dashboard subscription');
      return () => {};
    }

    console.log('Setting up dashboard notification subscription for user:', user.id);

    // Remove any existing channel with the same name first
    const channelName = `dashboard-notifications-${user.id}`;
    const existingChannel = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`);
    if (existingChannel) {
      console.log('Removing existing dashboard channel:', channelName);
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, 
        (payload) => {
          console.log('✅ Dashboard: New notification received via realtime:', payload);
          // Immediately update notifications state
          const newNotif = payload.new as any;
          const notification: Notification = {
            id: newNotif.id,
            type: newNotif.type,
            title: newNotif.title,
            message: newNotif.message,
            expense_id: newNotif.expense_id || null,
            created_at: newNotif.created_at,
            read: newNotif.read || false,
          };
          
          setNotifications(prev => {
            // Check if notification already exists
            if (prev.some(n => n.id === notification.id)) {
              return prev;
            }
            // Add new notification at the beginning, keep only 2 most recent
            console.log('📬 Dashboard: Adding new notification to state:', notification);
            return [notification, ...prev].slice(0, 2);
          });
          
          fetchNotifications(); // Also fetch to get expense title and ensure consistency
          fetchStats(); // Also refresh stats when new notification arrives
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Dashboard: Notification updated:', payload);
          fetchNotifications();
        }
      )
      .subscribe((status) => {
        console.log('📡 Dashboard notification subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Dashboard: Successfully subscribed to notifications');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Avoid recursive re-subscribe loops; polling fallback in useEffect already keeps data fresh.
          console.error('❌ Dashboard: Realtime channel issue. Falling back to polling.');
        }
      });

      return () => {
        console.log('Cleaning up dashboard notification subscription');
        supabase.removeChannel(channel);
      };
    };

  const setupBalanceRealtimeSubscription = () => {
    if (!user?.id) return () => {};

    console.log('Setting up balance real-time subscription for user:', user.id);

    const channel = supabase
      .channel(`dashboard-balance-${user.id}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('✅ Dashboard: Balance updated via realtime:', payload);
          const newBalance = (payload.new as any)?.balance ?? 0;
          setUserBalance(newBalance);
          fetchStats(); // Also refresh stats to update balance display
        }
      )
      .subscribe((status) => {
        console.log('📡 Dashboard balance subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Dashboard: Successfully subscribed to balance updates');
        }
      });

    return () => {
      console.log('Cleaning up dashboard balance subscription');
      supabase.removeChannel(channel);
    };
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

      // For employees and engineers, find their assigned cashier
      let targetUserId: string | null = null;

      if (userRole === "employee" || userRole === "engineer") {
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
            toast({
              variant: "destructive",
              title: "No Manager Assigned",
              description: "You don't have a manager assigned. Please contact an administrator.",
            });
            setReturningMoney(false);
            return;
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
          toast({
            variant: "destructive",
            title: "No Cashier Assigned",
            description: "Your manager doesn't have a cashier assigned. Please contact an administrator.",
          });
          setReturningMoney(false);
          return;
        }

        targetUserId = cashierUserId;
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Operation",
          description: "Return money is only available for employees and engineers.",
        });
        setReturningMoney(false);
        return;
      }

      if (!targetUserId) {
        throw new Error("Target cashier not found");
      }

      // Create a return request (requires cashier approval)
      const { MoneyReturnService } = await import("@/services/MoneyReturnService");
      await MoneyReturnService.createReturnRequest(user.id, targetUserId, amount);

      // Refresh balance and stats (request doesn't change balance yet)
      fetchUserBalance();
      fetchStats();

      // Update local state
      setReturnAmount("");
      setReturnMoneyDialogOpen(false);

      toast({
        title: "Return Request Submitted",
        description: `Your return request of ${formatINR(amount)} has been sent to your cashier for approval. You will be notified once it's approved.`,
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

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
      case "balance_added":
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case "expense_rejected":
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      case "expense_submitted":
      case "expense_assigned":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "expense_verified":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Bell className="h-5 w-5 text-gray-600" />;
    }
  };

  const getNotificationBgColor = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
      case "balance_added":
        return "bg-green-50 border-green-200";
      case "expense_rejected":
        return "bg-red-50 border-red-200";
      case "expense_submitted":
      case "expense_assigned":
        return "bg-blue-50 border-blue-200";
      case "expense_verified":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-white border-gray-200";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.expense_id) {
      navigate(`/expenses/${notification.expense_id}`);
    }
  };

  const statCards: Array<{
    title: string;
    value: string | number;
    icon: any;
    description: string;
    highlight: boolean;
    onClick?: () => void;
  }> = [
    {
      title: "Current Balance",
      value: formatINR(stats.currentBalance),
      icon: Wallet,
      description: "Available balance",
      highlight: true,
    },
    {
      title: "Total Expenses",
      value: userRole === "admin" ? formatINR(stats.totalExpenses as number) : stats.totalExpenses,
      icon: Coins,
      description: userRole === "admin" ? "Total amount of all expenses" : "All time expenses",
      highlight: false,
    },
    ...(userRole === "engineer" && stats.pendingReviews !== undefined
      ? [
          {
            title: "Pending Reviews",
            value: stats.pendingReviews,
            icon: Clock,
            description: `${formatINR(stats.pendingReviewsAmount || 0)} to review`,
            highlight: stats.pendingReviews > 0,
            onClick: () => navigate("/review"),
          },
        ]
      : []),
    ...(userRole === "admin" && stats.pendingApprovals !== undefined
      ? [
          {
            title: "Pending Approvals",
            value: stats.pendingApprovals,
            icon: Clock,
            description: `${formatINR(stats.pendingApprovalsAmount || 0)} to approve`,
            highlight: stats.pendingApprovals > 0,
            onClick: () => navigate("/admin/expenses"),
          },
        ]
      : []),
    {
      title: "Pending Amount",
      value: formatINR(stats.pendingAmount),
      icon: Clock,
      description: "Awaiting approval",
      highlight: false,
    },
    // Add total balance cards for admin
    ...(userRole === "admin" && stats.totalEmployeeBalance !== undefined
      ? [
          {
            title: "Total Employee Balance",
            value: formatINR(stats.totalEmployeeBalance),
            icon: Wallet,
            description: "All employees",
            highlight: true,
          },
        ]
      : []),
    ...(userRole === "admin" && stats.totalEngineerBalance !== undefined
      ? [
          {
            title: "Total Manager Balance",
            value: formatINR(stats.totalEngineerBalance),
            icon: Wallet,
            description: "All managers",
            highlight: true,
          },
        ]
      : []),
    ...(userRole === "admin" && stats.totalCashierBalance !== undefined
      ? [
          {
            title: "Total Cashier Balance",
            value: formatINR(stats.totalCashierBalance),
            icon: Wallet,
            description: "All cashiers",
            highlight: true,
          },
        ]
      : []),
  ];

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Welcome back! Here's an overview of your expenses.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-2 text-gray-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Mobile-optimized Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight whitespace-nowrap">Dashboard</h1>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground whitespace-nowrap mt-1">
            Welcome back! Here's an overview of your expenses.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(userRole === "employee" || userRole === "admin" || userRole === "engineer" || (userRole === "cashier" && allowCashierExpenseSubmission === true)) && (
              <>
              <Button 
                onClick={() => navigate("/expenses/new")}
                className="whitespace-nowrap"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
                </Button>
                {(userRole === "employee" || userRole === "engineer") && (
                  <Button 
                    onClick={() => setReturnMoneyDialogOpen(true)}
                    className="whitespace-nowrap"
                    variant="outline"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return Money
                  </Button>
                )}
              </>
            )}
            {userRole === "admin" && (
              <Button 
                onClick={() => {
                  navigate("/admin/users");
                  setTimeout(() => {
                    const element = document.getElementById('create-user-section');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 100);
                }}
                className="whitespace-nowrap"
                variant="outline"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            )}
            {userRole === "engineer" && (
              <Button 
                onClick={() => navigate("/review")}
                className="whitespace-nowrap"
                variant="outline"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve Expense
              </Button>
            )}
            {(userRole === "admin" || userRole === "cashier") && (
              <Button 
                onClick={() => navigate("/balances")}
                className="whitespace-nowrap"
                variant="outline"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Add Balance
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile-optimized Stats Grid */}
      <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isPendingReviews = card.title === "Pending Reviews";
          const isPendingApprovals = card.title === "Pending Approvals";
          const isTotalBalance = card.title === "Total Employee Balance" || card.title === "Total Manager Balance" || card.title === "Total Cashier Balance";
          return (
            <Card 
              key={card.title} 
              className={`hover:shadow-md transition-all ${
                card.onClick ? 'cursor-pointer hover:scale-[1.02]' : ''
              } ${
                card.highlight 
                  ? isPendingReviews || isPendingApprovals
                    ? 'border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50'
                    : isTotalBalance
                    ? 'border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                    : 'border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                  : ''
              }`}
              onClick={card.onClick}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 gap-2">
                <CardTitle className={`text-xs sm:text-sm md:text-base font-medium truncate flex-1 min-w-0 ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-700' : 'text-green-700'
                    : ''
                }`}>
                  {card.title}
                </CardTitle>
                <Icon 
                  className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ml-1 ${
                    card.highlight 
                      ? isPendingReviews || isPendingApprovals ? 'text-blue-600' : 'text-green-600'
                      : 'text-muted-foreground'
                  } ${card.onClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    if (card.onClick) {
                      e.stopPropagation();
                      card.onClick();
                    }
                  }}
                />
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
                {isTotalBalance ? (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                      card.title === "Total Employee Balance" 
                        ? 'bg-green-100' 
                        : card.title === "Total Manager Balance"
                        ? 'bg-blue-100'
                        : 'bg-purple-100'
                    }`}>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-600' 
                          : card.title === "Total Manager Balance"
                          ? 'text-blue-600'
                          : 'text-purple-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className={`text-base sm:text-lg md:text-xl lg:text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-700' 
                          : card.title === "Total Manager Balance"
                          ? 'text-blue-700'
                          : 'text-purple-700'
                      }`}>
                        {card.value}
                      </div>
                      <p className={`text-xs sm:text-sm mt-1 truncate ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-600' 
                          : card.title === "Total Manager Balance"
                          ? 'text-blue-600'
                          : 'text-purple-600'
                      }`}>
                        {card.description}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                <div className={`text-base sm:text-lg md:text-xl lg:text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-800' : 'text-green-800'
                    : card.title === "Current Balance" && typeof card.value === 'string' && card.value.includes('-')
                    ? 'text-red-600'
                    : ''
                }`}>
                  {card.value}
                </div>
                <p className={`text-xs sm:text-sm mt-1 truncate ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-600' : 'text-green-600'
                    : 'text-muted-foreground'
                }`}>
                  {card.description}
                </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live Notifications Section */}
      <Card>
        <CardHeader className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6">
          <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2 whitespace-nowrap">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            Live Notifications
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm whitespace-nowrap">Your most recent notifications</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
          {notifications.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted-foreground text-center py-4 whitespace-nowrap">
              No notifications yet. You'll see your latest notifications here.
            </p>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={cn(
                    "cursor-pointer hover:shadow-md transition-all",
                    getNotificationBgColor(notification.type),
                    !notification.read && "ring-2 ring-blue-400"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-xs sm:text-sm text-gray-900 truncate">
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <span className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 sm:mt-2 whitespace-nowrap">
                              {format(new Date(notification.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          {notification.expense_id && (
                            <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {notifications.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <Button
                variant="link"
                className="p-0 h-auto text-sm w-full justify-center"
                onClick={() => navigate("/notifications")}
              >
                View All Notifications
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile-optimized Recent Activity */}
      <Card>
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl">Recent Activity</CardTitle>
          <CardDescription className="text-sm">Your latest expense submissions</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <p className="text-sm text-muted-foreground">
            View your recent expenses in the{" "}
            <Button
              variant="link"
              className="p-0 h-auto text-sm"
              onClick={() => navigate("/expenses")}
            >
              My Expenses
            </Button>{" "}
            section.
          </p>
        </CardContent>
      </Card>

      {/* Cashier: Return Money Requests */}
      {userRole === "cashier" && (
        <Card>
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-lg sm:text-xl">Pending Return Requests</CardTitle>
            <CardDescription className="text-sm">Approve or reject money return requests from employees and managers</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {loadingRequests ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-2 text-sm text-gray-600">Loading requests...</span>
              </div>
            ) : returnRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pending return requests
              </p>
            ) : (
              <div className="space-y-3">
                {returnRequests.map((request: any) => (
                  <Card key={request.id} className="border-2 border-blue-200">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm text-gray-900 truncate">
                              {request.requesterName || "Unknown"}
                            </h4>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              wants to return
                            </span>
                          </div>
                          <p className="text-lg font-bold text-blue-600">
                            {formatINR(Number(request.amount))}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Requested {format(new Date(request.requested_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = prompt("Enter rejection reason (optional):");
                              handleRejectRequest(request.id, reason || undefined);
                            }}
                            disabled={loadingRequests}
                            className="whitespace-nowrap"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApproveRequest(request.id)}
                            disabled={loadingRequests}
                            className="whitespace-nowrap"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Return Money Dialog */}
      {(userRole === "employee" || userRole === "engineer") && (
        <Dialog open={returnMoneyDialogOpen} onOpenChange={setReturnMoneyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Return Money</DialogTitle>
              <DialogDescription>
                Return money to your assigned cashier. Your current balance: {formatINR(userBalance ?? 0)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="returnAmount">Amount to Return</Label>
                <Input
                  id="returnAmount"
                  type="number"
                  placeholder="0.00"
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  disabled={returningMoney}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReturnMoneyDialogOpen(false);
                  setReturnAmount("");
                }}
                disabled={returningMoney}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReturnMoney}
                disabled={returningMoney || !returnAmount || parseFloat(returnAmount) <= 0}
              >
                {returningMoney ? "Returning..." : "Return Money"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
