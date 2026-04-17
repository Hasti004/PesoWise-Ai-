import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, TrendingUp, Coins, Clock3, CheckCircle2, XCircle } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
} from "recharts";

interface ExpenseAnalytics {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  medianAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  approvalRate: number;
  rejectionRate: number;
  avgResolutionHours: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  destinationBreakdown: Array<{
    destination: string;
    amount: number;
    count: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  monthlyStatusTrend: Array<{
    month: string;
    submitted: number;
    under_review: number;
    verified: number;
    approved: number;
    rejected: number;
    paid: number;
    draft: number;
  }>;
  amountDistribution: Array<{
    bucket: string;
    count: number;
  }>;
  weekdayTrend: Array<{
    day: string;
    amount: number;
    count: number;
  }>;
  topSubmitters: Array<{
    name: string;
    count: number;
    amount: number;
  }>;
  cumulativeTrend: Array<{
    month: string;
    cumulativeAmount: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#60a5fa",
  under_review: "#38bdf8",
  verified: "#22c55e",
  approved: "#16a34a",
  rejected: "#ef4444",
  paid: "#8b5cf6",
};

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function bucketForAmount(amount: number): string {
  if (amount < 1000) return "< 1k";
  if (amount < 5000) return "1k - 5k";
  if (amount < 10000) return "5k - 10k";
  if (amount < 25000) return "10k - 25k";
  return "25k+";
}

function truncateLabel(input: string, max = 12): string {
  if (!input) return "";
  return input.length <= max ? input : `${input.slice(0, max)}...`;
}

export default function Analytics() {
  const { user, userRole, organizationId } = useAuth();
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && organizationId) {
      fetchAnalytics();
    }
  }, [user, organizationId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      let expenses: any[] = [];
      const profileNameById = new Map<string, string>();

      // Keep analytics consistent with the all-expenses view: organization scope, all time.
      const { data, error } = await supabase
        .from("expenses")
        .select(`*, expense_line_items(*)`)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      expenses = data || [];

      const userIds = [...new Set(expenses.map((e) => e.user_id).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, name")
          .eq("organization_id", organizationId)
          .in("user_id", userIds);
        (profilesData || []).forEach((p: any) => profileNameById.set(p.user_id, p.name || "Unknown"));
      }

      const totalAmount = expenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const totalCount = expenses.length;
      const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;
      const medianAmount = median(expenses.map((e) => Number(e.total_amount || 0)));

      const approvedExpenses = expenses.filter((e) => e.status === "approved");
      const rejectedExpenses = expenses.filter((e) => e.status === "rejected");
      const reviewedExpenses = expenses.filter((e) => ["approved", "rejected"].includes(e.status));
      const approvedAmount = approvedExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const rejectedAmount = rejectedExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const approvalRate = reviewedExpenses.length > 0 ? (approvedExpenses.length / reviewedExpenses.length) * 100 : 0;
      const rejectionRate = reviewedExpenses.length > 0 ? (rejectedExpenses.length / reviewedExpenses.length) * 100 : 0;

      const resolutionDurations = reviewedExpenses
        .map((e) => {
          const created = new Date(e.created_at).getTime();
          const updated = new Date(e.updated_at || e.created_at).getTime();
          const diffHours = (updated - created) / (1000 * 60 * 60);
          return Number.isFinite(diffHours) && diffHours >= 0 ? diffHours : null;
        })
        .filter((v): v is number => v !== null);
      const avgResolutionHours =
        resolutionDurations.length > 0
          ? resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length
          : 0;

      const categoryMap = new Map<string, { amount: number; count: number }>();
      expenses.forEach((expense) => {
        const category = expense.category || "other";
        const amount = Number(expense.total_amount || 0);
        const current = categoryMap.get(category) || { amount: 0, count: 0 };
        categoryMap.set(category, {
          amount: current.amount + amount,
          count: current.count + 1,
        });
      });

      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        ...data,
      })).sort((a, b) => b.amount - a.amount);

      const monthlyMap = new Map<string, { amount: number; count: number }>();
      const monthlyStatusMap = new Map<string, {
        submitted: number;
        under_review: number;
        verified: number;
        approved: number;
        rejected: number;
        paid: number;
        draft: number;
      }>();
      expenses.forEach((expense) => {
        const date = new Date(expense.created_at);
        const monthKey = monthKeyFromDate(date);
        const amount = Number(expense.total_amount || 0);
        const current = monthlyMap.get(monthKey) || { amount: 0, count: 0 };
        monthlyMap.set(monthKey, {
          amount: current.amount + amount,
          count: current.count + 1,
        });

        const statusCurrent = monthlyStatusMap.get(monthKey) || {
          submitted: 0,
          under_review: 0,
          verified: 0,
          approved: 0,
          rejected: 0,
          paid: 0,
          draft: 0,
        };
        const status = (expense.status || "draft") as keyof typeof statusCurrent;
        if (statusCurrent[status] !== undefined) {
          statusCurrent[status] += 1;
        } else {
          statusCurrent.draft += 1;
        }
        monthlyStatusMap.set(monthKey, statusCurrent);
      });

      const monthlyTrend = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month: formatMonthLabel(new Date(`${month}-01`)), ...data }));

      const monthlyStatusTrend = Array.from(monthlyStatusMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month: formatMonthLabel(new Date(`${month}-01`)), ...data }));

      const destinationMap = new Map<string, { amount: number; count: number }>();
      expenses.forEach((expense) => {
        const destination = expense.destination || "Unknown";
        const amount = Number(expense.total_amount || 0);
        const current = destinationMap.get(destination) || { amount: 0, count: 0 };
        destinationMap.set(destination, {
          amount: current.amount + amount,
          count: current.count + 1,
        });
      });

      const destinationBreakdown = Array.from(destinationMap.entries())
        .map(([destination, data]) => ({ destination, ...data }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      const statusMap = new Map<string, { count: number; amount: number }>();
      expenses.forEach((expense) => {
        const status = (expense.status || "draft").toLowerCase();
        const current = statusMap.get(status) || { count: 0, amount: 0 };
        statusMap.set(status, {
          count: current.count + 1,
          amount: current.amount + Number(expense.total_amount || 0),
        });
      });
      const statusBreakdown = Array.from(statusMap.entries())
        .map(([status, data]) => ({
          status: status.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          ...data,
        }))
        .sort((a, b) => b.count - a.count);

      const distributionBuckets = ["< 1k", "1k - 5k", "5k - 10k", "10k - 25k", "25k+"];
      const distributionMap = new Map<string, number>(distributionBuckets.map((b) => [b, 0]));
      expenses.forEach((e) => {
        const bucket = bucketForAmount(Number(e.total_amount || 0));
        distributionMap.set(bucket, (distributionMap.get(bucket) || 0) + 1);
      });
      const amountDistribution = distributionBuckets.map((bucket) => ({
        bucket,
        count: distributionMap.get(bucket) || 0,
      }));

      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weekdayMap = new Map<string, { amount: number; count: number }>(
        weekdayNames.map((d) => [d, { amount: 0, count: 0 }]),
      );
      expenses.forEach((e) => {
        const d = new Date(e.created_at);
        const day = weekdayNames[d.getDay()];
        const cur = weekdayMap.get(day)!;
        cur.amount += Number(e.total_amount || 0);
        cur.count += 1;
        weekdayMap.set(day, cur);
      });
      const weekdayTrend = weekdayNames.map((day) => ({
        day,
        amount: weekdayMap.get(day)?.amount || 0,
        count: weekdayMap.get(day)?.count || 0,
      }));

      const submitterMap = new Map<string, { name: string; count: number; amount: number }>();
      expenses.forEach((e) => {
        const uid = e.user_id || "unknown";
        const current = submitterMap.get(uid) || {
          name: profileNameById.get(uid) || "Unknown",
          count: 0,
          amount: 0,
        };
        current.count += 1;
        current.amount += Number(e.total_amount || 0);
        submitterMap.set(uid, current);
      });
      const topSubmitters = Array.from(submitterMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

      let running = 0;
      const cumulativeTrend = monthlyTrend.map((m) => {
        running += m.amount;
        return { month: m.month, cumulativeAmount: running };
      });

      setAnalytics({
        totalAmount,
        totalCount,
        averageAmount,
        medianAmount,
        approvedAmount,
        rejectedAmount,
        approvalRate,
        rejectionRate,
        avgResolutionHours,
        categoryBreakdown,
        monthlyTrend,
        destinationBreakdown,
        statusBreakdown,
        monthlyStatusTrend,
        amountDistribution,
        weekdayTrend,
        topSubmitters,
        cumulativeTrend,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load analytics data. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No analytics data available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Organization-wide analytics across all users (all-time).
          </p>
        </div>
        <div className="text-xs text-muted-foreground rounded-md border px-3 py-2 bg-muted/30">
          Scope: All users • All time
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Average: {formatINR(analytics.averageAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalCount}</div>
            <p className="text-xs text-muted-foreground">
              Expenses in this organization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Expense</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.averageAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Per expense submission
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Median Amount</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.medianAmount)}</div>
            <p className="text-xs text-muted-foreground">Middle value all-time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.approvalRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Approved vs reviewed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected Amount</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.rejectedAmount)}</div>
            <p className="text-xs text-muted-foreground">{analytics.rejectionRate.toFixed(1)}% rejection rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution</CardTitle>
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.avgResolutionHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">For approved/rejected</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
            <CardDescription>Expense amount over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatINR(Number(value)), "Amount"]} />
                <Legend />
                <Line type="monotone" dataKey="amount" stroke="#8884d8" name="Amount" />
                <Line type="monotone" dataKey="count" stroke="#22c55e" name="Count" yAxisId={1} />
                <YAxis yAxisId={1} orientation="right" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>Expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {analytics.categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatINR(Number(value))} />
                <Legend formatter={(value) => truncateLabel(String(value), 16)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Expense count by lifecycle status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.statusBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" tickFormatter={(v) => truncateLabel(String(v), 12)} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Amount Distribution</CardTitle>
            <CardDescription>How many expenses fall in each amount bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.amountDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Status Trend</CardTitle>
            <CardDescription>Status flow over all recorded months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={analytics.monthlyStatusTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                {(["submitted", "under_review", "verified", "approved", "rejected", "paid"] as const).map((k) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={STATUS_COLORS[k]} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cumulative Spend</CardTitle>
            <CardDescription>Running total across all recorded data</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={analytics.cumulativeTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatINR(Number(value)), "Cumulative"]} />
                <Area type="monotone" dataKey="cumulativeAmount" stroke="#10b981" fill="#d1fae5" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {analytics.destinationBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Destinations</CardTitle>
              <CardDescription>Expenses by destination</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.destinationBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="destination"
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={70}
                    tickFormatter={(v) => truncateLabel(String(v), 14)}
                  />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatINR(Number(value)), "Amount"]} />
                  <Bar dataKey="amount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Day-of-Week Pattern</CardTitle>
            <CardDescription>When expenses are usually submitted</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={analytics.weekdayTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value, name) => [name === "amount" ? formatINR(Number(value)) : value, name === "amount" ? "Amount" : "Count"]} />
                <Legend />
                <Bar dataKey="count" fill="#6366f1" />
                <Line dataKey="amount" stroke="#ef4444" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {analytics.topSubmitters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Submitters</CardTitle>
            <CardDescription>{userRole === "admin" ? "Highest spenders across all-time data" : "Top submitters across all-time data"}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={analytics.topSubmitters}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  tickFormatter={(v) => truncateLabel(String(v), 12)}
                />
                <YAxis />
                <Tooltip formatter={(value, name) => [name === "amount" ? formatINR(Number(value)) : value, name === "amount" ? "Amount" : "Count"]} />
                <Legend />
                <Bar dataKey="amount" fill="#0ea5e9" name="Amount" />
                <Bar dataKey="count" fill="#a78bfa" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

