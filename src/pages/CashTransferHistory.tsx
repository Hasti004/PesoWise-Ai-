import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ArrowDown, ArrowUp } from "lucide-react";
import { formatINR } from "@/lib/format";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CashTransfer {
  id: string;
  transferrer_id: string;
  transferrer_name?: string;
  transferrer_role: string;
  recipient_id: string;
  recipient_name?: string;
  recipient_role: string;
  amount: number;
  transfer_type: string;
  transferred_at: string;
  notes?: string;
}

export default function CashTransferHistory() {
  const { user, userRole, organizationId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [filteredTransfers, setFilteredTransfers] = useState<CashTransfer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  useEffect(() => {
    if (user && organizationId && (userRole === "admin" || userRole === "cashier")) {
      fetchTransfers();
    }
  }, [user, userRole, organizationId]);

  useEffect(() => {
    applyFilters();
  }, [transfers, searchTerm, filterType, filterRole]);

  const applyFilters = () => {
    let filtered = [...transfers];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.transferrer_name?.toLowerCase().includes(search) ||
          t.recipient_name?.toLowerCase().includes(search) ||
          t.transfer_type.toLowerCase().includes(search)
      );
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter((t) => t.transfer_type === filterType);
    }

    // Role filter
    if (filterRole !== "all") {
      if (userRole === "cashier") {
        // Cashiers can filter by recipient role
        filtered = filtered.filter((t) => t.recipient_role === filterRole);
      } else {
        // Admins can filter by transferrer or recipient role
        filtered = filtered.filter(
          (t) => t.transferrer_role === filterRole || t.recipient_role === filterRole
        );
      }
    }

    setFilteredTransfers(filtered);
  };

  const fetchTransfers = async () => {
    if (!user?.id || !organizationId) return;
    try {
      setLoading(true);
      
      let query = supabase
        .from("cash_transfer_history")
        .select("*")
        .eq("organization_id", organizationId)
        .order("transferred_at", { ascending: false });

      // Cashiers can only see their own transfers
      if (userRole === "cashier") {
        query = query.or(`transferrer_id.eq.${user.id},recipient_id.eq.${user.id}`);
      }
      // Admins can see all transfers

      const { data, error } = await query;

      if (error) {
        if (error.code === "PGRST205" || error.message?.includes("does not exist") || error.message?.includes("relation") || error.code === "42P01") {
          console.warn("cash_transfer_history table does not exist yet. Please run migration: 20250129000000_create_cash_transfer_history.sql", error);
          setTransfers([]);
          setFilteredTransfers([]);
          return;
        }
        throw error;
      }

      const typedTransfers = (data || []) as any[];

      // Fetch names for transferrers and recipients
      const userIds = new Set<string>();
      typedTransfers.forEach((t) => {
        userIds.add(t.transferrer_id);
        userIds.add(t.recipient_id);
      });

      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .eq("organization_id", organizationId)
          .in("user_id", Array.from(userIds));

        const nameMap = new Map(profiles?.map((p) => [p.user_id, p.name]) || []);

        const transfersWithNames: CashTransfer[] = typedTransfers.map((t) => ({
          id: t.id,
          transferrer_id: t.transferrer_id,
          transferrer_name: nameMap.get(t.transferrer_id) || "Unknown",
          transferrer_role: t.transferrer_role,
          recipient_id: t.recipient_id,
          recipient_name: nameMap.get(t.recipient_id) || "Unknown",
          recipient_role: t.recipient_role,
          amount: Number(t.amount),
          transfer_type: t.transfer_type,
          transferred_at: t.transferred_at,
          notes: t.notes || undefined,
        }));

        setTransfers(transfersWithNames);
      } else {
        setTransfers([]);
      }
    } catch (error: any) {
      console.error("Error fetching transfer history:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to load transfer history.",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTransferTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      admin_to_cashier: "Admin → Cashier",
      admin_to_employee: "Admin → Employee",
      admin_to_engineer: "Admin → Manager",
      cashier_to_employee: "Cashier → Employee",
      cashier_to_engineer: "Cashier → Manager",
    };
    return labels[type] || type;
  };

  const exportToCSV = () => {
    const csvRows = [
      ["Date", "Transferrer", "Transferrer Role", "Recipient", "Recipient Role", "Amount", "Type", "Notes"].join(","),
      ...filteredTransfers.map((t) => {
        const row = [
          format(new Date(t.transferred_at), "yyyy-MM-dd HH:mm:ss"),
          `"${t.transferrer_name || "Unknown"}"`,
          t.transferrer_role,
          `"${t.recipient_name || "Unknown"}"`,
          t.recipient_role,
          t.amount,
          getTransferTypeLabel(t.transfer_type),
          t.notes ? `"${t.notes.replace(/"/g, '""')}"` : "",
        ];
        return row.join(",");
      }),
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cash-transfer-history-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: "Transfer history has been exported to CSV.",
    });
  };

  if (userRole !== "admin" && userRole !== "cashier") {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              This page is only accessible to administrators and cashiers.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cash Transfer History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View complete history of all cash transfers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTransfers}
            disabled={loading}
            className="whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={loading || filteredTransfers.length === 0}
            className="whitespace-nowrap"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input
                placeholder="Search by name or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Transfer Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="admin_to_cashier">Admin → Cashier</SelectItem>
                  <SelectItem value="admin_to_employee">Admin → Employee</SelectItem>
                  <SelectItem value="admin_to_engineer">Admin → Manager</SelectItem>
                  <SelectItem value="cashier_to_employee">Cashier → Employee</SelectItem>
                  <SelectItem value="cashier_to_engineer">Cashier → Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Role</label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="engineer">Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer History</CardTitle>
          <CardDescription>
            {filteredTransfers.length} transfer{filteredTransfers.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-gray-600">Loading...</span>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No transfers found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date & Time</TableHead>
                    <TableHead className="whitespace-nowrap">From</TableHead>
                    <TableHead className="whitespace-nowrap">To</TableHead>
                    <TableHead className="whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(transfer.transferred_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium truncate max-w-[150px]">
                            {transfer.transferrer_name || "Unknown"}
                          </div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {transfer.transferrer_role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium truncate max-w-[150px]">
                            {transfer.recipient_name || "Unknown"}
                          </div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {transfer.recipient_role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatINR(transfer.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {getTransferTypeLabel(transfer.transfer_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {transfer.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

