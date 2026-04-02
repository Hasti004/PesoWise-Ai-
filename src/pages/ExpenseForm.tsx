import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAllowCashierExpenseSubmission } from "@/hooks/useAllowCashierExpenseSubmission";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Save, Send } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatINR, parseLocalDate } from "@/lib/format";
import { FileUpload } from "@/components/FileUpload";
import { ExpenseService, CreateExpenseData, UpdateExpenseData } from "@/services/ExpenseService";
import { AIAssistantModal } from "@/components/expenses/AIAssistantModal";
import { AIParsedExpense } from "@/services/AIService";
import { z } from "zod";
// line items removed

const expenseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  destination: z.string().min(1, "Destination is required"),
  expense_date: z.date().refine(
    (date) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    },
    {
      message: "Expense date cannot be in the future. Please select a past date or today.",
    }
  ),
  purpose: z.string().optional(),
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
});

// Line items schema removed

export default function ExpenseForm() {
  const { user, userRole, organizationId } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { allowCashierExpenseSubmission, loading: settingLoading } = useAllowCashierExpenseSubmission();

  // Block cashiers only when org does not allow cashier expense submission
  useEffect(() => {
    if (userRole !== "cashier") return;
    if (settingLoading) return;
    if (allowCashierExpenseSubmission === true) return;
    toast({
      variant: "destructive",
      title: "Access Denied",
      description: "Cashiers are not allowed to create or edit expenses.",
    });
    navigate("/expenses");
  }, [userRole, allowCashierExpenseSubmission, settingLoading, navigate, toast]);

  const [loading, setLoading] = useState(false);
  const [expense, setExpense] = useState({
    title: "",
    destination: "",
    expense_date: new Date(),
    purpose: "",
    amount: 0,
    category: "other",
  });
  // Line items state removed
  const [isEditing, setIsEditing] = useState(false);
  const [currentExpenseId, setCurrentExpenseId] = useState<string | null>(null);
  const [expenseStatus, setExpenseStatus] = useState<string | null>(null);
  const [requiredFiles, setRequiredFiles] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [recommendedCategories, setRecommendedCategories] = useState<string[]>([]);
  const [showRecommended, setShowRecommended] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [attachmentRequiredAboveAmount, setAttachmentRequiredAboveAmount] = useState<number>(50); // Default ₹50
  const [isAttachmentRequired, setIsAttachmentRequired] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiMissingInfo, setAiMissingInfo] = useState<string | null>(null);
  // Form fields state
  const [categoryFormFields, setCategoryFormFields] = useState<any[]>([]);
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string>>({});

  const mapAIToCategory = (aiCategory: AIParsedExpense["category"]): string => {
    const normalized = aiCategory.toLowerCase();
    const direct = categories.find((cat) => cat.toLowerCase() === normalized);
    if (direct) return direct;
    const includes = categories.find((cat) => cat.toLowerCase().includes(normalized));
    if (includes) return includes;
    return normalized;
  };

  const applyAIParsedExpense = async (parsed: AIParsedExpense) => {
    const nextCategory = mapAIToCategory(parsed.category);
    const nextDate = parsed.expense_date ? parseLocalDate(parsed.expense_date) ?? expense.expense_date : expense.expense_date;

    setExpense((prev) => ({
      ...prev,
      title: parsed.title || prev.title,
      destination: parsed.destination !== "Not-Specified" ? parsed.destination : prev.destination,
      amount: parsed.amount ?? prev.amount,
      category: nextCategory || prev.category,
      expense_date: nextDate,
      purpose: parsed.purpose ?? prev.purpose,
    }));

    if (nextCategory) {
      await fetchCategoryFormFields(nextCategory);
    }

    setAiMissingInfo(parsed.missingInfo);
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoadingCategories(true);
        if (!organizationId) return;
        
        // Try with 'active' first, then 'is_active' (filtered by organization_id)
        let { data: catData, error: catError } = await supabase
          .from('expense_categories')
          .select('name, active')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .order('name');
        
        if (catError && (catError as any).code === '42703') {
          // Fallback to 'is_active'
          const res2 = await supabase
            .from('expense_categories')
            .select('name, is_active')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('name');
          catData = res2.data;
          catError = res2.error;
        }
        
        if (catData) {
          const categoryNames = catData.map((c: any) => c.name || c);
          setCategories(categoryNames);
        }

        if (user?.id) {
          const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle();
          setIsAdmin(!!role);
        }

        // Fetch attachment required above amount setting
        // First try organization_settings table (preferred)
        const { data: orgSettings, error: orgError } = await supabase
          .from('organization_settings')
          .select('attachment_required_above_amount')
          .eq('organization_id', organizationId)
          .maybeSingle();
        
        console.log('📋 Loading attachment limit - organization_settings:', { orgSettings, orgError, organizationId });
        
        if (!orgError && orgSettings?.attachment_required_above_amount !== null && orgSettings?.attachment_required_above_amount !== undefined) {
          const limit = Number(orgSettings.attachment_required_above_amount);
          console.log('✅ Using attachment limit from organization_settings:', limit);
          if (!isNaN(limit) && limit >= 0) {
            setAttachmentRequiredAboveAmount(limit);
          }
        } else {
          // Fallback to settings table with organization_id filter
          const { data: attachmentLimitSetting, error: settingsError } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'attachment_required_above_amount')
            .eq('organization_id', organizationId)
            .maybeSingle();
          
          console.log('📋 Loading attachment limit - settings table:', { attachmentLimitSetting, settingsError, organizationId });
          
          if (!settingsError && attachmentLimitSetting) {
            const limit = parseFloat(attachmentLimitSetting.value);
            console.log('✅ Using attachment limit from settings table:', limit);
            if (!isNaN(limit) && limit >= 0) {
              setAttachmentRequiredAboveAmount(limit);
            }
          } else {
            console.warn('⚠️ No attachment limit found, using default 50');
          }
        }
      } finally {
        setLoadingCategories(false);
      }
    };
    init();
    if (id && id !== "new") {
      fetchExpense();
      setIsEditing(true);
    }
  }, [id, organizationId]);

  // Fetch form fields for selected category
  const fetchCategoryFormFields = async (categoryName: string) => {
    try {
      if (!organizationId || !categoryName) {
        setCategoryFormFields([]);
        setFormFieldValues({});
        return;
      }

      // Get category ID
      let { data: categoryData } = await supabase
        .from("expense_categories")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("name", categoryName)
        .maybeSingle();

      if (!categoryData) {
        setCategoryFormFields([]);
        setFormFieldValues({});
        return;
      }

      // Get form field assignments for this category
      const { data: assignments, error } = await supabase
        .from("expense_category_form_fields")
        .select(`
          *,
          expense_form_field_templates(*)
        `)
        .eq("organization_id", organizationId)
        .eq("category_id", categoryData.id)
        .order("display_order", { ascending: true });

      if (error) throw error;

      const fields = (assignments || []).map((assignment: any) => ({
        ...assignment,
        template: assignment.expense_form_field_templates
      }));

      setCategoryFormFields(fields);

      // Initialize form field values with defaults
      const initialValues: Record<string, string> = {};
      fields.forEach((field: any) => {
        if (field.template?.default_value) {
          initialValues[field.template.id] = field.template.default_value;
        } else if (field.template?.field_type === 'checkbox') {
          initialValues[field.template.id] = 'false';
        }
      });
      setFormFieldValues(initialValues);
    } catch (e: any) {
      console.error("Failed to fetch category form fields:", e);
      setCategoryFormFields([]);
    }
  };

  // Update attachment requirement based on amount
  useEffect(() => {
    const amount = expense.amount || 0;
    const required = amount > attachmentRequiredAboveAmount;
    setIsAttachmentRequired(required);
    
    // If amount is below limit and attachments exist, clear them (optional - you may want to keep existing)
    // For now, we'll just disable the field but keep existing attachments
  }, [expense.amount, attachmentRequiredAboveAmount]);

  const fetchExpense = async () => {
    try {
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", id)
        .single();

      if (expenseError) throw expenseError;

      setExpense({
        title: expenseData.title,
        destination: expenseData.destination,
        expense_date: parseLocalDate(expenseData.trip_start) ?? new Date(),
        purpose: expenseData.purpose || "",
        amount: Number(expenseData.total_amount || 0),
        category: expenseData.category || "other",
      });

      setCurrentExpenseId(expenseData.id);
      setExpenseStatus(expenseData.status);
      
      // Fetch form fields for this category and load existing values
      if (expenseData.category) {
        await fetchCategoryFormFields(expenseData.category);
        
        // Load existing form field values
        const { data: existingValues } = await supabase
          .from("expense_form_field_values")
          .select("template_id, field_value")
          .eq("expense_id", expenseData.id)
          .eq("organization_id", organizationId);
        
        if (existingValues) {
          const values: Record<string, string> = {};
          existingValues.forEach((val: any) => {
            values[val.template_id] = val.field_value;
          });
          setFormFieldValues(values);
        }
      }

      // Fetch existing attachments for this expense
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("file_url")
        .eq("expense_id", id);

      if (!attachmentsError && attachmentsData) {
        // Load existing attachments into state
        const existingAttachmentUrls = attachmentsData
          .map(att => att.file_url)
          .filter(url => url) as string[];
        setAttachments(existingAttachmentUrls);
      }

      // no line items fetch
    } catch (error) {
      console.error("Error fetching expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load expense data",
      });
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (!organizationId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Organization not found' });
      return;
    }
    try {
      // Try inserting with 'active' first (must include organization_id)
      let { error } = await supabase
        .from('expense_categories')
        .insert({ name, active: true, organization_id: organizationId, created_by: user?.id || null });
      if (error && (error as any).code === '42703') {
        // Fallback to 'is_active'
        const res2 = await supabase
          .from('expense_categories')
          .insert({ name, is_active: true, organization_id: organizationId, created_by: user?.id || null });
        error = res2.error as any;
      }
      if (error) throw error;

      // Refresh categories list
      setCategories((prev) => Array.from(new Set([...
        prev,
        name
      ])));
      setNewCategoryName("");
      setAddCatOpen(false);
      toast({ title: 'Category added', description: `${name} has been added.` });
    } catch (e: any) {
      console.error('Failed to add category:', e);
      toast({ variant: 'destructive', title: 'Error', description: e?.message || 'Failed to add category' });
    }
  };

  const AddCategoryDialog = (
    <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="newCat">Category Name</Label>
          <Input id="newCat" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g., Travel" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddCatOpen(false)}>Cancel</Button>
          <Button onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // addLineItem removed

  const moveTempFilesToExpense = async (expenseId: string) => {
    try {
      if (!user?.id) {
        console.error('User not authenticated');
        return;
      }
      
      if (!organizationId) {
        console.error('Organization not found');
        throw new Error('Organization not found');
      }

      // Get all temp files for this user
      const { data: tempFiles, error: listError } = await supabase.storage
        .from('receipts')
        .list(`temp/${user.id}`, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) {
        console.error('Error listing temp files:', listError);
        return;
      }

      if (!tempFiles || tempFiles.length === 0) return;

      // Move each temp file to the expense folder
      for (const file of tempFiles) {
        const tempPath = `temp/${user.id}/${file.name}`;
        const newPath = `${expenseId}/${file.name}`;

        // Copy file to new location
        const { data: copyData, error: copyError } = await supabase.storage
          .from('receipts')
          .copy(tempPath, newPath);

        if (copyError) {
          console.error('Error copying file:', copyError);
          continue;
        }

        // Create attachment record
        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(newPath);

        const { error: attachmentInsertError } = await supabase
          .from('attachments')
          .insert({
            expense_id: expenseId,
            organization_id: organizationId,
            file_url: urlData?.publicUrl || '',
            filename: file.name || 'unknown',
            content_type: file.metadata?.mimetype || 'image/jpeg',
            uploaded_by: user.id
          });
        
        if (attachmentInsertError) {
          console.error('Error creating attachment record:', attachmentInsertError);
          throw attachmentInsertError;
        }

        // Delete temp file
        await supabase.storage
          .from('receipts')
          .remove([tempPath]);
      }
    } catch (error) {
      console.error('Error moving temp files:', error);
    }
  };

  // Fetch recommended categories based on usage
  const fetchRecommendedCategories = async () => {
    try {
      if (!organizationId || !user?.id || categories.length === 0) {
        // If no categories yet, set default recommendations
        if (categories.length > 0) {
          setRecommendedCategories(categories.slice(0, 3));
        }
        return;
      }
      
      const { data, error } = await supabase
        .from("category_usage_tracking")
        .select("category_name, usage_count")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .order("usage_count", { ascending: false })
        .order("last_used_at", { ascending: false })
        .limit(4);
      
      if (error) {
        console.error("Failed to fetch recommended categories:", error);
      }
      
      let recommended: string[] = [];
      
      if (data && data.length > 0) {
        // User has usage history - use their top categories
        recommended = (data || [])
          .map(item => item.category_name)
          .filter(name => categories.includes(name)); // Only include active categories
      }
      
      // If user has no history or less than 3 recommendations, fill with default/common categories
      if (recommended.length < 3 && categories.length > 0) {
        // Common categories that are likely to be used
        const commonCategories = ["Travel", "Food", "Office Supplies", "Transport", "Meals", "Fuel", "Accommodation"];
        
        // Get categories that aren't already in recommended
        const availableCategories = categories.filter(cat => 
          !recommended.includes(cat) && 
          commonCategories.some(common => cat.toLowerCase().includes(common.toLowerCase()))
        );
        
        // Fill up to 3 total recommendations
        const needed = 3 - recommended.length;
        recommended = [...recommended, ...availableCategories.slice(0, needed)];
        
        // If still not enough, just add any available categories
        if (recommended.length < 3) {
          const remaining = categories.filter(cat => !recommended.includes(cat));
          recommended = [...recommended, ...remaining.slice(0, 3 - recommended.length)];
        }
      }
      
      setRecommendedCategories(recommended.slice(0, 4)); // Max 4 recommendations
    } catch (e: any) {
      console.error("Error fetching recommended categories:", e);
      // Fallback: use first 3 categories if available
      if (categories.length > 0) {
        setRecommendedCategories(categories.slice(0, 3));
      }
    }
  };
  
  // Fetch recommended categories when categories change
  useEffect(() => {
    if (categories.length > 0 && organizationId && user?.id) {
      fetchRecommendedCategories();
    }
  }, [categories.length, organizationId, user?.id]);

  // Track category usage
  const trackCategoryUsage = async (categoryName: string) => {
    try {
      if (!organizationId || !user?.id || !categoryName) return;
      
      // Try RPC function first
      const { error: rpcError } = await supabase.rpc('increment_category_usage', {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_category_name: categoryName
      });
      
      if (rpcError) {
        // Fallback to direct upsert with increment
        const { data: existing } = await supabase
          .from("category_usage_tracking")
          .select("usage_count")
          .eq("organization_id", organizationId)
          .eq("user_id", user.id)
          .eq("category_name", categoryName)
          .maybeSingle();
        
        const newCount = existing ? existing.usage_count + 1 : 1;
        
        const { error: upsertError } = await supabase
          .from("category_usage_tracking")
          .upsert({
            organization_id: organizationId,
            user_id: user.id,
            category_name: categoryName,
            usage_count: newCount,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'organization_id,user_id,category_name'
          });
        
        if (upsertError) {
          console.error("Failed to track category usage:", upsertError);
        }
      }
      
      // Refresh recommended categories
      await fetchRecommendedCategories();
    } catch (e: any) {
      console.error("Error tracking category usage:", e);
    }
  };

  // Save form field values
  const saveFormFieldValues = async (expenseId: string) => {
    try {
      if (!organizationId || categoryFormFields.length === 0) return;

      const valuesToSave = Object.entries(formFieldValues)
        .filter(([_, value]) => value !== null && value !== undefined && value !== "")
        .map(([templateId, value]) => ({
          organization_id: organizationId,
          expense_id: expenseId,
          template_id: templateId,
          field_value: String(value),
        }));

      if (valuesToSave.length > 0) {
        const { error } = await supabase
          .from("expense_form_field_values")
          .upsert(valuesToSave, {
            onConflict: 'expense_id,template_id',
          });

        if (error) {
          console.error("Failed to save form field values:", error);
          // Don't throw - form fields are supplementary
        }
      }
    } catch (e: any) {
      console.error("Error saving form field values:", e);
      // Don't throw - form fields are supplementary
    }
  };

  // line item handlers removed

  const saveExpense = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Validate expense data
      const validatedExpense = expenseSchema.parse({
        ...expense,
        expense_date: expense.expense_date,
      });

      // Validate form fields
      for (const field of categoryFormFields) {
        const template = field.template;
        const isRequired = field.required !== null ? field.required : template.required;
        const value = formFieldValues[template.id] || "";
        
        if (isRequired && !value.trim()) {
          throw new Error(`${template.name} is required`);
        }
        
        // Validate number fields
        if (template.field_type === 'number' && value) {
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            throw new Error(`${template.name} must be a valid number`);
          }
          if (template.validation_rules?.min !== undefined && numValue < template.validation_rules.min) {
            throw new Error(`${template.name} must be at least ${template.validation_rules.min}`);
          }
          if (template.validation_rules?.max !== undefined && numValue > template.validation_rules.max) {
            throw new Error(`${template.name} must be at most ${template.validation_rules.max}`);
          }
        }
      }

      // Check if bill photos are required based on amount
      // Fetch the latest attachment limit from database to ensure we have the correct value
      const { data: latestOrgSettings } = await supabase
        .from('organization_settings')
        .select('attachment_required_above_amount')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      const currentAttachmentLimit = latestOrgSettings?.attachment_required_above_amount !== null && latestOrgSettings?.attachment_required_above_amount !== undefined
        ? Number(latestOrgSettings.attachment_required_above_amount)
        : attachmentRequiredAboveAmount;
      
      const expenseAmount = validatedExpense.amount;
      const requiresAttachment = expenseAmount > currentAttachmentLimit;

      console.log('🔍 Attachment validation:', { 
        expenseAmount, 
        currentAttachmentLimit, 
        requiresAttachment,
        attachmentRequiredAboveAmount,
        latestOrgSettings 
      });

      if (requiresAttachment) {
        // For new expenses, check if attachments exist
        if (!isEditing) {
          // First check the attachments state (files uploaded via FileUpload component)
          const hasAttachmentsInState = attachments && attachments.length > 0;
          
          // Also check for temp files in storage as a fallback
          const { data: tempFiles } = await supabase.storage
            .from('receipts')
            .list(`temp/${user.id}`, { limit: 100 });
          
          const hasTempFiles = tempFiles && tempFiles.length > 0;
          
          // Require at least one attachment either in state or in storage
          if (!hasAttachmentsInState && !hasTempFiles) {
            throw new Error(`Bill photos are required for expenses above ₹${currentAttachmentLimit}. Please upload at least one photo of your receipt or bill.`);
          }
        } else if (id) {
          // For editing, check if there are any attachments (existing in DB, in state, or temp files)
          const { data: existingAttachments } = await supabase
            .from("attachments")
            .select("id")
            .eq("expense_id", id);
          
          // Check the attachments state (includes existing + newly uploaded)
          const hasAttachmentsInState = attachments && attachments.length > 0;
          
          // Check for temp files that will be moved
          const { data: tempFiles } = await supabase.storage
            .from('receipts')
            .list(`temp/${user.id}`, { limit: 100 });
          
          const hasExistingAttachments = existingAttachments && existingAttachments.length > 0;
          const hasTempFiles = tempFiles && tempFiles.length > 0;
          
          // Require at least one attachment from any source
          if (!hasExistingAttachments && !hasAttachmentsInState && !hasTempFiles) {
            throw new Error(`Bill photos are required for expenses above ₹${currentAttachmentLimit}. Please upload at least one photo of your receipt or bill.`);
          }
        }
      }

      // Prepare data for ExpenseService
      // Use expense_date for both trip_start and trip_end since DB requires both.
      // Build YYYY-MM-DD from local date parts to avoid timezone shifting the day.
      const d = validatedExpense.expense_date;
      const expenseDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const expenseData: CreateExpenseData | UpdateExpenseData = {
        title: validatedExpense.title,
        destination: validatedExpense.destination,
        trip_start: expenseDateStr,
        trip_end: expenseDateStr,
        purpose: validatedExpense.purpose,
        amount: validatedExpense.amount,
        category: validatedExpense.category,
      };

      if (isEditing && id) {
        // Update existing expense
        await ExpenseService.updateExpense(id, user.id, expenseData);
        
        // Move any temp files to the expense folder (for newly uploaded files during edit)
        // This must succeed before submission
        await moveTempFilesToExpense(id);
        
        // Submit the expense (this will handle status change to submitted)
        await ExpenseService.submitExpense(id, user.id);
        
        // Save form field values
        await saveFormFieldValues(id);
        
        // Track category usage
        await trackCategoryUsage(validatedExpense.category);
      } else {
        // Create new expense
        const newExpense = await ExpenseService.createExpense(user.id, expenseData as CreateExpenseData);
        setCurrentExpenseId(newExpense.id);
        
        // Move temp files to the new expense folder
        // This must succeed before submission - if it fails, the expense creation will be rolled back
        try {
          await moveTempFilesToExpense(newExpense.id);
        } catch (attachmentError: any) {
          // If attachment creation fails, delete the expense and throw error
          await supabase
            .from('expenses')
            .delete()
            .eq('id', newExpense.id);
          throw new Error(`Failed to create attachments: ${attachmentError.message || 'Unknown error'}`);
        }
        
        // Submit the expense
        await ExpenseService.submitExpense(newExpense.id, user.id);
        
        // Save form field values
        await saveFormFieldValues(newExpense.id);
        
        // Track category usage
        await trackCategoryUsage(validatedExpense.category);
      }

      const isResubmission = expenseStatus === "rejected";
      toast({
        title: "Success",
        description: userRole === "admin" 
          ? "Expense created and auto-approved. Amount deducted from your balance." 
          : isResubmission
          ? "Expense resubmitted successfully"
          : "Expense submitted successfully",
      });

      navigate("/expenses");
    } catch (error: any) {
      console.error("Error saving expense:", error);
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        stack: error?.stack
      });
      
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: error.errors[0].message,
        });
      } else {
        // Provide more detailed error information
        let errorMessage = "Failed to save expense";
        if (error?.message) {
          errorMessage = error.message;
        } else if (error?.code) {
          errorMessage = `Database error (${error.code}): ${error.message || 'Unknown error'}`;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error, null, 2);
        }
        
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 max-w-4xl mx-auto">
      {/* Center-aligned Header */}
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {isEditing 
            ? expenseStatus === "rejected" 
              ? "Edit & Resubmit Expense" 
              : "Edit Expense" 
            : "New Expense"}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">
          {isEditing 
            ? expenseStatus === "rejected"
              ? "Update your expense details and resubmit for review"
              : "Update your expense details"
            : "Create a new expense claim"}
        </p>
      </div>

      <div className="flex justify-center">
        {/* Expense Details */}
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-center">Expense Details</CardTitle>
            <CardDescription className="text-center">Basic information about your expense</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setAiModalOpen(true)}>
                Auto-Fill with AI
              </Button>
            </div>

            {aiMissingInfo && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                AI could not determine: {aiMissingInfo}
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="category">Category *</Label>
              
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                      id="category"
                    >
                      {expense.category || (loadingCategories ? 'Loading...' : 'Select a category')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        <CommandEmpty>No categories found.</CommandEmpty>
                        <CommandGroup>
                          {categories.map((c) => (
                            <CommandItem
                              key={c}
                              value={c}
                              onSelect={async () => {
                                setExpense({ ...expense, category: c });
                                await fetchCategoryFormFields(c);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  expense.category === c ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {c}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {isAdmin && (
                  <Button type="button" variant="outline" onClick={() => setAddCatOpen(true)}>Add</Button>
                )}
              </div>
              
              {/* Recommended Categories - Prominent below the dropdown */}
              {recommendedCategories.length > 0 && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Label className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        ⭐ Recommended Categories
                      </Label>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                        Your most frequently used categories
                      </p>
                    </div>
                    {showRecommended && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                        onClick={() => setShowRecommended(false)}
                      >
                        Hide
                      </Button>
                    )}
                  </div>
                  {showRecommended ? (
                    <div className="flex flex-wrap gap-2">
                      {recommendedCategories.map((cat) => (
                        <Button
                          key={cat}
                          type="button"
                          variant={expense.category === cat ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "h-9 text-sm font-medium transition-all",
                            expense.category === cat 
                              ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" 
                              : "bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100"
                          )}
                          onClick={async () => {
                            setExpense({ ...expense, category: cat });
                            await fetchCategoryFormFields(cat);
                          }}
                        >
                          {cat}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                      onClick={() => setShowRecommended(true)}
                    >
                      Show Recommended Categories ({recommendedCategories.length})
                    </Button>
                  )}
                </div>
              )}
              
              {!categories.length && (
                <p className="text-xs text-muted-foreground">No categories yet. {isAdmin ? 'Add one to get started.' : 'Please contact admin.'}</p>
              )}
            </div>

            {/* Category Form Fields */}
            {categoryFormFields.length > 0 && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                <h3 className="font-semibold text-sm">Additional Information</h3>
                {categoryFormFields.map((field: any) => {
                  const template = field.template;
                  const fieldId = `field-${template.id}`;
                  const isRequired = field.required !== null ? field.required : template.required;
                  const value = formFieldValues[template.id] || "";

                  return (
                    <div key={template.id} className="space-y-2">
                      <Label htmlFor={fieldId}>
                        {template.name}
                        {isRequired && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      
                      {template.field_type === 'text' && (
                        <Input
                          id={fieldId}
                          value={value}
                          onChange={(e) => setFormFieldValues({
                            ...formFieldValues,
                            [template.id]: e.target.value
                          })}
                          placeholder={template.placeholder || ""}
                          required={isRequired}
                        />
                      )}
                      
                      {template.field_type === 'number' && (
                        <Input
                          id={fieldId}
                          type="number"
                          value={value}
                          onChange={(e) => setFormFieldValues({
                            ...formFieldValues,
                            [template.id]: e.target.value
                          })}
                          placeholder={template.placeholder || ""}
                          min={template.validation_rules?.min}
                          max={template.validation_rules?.max}
                          required={isRequired}
                        />
                      )}
                      
                      {template.field_type === 'date' && (
                        <Input
                          id={fieldId}
                          type="date"
                          value={value}
                          onChange={(e) => setFormFieldValues({
                            ...formFieldValues,
                            [template.id]: e.target.value
                          })}
                          required={isRequired}
                        />
                      )}
                      
                      {template.field_type === 'textarea' && (
                        <Textarea
                          id={fieldId}
                          value={value}
                          onChange={(e) => setFormFieldValues({
                            ...formFieldValues,
                            [template.id]: e.target.value
                          })}
                          placeholder={template.placeholder || ""}
                          required={isRequired}
                          rows={3}
                        />
                      )}
                      
                      {template.field_type === 'select' && (
                        <Select
                          value={value}
                          onValueChange={(val) => setFormFieldValues({
                            ...formFieldValues,
                            [template.id]: val
                          })}
                        >
                          <SelectTrigger id={fieldId}>
                            <SelectValue placeholder={template.placeholder || "Select an option"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(template.options || []).map((option: string, idx: number) => (
                              <SelectItem key={idx} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      
                      {template.field_type === 'checkbox' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={fieldId}
                            checked={value === 'true'}
                            onChange={(e) => setFormFieldValues({
                              ...formFieldValues,
                              [template.id]: e.target.checked ? 'true' : 'false'
                            })}
                            className="rounded"
                          />
                          <Label htmlFor={fieldId} className="cursor-pointer">
                            {template.placeholder || "Check this box"}
                          </Label>
                        </div>
                      )}
                      
                      {template.help_text && (
                        <p className="text-xs text-muted-foreground">{template.help_text}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={expense.title}
                onChange={(e) => setExpense({ ...expense, title: e.target.value })}
                placeholder="e.g., Office supplies purchase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">Vendor / Location *</Label>
              <Input
                id="destination"
                value={expense.destination}
                onChange={(e) => setExpense({ ...expense, destination: e.target.value })}
                placeholder="e.g., Amazon, New York, NY"
              />
            </div>

            <div className="space-y-2">
              <Label>Expense Date *</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !expense.expense_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expense.expense_date ? format(expense.expense_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={expense.expense_date}
                    onSelect={(date) => {
                      if (!date) return;
                      // Use local date parts so the highlighted day matches the day the user clicked (no off-by-one)
                      const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                      setExpense((prev) => ({ ...prev, expense_date: localMidnight }));
                      setDatePickerOpen(false);
                    }}
                    initialFocus
                    disabled={(date) => {
                      // Disable all future dates (dates after today)
                      const today = new Date();
                      today.setHours(23, 59, 59, 999); // End of today
                      return date > today;
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea
                id="purpose"
                value={expense.purpose}
                onChange={(e) => setExpense({ ...expense, purpose: e.target.value })}
                placeholder="Describe the purpose of this expense..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={expense.amount === 0 ? "" : expense.amount}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only update if value is valid number or empty
                  if (value === "" || value === ".") {
                    setExpense({ ...expense, amount: 0 });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      setExpense({ ...expense, amount: numValue });
                    }
                  }
                }}
                onBlur={(e) => {
                  // Ensure value is properly formatted on blur
                  const value = e.target.value;
                  if (value === "" || value === ".") {
                    setExpense({ ...expense, amount: 0 });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                      setExpense({ ...expense, amount: numValue });
                    }
                  }
                }}
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items removed from the creation form */}
      </div>

      {/* File Upload Section - Conditionally Required */}
      <div className="mt-8 flex justify-center">
        <Card className={`w-full max-w-2xl ${!isAttachmentRequired ? 'opacity-75' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Bill Photos
              {isAttachmentRequired && (
                <span className="text-red-500 text-sm font-normal">* Required</span>
              )}
            </CardTitle>
            <CardDescription>
              {isAttachmentRequired 
                ? `Upload photos of your receipts and bills. Required for expenses above ${formatINR(attachmentRequiredAboveAmount)}.`
                : `Upload photos of your receipts and bills (optional for expenses up to ${formatINR(attachmentRequiredAboveAmount)}).`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorBoundary>
              <FileUpload 
                expenseId={currentExpenseId || id || "new"} 
                onUploadComplete={(attachment) => {
                  if (attachment && attachment.file_url) {
                    setAttachments(prev => [...prev, attachment.file_url]);
                    toast({
                      title: "Bill photo uploaded",
                      description: "Photo has been attached to this expense",
                    });
                  }
                }}
                required={isAttachmentRequired}
              />
            </ErrorBoundary>
            {!isAttachmentRequired && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  ℹ️ Bills above {formatINR(attachmentRequiredAboveAmount)} require an attachment (configured by admin). 
                  Your current amount ({formatINR(expense.amount || 0)}) does not require attachments.
                </p>
              </div>
            )}
            {isAttachmentRequired && attachments.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-green-600 font-medium">
                  ✓ {attachments.length} bill photo{attachments.length > 1 ? 's' : ''} uploaded
                </p>
              </div>
            )}
            {isAttachmentRequired && attachments.length === 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ You must upload at least one bill photo for expenses above {formatINR(attachmentRequiredAboveAmount)}.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit and Cancel Buttons - Full Width, Center-aligned */}
      <div className="flex flex-col gap-2 w-full max-w-2xl mx-auto">
        <Button
          onClick={() => saveExpense()}
          disabled={loading}
          className="w-full"
        >
          <Send className="mr-2 h-4 w-4" />
          {isEditing && expenseStatus === "rejected" ? "Resubmit" : "Submit"}
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/expenses")}
          disabled={loading}
          className="w-full"
        >
          Cancel
        </Button>
      </div>

      {AddCategoryDialog}
      <AIAssistantModal open={aiModalOpen} onOpenChange={setAiModalOpen} onExpenseParsed={applyAIParsedExpense} />
    </div>
  );
}
