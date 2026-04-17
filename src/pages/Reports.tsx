import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Eye, FileText, FileSpreadsheet, FileJson, FileType, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface ExpenseWithUser {
  id: string;
  user_id: string;
  title: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
  trip_start: string;
  trip_end: string;
  category: string | null;
  purpose?: string | null;
  destination?: string | null;
  user_name: string;
  user_email: string;
}

interface UserRow {
  user_id: string;
  name: string;
  email: string;
  balance: number;
  role: string;
}

interface AllocationRecord {
  id: string;
  transferred_at: string;
  amount: number;
  transfer_type: string;
  transferrer_role: string;
}

export default function Reports() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"verification" | "approval" | "detailed">("verification");
  
  // Common filters
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [engineerStatus, setEngineerStatus] = useState<string>("verified");
  const [hoStatus, setHoStatus] = useState<string>("approved");
  
  // Detailed report filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [verificationExpenses, setVerificationExpenses] = useState<ExpenseWithUser[]>([]);
  const [approvalExpenses, setApprovalExpenses] = useState<ExpenseWithUser[]>([]);
  const [detailedExpenses, setDetailedExpenses] = useState<ExpenseWithUser[]>([]);
  const [detailedAllocations, setDetailedAllocations] = useState<AllocationRecord[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTab, setExportTab] = useState<"verification" | "approval" | "detailed">("verification");

  useEffect(() => {
    if (userRole === "admin") {
      void fetchUsers();
      void fetchCategories();
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole === "admin") {
      if (activeTab === "verification") {
        void fetchVerificationExpenses();
      } else if (activeTab === "approval") {
        void fetchApprovalExpenses();
      } else if (activeTab === "detailed") {
        void fetchDetailedExpenses();
        void fetchDetailedAllocations();
      }
    }
  }, [userRole, activeTab, selectedEmployee, selectedCategory, engineerStatus, hoStatus, selectedYear, selectedMonth, selectedWeek]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email, balance");
      if (profilesError) throw profilesError;
      const ids = (profiles || []).map(p => p.user_id);
      let rolesById: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: rolesRows, error: rolesErr } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        if (rolesErr) throw rolesErr;
        (rolesRows || []).forEach(r => { rolesById[r.user_id] = r.role; });
      }
      const combined: UserRow[] = (profiles || []).map((p: any) => ({
        user_id: p.user_id,
        name: p.name || "",
        email: p.email || "",
        balance: Number(p.balance ?? 0),
        role: rolesById[p.user_id] || "employee",
      }));
      setUsers(combined);
    } catch (e) {
      console.error("Failed to fetch users for reports", e);
    }
  };

  const fetchCategories = async () => {
    try {
      let { data, error } = await supabase
        .from("expense_categories")
        .select("name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error && (error as any).code === '42703') {
        let r2 = await supabase
          .from("expense_categories")
          .select("name")
          .eq("active", true)
          .order("name", { ascending: true });
        data = r2.data as any;
        error = r2.error as any;
        if (error && (error as any).code === '42703') {
          const r3 = await supabase
            .from("expense_categories")
            .select("name")
            .order("name", { ascending: true });
          data = r3.data as any;
          error = r3.error as any;
        }
      }
      if (error) throw error;
      setCategories((data || []).map((r: any) => r.name));
    } catch (e) {
      console.warn("Categories not available", e);
      setCategories([]);
    }
  };

  const fetchVerificationExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category")
        .eq("status", "verified");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setVerificationExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setVerificationExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch verification expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovalExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category")
        .eq("status", "approved");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setApprovalExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setApprovalExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch approval expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category, purpose, destination");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      // Year filter
      if (selectedYear) {
        const yearStart = new Date(`${selectedYear}-01-01`);
        const yearEnd = new Date(`${selectedYear}-12-31`);
        yearEnd.setHours(23, 59, 59, 999);
        query = query.gte("trip_start", yearStart.toISOString().split('T')[0])
                    .lte("trip_start", yearEnd.toISOString().split('T')[0]);
      }
      
      // Month filter
      if (selectedMonth !== "all" && selectedYear) {
        const monthNum = parseInt(selectedMonth);
        const monthStart = new Date(parseInt(selectedYear), monthNum - 1, 1);
        const monthEnd = new Date(parseInt(selectedYear), monthNum, 0);
        query = query.gte("trip_start", monthStart.toISOString().split('T')[0])
                    .lte("trip_start", monthEnd.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query.order("trip_start", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setDetailedExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setDetailedExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch detailed expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedAllocations = async () => {
    if (selectedEmployee === "all") {
      setDetailedAllocations([]);
      return;
    }
    try {
      let query = supabase
        .from("cash_transfer_history")
        .select("id, transferred_at, amount, transfer_type, transferrer_role")
        .eq("recipient_id", selectedEmployee)
        .order("transferred_at", { ascending: true });

      if (selectedYear) {
        const yearStart = new Date(`${selectedYear}-01-01T00:00:00.000Z`);
        const yearEnd = new Date(`${selectedYear}-12-31T23:59:59.999Z`);
        query = query
          .gte("transferred_at", yearStart.toISOString())
          .lte("transferred_at", yearEnd.toISOString());
      }
      if (selectedMonth !== "all" && selectedYear) {
        const monthNum = parseInt(selectedMonth, 10);
        const monthStart = new Date(parseInt(selectedYear, 10), monthNum - 1, 1);
        const monthEnd = new Date(parseInt(selectedYear, 10), monthNum, 0, 23, 59, 59, 999);
        query = query
          .gte("transferred_at", monthStart.toISOString())
          .lte("transferred_at", monthEnd.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === "PGRST205" || error.message?.includes("does not exist") || error.message?.includes("relation")) {
          setDetailedAllocations([]);
          return;
        }
        throw error;
      }
      setDetailedAllocations((data || []).map((r: any) => ({
        id: r.id,
        transferred_at: r.transferred_at,
        amount: Number(r.amount ?? 0),
        transfer_type: r.transfer_type ?? "",
        transferrer_role: r.transferrer_role ?? "",
      })));
    } catch (e) {
      console.error("Failed to fetch allocation history", e);
      setDetailedAllocations([]);
    }
  };

  const escapeCsv = (val: string | number): string => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  type ExportFormat = "xlsx" | "csv" | "json" | "pdf";

  const exportVerificationList = (format: ExportFormat) => {
    const baseName = `claim-verification-list-${new Date().toISOString().slice(0, 10)}`;
    const headers = ["Employee", "Expense Type", "LPO Number", "Bill Date (DD-MM-YYYY)", "Bill Amount", "Manager Approval", "HO Approval", "Submitted On (DD-MM-YYYY)"];
    const rows = verificationExpenses.map((exp) => ({
      Employee: exp.user_name,
      "Expense Type": exp.category || "-",
      "LPO Number": "-",
      "Bill Date (DD-MM-YYYY)": formatDateDDMMYYYY(exp.trip_start),
      "Bill Amount": formatINR(Number(exp.total_amount || 0)),
      "Manager Approval": "Verified",
      "HO Approval": "Pending",
      "Submitted On (DD-MM-YYYY)": formatDateDDMMYYYY(exp.created_at),
    }));

    if (format === "csv") {
      const csv = [headers.map(escapeCsv).join(","), ...rows.map((r) => headers.map((h) => escapeCsv((r as Record<string, string>)[h])).join(","))].join("\n");
      downloadBlob(`${baseName}.csv`, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    } else if (format === "json") {
      downloadBlob(`${baseName}.json`, new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    } else if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Verification List");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Claim Verification List", 14, 16);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, 14, 24);
      doc.setTextColor(0, 0, 0);
      autoTable(doc, {
        startY: 32,
        head: [headers],
        body: rows.map((r) => headers.map((h) => (r as Record<string, string>)[h])),
        theme: "striped",
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [33, 37, 41] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        margin: { left: 14, right: 14 },
        columnStyles: { 4: { halign: "right" } },
      });
      doc.save(`${baseName}.pdf`);
    }
  };

  const exportApprovalList = (format: ExportFormat) => {
    const baseName = `claim-approval-list-${new Date().toISOString().slice(0, 10)}`;
    const headers = ["Employee", "Expense Type", "LPO Number", "Bill Date (DD-MM-YYYY)", "Bill Amount", "Manager Approval", "HO Approval", "Submitted On (DD-MM-YYYY)"];
    const rows = approvalExpenses.map((exp) => ({
      Employee: exp.user_name,
      "Expense Type": exp.category || "-",
      "LPO Number": "-",
      "Bill Date (DD-MM-YYYY)": formatDateDDMMYYYY(exp.trip_start),
      "Bill Amount": formatINR(Number(exp.total_amount || 0)),
      "Manager Approval": "Verified",
      "HO Approval": "Approved",
      "Submitted On (DD-MM-YYYY)": formatDateDDMMYYYY(exp.created_at),
    }));

    if (format === "csv") {
      const csv = [headers.map(escapeCsv).join(","), ...rows.map((r) => headers.map((h) => escapeCsv((r as Record<string, string>)[h])).join(","))].join("\n");
      downloadBlob(`${baseName}.csv`, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    } else if (format === "json") {
      downloadBlob(`${baseName}.json`, new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    } else if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Approval List");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Claim Approval List", 14, 16);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, 14, 24);
      doc.setTextColor(0, 0, 0);
      autoTable(doc, {
        startY: 32,
        head: [headers],
        body: rows.map((r) => headers.map((h) => (r as Record<string, string>)[h])),
        theme: "striped",
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [33, 37, 41] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        margin: { left: 14, right: 14 },
        columnStyles: { 4: { halign: "right" } },
      });
      doc.save(`${baseName}.pdf`);
    }
  };

  const exportDetailedReport = (format: ExportFormat) => {
    const employeeName = selectedUser?.name ?? "All";
    const safeName = employeeName.replace(/[^a-zA-Z0-9-_]/g, "-");
    const baseName = `detailed-expense-report-${safeName}-${selectedYear}-${new Date().toISOString().slice(0, 10)}`;

    const headers = ["Bill Date", "Type of Expense", "Purpose", "Destination", "Credit", "Debit", "Notes", "Opening Balance", "Closing Balance"];
    const detailRows = detailedListWithBalances.map((row) => ({
      "Bill Date": formatDateDDMMYYYY(row.date),
      "Type of Expense": row.category,
      Purpose: row.purpose ?? "-",
      Destination: row.destination ?? "-",
      Credit: row.type === "allocation" ? formatINR(row.credit) : "",
      Debit: row.type === "expense" ? formatINR(row.debit) : "",
      Notes: row.notes,
      "Opening Balance": formatINR(row.openingBalance),
      "Closing Balance": formatINR(row.closingBalance),
    }));

    const summaryRows: Record<string, string>[] = [];
    if (totalAllocationsInPeriod > 0) summaryRows.push({ Category: "Account Credited", Amount: formatINR(totalAllocationsInPeriod) });
    Object.entries(detailedSummary).forEach(([category, amount]) => summaryRows.push({ Category: category, Amount: formatINR(amount) }));
    summaryRows.push({ Category: "Total", Amount: formatINR(totalAmount) });

    const reconstructedClosing = detailedListWithBalances.length > 0 ? detailedListWithBalances[detailedListWithBalances.length - 1].closingBalance : balanceInfo.closing;

    if (format === "csv") {
      const lines: string[] = [headers.map(escapeCsv).join(",")];
      if (selectedUser) {
        lines.push(["", "", "", "", "", "", "Opening Balance", formatINR(balanceInfo.opening), formatINR(balanceInfo.opening)].map(escapeCsv).join(","));
        detailedListWithBalances.forEach((row) => {
          const creditStr = row.type === "allocation" ? formatINR(row.credit) : "";
          const debitStr = row.type === "expense" ? formatINR(row.debit) : "";
          lines.push([formatDateDDMMYYYY(row.date), row.category, row.purpose ?? "-", row.destination ?? "-", creditStr, debitStr, row.notes, formatINR(row.openingBalance), formatINR(row.closingBalance)].map(escapeCsv).join(","));
        });
        lines.push(["", "", "", "", "", "", "Closing Balance", formatINR(reconstructedClosing), formatINR(reconstructedClosing)].map(escapeCsv).join(","));
        lines.push("");
        lines.push(["Summary", ""].map(escapeCsv).join(","));
        if (totalAllocationsInPeriod > 0) lines.push(["Account Credited", formatINR(totalAllocationsInPeriod)].map(escapeCsv).join(","));
        Object.entries(detailedSummary).forEach(([category, amount]) => lines.push([category, formatINR(amount)].map(escapeCsv).join(",")));
        lines.push(["Total", formatINR(totalAmount)].map(escapeCsv).join(","));
      }
      downloadBlob(`${baseName}.csv`, new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    } else if (format === "json") {
      const payload = {
        employee: employeeName,
        year: selectedYear,
        openingBalance: balanceInfo.opening,
        closingBalance: reconstructedClosing,
        detailedList: detailRows,
        summary: summaryRows,
      };
      downloadBlob(`${baseName}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    } else if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      const openingRow: Record<string, string> = { "Bill Date": "", "Type of Expense": "Opening Balance", Purpose: "", Destination: "", Credit: "", Debit: "", Notes: "", "Opening Balance": formatINR(balanceInfo.opening), "Closing Balance": formatINR(balanceInfo.opening) };
      const closingRow: Record<string, string> = { "Bill Date": "", "Type of Expense": "Closing Balance", Purpose: "", Destination: "", Credit: "", Debit: "", Notes: "", "Opening Balance": formatINR(reconstructedClosing), "Closing Balance": formatINR(reconstructedClosing) };
      const wsDetail = XLSX.utils.json_to_sheet([openingRow, ...detailRows, closingRow]);
      XLSX.utils.book_append_sheet(wb, wsDetail, "Detailed List");
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;

      // Header block
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, pageW, 36, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Detailed Expense Report", margin, 16);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`${employeeName}  •  Year ${selectedYear}`, margin, 26);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 26, { align: "right" });
      doc.setTextColor(0, 0, 0);

      // Truncate long notes for table layout (max ~40 chars for landscape)
      const truncate = (s: string, maxLen: number) => (s.length <= maxLen ? s : s.slice(0, maxLen - 2) + "…");

      const detailBody: string[][] = [
        ["", "Opening Balance", "", "", "", "", "", formatINR(balanceInfo.opening), formatINR(balanceInfo.opening)],
        ...detailedListWithBalances.map((row) => [
          formatDateDDMMYYYY(row.date),
          row.category,
          truncate(row.purpose ?? "-", 30),
          truncate(row.destination ?? "-", 20),
          row.type === "allocation" ? formatINR(row.credit) : "",
          row.type === "expense" ? formatINR(row.debit) : "",
          truncate(row.notes, 42),
          formatINR(row.openingBalance),
          formatINR(row.closingBalance),
        ]),
        ["", "Closing Balance", "", "", "", "", "", formatINR(reconstructedClosing), formatINR(reconstructedClosing)],
      ];

      autoTable(doc, {
        startY: 42,
        head: [headers],
        body: detailBody,
        theme: "striped",
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 7, textColor: [33, 37, 41] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        margin: { left: margin, right: margin },
        columnStyles: {
          4: { halign: "right" },
          5: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
        },
        didDrawTable: (data) => {
          (doc as any).lastAutoTable = data;
        },
      });
      const finalY = (doc as any).lastAutoTable?.finalY ?? 42;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 95);
      doc.text("Summary", margin, finalY + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      autoTable(doc, {
        startY: finalY + 18,
        head: [["Category", "Amount"]],
        body: summaryRows.map((r) => [r.Category, r.Amount]),
        theme: "striped",
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [33, 37, 41] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        margin: { left: margin, right: margin },
        columnStyles: { 1: { halign: "right" } },
      });

      doc.save(`${baseName}.pdf`);
    }
  };

  const openExportDialog = (tab: "verification" | "approval" | "detailed") => {
    setExportTab(tab);
    setExportDialogOpen(true);
  };

  const handleExportAs = (format: ExportFormat) => {
    if (exportTab === "verification") exportVerificationList(format);
    else if (exportTab === "approval") exportApprovalList(format);
    else exportDetailedReport(format);
    setExportDialogOpen(false);
  };

  const formatDateDDMMYYYY = (dateString: string | null): string => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return "-";
    }
  };

  const clearFilters = () => {
    setSelectedEmployee("all");
    setSelectedCategory("all");
    setEngineerStatus("verified");
    setHoStatus("approved");
    setSelectedYear(new Date().getFullYear().toString());
    setSelectedMonth("all");
    setSelectedWeek("all");
  };

  // Calculate summary for detailed report
  const detailedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    detailedExpenses.forEach(exp => {
      const cat = exp.category || "Other";
      summary[cat] = (summary[cat] || 0) + Number(exp.total_amount || 0);
    });
    return summary;
  }, [detailedExpenses]);

  const totalAmount = useMemo(() => {
    return detailedExpenses.reduce((sum, exp) => sum + Number(exp.total_amount || 0), 0);
  }, [detailedExpenses]);

  // Get selected user for detailed report
  const selectedUser = useMemo(() => {
    if (selectedEmployee === "all") return null;
    return users.find(u => u.user_id === selectedEmployee);
  }, [selectedEmployee, users]);

  // Total allocations (money added to employee) in the report period
  const totalAllocationsInPeriod = useMemo(() => {
    return detailedAllocations.reduce((sum, a) => sum + a.amount, 0);
  }, [detailedAllocations]);

  // Total approved expenses (money spent/deducted) in the report period
  const totalApprovedExpensesInPeriod = useMemo(() => {
    return detailedExpenses
      .filter((e) => e.status === "approved")
      .reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
  }, [detailedExpenses]);

  // Calculate opening/closing balance for detailed report
  const balanceInfo = useMemo(() => {
    if (!selectedUser) return { opening: 0, allocated: 0, closing: 0 };
    const closing = Number(selectedUser.balance);
    // Period opening = current - allocations added in period + expenses deducted in period
    const opening = closing - totalAllocationsInPeriod + totalApprovedExpensesInPeriod;
    return { opening, allocated: totalAllocationsInPeriod, closing };
  }, [selectedUser, totalAllocationsInPeriod, totalApprovedExpensesInPeriod]);

  // Combined list: allocations + expenses, sorted by date, with running opening/closing balance per row
  const detailedListWithBalances = useMemo(() => {
    if (!selectedUser) return [];

    const allocationRows = detailedAllocations.map((a) => ({
      id: `alloc-${a.id}`,
      date: a.transferred_at,
      type: "allocation" as const,
      amount: a.amount,
      credit: a.amount,
      debit: 0,
      notes: a.transferrer_role === "admin" ? "By Admin" : "By Cashier",
      category: "Account Credited",
      purpose: a.transferrer_role === "admin" ? "Account credited by Admin" : "Account credited by Cashier",
      destination: "-",
      isApproved: true,
    }));

    const expenseRows = detailedExpenses.map((e) => ({
      id: e.id,
      date: e.trip_start,
      type: "expense" as const,
      amount: Number(e.total_amount || 0),
      credit: 0,
      debit: Number(e.total_amount || 0),
      notes: e.purpose || "-",
      category: e.category || "-",
      purpose: e.purpose || "-",
      destination: e.destination || "-",
      isApproved: e.status === "approved",
    }));

    const combined = [...allocationRows, ...expenseRows].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      // Same date: allocations before expenses
      return a.type === "allocation" ? -1 : 1;
    });

    // Running balance: apply every credit and debit in the list so balances are consistent and can go negative
    let running = balanceInfo.opening;
    return combined.map((row) => {
      const opening = running;
      running += row.credit - row.debit;
      return { ...row, openingBalance: opening, closingBalance: running };
    });
  }, [selectedUser, detailedAllocations, detailedExpenses, balanceInfo.opening]);

  if (userRole !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-sm text-slate-600">View and manage expense reports</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="verification">Claim Verification List</TabsTrigger>
          <TabsTrigger value="approval">Claim Approval List</TabsTrigger>
          <TabsTrigger value="detailed">Detailed Expense Report</TabsTrigger>
        </TabsList>

        {/* Claim Verification List */}
        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CLAIM VERIFICATION LIST</CardTitle>
              <CardDescription>Expenses verified by managers, pending admin approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">APPLIED FILTER</Label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Manager Approval Status</Label>
                    <Select value={engineerStatus} onValueChange={setEngineerStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verified">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchVerificationExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                  <Button variant="outline" onClick={() => openExportDialog("verification")} disabled={loading || verificationExpenses.length === 0}>Export</Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Expense Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">LPO Number</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Bill Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Manager Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">HO Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted On (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                      </tr>
                    ) : verificationExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No expenses found</td>
                      </tr>
                    ) : (
                      verificationExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">{exp.user_name}</td>
                          <td className="px-4 py-3">{exp.category || "-"}</td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.trip_start)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(Number(exp.total_amount || 0))}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status="verified" />
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">Pending</Badge>
                          </td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claim Approval List */}
        <TabsContent value="approval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CLAIM APPROVAL LIST</CardTitle>
              <CardDescription>Expenses approved by admin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">APPLIED FILTER</Label>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Manager Approval Status</Label>
                    <Select value={engineerStatus} onValueChange={setEngineerStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verified">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>HO Approval Status</Label>
                    <Select value={hoStatus} onValueChange={setHoStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchApprovalExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                  <Button variant="outline" onClick={() => openExportDialog("approval")} disabled={loading || approvalExpenses.length === 0}>Export</Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Expense Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">LPO Number</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Bill Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Manager Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">HO Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted On (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                      </tr>
                    ) : approvalExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No expenses found</td>
                      </tr>
                    ) : (
                      approvalExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">{exp.user_name}</td>
                          <td className="px-4 py-3">{exp.category || "-"}</td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.trip_start)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(Number(exp.total_amount || 0))}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status="verified" />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status="approved" />
                          </td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Expense Report */}
        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Expense Report</CardTitle>
              <CardDescription>View detailed expenses with balance tracking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">FILTERS</Label>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Employee *</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Expense" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All months</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = new Date(2000, i, 1).toLocaleString('default', { month: 'long' });
                          return <SelectItem key={i + 1} value={(i + 1).toString()}>{month}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Week</Label>
                    <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Week" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All weeks</SelectItem>
                        {Array.from({ length: 52 }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>Week {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchDetailedExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                  <Button variant="outline" onClick={() => openExportDialog("detailed")} disabled={!selectedUser || loading}>Export</Button>
                  <Button variant="outline" onClick={() => window.print()} disabled={!selectedUser || loading} className="print:inline-flex print:visible">
                    <Printer className="h-4 w-4 mr-2" />
                    Print report
                  </Button>
                </div>
              </div>

              {selectedUser && (
                <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                  <p className="font-semibold">{selectedUser.name}</p>
                  <p className="text-sm text-slate-600">Year : {selectedYear.slice(-2)}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Detailed List</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Type of Expense</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Purpose</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Destination</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Credit</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Debit</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Opening Balance</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Closing Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedUser && (
                          <>
                            <tr className="bg-slate-50 font-medium">
                              <td className="px-4 py-3" colSpan={6}></td>
                              <td className="px-4 py-3">Opening Balance</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(balanceInfo.opening)}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(balanceInfo.opening)}</td>
                            </tr>
                            {loading ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                              </tr>
                            ) : detailedListWithBalances.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">No allocations or expenses in this period</td>
                              </tr>
                            ) : (
                              detailedListWithBalances.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-3">{formatDateDDMMYYYY(row.date)}</td>
                                  <td className="px-4 py-3">{row.category}</td>
                                  <td className="px-4 py-3">{row.purpose ?? "-"}</td>
                                  <td className="px-4 py-3">{row.destination ?? "-"}</td>
                                  <td className="px-4 py-3 text-right font-medium">{row.type === "allocation" ? formatINR(row.credit) : ""}</td>
                                  <td className="px-4 py-3 text-right font-medium">{row.type === "expense" ? formatINR(row.debit) : ""}</td>
                                  <td className="px-4 py-3">{row.notes}</td>
                                  <td className="px-4 py-3 text-right">{formatINR(row.openingBalance)}</td>
                                  <td className="px-4 py-3 text-right font-medium">{formatINR(row.closingBalance)}</td>
                                </tr>
                              ))
                            )}
                            {selectedUser && !loading && detailedListWithBalances.length > 0 && (
                              <tr className="bg-slate-50 font-medium">
                                <td className="px-4 py-3" colSpan={6}></td>
                                <td className="px-4 py-3">Closing Balance</td>
                                <td className="px-4 py-3 text-right font-medium">{formatINR(detailedListWithBalances[detailedListWithBalances.length - 1].closingBalance)}</td>
                                <td className="px-4 py-3 text-right font-medium">{formatINR(detailedListWithBalances[detailedListWithBalances.length - 1].closingBalance)}</td>
                              </tr>
                            )}
                          </>
                        )}
                        {!selectedUser && (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Select an employee to view detailed report</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Summary</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Type of Expense</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {totalAllocationsInPeriod > 0 && (
                          <tr className="hover:bg-slate-50">
                            <td className="px-4 py-3">Account Credited</td>
                            <td className="px-4 py-3 text-right font-medium">{formatINR(totalAllocationsInPeriod)}</td>
                          </tr>
                        )}
                        {Object.entries(detailedSummary).map(([category, amount]) => (
                          <tr key={category} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{category}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatINR(amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-200 font-bold border-t-2">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{formatINR(totalAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export report</DialogTitle>
            <DialogDescription>
              Choose the format for your export. The {exportTab === "verification" ? "Claim Verification" : exportTab === "approval" ? "Claim Approval" : "Detailed Expense"} report will be downloaded.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button variant="outline" className="h-auto flex flex-col items-center gap-2 py-4" onClick={() => handleExportAs("xlsx")}>
              <FileSpreadsheet className="h-8 w-8 text-green-600" />
              <span>XLSX</span>
              <span className="text-xs text-muted-foreground font-normal">Excel spreadsheet</span>
            </Button>
            <Button variant="outline" className="h-auto flex flex-col items-center gap-2 py-4" onClick={() => handleExportAs("csv")}>
              <FileText className="h-8 w-8 text-slate-600" />
              <span>CSV</span>
              <span className="text-xs text-muted-foreground font-normal">Comma-separated values</span>
            </Button>
            <Button variant="outline" className="h-auto flex flex-col items-center gap-2 py-4" onClick={() => handleExportAs("json")}>
              <FileJson className="h-8 w-8 text-amber-600" />
              <span>JSON</span>
              <span className="text-xs text-muted-foreground font-normal">Structured data</span>
            </Button>
            <Button variant="outline" className="h-auto flex flex-col items-center gap-2 py-4" onClick={() => handleExportAs("pdf")}>
              <FileType className="h-8 w-8 text-red-600" />
              <span>PDF</span>
              <span className="text-xs text-muted-foreground font-normal">Portable document</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
