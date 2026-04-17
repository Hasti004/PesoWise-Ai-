import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Edit, 
  Download, 
  FileText, 
  Calendar, 
  MapPin, 
  Coins, 
  User, 
  Clock,
  CheckCircle,
  XCircle,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllowCashierExpenseSubmission } from "@/hooks/useAllowCashierExpenseSubmission";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { formatINR, parseLocalDate } from "@/lib/format";

interface Expense {
  id: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  purpose?: string;
  admin_comment?: string;
  assigned_engineer_id?: string;
  assigned_engineer_name?: string;
  category?: string | null;
}

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

interface AuditLog {
  id: string;
  action: string;
  comment?: string;
  created_at: string;
  user_name: string;
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userRole, organizationId, organization } = useAuth();
  const { allowCashierExpenseSubmission } = useAllowCashierExpenseSubmission();
  const { toast } = useToast();
  
  const [expense, setExpense] = useState<Expense | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [formFieldValues, setFormFieldValues] = useState<Array<{
    template_id: string;
    template_name: string;
    field_type: string;
    field_value: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchExpenseDetails();
    }
  }, [id]);

  const fetchExpenseDetails = async () => {
    try {
      setLoading(true);

      if (!organizationId) {
        throw new Error("Organization not found");
      }

      // Fetch expense data (filtered by organization_id)
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .single();

      if (expenseError) throw expenseError;

      // Fetch user profile
      const { data: userProfile, error: userProfileError } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("user_id", expenseData.user_id)
        .single();

      if (userProfileError) throw userProfileError;

      // Fetch engineer profile if assigned
      let engineerProfile = null;
      if (expenseData.assigned_engineer_id) {
        const { data: engineerData, error: engineerError } = await supabase
          .from("profiles")
          .select("name")
          .eq("user_id", expenseData.assigned_engineer_id)
          .single();
        
        if (!engineerError) {
          engineerProfile = engineerData;
        }
      }

      // Check if user has permission to view this expense
      const canView = 
        expenseData.user_id === user?.id || 
        expenseData.assigned_engineer_id === user?.id ||
        userRole === "admin";

      if (!canView) {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "You don't have permission to view this expense",
        });
        navigate("/expenses");
        return;
      }

      setExpense({
        ...expenseData,
        user_name: userProfile.name,
        user_email: userProfile.email,
        assigned_engineer_name: engineerProfile?.name,
        total_amount: Number(expenseData.total_amount)
      });

      // Fetch line items (filtered by organization_id)
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", id)
        .eq("organization_id", organizationId)
        .order("date");

      if (lineItemsError) throw lineItemsError;
      setLineItems(lineItemsData || []);

      // Fetch attachments (filtered by organization_id)
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("*")
        .eq("expense_id", id)
        .eq("organization_id", organizationId)
        .order("created_at");

      if (attachmentsError) throw attachmentsError;
      // Normalize attachment URLs to ensure they are valid public URLs from the active bucket
      const normalizedAttachments = (attachmentsData || []).map((att) => {
        const asUrl = att.file_url || "";

        // Case 1: Already a full URL
        if (asUrl.startsWith("http")) {
          try {
            const u = new URL(asUrl);
            // If legacy bucket is referenced, rebuild a receipts public URL using the same object key
            if (u.pathname.includes("/object/public/expense-attachments/")) {
              const key = u.pathname.split("/object/public/expense-attachments/")[1] || "";
              const { data } = supabase.storage.from("receipts").getPublicUrl(key);
              return { ...att, file_url: data.publicUrl };
            }
            return att;
          } catch {
            // If parsing fails, fall back to treating it as a path below
          }
        }

        // Case 2: Path-like value stored (e.g., "receipts/{expenseId}/file.png" or "expense-attachments/{...}")
        const parts = asUrl.split("/");
        const bucketMaybe = parts[0] || "receipts";
        const objectKey = parts.slice(1).join("/");
        const bucket = bucketMaybe === "expense-attachments" ? "receipts" : (bucketMaybe || "receipts");
        const key = objectKey || asUrl; // if not in bucket/key format, use raw string

        const { data } = supabase.storage.from(bucket).getPublicUrl(key);
        return { ...att, file_url: data.publicUrl };
      });

      setAttachments(normalizedAttachments);

      // Fetch audit logs including resubmission (filtered by organization_id)
      const { data: auditData, error: auditError } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("expense_id", id)
        .eq("organization_id", organizationId)
        .in("action", ["expense_created", "expense_submitted", "expense_resubmitted", "expense_verified", "expense_approved", "expense_rejected"])
        .order("created_at", { ascending: false });

      if (auditError) throw auditError;

      // Fetch user profiles for audit logs
      const auditLogsWithNames = await Promise.all(
        (auditData || []).map(async (log) => {
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

      // Fetch form field values
      const { data: fieldValuesData, error: fieldValuesError } = await supabase
        .from("expense_form_field_values")
        .select(`
          template_id,
          field_value,
          expense_form_field_templates(name, field_type)
        `)
        .eq("expense_id", id)
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

    } catch (error) {
      console.error("Error fetching expense details:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load expense details",
      });
    } finally {
      setLoading(false);
    }
  };

  const canEdit = () => {
    if (!expense) return false;
    if (userRole === "cashier") {
      return allowCashierExpenseSubmission === true && expense.user_id === user?.id && (expense.status === "submitted" || expense.status === "rejected");
    }
    return (
      (expense.user_id === user?.id && (expense.status === "submitted" || expense.status === "rejected")) ||
      userRole === "admin"
    );
  };

  const handleExportPDF = () => {
    if (!expense) return;

    // Create a printable HTML content
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Expense Receipt - ${expense.title}</title>
          <style>
            @media print {
              @page { margin: 20mm; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .section {
              margin-bottom: 25px;
            }
            .section-title {
              font-weight: bold;
              font-size: 16px;
              margin-bottom: 10px;
              border-bottom: 1px solid #ddd;
              padding-bottom: 5px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .label {
              font-weight: bold;
              color: #666;
            }
            .value {
              text-align: right;
            }
            .amount {
              font-size: 24px;
              font-weight: bold;
              color: #2563eb;
            }
            .status {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .status-submitted { background: #fef3c7; color: #92400e; }
            .status-verified { background: #dbeafe; color: #1e40af; }
            .status-approved { background: #d1fae5; color: #065f46; }
            .status-rejected { background: #fee2e2; color: #991b1b; }
            .attachments {
              margin-top: 20px;
            }
            .attachment-item {
              padding: 10px;
              background: #f9fafb;
              margin: 5px 0;
              border-radius: 4px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #000;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>EXPENSE RECEIPT</h1>
            ${organization?.name ? `<p style="font-size: 18px; font-weight: bold; margin: 10px 0;">${organization.name}</p>` : ''}
            <p>PesoWise - Powered by Unimisk</p>
          </div>

          <div class="section">
            <div class="section-title">Expense Details</div>
            <div class="row">
              <span class="label">Transaction #:</span>
              <span class="value">${(expense as any).transaction_number || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Title:</span>
              <span class="value">${expense.title}</span>
            </div>
            <div class="row">
              <span class="label">Destination:</span>
              <span class="value">${expense.destination}</span>
            </div>
            <div class="row">
              <span class="label">Date of Expense:</span>
              <span class="value">${format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}</span>
            </div>
            ${expense.purpose ? `
            <div class="row">
              <span class="label">Purpose:</span>
              <span class="value">${expense.purpose}</span>
            </div>
            ` : ''}
            <div class="row">
              <span class="label">Category:</span>
              <span class="value">${(expense as any).category || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Status:</span>
              <span class="value">
                <span class="status status-${expense.status}">${expense.status}</span>
              </span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Employee Information</div>
            <div class="row">
              <span class="label">Employee Name:</span>
              <span class="value">${expense.user_name}</span>
            </div>
            <div class="row">
              <span class="label">Email:</span>
              <span class="value">${expense.user_email}</span>
            </div>
            ${expense.assigned_engineer_name ? `
            <div class="row">
              <span class="label">Assigned Manager:</span>
              <span class="value">${expense.assigned_engineer_name}</span>
            </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">Amount</div>
            <div class="row">
              <span class="label">Total Amount:</span>
              <span class="value amount">${formatINR(expense.total_amount)}</span>
            </div>
          </div>

          ${attachments.length > 0 ? `
          <div class="section attachments">
            <div class="section-title">Attachments</div>
            ${attachments.map(att => `
              <div class="attachment-item">
                <strong>${att.filename}</strong><br>
                <small>${att.content_type} • ${format(new Date(att.created_at), "MMM d, yyyy")}</small>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${expense.admin_comment ? `
          <div class="section">
            <div class="section-title">Admin Comments</div>
            <p>${expense.admin_comment}</p>
          </div>
          ` : ''}

          <div class="footer">
            <p>Generated on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}</p>
            <p>This is a computer-generated receipt.</p>
          </div>
        </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    }
  };

  const handlePrintReceipt = () => {
    if (!expense) return;

    // Create a printable HTML content (same as PDF but optimized for printing)
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Expense Receipt - ${expense.title}</title>
          <style>
            @media print {
              @page { margin: 15mm; size: A4; }
              body { margin: 0; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .section {
              margin-bottom: 25px;
            }
            .section-title {
              font-weight: bold;
              font-size: 18px;
              margin-bottom: 10px;
              border-bottom: 2px solid #000;
              padding-bottom: 5px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .label {
              font-weight: bold;
              color: #374151;
            }
            .value {
              text-align: right;
            }
            .amount {
              font-size: 32px;
              font-weight: bold;
              color: #2563eb;
            }
            .status {
              display: inline-block;
              padding: 6px 16px;
              border-radius: 16px;
              font-size: 14px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .status-submitted { background: #fef3c7; color: #92400e; }
            .status-verified { background: #dbeafe; color: #1e40af; }
            .status-approved { background: #d1fae5; color: #065f46; }
            .status-rejected { background: #fee2e2; color: #991b1b; }
            .footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 2px solid #000;
              text-align: center;
              color: #666;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>EXPENSE RECEIPT</h1>
            ${organization?.name ? `<p style="font-size: 18px; font-weight: bold; margin: 10px 0;">${organization.name}</p>` : ''}
            <p>PesoWise - Powered by Unimisk</p>
          </div>

          <div class="section">
            <div class="section-title">Expense Details</div>
            <div class="row">
              <span class="label">Transaction #:</span>
              <span class="value">${(expense as any).transaction_number || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Title:</span>
              <span class="value">${expense.title}</span>
            </div>
            <div class="row">
              <span class="label">Destination:</span>
              <span class="value">${expense.destination}</span>
            </div>
            <div class="row">
              <span class="label">Date of Expense:</span>
              <span class="value">${format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}</span>
            </div>
            ${expense.purpose ? `
            <div class="row">
              <span class="label">Purpose:</span>
              <span class="value">${expense.purpose}</span>
            </div>
            ` : ''}
            <div class="row">
              <span class="label">Category:</span>
              <span class="value">${(expense as any).category || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Status:</span>
              <span class="value">
                <span class="status status-${expense.status}">${expense.status}</span>
              </span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Employee Information</div>
            <div class="row">
              <span class="label">Employee Name:</span>
              <span class="value">${expense.user_name}</span>
            </div>
            <div class="row">
              <span class="label">Email:</span>
              <span class="value">${expense.user_email}</span>
            </div>
            ${expense.assigned_engineer_name ? `
            <div class="row">
              <span class="label">Assigned Manager:</span>
              <span class="value">${expense.assigned_engineer_name}</span>
            </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">Amount</div>
            <div class="row">
              <span class="label">Total Amount:</span>
              <span class="value amount">${formatINR(expense.total_amount)}</span>
            </div>
          </div>

          ${attachments.length > 0 ? `
          <div class="section">
            <div class="section-title">Attachments</div>
            ${attachments.map(att => `
              <div style="padding: 10px; background: #f9fafb; margin: 5px 0; border-radius: 4px;">
                <strong>${att.filename}</strong><br>
                <small>${att.content_type} • ${format(new Date(att.created_at), "MMM d, yyyy")}</small>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${expense.admin_comment ? `
          <div class="section">
            <div class="section-title">Admin Comments</div>
            <p>${expense.admin_comment}</p>
          </div>
          ` : ''}

          <div class="footer">
            <p>Generated on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}</p>
            <p>This is a computer-generated receipt.</p>
          </div>
        </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "travel":
        return "✈️";
      case "lodging":
        return "🏨";
      case "food":
        return "🍽️";
      default:
        return "📄";
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return "🖼️";
    } else if (contentType === 'application/pdf') {
      return "📄";
    } else if (contentType.includes('word')) {
      return "📝";
    }
    return "📎";
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading expense details...</p>
        </div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
        </div>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold">Expense Not Found</h2>
          <p className="text-muted-foreground">The requested expense could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{expense.title}</h1>
            <p className="text-muted-foreground">
              Created on {format(new Date(expense.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit() && (
            <Button onClick={() => navigate(`/expenses/${expense.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Expense Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(expense.status)}
                Expense Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Employee
                  </div>
                  <div>
                    <p className="font-medium">{expense.user_name}</p>
                    <p className="text-sm text-muted-foreground">{expense.user_email}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Coins className="h-4 w-4" />
                    Total Amount
                  </div>
                  <p className="text-2xl font-bold">{formatINR(expense.total_amount)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Destination
                  </div>
                  <p className="font-medium">{expense.destination}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Date of Expense
                  </div>
                  <p className="font-medium">
                    {format(parseLocalDate(expense.trip_start) ?? new Date(expense.trip_start), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {expense.category && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Category
                    </div>
                    <p className="font-medium capitalize">{expense.category}</p>
                  </div>
                </>
              )}

              {expense.purpose && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Purpose
                    </div>
                    <p className="text-sm">{expense.purpose}</p>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Status
                  </div>
                  <StatusBadge status={expense.status as any} />
                </div>
                {expense.assigned_engineer_name && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Assigned Manager
                    </div>
                    <p className="font-medium">{expense.assigned_engineer_name}</p>
                  </div>
                )}
              </div>

              {(expense as any).transaction_number && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Transaction Number
                    </div>
                    <p className="text-lg font-mono font-bold text-blue-600">{(expense as any).transaction_number}</p>
                    <p className="text-xs text-muted-foreground">Use this number to track the expense in Tally</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Form Field Values */}
          {formFieldValues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
                <CardDescription>
                  Category-specific form field data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {formFieldValues.map((field) => (
                    <div key={field.template_id} className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        {field.template_name}
                      </div>
                      <div className="text-base">
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
              </CardContent>
            </Card>
          )}

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Line Items</CardTitle>
              <CardDescription>
                Detailed breakdown of all expense items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No line items found
                </p>
              ) : (
                <div className="space-y-3">
                  {lineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getCategoryIcon(item.category)}</span>
                        <div>
                          <p className="font-medium capitalize">{item.category}</p>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(item.date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatINR(item.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          {attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Receipts & Attachments</CardTitle>
                <CardDescription>
                  Supporting documents and receipts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getFileIcon(attachment.content_type)}</span>
                        <div>
                          <p className="font-medium">{attachment.filename}</p>
                          <p className="text-sm text-muted-foreground">
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
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                  <img 
                    src={imagePreviewUrl} 
                    alt="Attachment preview" 
                    className="w-full h-auto rounded" 
                    onError={(e) => {
                      console.error("Preview failed to load:", imagePreviewUrl);
                    }}
                  />
                )
              )}
            </DialogContent>
          </Dialog>

          {/* Admin Comments */}
          {expense.admin_comment && (
            <Card>
              <CardHeader>
                <CardTitle>Admin Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{expense.admin_comment}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Status Timeline</CardTitle>
              <CardDescription>
                Track the progress of this expense
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
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
                    <div key={log.id} className={`flex gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
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
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleExportPDF}
              >
                <Download className="h-4 w-4 mr-2" />
                Export as PDF
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handlePrintReceipt}
              >
                <FileText className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
              {canEdit() && (
                <Button 
                  className="w-full justify-start"
                  onClick={() => navigate(`/expenses/${id}/edit`)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {expense?.status === "rejected" ? "Edit & Resubmit" : "Edit Expense"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
