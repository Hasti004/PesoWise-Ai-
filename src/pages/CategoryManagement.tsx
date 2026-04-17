import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Plus, Tag, Upload, FileText, Settings, Link2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

interface FormFieldTemplate {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';
  required: boolean;
  default_value?: string | null;
  placeholder?: string | null;
  help_text?: string | null;
  validation_rules?: any;
  options?: string[] | null;
  created_at: string;
}

interface CategoryFormField {
  id: string;
  category_id: string;
  template_id: string;
  category_name?: string;
  template_name?: string;
  required?: boolean | null;
  display_order: number;
}

export default function CategoryManagement() {
  const { userRole, user, organizationId } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryActive, setCategoryActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<{
    added: string[];
    skipped: string[];
    errors: string[];
  } | null>(null);
  
  // Form Field Templates state
  const [activeTab, setActiveTab] = useState("categories");
  const [templates, setTemplates] = useState<FormFieldTemplate[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormFieldTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox'>('text');
  const [templateRequired, setTemplateRequired] = useState(false);
  const [templateDefaultValue, setTemplateDefaultValue] = useState("");
  const [templatePlaceholder, setTemplatePlaceholder] = useState("");
  const [templateHelpText, setTemplateHelpText] = useState("");
  const [templateMin, setTemplateMin] = useState("");
  const [templateMax, setTemplateMax] = useState("");
  const [templateOptions, setTemplateOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  
  // Category-Field Assignment state
  const [categoryFields, setCategoryFields] = useState<CategoryFormField[]>([]);
  const [selectedCategoriesForAssignment, setSelectedCategoriesForAssignment] = useState<Set<string>>(new Set());
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedTemplatesForAssignment, setSelectedTemplatesForAssignment] = useState<Set<string>>(new Set());
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");
  const [formFieldFeatureAvailable, setFormFieldFeatureAvailable] = useState(true);
  const hasShownFormFieldUnavailableToast = useRef(false);

  const isMissingFormFieldTablesError = (e: any) => {
    const code = (e?.code || "").toString().toUpperCase();
    const msg = `${e?.message || ""} ${e?.details || ""} ${e?.hint || ""}`.toLowerCase();
    return (
      code === "42P01" ||
      code === "PGRST205" ||
      msg.includes("expense_form_field_templates") ||
      msg.includes("expense_category_form_fields") ||
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      msg.includes("relation") && msg.includes("does not exist")
    );
  };

  const handleFormFieldFeatureUnavailable = () => {
    setFormFieldFeatureAvailable(false);
    setTemplates([]);
    setCategoryFields([]);
    if (activeTab !== "categories") {
      setActiveTab("categories");
    }
    if (!hasShownFormFieldUnavailableToast.current) {
      hasShownFormFieldUnavailableToast.current = true;
      toast({
        title: "Form-field templates unavailable",
        description:
          "Database form-field tables are missing in this environment. Run latest Supabase migrations, then refresh this page.",
      });
    }
  };

  useEffect(() => {
    if (userRole === "admin") {
      fetchCategories();
      if (!formFieldFeatureAvailable) return;
      if (activeTab === "templates") {
        fetchTemplates();
      } else if (activeTab === "assignments") {
        fetchTemplates();
        fetchCategoryFields();
      }
    }
  }, [userRole, activeTab, organizationId, formFieldFeatureAvailable]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      if (!organizationId) return;
      
      // Try with 'active' first, then 'is_active' (filtered by organization_id)
      let { data, error } = await (supabase as any)
        .from("expense_categories")
        .select("id, name, active, created_at, created_by")
        .eq("organization_id", organizationId)
        .order("name", { ascending: true });

      if (error && (error as any).code === '42703') {
        const res2 = await (supabase as any)
          .from("expense_categories")
          .select("id, name, is_active, created_at, created_by")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true });
        data = res2.data as any;
        error = res2.error as any;
        if (data) {
          data = data.map((cat: any) => ({
            ...cat,
            active: cat.is_active
          }));
        }
      }

      if (error) throw error;
      setCategories((data as Category[]) || []);
    } catch (e: any) {
      console.error("Failed to fetch categories:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to load categories",
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setCategoryName("");
    setCategoryActive(true);
    setSelectedCategory(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category);
    setCategoryName(category.name);
    setCategoryActive(category.active);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (category: Category) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!categoryName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Category name is required",
      });
      return;
    }

    try {
      setSaving(true);

      if (selectedCategory) {
        // Update existing category
        let { error } = await (supabase as any)
          .from("expense_categories")
          .update({
            name: categoryName.trim(),
            active: categoryActive,
          })
          .eq("id", selectedCategory.id);

        if (error && (error as any).code === '42703') {
          const res2 = await (supabase as any)
            .from("expense_categories")
            .update({
              name: categoryName.trim(),
              is_active: categoryActive,
            })
            .eq("id", selectedCategory.id);
          error = res2.error as any;
        }

        if (error) throw error;

        toast({
          title: "Category Updated",
          description: `${categoryName} has been updated successfully`,
        });
      } else {
        // Create new category (must include organization_id)
        if (!organizationId) {
          throw new Error("Organization not found");
        }
        
        let { error } = await (supabase as any)
          .from("expense_categories")
          .insert({
            name: categoryName.trim(),
            active: categoryActive,
            organization_id: organizationId,
            created_by: user?.id || null,
          });

        if (error && (error as any).code === '42703') {
          const res2 = await (supabase as any)
            .from("expense_categories")
            .insert({
              name: categoryName.trim(),
              is_active: categoryActive,
              organization_id: organizationId,
              created_by: user?.id || null,
            });
          error = res2.error as any;
        }

        if (error) throw error;

        toast({
          title: "Category Created",
          description: `${categoryName} has been created successfully`,
        });
      }

      setEditDialogOpen(false);
      setAddDialogOpen(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (e: any) {
      console.error("Failed to save category:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to save category",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;

    try {
      setDeleting(true);

      const { error } = await (supabase as any)
        .from("expense_categories")
        .delete()
        .eq("id", selectedCategory.id);

      if (error) throw error;

      toast({
        title: "Category Deleted",
        description: `${selectedCategory.name} has been deleted successfully`,
      });

      setDeleteDialogOpen(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (e: any) {
      console.error("Failed to delete category:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to delete category",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleMassImport = async () => {
    if (!importFile || !organizationId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a CSV file",
      });
      return;
    }

    try {
      setImporting(true);
      
      // Read CSV file
      const text = await importFile.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      if (lines.length === 0) {
        throw new Error("CSV file is empty");
      }

      // Remove header if it's "name" (case insensitive)
      const firstLine = lines[0].toLowerCase().trim();
      const categoryNames = firstLine === 'name' ? lines.slice(1) : lines;
      
      if (categoryNames.length === 0) {
        throw new Error("No categories found in CSV file");
      }

      // Remove duplicates from CSV
      const uniqueCategoryNames = Array.from(new Set(categoryNames.map(name => name.trim()).filter(name => name.length > 0)));

      // Get existing categories
      let existingCategories: Category[] = [];
      let { data, error: fetchError } = await (supabase as any)
        .from("expense_categories")
        .select("name")
        .eq("organization_id", organizationId);

      if (fetchError && (fetchError as any).code === '42703') {
        const res2 = await (supabase as any)
          .from("expense_categories")
          .select("name")
          .eq("organization_id", organizationId);
        data = res2.data;
        fetchError = res2.error;
      }

      if (fetchError) throw fetchError;
      existingCategories = (data || []) as Category[];

      const existingNames = new Set(existingCategories.map(cat => cat.name.toLowerCase().trim()));

      // Separate into added, skipped, and errors
      const results = {
        added: [] as string[],
        skipped: [] as string[],
        errors: [] as string[],
      };

      // Process each category
      for (const categoryName of uniqueCategoryNames) {
        const trimmedName = categoryName.trim();
        
        if (!trimmedName) {
          results.errors.push(`Empty category name skipped`);
          continue;
        }

        // Check if already exists (case-insensitive)
        if (existingNames.has(trimmedName.toLowerCase())) {
          results.skipped.push(trimmedName);
          continue;
        }

        // Try to insert
        try {
          let { error: insertError } = await (supabase as any)
            .from("expense_categories")
            .insert({
              name: trimmedName,
              active: true,
              organization_id: organizationId,
              created_by: user?.id || null,
            });

          if (insertError && (insertError as any).code === '42703') {
            const res2 = await (supabase as any)
              .from("expense_categories")
              .insert({
                name: trimmedName,
                is_active: true,
                organization_id: organizationId,
                created_by: user?.id || null,
              });
            insertError = res2.error as any;
          }

          if (insertError) {
            // Check if it's a duplicate error (unique constraint)
            if ((insertError as any).code === '23505' || insertError.message?.includes('unique')) {
              results.skipped.push(trimmedName);
            } else {
              results.errors.push(`${trimmedName}: ${insertError.message || 'Failed to import'}`);
            }
          } else {
            results.added.push(trimmedName);
            // Add to existing names to avoid duplicates in same import
            existingNames.add(trimmedName.toLowerCase());
          }
        } catch (e: any) {
          results.errors.push(`${trimmedName}: ${e.message || 'Failed to import'}`);
        }
      }

      setImportResults(results);

      // Show summary toast
      const totalProcessed = results.added.length + results.skipped.length + results.errors.length;
      toast({
        title: "Import Complete",
        description: `Processed ${totalProcessed} categories: ${results.added.length} added, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      });

      // Refresh categories list
      if (results.added.length > 0) {
        fetchCategories();
      }
    } catch (e: any) {
      console.error("Failed to import categories:", e);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: e.message || "Failed to import categories from CSV file",
      });
    } finally {
      setImporting(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">Only administrators can access category management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchTemplates = async () => {
    try {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from("expense_form_field_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setTemplates((data || []) as FormFieldTemplate[]);
    } catch (e: any) {
      if (isMissingFormFieldTablesError(e)) {
        console.warn("Form-field tables unavailable:", e);
        handleFormFieldFeatureUnavailable();
        return;
      }
      console.error("Failed to fetch templates:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to load form field templates",
      });
    }
  };

  const fetchCategoryFields = async () => {
    try {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from("expense_category_form_fields")
        .select(`
          *,
          expense_categories(name),
          expense_form_field_templates(name)
        `)
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      
      // Transform the data to include category and template names
      const transformed = (data || []).map((item: any) => ({
        ...item,
        category_name: item.expense_categories?.name,
        template_name: item.expense_form_field_templates?.name
      }));
      
      setCategoryFields(transformed as CategoryFormField[]);
    } catch (e: any) {
      if (isMissingFormFieldTablesError(e)) {
        console.warn("Form-field assignment tables unavailable:", e);
        handleFormFieldFeatureUnavailable();
        return;
      }
      console.error("Failed to fetch category fields:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to load category-field assignments",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Category Management</h1>
          <p className="text-muted-foreground">Manage expense categories and form fields</p>
        </div>
        {activeTab === "categories" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Mass Import
            </Button>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
        )}
        {formFieldFeatureAvailable && activeTab === "templates" && (
          <Button onClick={() => {
            setSelectedTemplate(null);
            setTemplateName("");
            setTemplateType("text");
            setTemplateRequired(false);
            setTemplateDefaultValue("");
            setTemplatePlaceholder("");
            setTemplateHelpText("");
            setTemplateMin("");
            setTemplateMax("");
            setTemplateOptions([]);
            setNewOption("");
            setTemplateDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        )}
        {formFieldFeatureAvailable && activeTab === "assignments" && (
          <Button onClick={() => {
            setSelectedCategoriesForAssignment(new Set());
            setSelectedTemplatesForAssignment(new Set());
            setAssignmentDialogOpen(true);
          }}>
            <Link2 className="h-4 w-4 mr-2" />
            Assign Fields to Categories
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", formFieldFeatureAvailable ? "grid-cols-3" : "grid-cols-1")}>
          <TabsTrigger value="categories">
            <Tag className="h-4 w-4 mr-2" />
            Categories
          </TabsTrigger>
          {formFieldFeatureAvailable && (
            <TabsTrigger value="templates">
              <Settings className="h-4 w-4 mr-2" />
              Form Field Templates
            </TabsTrigger>
          )}
          {formFieldFeatureAvailable && (
            <TabsTrigger value="assignments">
              <Link2 className="h-4 w-4 mr-2" />
              Assignments
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="categories" className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Expense Categories</CardTitle>
          <CardDescription>All categories available for expense classification</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <div className="text-center py-8">Loading categories...</div>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No categories found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Name</TableHead>
                    <TableHead className="w-[20%]">Status</TableHead>
                    <TableHead className="w-[25%]">Created At</TableHead>
                    <TableHead className="text-right w-[20%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {category.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={category.active ? "default" : "secondary"}>
                        {category.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(category.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-[40px]"
                          onClick={() => openEditDialog(category)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="min-w-[40px]"
                          onClick={() => openDeleteDialog(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Form Field Templates</CardTitle>
              <CardDescription>
                Create reusable form field templates that can be assigned to multiple categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No templates found. Create your first template to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{template.name}</h4>
                          <Badge variant="outline">{template.field_type}</Badge>
                          {template.required && (
                            <Badge variant="destructive">Required</Badge>
                          )}
                        </div>
                        {template.help_text && (
                          <p className="text-sm text-muted-foreground mt-1">{template.help_text}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTemplate(template);
                            setTemplateName(template.name);
                            setTemplateType(template.field_type);
                            setTemplateRequired(template.required);
                            setTemplateDefaultValue(template.default_value || "");
                            setTemplatePlaceholder(template.placeholder || "");
                            setTemplateHelpText(template.help_text || "");
                            setTemplateOptions(template.options || []);
                            if (template.validation_rules) {
                              setTemplateMin(template.validation_rules.min?.toString() || "");
                              setTemplateMax(template.validation_rules.max?.toString() || "");
                            }
                            setTemplateDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Category-Field Assignments</CardTitle>
              <CardDescription>
                Assign form field templates to categories. Users will see these fields when creating expenses with the selected category.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {categoryFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No assignments found. Assign fields to categories to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {categories.map((category) => {
                    const categoryFieldsList = categoryFields.filter(
                      cf => cf.category_id === category.id
                    );
                    if (categoryFieldsList.length === 0) return null;
                    
                    return (
                      <div key={category.id} className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-2">{category.name}</h4>
                        <div className="space-y-1">
                          {categoryFieldsList.map((cf) => (
                            <div key={cf.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                • {cf.template_name}
                                {cf.required && <span className="text-red-500 ml-1">*</span>}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const { error } = await supabase
                                      .from("expense_category_form_fields")
                                      .delete()
                                      .eq("id", cf.id);
                                    if (error) throw error;
                                    toast({
                                      title: "Assignment Removed",
                                      description: `Field removed from ${category.name}`,
                                    });
                                    fetchCategoryFields();
                                  } catch (e: any) {
                                    toast({
                                      variant: "destructive",
                                      title: "Error",
                                      description: e.message || "Failed to remove assignment",
                                    });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialogOpen || addDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditDialogOpen(false);
          setAddDialogOpen(false);
          setSelectedCategory(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              {selectedCategory ? "Update category details" : "Create a new expense category"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Travel, Food, Office Supplies"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="category-active">Active</Label>
              <Switch
                id="category-active"
                checked={categoryActive}
                onCheckedChange={setCategoryActive}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Inactive categories will not appear in the expense form dropdown
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setAddDialogOpen(false);
                setSelectedCategory(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !categoryName.trim()}>
              {saving ? "Saving..." : selectedCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Create/Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setTemplateDialogOpen(false);
          setSelectedTemplate(null);
          setTemplateName("");
          setTemplateType("text");
          setTemplateRequired(false);
          setTemplateDefaultValue("");
          setTemplatePlaceholder("");
          setTemplateHelpText("");
          setTemplateMin("");
          setTemplateMax("");
          setTemplateOptions([]);
          setNewOption("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? "Edit Form Field Template" : "Create Form Field Template"}</DialogTitle>
            <DialogDescription>
              Create a reusable form field template that can be assigned to multiple categories
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Field Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Odometer Reading"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-type">Field Type *</Label>
              <Select value={templateType} onValueChange={(value: any) => {
                setTemplateType(value);
                // Clear options if not select type
                if (value !== 'select') {
                  setTemplateOptions([]);
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="textarea">Textarea</SelectItem>
                  <SelectItem value="select">Dropdown/Select</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="template-required">Required Field</Label>
              <Switch
                id="template-required"
                checked={templateRequired}
                onCheckedChange={setTemplateRequired}
              />
            </div>

            {templateType !== 'checkbox' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="template-placeholder">Placeholder</Label>
                  <Input
                    id="template-placeholder"
                    value={templatePlaceholder}
                    onChange={(e) => setTemplatePlaceholder(e.target.value)}
                    placeholder="e.g., Enter odometer reading"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-default">Default Value</Label>
                  <Input
                    id="template-default"
                    value={templateDefaultValue}
                    onChange={(e) => setTemplateDefaultValue(e.target.value)}
                    placeholder="Default value (optional)"
                  />
                </div>
              </>
            )}

            {templateType === 'number' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-min">Minimum Value</Label>
                  <Input
                    id="template-min"
                    type="number"
                    value={templateMin}
                    onChange={(e) => setTemplateMin(e.target.value)}
                    placeholder="Min"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-max">Maximum Value</Label>
                  <Input
                    id="template-max"
                    type="number"
                    value={templateMax}
                    onChange={(e) => setTemplateMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>
            )}

            {templateType === 'select' && (
              <div className="space-y-2">
                <Label>Options *</Label>
                <div className="space-y-2">
                  {templateOptions.map((option, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input value={option} onChange={(e) => {
                        const newOptions = [...templateOptions];
                        newOptions[idx] = e.target.value;
                        setTemplateOptions(newOptions);
                      }} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTemplateOptions(templateOptions.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      placeholder="Add option"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOption.trim()) {
                          e.preventDefault();
                          setTemplateOptions([...templateOptions, newOption.trim()]);
                          setNewOption("");
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (newOption.trim()) {
                          setTemplateOptions([...templateOptions, newOption.trim()]);
                          setNewOption("");
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="template-help">Help Text</Label>
              <Textarea
                id="template-help"
                value={templateHelpText}
                onChange={(e) => setTemplateHelpText(e.target.value)}
                placeholder="Additional instructions for users"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTemplateDialogOpen(false);
                setSelectedTemplate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!templateName.trim()) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Field name is required",
                  });
                  return;
                }

                if (templateType === 'select' && templateOptions.length === 0) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "At least one option is required for select type",
                  });
                  return;
                }

                try {
                  setSavingTemplate(true);
                  if (!organizationId) {
                    throw new Error("Organization not found");
                  }

                  const validationRules: any = {};
                  if (templateType === 'number') {
                    if (templateMin) validationRules.min = parseFloat(templateMin);
                    if (templateMax) validationRules.max = parseFloat(templateMax);
                  }

                  const templateData: any = {
                    organization_id: organizationId,
                    name: templateName.trim(),
                    field_type: templateType,
                    required: templateRequired,
                    placeholder: templatePlaceholder || null,
                    help_text: templateHelpText || null,
                    default_value: templateDefaultValue || null,
                    validation_rules: Object.keys(validationRules).length > 0 ? validationRules : null,
                    options: templateType === 'select' ? templateOptions : null,
                    created_by: user?.id || null,
                  };

                  if (selectedTemplate) {
                    // Update
                    const { error } = await supabase
                      .from("expense_form_field_templates")
                      .update(templateData)
                      .eq("id", selectedTemplate.id);
                    
                    if (error) throw error;
                    toast({
                      title: "Template Updated",
                      description: `${templateName} has been updated successfully`,
                    });
                  } else {
                    // Create
                    const { error } = await supabase
                      .from("expense_form_field_templates")
                      .insert(templateData);
                    
                    if (error) throw error;
                    toast({
                      title: "Template Created",
                      description: `${templateName} has been created successfully`,
                    });
                  }

                  setTemplateDialogOpen(false);
                  setSelectedTemplate(null);
                  fetchTemplates();
                } catch (e: any) {
                  if (isMissingFormFieldTablesError(e)) {
                    console.warn("Form-field template save skipped: tables unavailable.", e);
                    setTemplateDialogOpen(false);
                    handleFormFieldFeatureUnavailable();
                    return;
                  }
                  console.error("Failed to save template:", e);
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: e.message || "Failed to save template",
                  });
                } finally {
                  setSavingTemplate(false);
                }
              }}
              disabled={savingTemplate || !templateName.trim() || (templateType === 'select' && templateOptions.length === 0)}
            >
              {savingTemplate ? "Saving..." : selectedTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category-Field Assignment Dialog */}
      <Dialog open={assignmentDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAssignmentDialogOpen(false);
          setSelectedCategoriesForAssignment(new Set());
          setSelectedTemplatesForAssignment(new Set());
          setCategorySearchTerm("");
          setTemplateSearchTerm("");
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Form Fields to Categories</DialogTitle>
            <DialogDescription>
              Select categories and form field templates to assign. Fields will appear when users create expenses with selected categories.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Categories *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const filteredCategories = categories.filter(cat =>
                      cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase())
                    );
                    if (selectedCategoriesForAssignment.size === filteredCategories.length) {
                      // Deselect all
                      setSelectedCategoriesForAssignment(new Set());
                    } else {
                      // Select all filtered
                      const newSet = new Set(filteredCategories.map(cat => cat.id));
                      setSelectedCategoriesForAssignment(newSet);
                    }
                  }}
                >
                  {selectedCategoriesForAssignment.size === categories.filter(cat =>
                    cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase())
                  ).length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <Input
                placeholder="Search categories..."
                value={categorySearchTerm}
                onChange={(e) => setCategorySearchTerm(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No categories available</p>
                ) : (
                  <div className="space-y-2">
                    {categories
                      .filter(cat => cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase()))
                      .map((category) => (
                        <div key={category.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`cat-${category.id}`}
                            checked={selectedCategoriesForAssignment.has(category.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedCategoriesForAssignment);
                              if (e.target.checked) {
                                newSet.add(category.id);
                              } else {
                                newSet.delete(category.id);
                              }
                              setSelectedCategoriesForAssignment(newSet);
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`cat-${category.id}`} className="text-sm cursor-pointer">
                            {category.name}
                          </label>
                        </div>
                      ))}
                    {categories.filter(cat => cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase())).length === 0 && (
                      <p className="text-sm text-muted-foreground">No categories match your search</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Form Field Templates *</Label>
              <Input
                placeholder="Search templates..."
                value={templateSearchTerm}
                onChange={(e) => setTemplateSearchTerm(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No templates available. Create templates first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templates
                      .filter(tpl => tpl.name.toLowerCase().includes(templateSearchTerm.toLowerCase()))
                      .map((template) => (
                        <div key={template.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`tpl-${template.id}`}
                            checked={selectedTemplatesForAssignment.has(template.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedTemplatesForAssignment);
                              if (e.target.checked) {
                                newSet.add(template.id);
                              } else {
                                newSet.delete(template.id);
                              }
                              setSelectedTemplatesForAssignment(newSet);
                            }}
                            className="rounded"
                          />
                          <label htmlFor={`tpl-${template.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                            <span>{template.name}</span>
                            <Badge variant="outline">{template.field_type}</Badge>
                            {template.required && <Badge variant="destructive">Required</Badge>}
                          </label>
                        </div>
                      ))}
                    {templates.filter(tpl => tpl.name.toLowerCase().includes(templateSearchTerm.toLowerCase())).length === 0 && (
                      <p className="text-sm text-muted-foreground">No templates match your search</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignmentDialogOpen(false);
                setSelectedCategoriesForAssignment(new Set());
                setSelectedTemplatesForAssignment(new Set());
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (selectedCategoriesForAssignment.size === 0) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Please select at least one category",
                  });
                  return;
                }

                if (selectedTemplatesForAssignment.size === 0) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Please select at least one form field template",
                  });
                  return;
                }

                try {
                  setSavingTemplate(true);
                  if (!organizationId) {
                    throw new Error("Organization not found");
                  }

                  const assignments: any[] = [];
                  let displayOrder = 0;

                  for (const categoryId of selectedCategoriesForAssignment) {
                    for (const templateId of selectedTemplatesForAssignment) {
                      assignments.push({
                        organization_id: organizationId,
                        category_id: categoryId,
                        template_id: templateId,
                        display_order: displayOrder++,
                      });
                    }
                  }

                  // Use upsert to handle duplicates gracefully
                  const { error } = await supabase
                    .from("expense_category_form_fields")
                    .upsert(assignments, {
                      onConflict: 'category_id,template_id',
                      ignoreDuplicates: false
                    });

                  if (error) throw error;

                  toast({
                    title: "Assignments Created",
                    description: `Assigned ${selectedTemplatesForAssignment.size} field(s) to ${selectedCategoriesForAssignment.size} category/categories`,
                  });

                  setAssignmentDialogOpen(false);
                  setSelectedCategoriesForAssignment(new Set());
                  setSelectedTemplatesForAssignment(new Set());
                  fetchCategoryFields();
                } catch (e: any) {
                  if (isMissingFormFieldTablesError(e)) {
                    console.warn("Form-field assignments skipped: tables unavailable.", e);
                    setAssignmentDialogOpen(false);
                    handleFormFieldFeatureUnavailable();
                    return;
                  }
                  console.error("Failed to create assignments:", e);
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: e.message || "Failed to create assignments",
                  });
                } finally {
                  setSavingTemplate(false);
                }
              }}
              disabled={savingTemplate || selectedCategoriesForAssignment.size === 0 || selectedTemplatesForAssignment.size === 0}
            >
              {savingTemplate ? "Assigning..." : "Assign Fields"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mass Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setImportDialogOpen(false);
          setImportFile(null);
          setImportResults(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mass Import Categories</DialogTitle>
            <DialogDescription>
              Upload a CSV file with category names. Each category should be on a new line. 
              Existing categories will be skipped. All imported categories will be set as active.
            </DialogDescription>
          </DialogHeader>
          
          {!importResults ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImportFile(file);
                      }
                    }}
                    className="cursor-pointer"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  CSV format: Single column with category names, one per line. Header row is optional.
                </p>
                {importFile && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{importFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(importFile.size / 1024).toFixed(2)} KB)
                    </span>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm font-medium text-blue-900 mb-2">CSV Format Example:</p>
                <pre className="text-xs text-blue-800 bg-white p-2 rounded border">
{`name
Travel
Food
Office Supplies
Transportation`}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                {importResults.added.length > 0 && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                    <h4 className="font-semibold text-green-900 mb-2">
                      ✅ Successfully Added ({importResults.added.length})
                    </h4>
                    <ul className="text-sm text-green-800 space-y-1 max-h-40 overflow-y-auto">
                      {importResults.added.map((name, idx) => (
                        <li key={idx}>• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {importResults.skipped.length > 0 && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h4 className="font-semibold text-yellow-900 mb-2">
                      ⚠️ Skipped - Already Exist ({importResults.skipped.length})
                    </h4>
                    <ul className="text-sm text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
                      {importResults.skipped.map((name, idx) => (
                        <li key={idx}>• {name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {importResults.errors.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <h4 className="font-semibold text-red-900 mb-2">
                      ❌ Errors ({importResults.errors.length})
                    </h4>
                    <ul className="text-sm text-red-800 space-y-1 max-h-40 overflow-y-auto">
                      {importResults.errors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            {importResults ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false);
                    setImportFile(null);
                    setImportResults(null);
                    fetchCategories();
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setImportFile(null);
                    setImportResults(null);
                  }}
                >
                  Import More
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false);
                    setImportFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMassImport}
                  disabled={!importFile || importing}
                >
                  {importing ? "Importing..." : "Import Categories"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category "{selectedCategory?.name}". 
              This action cannot be undone. Expenses using this category will still reference it, 
              but it will no longer be available for new expenses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

