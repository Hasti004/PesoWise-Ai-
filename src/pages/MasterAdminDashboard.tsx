import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Mail,
  Database,
  HardDrive,
  Users,
  MessageSquare,
  RefreshCw,
  Copy,
  Download,
} from "lucide-react";
import { fetchFullBackup, downloadFullBackup, downloadFullBackupWithReceipts, fetchOrgBackup, downloadBackup, downloadBackupWithReceipts, fetchReceiptBlobs } from "@/lib/backupData";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  payment_status: string | null;
  is_blocked: boolean | null;
  last_activity_at: string | null;
  created_at: string;
  max_users: number | null;
}

interface ContactLead {
  id: string;
  full_name: string;
  work_email: string;
  company: string;
  phone: string | null;
  role: string | null;
  team_size: string | null;
  multi_level: boolean;
  balance: boolean;
  multi_location: boolean;
  receipts: boolean;
  message: string | null;
  consent_marketing: boolean;
  created_at: string;
}

interface StorageMetrics {
  database_size_gb?: number;
  storage_size_gb?: number;
  total_size_gb?: number;
}

export default function MasterAdminDashboard() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contactLeads, setContactLeads] = useState<ContactLead[]>([]);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingOrgId, setUpdatingOrgId] = useState<string | null>(null);
  const [backupFullLoading, setBackupFullLoading] = useState(false);
  const [backupOrgLoading, setBackupOrgLoading] = useState(false);
  const [selectedOrgIdForBackup, setSelectedOrgIdForBackup] = useState<string>("");
  const [includeReceiptsFull, setIncludeReceiptsFull] = useState(false);
  const [includeReceiptsOrg, setIncludeReceiptsOrg] = useState(false);
  const [memberCountByOrgId, setMemberCountByOrgId] = useState<Record<string, number>>({});

  const PLAN_OPTIONS = ["starter", "free-trial", "pro"] as const;
  const PAYMENT_OPTIONS = ["active", "pending", "overdue", "suspended", "cancelled"] as const;

  const updateOrganization = async (
    orgId: string,
    updates: { plan?: string | null; payment_status?: string | null; max_users?: number | null }
  ) => {
    setUpdatingOrgId(orgId);
    try {
      const { error } = await (supabase as any)
        .from("organizations")
        .update(updates)
        .eq("id", orgId);
      if (error) throw error;
      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === orgId ? { ...o, ...updates } : o
        )
      );
      toast({ title: "Updated", description: "Organization updated successfully." });
    } catch (e) {
      console.error("Update organization error:", e);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setUpdatingOrgId(null);
    }
  };

  const load = async () => {
    try {
      const [orgRes, leadsRes, metricsRes, countsRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, slug, plan, payment_status, is_blocked, last_activity_at, created_at, max_users")
          .order("created_at", { ascending: false }),
        supabase
          .from("contact_leads")
          .select("id, full_name, work_email, company, phone, role, team_size, multi_level, balance, multi_location, receipts, message, consent_marketing, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.rpc("get_storage_metrics"),
        supabase.rpc("get_organization_member_counts"),
      ]);

      if (orgRes.error) throw orgRes.error;
      if (leadsRes.error) throw leadsRes.error;

      setOrganizations((orgRes.data ?? []) as Organization[]);
      setContactLeads((leadsRes.data ?? []) as ContactLead[]);
      setStorageMetrics((metricsRes.data ?? null) as StorageMetrics | null);
      if (countsRes.data && Array.isArray(countsRes.data)) {
        const byId: Record<string, number> = {};
        for (const row of countsRes.data as { organization_id: string; member_count: number }[]) {
          byId[row.organization_id] = Number(row.member_count);
        }
        setMemberCountByOrgId(byId);
      }
      if (metricsRes.error) {
        console.warn("Storage metrics not available:", metricsRes.error.message);
      }
    } catch (e) {
      console.error("Master admin load error:", e);
      toast({
        variant: "destructive",
        title: "Error loading data",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userRole === "master_admin") {
      load();
    }
  }, [userRole]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleDownloadFullBackup = async () => {
    try {
      setBackupFullLoading(true);
      const payload = await fetchFullBackup(supabase);
      if (includeReceiptsFull) {
        const receiptsByOrg: Record<string, Awaited<ReturnType<typeof fetchReceiptBlobs>>> = {};
        for (const orgId of Object.keys(payload.dataByOrganization)) {
          const atts = payload.dataByOrganization[orgId]?.attachments ?? [];
          receiptsByOrg[orgId] = await fetchReceiptBlobs(supabase, atts);
        }
        await downloadFullBackupWithReceipts(payload, receiptsByOrg);
        toast({ title: "Full backup downloaded", description: "All organizations, data, and receipt files saved (ZIP)." });
      } else {
        downloadFullBackup(payload);
        toast({ title: "Full backup downloaded", description: "All organizations and data have been saved." });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "Failed to prepare full backup.",
      });
    } finally {
      setBackupFullLoading(false);
    }
  };

  const handleDownloadOrgBackup = async () => {
    if (!selectedOrgIdForBackup) {
      toast({ variant: "destructive", title: "Select an organization", description: "Choose an organization to download." });
      return;
    }
    try {
      setBackupOrgLoading(true);
      const payload = await fetchOrgBackup(supabase, selectedOrgIdForBackup);
      if (includeReceiptsOrg && payload.attachments.length > 0) {
        const receiptBlobs = await fetchReceiptBlobs(supabase, payload.attachments);
        await downloadBackupWithReceipts(payload, receiptBlobs);
        toast({ title: "Backup downloaded", description: `Data and ${receiptBlobs.length} receipt(s) for ${organizations.find((o) => o.id === selectedOrgIdForBackup)?.name ?? "organization"} saved.` });
      } else {
        downloadBackup(payload);
        toast({ title: "Backup downloaded", description: `Data for ${organizations.find((o) => o.id === selectedOrgIdForBackup)?.name ?? "organization"} saved.` });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "Failed to prepare organization backup.",
      });
    } finally {
      setBackupOrgLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Could not copy to clipboard.",
      });
    }
  };

  if (userRole !== "master_admin") {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground">Only master admins can access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Master Admin</h1>
          <p className="text-muted-foreground">Organizations, contact leads, and system metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contact Leads</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactLeads.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage (total)</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {storageMetrics?.total_size_gb != null
                ? `${storageMetrics.total_size_gb} GB`
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organizations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Organizations
          </CardTitle>
          <CardDescription>All organizations in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Blocked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No organizations
                    </TableCell>
                  </TableRow>
                ) : (
                  organizations.map((org) => {
                    const memberCount = memberCountByOrgId[org.id] ?? 0;
                    return (
                    <TableRow key={org.id}>
                      <TableCell className="max-w-[180px]">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(org.id, "Organization ID")}
                          className="flex items-center gap-1.5 w-full font-mono text-xs text-muted-foreground truncate text-left hover:text-foreground hover:bg-muted/50 rounded px-1.5 py-1 -mx-1.5 -my-1 transition-colors"
                          title="Click to copy"
                        >
                          <Copy className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{org.id}</span>
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                      <TableCell>
                        <Select
                          value={org.plan ?? "__none__"}
                          onValueChange={(value) =>
                            updateOrganization(org.id, {
                              plan: value === "__none__" ? null : value,
                            })
                          }
                          disabled={updatingOrgId === org.id}
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {PLAN_OPTIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={org.payment_status ?? "__none__"}
                          onValueChange={(value) =>
                            updateOrganization(org.id, {
                              payment_status: value === "__none__" ? null : value,
                            })
                          }
                          disabled={updatingOrgId === org.id}
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {PAYMENT_OPTIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs whitespace-nowrap">
                            {memberCount} / {org.max_users == null ? "∞" : org.max_users}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="Unlimited"
                            className="h-8 w-[100px]"
                            key={`${org.id}-${org.max_users ?? "u"}`}
                            defaultValue={org.max_users == null ? "" : String(org.max_users)}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                if (org.max_users != null) updateOrganization(org.id, { max_users: null });
                                return;
                              }
                              const n = parseInt(raw, 10);
                              if (!Number.isNaN(n) && n >= 0 && n !== (org.max_users ?? undefined)) {
                                updateOrganization(org.id, { max_users: n });
                              }
                            }}
                            disabled={updatingOrgId === org.id}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {org.last_activity_at
                          ? format(new Date(org.last_activity_at), "PPp")
                          : "—"}
                      </TableCell>
                      <TableCell>{org.is_blocked ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Data & backup (master admin) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Data & backup
          </CardTitle>
          <CardDescription>
            Worst-case backup: full website data includes <strong>all expenses, users, memberships, settings, locations, categories, and audit logs from every organization</strong>, plus contact leads and master admin list. Use &quot;Download full website data&quot; to get everything in one file. Optionally include receipt files in a ZIP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="full-include-receipts"
                checked={includeReceiptsFull}
                onCheckedChange={(v) => setIncludeReceiptsFull(v === true)}
              />
              <Label htmlFor="full-include-receipts" className="text-sm font-normal cursor-pointer">Include receipts (full backup)</Label>
            </div>
            <button
              type="button"
              onClick={handleDownloadFullBackup}
              disabled={backupFullLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {backupFullLoading ? "Preparing full backup…" : includeReceiptsFull ? "Download full data (ZIP)" : "Download full website data"}
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="org-include-receipts"
                checked={includeReceiptsOrg}
                onCheckedChange={(v) => setIncludeReceiptsOrg(v === true)}
              />
              <Label htmlFor="org-include-receipts" className="text-sm font-normal cursor-pointer">Include receipts (org backup)</Label>
            </div>
            <Select value={selectedOrgIdForBackup} onValueChange={setSelectedOrgIdForBackup}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name} ({org.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={handleDownloadOrgBackup}
              disabled={backupOrgLoading || !selectedOrgIdForBackup}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {backupOrgLoading ? "Preparing…" : includeReceiptsOrg ? "Download org data (ZIP)" : "Download organization data"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Contact leads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact / Inquiry Leads
          </CardTitle>
          <CardDescription>Submissions from the contact form (Tell us about your organization)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Needs</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No contact leads yet
                    </TableCell>
                  </TableRow>
                ) : (
                  contactLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.full_name}</TableCell>
                      <TableCell>
                        <a href={`mailto:${lead.work_email}`} className="text-primary hover:underline">
                          {lead.work_email}
                        </a>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lead.phone ?? "—"}</TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.role ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {[
                          lead.multi_level && "Multi-level",
                          lead.balance && "Balance",
                          lead.multi_location && "Multi-location",
                          lead.receipts && "Receipts",
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(lead.created_at), "PP")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Storage */}
      {storageMetrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Storage metrics
            </CardTitle>
            <CardDescription>Database and file storage usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Database</p>
                <p className="text-xl font-semibold">{storageMetrics.database_size_gb ?? "—"} GB</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Storage buckets</p>
                <p className="text-xl font-semibold">{storageMetrics.storage_size_gb ?? "—"} GB</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-semibold">{storageMetrics.total_size_gb ?? "—"} GB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
