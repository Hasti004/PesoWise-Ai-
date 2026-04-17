import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, User, Shield, Settings, Sparkles, CheckCircle, AlertCircle, Edit, Trash2, Eye, EyeOff, Search, Lock, Copy, Check, Table2, Network, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatINR } from "@/lib/format";

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "engineer", "employee", "cashier"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

interface CreateUserForm {
  name: string;
  email: string;
  role: "admin" | "engineer" | "employee" | "cashier";
  password: string;
  reportingEngineerId?: string | "none";
  cashierAssignedEngineerId?: string | "none";
  cashierAssignedLocationId?: string | "none";
  assignedCashierId?: string | "none";
  locationId?: string | "none";
}

export default function UserManagement() {
  const { userRole, user, organizationId } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [engineers, setEngineers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [cashiers, setCashiers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [users, setUsers] = useState<{ user_id: string; name: string; email: string; balance: number; role: string; assigned_engineer_name?: string; cashier_assigned_engineer_name?: string; cashier_assigned_location_id?: string; cashier_assigned_location_name?: string; assigned_cashier_name?: string; cashier_assigned_engineer_id?: string; reporting_engineer_id?: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [engineerLocations, setEngineerLocations] = useState<Record<string, string>>({}); // engineer_id -> location_id (single location only)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; name: string; email: string; balance: number; role: string } | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [logsByExpense, setLogsByExpense] = useState<Record<string, any[]>>({});
  const [deductions, setDeductions] = useState<any[]>([]);
  const [formData, setFormData] = useState<CreateUserForm>({
    name: "",
    email: "",
    role: "employee",
    password: "",
    reportingEngineerId: "none",
    cashierAssignedEngineerId: "none",
    cashierAssignedLocationId: "none",
    locationId: "none",
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<{ user_id: string; name: string; email: string; balance: number; role: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ user_id: string; name: string; email: string } | null>(null);
  const [editFormData, setEditFormData] = useState<{ name: string; email: string; role: "admin" | "engineer" | "employee" | "cashier"; reportingEngineerId: string; cashierAssignedEngineerId: string; cashierAssignedLocationId: string; assignedCashierId: string; locationId: string; balance: number }>({
    name: "",
    email: "",
    role: "employee",
    reportingEngineerId: "none",
    cashierAssignedEngineerId: "none",
    cashierAssignedLocationId: "none",
    assignedCashierId: "none",
    locationId: "none",
    balance: 0,
  });
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordConfirmOpen, setResetPasswordConfirmOpen] = useState(false);
  const [resetPasswordSuccessOpen, setResetPasswordSuccessOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "hierarchical">("table");

  useEffect(() => {
    // Load engineers for assignment dropdown
    const loadEngineers = async () => {
      try {
        // 1) Get user ids with engineer role in this organization
        if (!organizationId) return;
        const { data: roleRows, error: rolesError } = await supabase
          .from("organization_memberships")
          .select("user_id, role")
          .eq("organization_id", organizationId)
          .eq("role", "engineer")
          .eq("is_active", true);

        if (rolesError) throw rolesError;

        const engineerIds = (roleRows || []).map(r => r.user_id);
        if (engineerIds.length === 0) {
          setEngineers([]);
          return;
        }

        // 2) Get profiles for those engineers
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name, email")
          .in("user_id", engineerIds);

        if (profilesError) throw profilesError;

        const list = (profileRows || []).map(p => ({ id: p.user_id, name: p.name, email: p.email }));
        setEngineers(list);
      } catch (e) {
        console.error("Error loading engineers:", e);
      }
    };

    loadEngineers();
    
    // Load locations (filtered by organization)
    const loadLocations = async () => {
      try {
        if (!organizationId) return;
        const { data, error } = await supabase
          .from("locations")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true });
        if (error) throw error;
        setLocations(data || []);
      } catch (e) {
        console.error("Error loading locations:", e);
      }
    };
    loadLocations();
    
    // Load engineer-location assignments
    const loadEngineerLocations = async () => {
      try {
        const { data, error } = await supabase
          .from("engineer_locations")
          .select("engineer_id, location_id");
        if (error) throw error;
        
        const assignments: Record<string, string> = {};
        (data || []).forEach((el: any) => {
          // Only store the first location for each engineer (one location per engineer)
          if (!assignments[el.engineer_id]) {
            assignments[el.engineer_id] = el.location_id;
          }
        });
        setEngineerLocations(assignments);
      } catch (e) {
        console.error("Error loading engineer locations:", e);
      }
    };
    loadEngineerLocations();
    
    // Load users for admin list
    const loadUsers = async () => {
      try {
        setListLoading(true);
        // fetch profiles with reporting_engineer_id, cashier_assigned_engineer_id, cashier_assigned_location_id, and assigned_cashier_id (filtered by organization)
        if (!organizationId) return;
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name, email, balance, reporting_engineer_id, cashier_assigned_engineer_id, cashier_assigned_location_id, assigned_cashier_id")
          .eq("organization_id", organizationId);
        if (profilesError) throw profilesError;

        const ids = (profiles || []).map(p => p.user_id);
        let rolesById: Record<string, string> = {};
        if (ids.length > 0 && organizationId) {
          const { data: rolesRows, error: rolesErr } = await supabase
            .from("organization_memberships")
            .select("user_id, role")
            .eq("organization_id", organizationId)
            .in("user_id", ids)
            .eq("is_active", true);
          if (rolesErr) throw rolesErr;
          (rolesRows || []).forEach(r => { rolesById[r.user_id] = r.role; });
        }

        // Get all engineer IDs that are assigned to employees AND cashiers
        const employeeEngineerIds = [...new Set((profiles || [])
          .map(p => (p as any).reporting_engineer_id)
          .filter(id => id !== null && id !== undefined))];
        
        const cashierEngineerIds = [...new Set((profiles || [])
          .map(p => (p as any).cashier_assigned_engineer_id)
          .filter(id => id !== null && id !== undefined))];
        
        // Combine all engineer IDs (for employees and cashiers)
        const allEngineerIds = [...new Set([...employeeEngineerIds, ...cashierEngineerIds])];

        // Get all cashier IDs (for employees assigned to cashiers)
        const assignedCashierIds = [...new Set((profiles || [])
          .map(p => (p as any).assigned_cashier_id)
          .filter(id => id !== null && id !== undefined))];

        // Fetch engineer names
        let engineerNamesById: Record<string, string> = {};
        if (allEngineerIds.length > 0) {
          const { data: engineerProfiles, error: engineerError } = await supabase
            .from("profiles")
            .select("user_id, name")
            .in("user_id", allEngineerIds);
          if (!engineerError && engineerProfiles) {
            engineerProfiles.forEach(ep => {
              engineerNamesById[ep.user_id] = ep.name;
            });
          }
        }

        // Fetch cashier names
        let cashierNamesById: Record<string, string> = {};
        if (assignedCashierIds.length > 0) {
          const { data: cashierProfiles, error: cashierError } = await supabase
            .from("profiles")
            .select("user_id, name")
            .in("user_id", assignedCashierIds);
          if (!cashierError && cashierProfiles) {
            cashierProfiles.forEach(cp => {
              cashierNamesById[cp.user_id] = cp.name;
            });
          }
        }

        // Fetch location names for cashiers
        const cashierLocationIds = [...new Set((profiles || [])
          .map(p => (p as any).cashier_assigned_location_id)
          .filter(id => id !== null && id !== undefined))];
        
        let locationNamesById: Record<string, string> = {};
        if (cashierLocationIds.length > 0) {
          const { data: locationData, error: locationError } = await supabase
            .from("locations")
            .select("id, name")
            .in("id", cashierLocationIds);
          if (!locationError && locationData) {
            locationData.forEach(loc => {
              locationNamesById[loc.id] = loc.name;
            });
          }
        }

        const combined = (profiles || []).map(p => ({
          user_id: p.user_id,
          name: (p as any).name || "",
          email: (p as any).email || "",
          balance: Number((p as any).balance ?? 0),
          role: rolesById[p.user_id] || "employee",
          assigned_engineer_name: (p as any).reporting_engineer_id 
            ? engineerNamesById[(p as any).reporting_engineer_id] || "Unknown"
            : undefined,
          cashier_assigned_engineer_name: (p as any).cashier_assigned_engineer_id
            ? engineerNamesById[(p as any).cashier_assigned_engineer_id] || "Unknown"
            : undefined,
          cashier_assigned_location_id: (p as any).cashier_assigned_location_id || undefined,
          cashier_assigned_location_name: (p as any).cashier_assigned_location_id
            ? locationNamesById[(p as any).cashier_assigned_location_id] || "Unknown"
            : undefined,
          assigned_cashier_name: (p as any).assigned_cashier_id
            ? cashierNamesById[(p as any).assigned_cashier_id] || "Unknown"
            : undefined,
          cashier_assigned_engineer_id: (p as any).cashier_assigned_engineer_id || undefined,
          reporting_engineer_id: (p as any).reporting_engineer_id || undefined,
        }));
        setUsers(combined);
      } catch (e) {
        console.error("Error loading users list:", e);
      } finally {
        setListLoading(false);
      }
    };
    loadUsers();
  }, []);

  // Build hierarchy structure from users
  const buildHierarchy = () => {
    // Get all engineers
    const engineerUsers = users.filter(u => u.role === "engineer");
    
    // Build a map of engineer name to engineer user_id for matching
    const engineerNameToId: Record<string, string> = {};
    engineerUsers.forEach(e => {
      engineerNameToId[e.name] = e.user_id;
    });
    
    // Build a map of engineer user_id to engineer name for reverse lookup
    const engineerIdToName: Record<string, string> = {};
    engineerUsers.forEach(e => {
      engineerIdToName[e.user_id] = e.name;
    });
    
    // Build hierarchy: Location -> Engineer -> Cashier -> Employee
    // First, group engineers by location
    const locationHierarchy: Record<string, Array<{
      engineer: typeof engineerUsers[0] & { cashierCount: number; employeeCount: number };
      cashiers: typeof users;
      employees: typeof users;
    }>> = {};
    
    // Engineers without locations
    const unassignedEngineers: Array<{
      engineer: typeof engineerUsers[0] & { cashierCount: number; employeeCount: number };
      cashiers: typeof users;
      employees: typeof users;
    }> = [];
    
    engineerUsers.forEach(engineer => {
      // Get location for this engineer (single location only)
      const engineerLocationId = engineerLocations[engineer.user_id];
      
      // Get cashiers assigned to this engineer
      // Priority: Location-based assignment > Direct engineer assignment
      const allCashiers: typeof users = [];
      
      // First, check for location-based cashier assignment
      if (engineerLocationId) {
        const locationCashiers = users.filter(u => 
          u.role === "cashier" && 
          u.cashier_assigned_location_id === engineerLocationId
        );
        allCashiers.push(...locationCashiers);
      }
      
      // If no location-based cashier found, check for direct engineer assignment
      if (allCashiers.length === 0) {
        const directCashiers = users.filter(u => 
          u.role === "cashier" && 
          (u.cashier_assigned_engineer_id === engineer.user_id || 
           (u.cashier_assigned_engineer_id === undefined && u.cashier_assigned_engineer_name === engineer.name))
        );
        allCashiers.push(...directCashiers);
      }
      
      // Deduplicate by user_id and take only the first one (enforce one cashier per engineer)
      const cashiers = allCashiers.filter((cashier, index, self) => 
        index === self.findIndex(c => c.user_id === cashier.user_id)
      ).slice(0, 1); // Only take the first cashier - one cashier per manager
      
      // Get employees assigned to this engineer (match by name)
      const employees = users.filter(u => 
        u.role === "employee" && 
        u.assigned_engineer_name === engineer.name
      );
      
      const engineerData = {
        engineer: {
          ...engineer,
          cashierCount: cashiers.length,
          employeeCount: employees.length,
        },
        cashiers: cashiers,
        employees: employees,
      };
      
      if (!engineerLocationId) {
        // Engineer has no location assigned
        unassignedEngineers.push(engineerData);
      } else {
        // Add engineer to their location
        if (!locationHierarchy[engineerLocationId]) {
          locationHierarchy[engineerLocationId] = [];
        }
        locationHierarchy[engineerLocationId].push(engineerData);
      }
    });
    
    // Get location-based cashiers (cashiers assigned to locations)
    const locationCashiers: Record<string, typeof users> = {}; // location_id -> cashiers[]
    users.filter(u => u.role === "cashier" && u.cashier_assigned_location_id).forEach(cashier => {
      const locationId = cashier.cashier_assigned_location_id!;
      if (!locationCashiers[locationId]) {
        locationCashiers[locationId] = [];
      }
      locationCashiers[locationId].push(cashier);
    });
    
    // Convert location hierarchy to array format with location names
    const hierarchyByLocation = locations.map(location => {
      const engineers = locationHierarchy[location.id] || [];
      // For each engineer, remove location-based cashiers from their individual cashier list
      // since they'll be shown at the location level instead
      const locationCashierIds = new Set((locationCashiers[location.id] || []).map(c => c.user_id));
      const engineersWithoutLocationCashiers = engineers.map(engData => ({
        ...engData,
        cashiers: engData.cashiers.filter(c => !locationCashierIds.has(c.user_id)),
      }));
      
      return {
        location: location,
        cashiers: locationCashiers[location.id] || [], // Show location-based cashiers at location level
        engineers: engineersWithoutLocationCashiers,
      };
    }).filter(loc => loc.engineers.length > 0 || loc.cashiers.length > 0); // Show locations with engineers or cashiers
    
    // Also include unassigned users
    const unassignedCashiers = users.filter(u => 
      u.role === "cashier" && !u.cashier_assigned_engineer_name && !u.cashier_assigned_location_id
    );
    const unassignedEmployees = users.filter(u => 
      u.role === "employee" && !u.assigned_engineer_name
    );
    const admins = users.filter(u => u.role === "admin");
    
    return {
      hierarchyByLocation,
      unassignedEngineers,
      unassignedCashiers,
      unassignedEmployees,
      admins,
      totalEngineers: engineerUsers.length,
      totalCashiers: users.filter(u => u.role === "cashier").length,
      totalEmployees: users.filter(u => u.role === "employee").length,
    };
  };

  const openUserDrawer = async (u: { user_id: string; name: string; email: string; balance: number; role: string }) => {
    setSelectedUser(u);
    setDrawerOpen(true);
    setExpensesLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, total_amount, status, created_at, updated_at")
        .eq("user_id", u.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = data || [];
      setExpenses(list);

      // Fetch audit logs for these expenses to build history and deductions
      const expenseIds = list.map((e: any) => e.id);
      if (expenseIds.length > 0) {
        const { data: logs, error: logsErr } = await supabase
          .from("audit_logs")
          .select("expense_id, user_id, action, comment, created_at")
          .in("expense_id", expenseIds)
          .order("created_at", { ascending: false });
        if (logsErr) throw logsErr;

        const grouped: Record<string, any[]> = {};
        (logs || []).forEach((log: any) => {
          if (!grouped[log.expense_id]) grouped[log.expense_id] = [];
          grouped[log.expense_id].push(log);
        });
        setLogsByExpense(grouped);

        // Deductions are the admin approvals for this user's expenses
        const approvals = (logs || []).filter(l => l.action === "expense_approved");
        // Map to include the expense info and amount (use total_amount)
        const deduced = approvals.map((l: any) => {
          const exp = list.find((e: any) => e.id === l.expense_id);
          return {
            expense_id: l.expense_id,
            title: exp?.title || "Untitled",
            amount: Number(exp?.total_amount ?? 0),
            at: l.created_at,
            comment: l.comment || "",
          };
        });
        setDeductions(deduced);
      } else {
        setLogsByExpense({});
        setDeductions([]);
      }
    } catch (e) {
      console.error("Failed to load expenses for user:", e);
    } finally {
      setExpensesLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (userRole !== "admin") {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Only administrators can create user accounts",
      });
      return;
    }

    // Check if password is empty or too short
    if (!formData.password || formData.password.length < 8) {
      toast({
        variant: "destructive",
        title: "Password Required",
        description: "Please enter a password with at least 8 characters or use the Generate button",
      });
      return;
    }

    try {
      const validated = createUserSchema.parse(formData);
      setLoading(true);

      // Use Admin API to create user with auto-confirmation
      // Account is created and activated immediately
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
      
      let authData: { user: { id: string; email: string } } | null = null;
      let authError: any = null;

      if (serviceRoleKey) {
        // Use Admin API with service role key (auto-confirms email)
        try {
          const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'apikey': serviceRoleKey,
            },
            body: JSON.stringify({
              email: validated.email,
              password: validated.password,
              email_confirm: true, // Auto-confirm email
              user_metadata: {
                name: validated.name,
                organization_id: organizationId, // Pass organization_id in metadata
              },
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            if (errorData.message?.includes("already registered") || errorData.message?.includes("already exists")) {
              throw new Error("An account with this email already exists");
            }
            throw new Error(errorData.message || `Failed to create user: ${response.statusText}`);
          }

          const userData = await response.json();
          authData = { user: { id: userData.id, email: userData.email } };
        } catch (error: any) {
          authError = error;
        }
      } else {
        // Fallback to regular signup if service role key not available
      // Create a temporary client with no session persistence so admin session isn't replaced
      const tempSupabase = createClient<Database>(
          supabaseUrl,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            storage: undefined,
          },
        }
      );

        // Create user using signup (fallback method)
        const result = await tempSupabase.auth.signUp({
        email: validated.email,
        password: validated.password,
        options: {
          data: {
            name: validated.name,
              organization_id: organizationId,
          },
            email_redirect_to: undefined, // Don't redirect
        },
      });

        authData = result.data;
        authError = result.error;
      }

      if (authError) {
        // Handle specific error cases
        if (authError.message?.includes("already registered") || authError.message?.includes("already exists")) {
          throw new Error("An account with this email already exists");
        }
        if (authError.message?.includes("Email not confirmed")) {
          throw new Error("User creation failed. Please ensure VITE_SUPABASE_SERVICE_ROLE_KEY is set in your .env.local file.");
        }
        throw authError;
      }

      if (!authData?.user) {
        throw new Error("Failed to create user");
      }

      if (!organizationId) {
        throw new Error("Organization not found. Please contact support.");
      }

      // Use assign_user_to_organization function which enforces org user limit and handles conflicts
      const { error: assignError } = await supabase.rpc('assign_user_to_organization', {
        p_user_id: authData.user.id,
        p_organization_id: organizationId,
        p_role: validated.role
      });

      if (assignError) {
        // Surface RPC error (e.g. "Organization user limit reached") – do not fall back to direct upsert
        throw new Error(assignError.message || "Failed to add user to organization.");
      }

      // RPC succeeded; update the name if needed (RPC uses name from auth metadata)
      if (validated.name !== (authData.user.user_metadata?.name || 'New User')) {
        const { error: nameUpdateError } = await supabase
          .from("profiles")
          .update({ name: validated.name })
          .eq("user_id", authData.user.id);

        if (nameUpdateError) console.error("Failed to update name:", nameUpdateError);
      }

      // If creating an employee and an engineer is chosen, link them
      if (validated.role === "employee" && formData.reportingEngineerId && formData.reportingEngineerId !== "none") {
        const updateData: any = { reporting_engineer_id: formData.reportingEngineerId };
        
        // If creating an employee and a cashier is chosen, link them
        if (formData.assignedCashierId && formData.assignedCashierId !== "none") {
          updateData.assigned_cashier_id = formData.assignedCashierId;
        }
        
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("user_id", authData.user.id);

        if (profileUpdateError) throw profileUpdateError;
      }

      // If creating an engineer and a cashier is chosen, link them
      if (validated.role === "engineer" && formData.assignedCashierId && formData.assignedCashierId !== "none") {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ assigned_cashier_id: formData.assignedCashierId })
          .eq("user_id", authData.user.id);

        if (profileUpdateError) throw profileUpdateError;
      }

      // If creating a cashier, handle location or engineer assignment
      if (validated.role === "cashier") {
        const updateData: any = {};
        
        // Priority: Location assignment over direct engineer assignment
        if (formData.cashierAssignedLocationId && formData.cashierAssignedLocationId !== "none") {
          // Check if location already has a cashier
          // First get all profiles with this location assigned
          const { data: profilesWithLocation, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("cashier_assigned_location_id", formData.cashierAssignedLocationId);
          
          if (profilesError) throw profilesError;
          
          // If any profiles have this location, check if they're cashiers
          if (profilesWithLocation && profilesWithLocation.length > 0) {
            const userIds = profilesWithLocation.map(p => p.user_id);
            const { data: cashierRoles, error: rolesError } = await supabase
              .from("organization_memberships")
              .eq("organization_id", organizationId!)
              .eq("is_active", true)
              .select("user_id")
              .in("user_id", userIds)
              .eq("role", "cashier");
            
            if (rolesError) throw rolesError;
            
            // Only throw error if we found an actual cashier
            if (cashierRoles && cashierRoles.length > 0) {
              throw new Error("This location already has a cashier assigned. Each location can only have one cashier.");
            }
          }

          updateData.cashier_assigned_location_id = formData.cashierAssignedLocationId;
          updateData.cashier_assigned_engineer_id = null; // Clear direct assignment when using location
        } else if (formData.cashierAssignedEngineerId && formData.cashierAssignedEngineerId !== "none") {
          // Fallback to direct engineer assignment
          // Check if engineer already has a cashier
          const { data: existingCashier, error: checkError } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("cashier_assigned_engineer_id", formData.cashierAssignedEngineerId)
            .limit(1);

          if (checkError) throw checkError;

          if (existingCashier && existingCashier.length > 0) {
            throw new Error("This engineer already has a cashier assigned. Each engineer can only have one cashier.");
          }

          updateData.cashier_assigned_engineer_id = formData.cashierAssignedEngineerId;
          updateData.cashier_assigned_location_id = null; // Clear location assignment when using direct
        }

        if (Object.keys(updateData).length > 0) {
          const { error: profileUpdateError } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("user_id", authData.user.id);

          if (profileUpdateError) throw profileUpdateError;

          // If location assignment, trigger sync of engineers
          if (updateData.cashier_assigned_location_id) {
            const { error: syncError } = await supabase.rpc('sync_engineers_with_location_cashier', {
              location_id_param: updateData.cashier_assigned_location_id
            });
            if (syncError) {
              console.error("Error syncing engineers with location cashier:", syncError);
              // Don't throw - this is a background sync
            }
          }
        }
      }

      // If creating an engineer and a location is selected, assign it
      if (validated.role === "engineer" && formData.locationId && formData.locationId !== "none") {
        const { error: locationError } = await supabase
          .from("engineer_locations")
          .insert({
            engineer_id: authData.user.id,
            location_id: formData.locationId,
            organization_id: organizationId,
          });

        if (locationError) throw locationError;
      }

      toast({
        title: "User Created Successfully",
        description: `${validated.name} has been created as ${validated.role}. Account is active and ready to use.`,
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        role: "employee",
        password: "",
        reportingEngineerId: "none",
        cashierAssignedEngineerId: "none",
        cashierAssignedLocationId: "none",
        locationId: "none",
      });
      setShowPassword(false);
      
      // Reload engineer locations
      const { data: elData, error: elError } = await supabase
        .from("engineer_locations")
        .select("engineer_id, location_id");
      if (!elError && elData) {
        const assignments: Record<string, string> = {};
        elData.forEach((el: any) => {
          // Only store the first location for each engineer (one location per engineer)
          if (!assignments[el.engineer_id]) {
            assignments[el.engineer_id] = el.location_id;
          }
        });
        setEngineerLocations(assignments);
      }

    } catch (error: any) {
      console.error("Error creating user:", error);
      
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: error.errors[0].message,
        });
      } else if (error.message?.includes("already registered")) {
        toast({
          variant: "destructive",
          title: "User Already Exists",
          description: "An account with this email already exists",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error Creating User",
          description: error.message || "Failed to create user account",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
    setShowPassword(true); // Automatically show the generated password
  };

  const openEditDialog = (u: { user_id: string; name: string; email: string; balance: number; role: string }) => {
    setUserToEdit(u);
    // Fetch assignments (engineer for employee, engineer for cashier, locations for engineer)
    const fetchAssignments = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("reporting_engineer_id, cashier_assigned_engineer_id, cashier_assigned_location_id, assigned_cashier_id")
          .eq("user_id", u.user_id)
          .single();
        
        // Fetch location for engineer (only one location allowed)
        let locationId: string = "none";
        if (u.role === "engineer") {
          const { data: locationData } = await supabase
            .from("engineer_locations")
            .select("location_id")
            .eq("engineer_id", u.user_id)
            .limit(1)
            .maybeSingle();
          locationId = locationData?.location_id || "none";
        }
        
        setEditFormData({
          name: u.name,
          email: u.email,
          role: u.role as "admin" | "engineer" | "employee" | "cashier",
          reportingEngineerId: (data as any)?.reporting_engineer_id || "none",
          cashierAssignedEngineerId: (data as any)?.cashier_assigned_engineer_id || "none",
          cashierAssignedLocationId: (data as any)?.cashier_assigned_location_id || "none",
          assignedCashierId: (data as any)?.assigned_cashier_id || "none",
          locationId: locationId,
          balance: Number(u.balance ?? 0),
        });
      } catch (e) {
        setEditFormData({
          name: u.name,
          email: u.email,
          role: u.role as "admin" | "engineer" | "employee" | "cashier",
          reportingEngineerId: "none",
          cashierAssignedEngineerId: "none",
          cashierAssignedLocationId: "none",
          assignedCashierId: "none",
          locationId: "none",
          balance: Number(u.balance ?? 0),
        });
      }
    };
    fetchAssignments();
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (u: { user_id: string; name: string; email: string }) => {
    setUserToDelete(u);
    setDeleteDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!userToEdit) return;

    try {
      setUpdating(true);

      // Update profile (name, email, assignments, balance for admin)
      // Clear assignments when role changes - only set if role matches
      const updateData: any = {
        name: editFormData.name,
        email: editFormData.email,
      };
      if (userRole === "admin" && typeof editFormData.balance === "number" && !Number.isNaN(editFormData.balance)) {
        updateData.balance = editFormData.balance;
      }

      // Handle reporting_engineer_id (for employees)
      if (editFormData.role === "employee") {
        updateData.reporting_engineer_id = editFormData.reportingEngineerId !== "none" 
          ? editFormData.reportingEngineerId 
          : null;
        // Handle assigned_cashier_id (for employees)
        updateData.assigned_cashier_id = editFormData.assignedCashierId !== "none"
          ? editFormData.assignedCashierId
          : null;
      } else if (editFormData.role === "engineer") {
        // Handle assigned_cashier_id (for engineers)
        updateData.assigned_cashier_id = editFormData.assignedCashierId !== "none"
          ? editFormData.assignedCashierId
          : null;
        // Clear reporting_engineer_id if role is engineer
        updateData.reporting_engineer_id = null;
      } else {
        // Clear if role is not employee or engineer
        updateData.reporting_engineer_id = null;
        updateData.assigned_cashier_id = null;
      }
      
      // Handle cashier assignment (for cashiers) - location takes priority
      if (editFormData.role === "cashier") {
        // Priority: Location assignment over direct engineer assignment
        if (editFormData.cashierAssignedLocationId && editFormData.cashierAssignedLocationId !== "none") {
          // Check if location already has a cashier (unless it's the current cashier being edited)
          // First get all profiles with this location assigned (excluding current user)
          const { data: profilesWithLocation, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("cashier_assigned_location_id", editFormData.cashierAssignedLocationId)
            .neq("user_id", userToEdit.user_id); // Exclude current cashier
          
          if (profilesError) throw profilesError;
          
          // If any profiles have this location, check if they're cashiers
          if (profilesWithLocation && profilesWithLocation.length > 0) {
            const userIds = profilesWithLocation.map(p => p.user_id);
            const { data: cashierRoles, error: rolesError } = await supabase
              .from("organization_memberships")
              .eq("organization_id", organizationId!)
              .eq("is_active", true)
              .select("user_id")
              .in("user_id", userIds)
              .eq("role", "cashier");
            
            if (rolesError) throw rolesError;
            
            // Only throw error if we found an actual cashier (excluding the current one)
            if (cashierRoles && cashierRoles.length > 0) {
              throw new Error("This location already has a cashier assigned. Each location can only have one cashier.");
            }
          }

          updateData.cashier_assigned_location_id = editFormData.cashierAssignedLocationId;
          updateData.cashier_assigned_engineer_id = null; // Clear direct assignment when using location
        } else if (editFormData.cashierAssignedEngineerId && editFormData.cashierAssignedEngineerId !== "none") {
          // Fallback to direct engineer assignment
          // Check if engineer already has a cashier (unless it's the current cashier being edited)
          const { data: existingCashier, error: checkError } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("cashier_assigned_engineer_id", editFormData.cashierAssignedEngineerId)
            .neq("user_id", userToEdit.user_id) // Exclude current cashier
            .limit(1);

          if (checkError) throw checkError;

          if (existingCashier && existingCashier.length > 0) {
            throw new Error("This engineer already has a cashier assigned. Each engineer can only have one cashier.");
          }
          
          updateData.cashier_assigned_engineer_id = editFormData.cashierAssignedEngineerId;
          updateData.cashier_assigned_location_id = null; // Clear location assignment when using direct
        } else {
          // Clear both if neither is selected
          updateData.cashier_assigned_engineer_id = null;
          updateData.cashier_assigned_location_id = null;
        }
      } else {
        // Clear if role is not cashier
        updateData.cashier_assigned_engineer_id = null;
        updateData.cashier_assigned_location_id = null;
      }
      
      const { error: profileError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("user_id", userToEdit.user_id);

      if (profileError) throw profileError;

      // If location assignment changed, trigger sync of engineers
      if (editFormData.role === "cashier" && updateData.cashier_assigned_location_id) {
        const { error: syncError } = await supabase.rpc('sync_engineers_with_location_cashier', {
          location_id_param: updateData.cashier_assigned_location_id
        });
        if (syncError) {
          console.error("Error syncing engineers with location cashier:", syncError);
          // Don't throw - this is a background sync
        }
      }

      // Update role - update existing membership
      if (!organizationId) throw new Error("Organization not found");
      const { error: updateRoleError } = await supabase
        .from("organization_memberships")
        .update({ role: editFormData.role })
        .eq("organization_id", organizationId)
        .eq("user_id", userToEdit.user_id);

      if (updateRoleError) throw updateRoleError;

      // Update engineer locations if role is engineer
      if (editFormData.role === "engineer") {
        // Delete existing location assignments for this org
        const { error: deleteError } = await supabase
          .from("engineer_locations")
          .delete()
          .eq("engineer_id", userToEdit.user_id)
          .eq("organization_id", organizationId);

        if (deleteError) throw deleteError;

        // Insert new location assignment (only one location allowed)
        if (editFormData.locationId && editFormData.locationId !== "none") {
          const { error: locationError } = await supabase
            .from("engineer_locations")
            .insert({
              engineer_id: userToEdit.user_id,
              location_id: editFormData.locationId,
              organization_id: organizationId,
            });

          if (locationError) throw locationError;
        }
      } else {
        // Remove location assignments if role is not engineer
        const { error: deleteError } = await supabase
          .from("engineer_locations")
          .delete()
          .eq("engineer_id", userToEdit.user_id)
          .eq("organization_id", organizationId);

        if (deleteError) throw deleteError;
      }

      toast({
        title: "User Updated",
        description: `${editFormData.name}'s information has been updated successfully`,
      });

      setEditDialogOpen(false);
      setUserToEdit(null);
      
      // Reload engineer locations
      const { data: elData, error: elError } = await supabase
        .from("engineer_locations")
        .select("engineer_id, location_id");
      if (!elError && elData) {
        const assignments: Record<string, string> = {};
        elData.forEach((el: any) => {
          // Only store the first location for each engineer (one location per engineer)
          if (!assignments[el.engineer_id]) {
            assignments[el.engineer_id] = el.location_id;
          }
        });
        setEngineerLocations(assignments);
      }
      
      // Reload users list
      const loadUsers = async () => {
        try {
          setListLoading(true);
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id, name, email, balance, reporting_engineer_id, cashier_assigned_engineer_id, cashier_assigned_location_id");
          if (profilesError) throw profilesError;

          const ids = (profiles || []).map(p => p.user_id);
          let rolesById: Record<string, string> = {};
          if (ids.length > 0) {
            const { data: rolesRows, error: rolesErr } = await supabase
              .from("organization_memberships")
              .eq("organization_id", organizationId!)
              .eq("is_active", true)
              .select("user_id, role")
              .in("user_id", ids);
            if (rolesErr) throw rolesErr;
            (rolesRows || []).forEach(r => { rolesById[r.user_id] = r.role; });
          }

          // Get all engineer IDs that are assigned to employees AND cashiers
          const employeeEngineerIds = [...new Set((profiles || [])
            .map(p => (p as any).reporting_engineer_id)
            .filter(id => id !== null && id !== undefined))];
          
          const cashierEngineerIds = [...new Set((profiles || [])
            .map(p => (p as any).cashier_assigned_engineer_id)
            .filter(id => id !== null && id !== undefined))];
          
          // Combine all engineer IDs (for employees and cashiers)
          const allEngineerIds = [...new Set([...employeeEngineerIds, ...cashierEngineerIds])];

          // Fetch engineer names
          let engineerNamesById: Record<string, string> = {};
          if (allEngineerIds.length > 0) {
            const { data: engineerProfiles, error: engineerError } = await supabase
              .from("profiles")
              .select("user_id, name")
              .in("user_id", allEngineerIds);
            if (!engineerError && engineerProfiles) {
              engineerProfiles.forEach(ep => {
                engineerNamesById[ep.user_id] = ep.name;
              });
            }
          }

          const combined = (profiles || []).map(p => ({
            user_id: p.user_id,
            name: (p as any).name || "",
            email: (p as any).email || "",
            balance: Number((p as any).balance ?? 0),
            role: rolesById[p.user_id] || "employee",
            assigned_engineer_name: (p as any).reporting_engineer_id 
              ? engineerNamesById[(p as any).reporting_engineer_id] || "Unknown"
              : undefined,
            cashier_assigned_engineer_name: (p as any).cashier_assigned_engineer_id
              ? engineerNamesById[(p as any).cashier_assigned_engineer_id] || "Unknown"
              : undefined,
          }));
          setUsers(combined);
        } catch (e) {
          console.error("Error loading users list:", e);
        } finally {
          setListLoading(false);
        }
      };
      loadUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update user",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!userToEdit || !user?.email) return;

    // Verify admin password first
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: adminPassword,
      });

      if (signInError) {
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: "Your admin password is incorrect",
        });
        return;
      }

      // Re-authenticate the admin after password verification
      // (signInWithPassword changes the session, so we need to restore it)
      // For now, we'll proceed with the password reset

      // Check if user is admin (can't reset admin passwords)
      if (userToEdit.role === "admin") {
        toast({
          variant: "destructive",
          title: "Cannot Reset Password",
          description: "Admin passwords cannot be reset through this interface",
        });
        setResetPasswordDialogOpen(false);
        setAdminPassword("");
        setNewUserPassword("");
        return;
      }

      // Validate new password
      if (newUserPassword.length < 8) {
        toast({
          variant: "destructive",
          title: "Invalid Password",
          description: "Password must be at least 8 characters long",
        });
        return;
      }

      // Show confirmation dialog
      setResetPasswordConfirmOpen(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to verify admin password",
      });
    }
  };

  const confirmResetPassword = async () => {
    if (!userToEdit) return;

    try {
      setResettingPassword(true);
      setResetPasswordConfirmOpen(false);

      // Call Supabase Edge Function to reset password
      // The edge function will use service role to update the password
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          target_user_id: userToEdit.user_id,
          new_password: newUserPassword,
        }
      });

      if (error) {
        throw new Error(error.message || "Failed to call password reset function");
      } else if (data?.success) {
        setResetPasswordValue(newUserPassword);
        setResetPasswordSuccessOpen(true);
        setResetPasswordDialogOpen(false);
        setAdminPassword("");
        setNewUserPassword("");
        
        toast({
          title: "Password Reset",
          description: `Password has been reset for ${userToEdit.name}. Please copy and share the new password securely.`,
        });
      } else {
        throw new Error(data?.error || "Failed to reset password");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reset password",
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(resetPasswordValue);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Password copied to clipboard",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy password",
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setDeleting(true);

      // Delete organization membership first
      if (!organizationId) throw new Error("Organization not found");
      const { error: roleError } = await supabase
        .from("organization_memberships")
        .delete()
        .eq("organization_id", organizationId)
        .eq("user_id", userToDelete.user_id);

      if (roleError) throw roleError;

      // Delete from profiles (this will cascade delete related data)
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userToDelete.user_id);

      if (profileError) throw profileError;

      // Note: Deleting from auth.users requires admin API access
      // For now, we'll just delete from our tables
      // The auth user will remain but won't be able to access the system

      toast({
        title: "User Deleted",
        description: `${userToDelete.name} has been removed from the system`,
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      
      // Reload users list
      const loadUsers = async () => {
        try {
          setListLoading(true);
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id, name, email, balance, reporting_engineer_id, cashier_assigned_engineer_id, cashier_assigned_location_id");
          if (profilesError) throw profilesError;

          const ids = (profiles || []).map(p => p.user_id);
          let rolesById: Record<string, string> = {};
          if (ids.length > 0) {
            const { data: rolesRows, error: rolesErr } = await supabase
              .from("organization_memberships")
              .eq("organization_id", organizationId!)
              .eq("is_active", true)
              .select("user_id, role")
              .in("user_id", ids);
            if (rolesErr) throw rolesErr;
            (rolesRows || []).forEach(r => { rolesById[r.user_id] = r.role; });
          }

          // Get all engineer IDs that are assigned to employees AND cashiers
          const employeeEngineerIds = [...new Set((profiles || [])
            .map(p => (p as any).reporting_engineer_id)
            .filter(id => id !== null && id !== undefined))];
          
          const cashierEngineerIds = [...new Set((profiles || [])
            .map(p => (p as any).cashier_assigned_engineer_id)
            .filter(id => id !== null && id !== undefined))];
          
          // Combine all engineer IDs (for employees and cashiers)
          const allEngineerIds = [...new Set([...employeeEngineerIds, ...cashierEngineerIds])];

          // Fetch engineer names
          let engineerNamesById: Record<string, string> = {};
          if (allEngineerIds.length > 0) {
            const { data: engineerProfiles, error: engineerError } = await supabase
              .from("profiles")
              .select("user_id, name")
              .in("user_id", allEngineerIds);
            if (!engineerError && engineerProfiles) {
              engineerProfiles.forEach(ep => {
                engineerNamesById[ep.user_id] = ep.name;
              });
            }
          }

          const combined = (profiles || []).map(p => ({
            user_id: p.user_id,
            name: (p as any).name || "",
            email: (p as any).email || "",
            balance: Number((p as any).balance ?? 0),
            role: rolesById[p.user_id] || "employee",
            assigned_engineer_name: (p as any).reporting_engineer_id 
              ? engineerNamesById[(p as any).reporting_engineer_id] || "Unknown"
              : undefined,
            cashier_assigned_engineer_name: (p as any).cashier_assigned_engineer_id
              ? engineerNamesById[(p as any).cashier_assigned_engineer_id] || "Unknown"
              : undefined,
          }));
          setUsers(combined);
        } catch (e) {
          console.error("Error loading users list:", e);
        } finally {
          setListLoading(false);
        }
      };
      loadUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete user",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">Only administrators can access user management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scrollToCreateUser = () => {
    const element = document.getElementById('create-user-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 relative">
      {/* Mobile-optimized Header Section */}
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl sm:rounded-2xl shadow-lg">
          <UserPlus className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          User Management
        </h1>
        <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto px-4">
          Create and manage user accounts for your organization with role-based access control
        </p>
      </div>

      {/* Users List Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div>
                <CardTitle className="text-lg sm:text-xl font-bold">All Users</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Click a user to view full details and expense history</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={scrollToCreateUser}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-colors duration-150 text-xs sm:text-sm"
                  size="sm"
                >
                  <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Create User</span>
                  <span className="sm:hidden">Create</span>
                </Button>
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                >
                  <Table2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Table</span>
                </Button>
                <Button
                  variant={viewMode === "hierarchical" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("hierarchical")}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                >
                  <Network className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Hierarchy</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
          <CardContent className="p-0 pt-0">
            {viewMode === "table" ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="max-h-[440px] overflow-y-auto min-h-[400px]">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-left sticky top-0 z-10">
                  <tr>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 bg-slate-50 min-w-[140px]">Name / Email</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 bg-slate-50 min-w-[120px] hidden sm:table-cell">Email</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 bg-slate-50 min-w-[100px]">Role</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 bg-slate-50 min-w-[120px] hidden md:table-cell">
                        Assigned Manager
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 bg-slate-50 min-w-[100px] hidden sm:table-cell">Balance</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-slate-700 text-right bg-slate-50 min-w-[120px]">Balance / Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td className="px-4 py-4" colSpan={6}>Loading users...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4" colSpan={6}>No users found</td>
                    </tr>
                  ) : (() => {
                    const filteredUsers = users.filter(u => {
                      if (!searchTerm) return true;
                      const search = searchTerm.toLowerCase();
                      return (
                        u.name.toLowerCase().includes(search) ||
                        u.email.toLowerCase().includes(search)
                      );
                    });
                    return filteredUsers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4" colSpan={6}>No users match your search</td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                      <tr key={u.user_id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => openUserDrawer(u)}>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="font-medium">{u.name || "-"}</div>
                          <div className="text-xs text-muted-foreground sm:hidden mt-1">{u.email || "-"}</div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">{u.email || "-"}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                            {u.role === "engineer" ? "Manager" : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell">
                          {u.role === "employee" ? (
                            u.assigned_engineer_name ? (
                              <span className="text-slate-700 font-medium">{u.assigned_engineer_name}</span>
                            ) : (
                              <span className="text-slate-400 italic">Not assigned</span>
                            )
                          ) : u.role === "cashier" ? (
                            u.cashier_assigned_location_name ? (
                              <span className="text-slate-700 font-medium">{u.cashier_assigned_location_name}</span>
                            ) : (
                              <span className="text-slate-400 italic">Not assigned</span>
                            )
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium hidden sm:table-cell">{formatINR(Number(u.balance ?? 0))}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col sm:flex-row items-end gap-2 sm:gap-0">
                            <div className="sm:hidden font-medium text-right">{formatINR(Number(u.balance ?? 0))}</div>
                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                              <Button variant="outline" size="sm" onClick={() => openUserDrawer(u)} className="text-xs sm:text-sm px-2 sm:px-3">
                                <span className="hidden sm:inline">View</span>
                                <Eye className="h-3 w-3 sm:h-4 sm:w-4 sm:hidden" />
                            </Button>
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(u)} className="px-2 sm:px-3">
                                <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(u)} className="px-2 sm:px-3">
                                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      ))
                    );
                  })()}
                </tbody>
              </table>
            </div>
            </div>
            ) : (
            <div className="p-6 min-h-[400px]">
              {listLoading ? (
                <div className="text-center py-8 text-gray-500">Loading hierarchy...</div>
              ) : (() => {
                const hierarchyData = buildHierarchy();
                
                // Filter hierarchy by location
                const filteredHierarchyByLocation = searchTerm ? hierarchyData.hierarchyByLocation.map(loc => ({
                  ...loc,
                  engineers: loc.engineers.filter(h => {
                    const search = searchTerm.toLowerCase();
                    return (
                      h.engineer.name.toLowerCase().includes(search) ||
                      h.engineer.email.toLowerCase().includes(search) ||
                      h.cashiers.some(c => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)) ||
                      h.employees.some(e => e.name.toLowerCase().includes(search) || e.email.toLowerCase().includes(search)) ||
                      loc.location.name.toLowerCase().includes(search)
                    );
                  })
                })).filter(loc => loc.engineers.length > 0) : hierarchyData.hierarchyByLocation;
                
                // Filter unassigned engineers
                const filteredUnassignedEngineers = searchTerm ? hierarchyData.unassignedEngineers.filter(h => {
                  const search = searchTerm.toLowerCase();
                  return (
                    h.engineer.name.toLowerCase().includes(search) ||
                    h.engineer.email.toLowerCase().includes(search) ||
                    h.cashiers.some(c => c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)) ||
                    h.employees.some(e => e.name.toLowerCase().includes(search) || e.email.toLowerCase().includes(search))
                  );
                }) : hierarchyData.unassignedEngineers;
                
                return (
                  <div className="space-y-8">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
                        <div className="text-xl sm:text-2xl font-bold text-blue-900">{hierarchyData.totalEngineers}</div>
                        <div className="text-xs sm:text-sm text-blue-700">Managers</div>
                      </div>
                      <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
                        <div className="text-xl sm:text-2xl font-bold text-purple-900">{hierarchyData.totalCashiers}</div>
                        <div className="text-xs sm:text-sm text-purple-700">Cashiers</div>
                      </div>
                      <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                        <div className="text-xl sm:text-2xl font-bold text-green-900">{hierarchyData.totalEmployees}</div>
                        <div className="text-xs sm:text-sm text-green-700">Employees</div>
                      </div>
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <div className="text-xl sm:text-2xl font-bold text-gray-900">{hierarchyData.admins.length}</div>
                        <div className="text-xs sm:text-sm text-gray-700">Admins</div>
                      </div>
                    </div>

                    {/* Hierarchy View by Location */}
                    {filteredHierarchyByLocation.length === 0 && filteredUnassignedEngineers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No managers found</div>
                    ) : (
                      <div className="space-y-6 sm:space-y-8">
                        {/* Locations with Engineers */}
                        {filteredHierarchyByLocation.map((locationData, locIdx) => (
                          <div key={locationData.location.id} className="border-2 border-indigo-200 rounded-lg p-4 sm:p-6 bg-gradient-to-br from-indigo-50 to-purple-50">
                            {/* Location Header */}
                            <div className="mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-indigo-200">
                              <div className="flex items-center gap-2 sm:gap-3">
                                <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
                                <h3 className="text-lg sm:text-xl font-bold text-indigo-900">{locationData.location.name}</h3>
                                <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-300">
                                  {locationData.engineers.length} Manager{locationData.engineers.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            </div>
                            
                            {/* Location-Based Cashiers - Shown at location level, with managers nested under them */}
                            {locationData.cashiers && locationData.cashiers.length > 0 ? (
                              <div className="mb-4 sm:mb-6 ml-0 sm:ml-4 space-y-4 sm:space-y-6">
                                {locationData.cashiers.map((cashier, cashierIdx) => {
                                  // Count total employees managed by this location cashier (all employees under all managers in this location)
                                  const totalEmployees = locationData.engineers.reduce((sum, eng) => sum + eng.employees.length, 0);
                                  return (
                                    <div key={cashier.user_id || cashierIdx} className="border-2 border-purple-300 rounded-lg p-4 sm:p-6 bg-gradient-to-br from-purple-50 to-amber-50 shadow-md">
                                      {/* Cashier Level */}
                                      <div className="mb-4 sm:mb-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2">
                                          <div 
                                            className="flex items-center gap-3 sm:gap-4 cursor-pointer hover:opacity-90 transition-opacity duration-150 flex-1 min-w-0"
                                            onClick={() => openUserDrawer(cashier)}
                                          >
                                            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl flex-shrink-0 shadow-lg">
                                              {cashier.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="font-bold text-lg sm:text-xl text-gray-900 truncate">{cashier.name}</div>
                                              <div className="text-sm sm:text-base text-gray-600 truncate">{cashier.email}</div>
                                              <div className="text-sm sm:text-base font-semibold text-purple-700 mt-1">
                                                Balance: {formatINR(Number(cashier.balance ?? 0))}
                                              </div>
                                            </div>
                                            <Badge variant="default" className="bg-purple-600 text-sm sm:text-base px-3 py-1 flex-shrink-0 shadow-md">Cashier</Badge>
                                          </div>
                                          <div className="text-left sm:text-right">
                                            <div className="text-sm sm:text-base text-gray-600 font-medium">Manages</div>
                                            <div className="font-bold text-base sm:text-lg text-gray-900">
                                              {locationData.engineers.length} Manager{locationData.engineers.length !== 1 ? 's' : ''} • {totalEmployees} Employee{totalEmployees !== 1 ? 's' : ''}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Managers under this cashier */}
                                      {locationData.engineers.length > 0 && (
                                        <div className="ml-0 sm:ml-6 space-y-4 sm:space-y-5">
                                          <div className="text-sm sm:text-base font-bold text-gray-800 mb-3 flex items-center gap-2 border-b border-blue-200 pb-2">
                                            <Settings className="h-4 w-4 text-blue-600" />
                                            <span>Manager{locationData.engineers.length !== 1 ? 's' : ''} ({locationData.engineers.length})</span>
                                          </div>
                                          {locationData.engineers.map((item, idx) => (
                                            <div key={item.engineer.user_id || idx} className="border rounded-lg p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                                              {/* Manager Level */}
                                              <div className="mb-3 sm:mb-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2">
                                                  <div 
                                                    className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                                    onClick={() => openUserDrawer(item.engineer)}
                                                  >
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0">
                                                      {item.engineer.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="font-bold text-base sm:text-lg text-gray-900 truncate">{item.engineer.name}</div>
                                                      <div className="text-xs sm:text-sm text-gray-600 truncate">{item.engineer.email}</div>
                                                      <div className="text-xs sm:text-sm font-semibold text-blue-700 mt-1">
                                                        Balance: {formatINR(Number(item.engineer.balance ?? 0))}
                                                      </div>
                                                    </div>
                                                    <Badge variant="default" className="bg-blue-600 text-xs sm:text-sm flex-shrink-0">Manager</Badge>
                                                  </div>
                                                  <div className="text-left sm:text-right">
                                                    <div className="text-xs sm:text-sm text-gray-600">Team Stats</div>
                                                    <div className="font-semibold text-sm sm:text-base text-gray-900">
                                                      {item.employeeCount} Employee{item.employeeCount !== 1 ? 's' : ''}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Employees Level */}
                                              {item.employees.length > 0 && (
                                                <div className="ml-0 sm:ml-4 md:ml-8">
                                                  <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                    <div className="w-12 sm:w-24 h-0.5 bg-green-300"></div>
                                                    <span>Employees ({item.employees.length})</span>
                                                  </div>
                                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                    {item.employees.map((employee, eIdx) => (
                                                      <div 
                                                        key={employee.user_id || eIdx} 
                                                        className="bg-white rounded-lg p-3 border border-green-200 shadow-sm cursor-pointer hover:border-green-300 transition-colors"
                                                        onClick={() => openUserDrawer(employee)}
                                                      >
                                                        <div className="flex items-center gap-2">
                                                          <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                            {employee.name.charAt(0).toUpperCase()}
                                                          </div>
                                                          <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-xs text-gray-900 truncate">{employee.name}</div>
                                                            <div className="text-xs text-gray-500 truncate">{employee.email}</div>
                                                          </div>
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                          Balance: {formatINR(Number(employee.balance ?? 0))}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* If no location-based cashiers, show managers directly under location */
                              <div className="space-y-4 sm:space-y-6 ml-0 sm:ml-4">
                                {locationData.engineers.map((item, idx) => (
                                  <div key={item.engineer.user_id || idx} className="border rounded-lg p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                                    {/* Manager Level */}
                                    <div className="mb-3 sm:mb-4">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2">
                                        <div 
                                          className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                          onClick={() => openUserDrawer(item.engineer)}
                                        >
                                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0">
                                            {item.engineer.name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-bold text-base sm:text-lg text-gray-900 truncate">{item.engineer.name}</div>
                                            <div className="text-xs sm:text-sm text-gray-600 truncate">{item.engineer.email}</div>
                                            <div className="text-xs sm:text-sm font-semibold text-blue-700 mt-1">
                                              Balance: {formatINR(Number(item.engineer.balance ?? 0))}
                                            </div>
                                          </div>
                                          <Badge variant="default" className="bg-blue-600 text-xs sm:text-sm flex-shrink-0">Manager</Badge>
                                        </div>
                                        <div className="text-left sm:text-right">
                                          <div className="text-xs sm:text-sm text-gray-600">Team Stats</div>
                                          <div className="font-semibold text-sm sm:text-base text-gray-900">
                                            {item.cashierCount} Cashier{item.cashierCount !== 1 ? 's' : ''} • {item.employeeCount} Employee{item.employeeCount !== 1 ? 's' : ''}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Cashiers Level - Only one cashier per manager */}
                                    {item.cashiers.length > 0 && (
                                      <div className="ml-0 sm:ml-4 md:ml-8 mb-3 sm:mb-4">
                                        <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                          <div className="w-12 sm:w-24 h-0.5 bg-purple-300"></div>
                                          <span>Cashier{item.cashiers.length !== 1 ? 's' : ''} ({item.cashiers.length})</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                          {item.cashiers.map((cashier, cIdx) => {
                                            const employeesManaged = item.employees.length;
                                            return (
                                              <div 
                                                key={cashier.user_id || `cashier-${cIdx}-${cashier.name}`} 
                                                className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm cursor-pointer hover:border-purple-300 transition-colors"
                                                onClick={() => openUserDrawer(cashier)}
                                              >
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                                    {cashier.name.charAt(0).toUpperCase()}
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm text-gray-900 truncate">{cashier.name}</div>
                                                    <div className="text-xs text-gray-500 truncate">{cashier.email}</div>
                                                  </div>
                                                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 text-xs">Cashier</Badge>
                                                </div>
                                                <div className="text-xs text-gray-600 space-y-1">
                                                  <div>Balance: {formatINR(Number(cashier.balance ?? 0))}</div>
                                                  <div>Manages: {employeesManaged} employee{employeesManaged !== 1 ? 's' : ''}</div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Employees Level */}
                                    {item.employees.length > 0 && (
                                      <div className="ml-0 sm:ml-4 md:ml-8">
                                        <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                          <div className="w-12 sm:w-24 h-0.5 bg-green-300"></div>
                                          <span>Employees ({item.employees.length})</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                          {item.employees.map((employee, eIdx) => (
                                            <div 
                                              key={employee.user_id || eIdx} 
                                              className="bg-white rounded-lg p-3 border border-green-200 shadow-sm cursor-pointer hover:border-green-300 transition-colors"
                                              onClick={() => openUserDrawer(employee)}
                                            >
                                              <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                  {employee.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-medium text-xs text-gray-900 truncate">{employee.name}</div>
                                                  <div className="text-xs text-gray-500 truncate">{employee.email}</div>
                                                </div>
                                              </div>
                                              <div className="text-xs text-gray-600 mt-1">
                                                Balance: {formatINR(Number(employee.balance ?? 0))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {/* Unassigned Managers (no location) */}
                        {filteredUnassignedEngineers.length > 0 && (
                          <div className="border-2 border-gray-200 rounded-lg p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-slate-50">
                            <div className="mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gray-200">
                              <div className="flex items-center gap-2 sm:gap-3">
                                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
                                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Unassigned Managers</h3>
                                <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
                                  {filteredUnassignedEngineers.length} Manager{filteredUnassignedEngineers.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                              <p className="text-xs sm:text-sm text-gray-600 mt-2">Managers without location assignments</p>
                            </div>
                            
                            <div className="space-y-4 sm:space-y-6">
                              {filteredUnassignedEngineers.map((item, idx) => (
                                <div key={item.engineer.user_id || idx} className="border rounded-lg p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                                  {/* Manager Level */}
                                  <div className="mb-3 sm:mb-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-2">
                                      <div 
                                        className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-90 transition-opacity duration-150"
                                        onClick={() => openUserDrawer(item.engineer)}
                                      >
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0">
                                          {item.engineer.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="font-bold text-base sm:text-lg text-gray-900 truncate">{item.engineer.name}</div>
                                          <div className="text-xs sm:text-sm text-gray-600 truncate">{item.engineer.email}</div>
                                          <div className="text-xs sm:text-sm font-semibold text-blue-700 mt-1">
                                            Balance: {formatINR(Number(item.engineer.balance ?? 0))}
                                          </div>
                                        </div>
                                        <Badge variant="default" className="bg-blue-600 text-xs sm:text-sm flex-shrink-0">Manager</Badge>
                                      </div>
                                      <div className="text-left sm:text-right">
                                        <div className="text-xs sm:text-sm text-gray-600">Team Stats</div>
                                        <div className="font-semibold text-sm sm:text-base text-gray-900">
                                          {item.cashierCount} Cashier{item.cashierCount !== 1 ? 's' : ''} • {item.employeeCount} Employee{item.employeeCount !== 1 ? 's' : ''}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Employees Level */}
                                  {item.employees.length > 0 && (
                                    <div className="ml-0 sm:ml-4 md:ml-8">
                                      <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <div className="w-12 sm:w-24 h-0.5 bg-green-300"></div>
                                        <span>Employees ({item.employees.length})</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {item.employees.map((employee, eIdx) => (
                                          <div 
                                            key={employee.user_id || eIdx} 
                                            className="bg-white rounded-lg p-3 border border-green-200 shadow-sm cursor-pointer hover:border-green-300 transition-colors"
                                            onClick={() => openUserDrawer(employee)}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                                {employee.name.charAt(0).toUpperCase()}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-medium text-xs text-gray-900 truncate">{employee.name}</div>
                                                <div className="text-xs text-gray-500 truncate">{employee.email}</div>
                                              </div>
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                              Balance: {formatINR(Number(employee.balance ?? 0))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Unassigned Section */}
                    {(hierarchyData.unassignedCashiers.length > 0 || hierarchyData.unassignedEmployees.length > 0) && (
                      <div className="border rounded-lg p-6 bg-gray-50 mt-6">
                        <div className="font-bold text-lg text-gray-900 mb-4">Unassigned Users</div>
                        {hierarchyData.unassignedCashiers.length > 0 && (
                          <div className="mb-4">
                            <div className="text-sm font-semibold text-gray-700 mb-2">Cashiers ({hierarchyData.unassignedCashiers.length})</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {hierarchyData.unassignedCashiers.map((cashier, idx) => (
                                <div 
                                  key={cashier.user_id || idx} 
                                  className="bg-white rounded p-2 border border-gray-300 text-sm cursor-pointer hover:border-gray-400 transition-colors"
                                  onClick={() => openUserDrawer(cashier)}
                                >
                                  <div>{cashier.name} ({cashier.email})</div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    Balance: {formatINR(Number(cashier.balance ?? 0))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {hierarchyData.unassignedEmployees.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-gray-700 mb-2">Employees ({hierarchyData.unassignedEmployees.length})</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                              {hierarchyData.unassignedEmployees.map((employee, idx) => (
                                <div 
                                  key={employee.user_id || idx} 
                                  className="bg-white rounded p-2 border border-gray-300 text-sm cursor-pointer hover:border-gray-400 transition-colors"
                                  onClick={() => openUserDrawer(employee)}
                                >
                                  <div>{employee.name} ({employee.email})</div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    Balance: {formatINR(Number(employee.balance ?? 0))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            )}
          </CardContent>
        </Card>

      {/* Create User Card */}
        <Card id="create-user-section" className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Create New User</CardTitle>
                <CardDescription className="text-blue-100 mt-1">
                  Add new team members with appropriate access levels
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleCreateUser} className="space-y-8">
              {/* Personal Information */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name *</Label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="John Doe"
                        className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address *</Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john.doe@company.com"
                        className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Role and Security */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Role & Security</h3>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label htmlFor="role" className="text-sm font-medium text-gray-700">Role *</Label>
                    <div className="relative group">
                      <Settings className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors z-10" />
                      <Select
                        value={formData.role}
                        onValueChange={(value: "admin" | "engineer" | "employee" | "cashier") => 
                          setFormData(prev => ({ ...prev, role: value }))
                        }
                      >
                        <SelectTrigger className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-0 shadow-xl">
                          <SelectItem value="employee">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                <User className="h-4 w-4 text-green-600" />
                              </div>
                              <div>
                                <div className="font-medium">Employee</div>
                                <div className="text-xs text-gray-500">Create and submit expenses</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="engineer">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Settings className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-medium">Manager</div>
                                <div className="text-xs text-gray-500">Review and verify expenses</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Shield className="h-4 w-4 text-purple-600" />
                              </div>
                              <div>
                                <div className="font-medium">Administrator</div>
                                <div className="text-xs text-gray-500">Full system access</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="cashier">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                                <Settings className="h-4 w-4 text-amber-600" />
                              </div>
                              <div>
                                <div className="font-medium">Cashier</div>
                                <div className="text-xs text-gray-500">Mark expenses as paid and manage payouts</div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                   {formData.role === "employee" && (
                  <div className="space-y-3">
                    <Label htmlFor="reportingEngineer" className="text-sm font-medium text-gray-700">Assign Manager (for Employee)</Label>
                    <Select
                      value={formData.reportingEngineerId || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, reportingEngineerId: value }))}
                    >
                         <SelectTrigger className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150">
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent className="border-0 shadow-xl">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {engineers.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">If set, all expenses will auto-assign to this manager.</p>
                  </div>
                   )}

                   {formData.role === "employee" && (
                     <div className="space-y-3">
                       <Label htmlFor="assignedCashier" className="text-sm font-medium text-gray-700">Assign Cashier</Label>
                       <Select
                         value={formData.assignedCashierId || "none"}
                         onValueChange={(value) => setFormData(prev => ({ ...prev, assignedCashierId: value }))}
                       >
                         <SelectTrigger className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150">
                           <SelectValue placeholder="Select cashier" />
                         </SelectTrigger>
                         <SelectContent className="border-0 shadow-xl">
                           <SelectItem value="none">Unassigned</SelectItem>
                           {cashiers.map(c => (
                             <SelectItem key={c.id} value={c.id}>
                               {c.name} ({c.email})
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <p className="text-xs text-gray-500">Employee will return money to this cashier.</p>
                     </div>
                   )}

                   {formData.role === "cashier" && (
                     <div className="space-y-3 md:col-span-2">
                       <div className="space-y-3">
                         <Label htmlFor="cashierLocation" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                           <MapPin className="h-4 w-4 text-blue-600" />
                           Assign Location (Recommended)
                         </Label>
                         <Select
                           value={formData.cashierAssignedLocationId || "none"}
                           onValueChange={(value) => setFormData(prev => ({ ...prev, cashierAssignedLocationId: value, cashierAssignedEngineerId: "none" }))}
                         >
                           <SelectTrigger className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150">
                             <SelectValue placeholder="Select location" />
                           </SelectTrigger>
                           <SelectContent className="border-0 shadow-xl">
                             <SelectItem value="none">Unassigned</SelectItem>
                             {locations.filter(loc => {
                               // Filter out locations that already have a cashier assigned
                               const locationHasCashier = users.some(u => 
                                 u.role === "cashier" && 
                                 u.cashier_assigned_location_id === loc.id
                               );
                               return !locationHasCashier;
                             }).map(loc => (
                               <SelectItem key={loc.id} value={loc.id}>
                                 {loc.name}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <p className="text-xs text-gray-500">If set, this cashier will manage all managers and employees in this location. Each location can only have one cashier.</p>
                       </div>
                       
                       <div className="space-y-3 border-t pt-3">
                         <Label htmlFor="cashierEngineer" className="text-sm font-medium text-gray-700">OR Assign Manager Directly (Fallback)</Label>
                         <Select
                           value={formData.cashierAssignedEngineerId || "none"}
                           onValueChange={(value) => setFormData(prev => ({ ...prev, cashierAssignedEngineerId: value, cashierAssignedLocationId: "none" }))}
                           disabled={formData.cashierAssignedLocationId && formData.cashierAssignedLocationId !== "none"}
                         >
                           <SelectTrigger className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150">
                            <SelectValue placeholder="Select manager" />
                          </SelectTrigger>
                           <SelectContent className="border-0 shadow-xl">
                             <SelectItem value="none">Unassigned (Can manage all)</SelectItem>
                             {engineers.filter(e => {
                               // Filter out engineers who already have a cashier assigned
                               const engineerHasCashier = users.some(u => 
                                 u.role === "cashier" && 
                                 u.cashier_assigned_engineer_name &&
                                 // Find the engineer user by matching name
                                 users.find(eng => eng.role === "engineer" && eng.name === u.cashier_assigned_engineer_name)?.user_id === e.id
                               );
                               return !engineerHasCashier;
                             }).map(e => (
                               <SelectItem key={e.id} value={e.id}>
                                 {e.name} ({e.email})
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <p className="text-xs text-gray-500">If set, this cashier can only manage employees under the selected manager's zone/department. Each manager can only have one cashier. (Disabled when location is selected)</p>
                       </div>
                     </div>
                   )}

                   {formData.role === "engineer" && (
                     <div className="space-y-3 md:col-span-2 border-t pt-4 mt-2">
                       <Label htmlFor="locations" className="text-sm font-medium text-gray-700 whitespace-nowrap flex items-center gap-2">
                         <MapPin className="h-4 w-4 text-blue-600" />
                         Assign Location
                       </Label>
                       <div className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 max-h-40 sm:max-h-48 overflow-y-auto bg-gray-50">
                         {locations.length === 0 ? (
                           <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">No locations available. Create locations in Settings first.</p>
                         ) : (
                           <RadioGroup
                             value={formData.locationId || "none"}
                             onValueChange={(value) => setFormData(prev => ({ ...prev, locationId: value }))}
                           >
                             <div key="none" className="flex items-center space-x-2">
                               <RadioGroupItem value="none" id="location-none" />
                               <label
                                 htmlFor="location-none"
                                 className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 whitespace-nowrap"
                               >
                                 <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
                                 <span className="truncate">Unassigned</span>
                               </label>
                             </div>
                             {locations.map((location) => (
                               <div key={location.id} className="flex items-center space-x-2">
                                 <RadioGroupItem value={location.id} id={`location-${location.id}`} />
                                 <label
                                   htmlFor={`location-${location.id}`}
                                   className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 whitespace-nowrap"
                                 >
                                   <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
                                   <span className="truncate">{location.name}</span>
                                 </label>
                               </div>
                             ))}
                           </RadioGroup>
                         )}
                       </div>
                       <p className="text-xs text-gray-500 whitespace-nowrap">Select one location for this manager. Each manager can only be assigned to one location.</p>
                     </div>
                   )}

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">Permanent Password *</Label>
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter permanent password (min 8 characters)"
                          className={`h-12 pr-20 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-colors duration-150 ${
                            formData.password && formData.password.length < 8 ? "border-red-300 focus:border-red-500" : ""
                          }`}
                          required
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                          {formData.password && formData.password.length >= 8 && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {formData.password && (
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={generatePassword}
                        className="h-12 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg transition-colors duration-150"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                    {formData.password && formData.password.length < 8 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Password must be at least 8 characters long
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      This password will be the user's final password
                    </p>
                  </div>
                </div>
              </div>

              {/* Information Cards */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Role Permissions
                  </h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span><strong>Employee:</strong> Create and submit expense claims</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span><strong>Manager:</strong> Review and verify assigned expenses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span><strong>Admin:</strong> Full system access and user management</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-6 rounded-xl border border-emerald-200">
                  <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Account Creation Process
                  </h4>
                  <div className="space-y-2 text-sm text-emerald-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>Password must be at least 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>Account is created and activated immediately</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>User can sign in right away</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-lg shadow-xl hover:shadow-xl transition-colors duration-200"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating User...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Create User Account
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Guidelines Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 p-6">
            <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-600" />
              User Creation Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Security Requirements
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Passwords must be at least 8 characters long</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Email addresses must be unique and valid</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Only administrators can create user accounts</span>
                  </li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-green-600" />
                  Account Management
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>User roles can be modified after account creation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>Accounts can be deactivated if needed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>All user actions are logged for audit purposes</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      {/* Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto">
          <SheetHeader className="relative pr-20">
            <div className="absolute right-12 top-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedUser) {
                    openEditDialog(selectedUser);
                    setDrawerOpen(false);
                  }
                }}
                className="flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            </div>
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>Profile, balance, and complete expense history</SheetDescription>
          </SheetHeader>
          {selectedUser && (
            <div className="space-y-6 py-4">
              <div>
                <div className="text-lg font-semibold">{selectedUser.name}</div>
                <div className="text-slate-600 text-sm">{selectedUser.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                  {selectedUser.role}
                </span>
                <Separator orientation="vertical" className="h-5" />
                <div className="text-sm">Balance: <span className="font-semibold">{formatINR(Number(selectedUser.balance ?? 0))}</span></div>
              </div>

              <Separator />

              <div>
                <div className="text-base font-semibold mb-3">Expenses</div>
                {expensesLoading ? (
                  <div className="text-sm text-slate-600">Loading expenses...</div>
                ) : expenses.length === 0 ? (
                  <div className="text-sm text-slate-600">No expenses found</div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((e) => (
                      <div key={e.id} className="p-3 rounded border bg-white">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{e.title || "Untitled"}</div>
                          <div className="text-sm">{formatINR(Number(e.total_amount ?? 0))}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600 mt-1">
                          <div>Category: {e.category || "-"}</div>
                          <div>Status: {e.status}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Created: {new Date(e.created_at).toLocaleString()} {e.updated_at ? `• Updated: ${new Date(e.updated_at).toLocaleString()}` : ""}
                        </div>

                        {/* History timeline */}
                        {logsByExpense[e.id] && logsByExpense[e.id].length > 0 && (
                          <div className="mt-3 border-t pt-2 space-y-1">
                            {logsByExpense[e.id].map((log) => (
                              <div key={log.created_at + log.action} className="text-xs flex items-center justify-between">
                                <div className="text-slate-600">{log.action.replaceAll("_", " ")}</div>
                                <div className="text-slate-500">{new Date(log.created_at).toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Balance deductions (from approvals) */}
              <div>
                <div className="text-base font-semibold mb-3">Balance Deductions</div>
                {deductions.length === 0 ? (
                  <div className="text-sm text-slate-600">No deductions recorded</div>
                ) : (
                  <div className="space-y-2">
                    {deductions.map((d) => (
                      <div key={d.expense_id + d.at} className="p-3 rounded border bg-white text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{d.title}</div>
                          <div className="font-semibold">-{formatINR(Number(d.amount ?? 0))}</div>
                        </div>
                        <div className="text-xs text-slate-500">{new Date(d.at).toLocaleString()}</div>
                        {d.comment ? (
                          <div className="text-xs text-slate-600 mt-1">{d.comment}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="whitespace-nowrap">Edit User</DialogTitle>
            <DialogDescription className="whitespace-nowrap">Update user information and role</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="whitespace-nowrap">Name *</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
                className="whitespace-nowrap"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="whitespace-nowrap">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
                className="whitespace-nowrap"
              />
            </div>
            {/* Password Reset Section - Only for non-admin users */}
            {userToEdit && userToEdit.role !== "admin" && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Label className="whitespace-nowrap">Reset Password</Label>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                  Reset this user's password. You'll need to enter your admin password to confirm.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResetPasswordDialogOpen(true);
                    setAdminPassword("");
                    setNewUserPassword("");
                  }}
                  className="w-full whitespace-nowrap"
                >
                  <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
                  Reset Password
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-role" className="whitespace-nowrap">Role *</Label>
              <Select
                value={editFormData.role}
                onValueChange={(value: "admin" | "engineer" | "employee" | "cashier") => 
                  setEditFormData(prev => ({ ...prev, role: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="engineer">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {userRole === "admin" && (
              <div className="space-y-2">
                <Label htmlFor="edit-balance" className="whitespace-nowrap">Balance (INR)</Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-balance"
                    type="number"
                    step="0.01"
                    value={editFormData.balance ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      setEditFormData(prev => ({ ...prev, balance: Number.isNaN(v) ? 0 : v }));
                    }}
                    placeholder="0"
                    className="whitespace-nowrap"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditFormData(prev => ({ ...prev, balance: 0 }))}
                  >
                    Set to 0
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">Edit this user&apos;s balance to any value (including negative). Use 0 to clear.</p>
              </div>
            )}
            {editFormData.role === "employee" && (
              <div className="space-y-2">
                <Label htmlFor="edit-engineer" className="whitespace-nowrap">Assign Manager</Label>
                <Select
                  value={editFormData.reportingEngineerId}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, reportingEngineerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {engineers.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} ({e.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground whitespace-nowrap">If set, all expenses will auto-assign to this manager.</p>
              </div>
            )}
            {editFormData.role === "employee" && (
              <div className="space-y-2">
                <Label htmlFor="edit-cashier" className="whitespace-nowrap">Assign Cashier</Label>
                <Select
                  value={editFormData.assignedCashierId}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, assignedCashierId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select cashier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {cashiers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground whitespace-nowrap">Employee will return money to this cashier.</p>
              </div>
            )}
            {editFormData.role === "engineer" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-engineer-cashier" className="whitespace-nowrap">Assign Cashier</Label>
                  <Select
                    value={editFormData.assignedCashierId}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, assignedCashierId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select cashier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {cashiers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Manager will return money to this cashier.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-locations" className="whitespace-nowrap">Assign Location</Label>
                  <div className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 max-h-40 sm:max-h-48 overflow-y-auto">
                    {locations.length === 0 ? (
                      <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">No locations available. Create locations in Settings first.</p>
                    ) : (
                      <RadioGroup
                        value={editFormData.locationId || "none"}
                        onValueChange={(value) => setEditFormData(prev => ({ ...prev, locationId: value }))}
                      >
                        <div key="none" className="flex items-center space-x-2">
                          <RadioGroupItem value="none" id="edit-location-none" />
                          <label
                            htmlFor="edit-location-none"
                            className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 whitespace-nowrap"
                          >
                            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
                            <span className="truncate">Unassigned</span>
                          </label>
                        </div>
                        {locations.map((location) => (
                          <div key={location.id} className="flex items-center space-x-2">
                            <RadioGroupItem value={location.id} id={`edit-location-${location.id}`} />
                            <label
                              htmlFor={`edit-location-${location.id}`}
                              className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 whitespace-nowrap"
                            >
                              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
                              <span className="truncate">{location.name}</span>
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Select one location for this manager. Each manager can only be assigned to one location.</p>
                </div>
              </>
            )}
            {editFormData.role === "cashier" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-cashier-location" className="whitespace-nowrap flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Assign Location (Recommended)
                  </Label>
                  <Select
                    value={editFormData.cashierAssignedLocationId || "none"}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, cashierAssignedLocationId: value, cashierAssignedEngineerId: "none" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">If set, this cashier will manage all managers and employees in this location.</p>
                </div>
                
                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor="edit-cashier-engineer" className="whitespace-nowrap">OR Assign Manager Directly (Fallback)</Label>
                  <Select
                    value={editFormData.cashierAssignedEngineerId}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, cashierAssignedEngineerId: value, cashierAssignedLocationId: "none" }))}
                    disabled={editFormData.cashierAssignedLocationId && editFormData.cashierAssignedLocationId !== "none"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned (Can manage all)</SelectItem>
                      {engineers.filter(e => {
                        // Filter out engineers who already have a cashier (unless editing the current cashier)
                        const engineerHasCashier = users.some(u => 
                          u.role === "cashier" && 
                          u.user_id !== userToEdit?.user_id && // Exclude current cashier being edited
                          u.cashier_assigned_engineer_name &&
                          // Find the engineer user by matching name
                          users.find(eng => eng.role === "engineer" && eng.name === u.cashier_assigned_engineer_name)?.user_id === e.id
                        );
                      return !engineerHasCashier;
                    }).map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} ({e.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground whitespace-nowrap">If set, this cashier can only manage employees under the selected manager's zone/department. Each manager can only have one cashier. (Disabled when location is selected)</p>
              </div>
            </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="whitespace-nowrap">Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={updating} className="whitespace-nowrap">
              {updating ? "Updating..." : "Update User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {userToDelete?.name} ({userToDelete?.email}) from the system. 
              This action cannot be undone. All associated expenses and data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Reset password for {userToEdit?.name} ({userToEdit?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Your Admin Password *</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showAdminPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter your admin password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                >
                  {showAdminPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your admin password to confirm this action
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password *</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters required
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setResetPasswordDialogOpen(false);
              setAdminPassword("");
              setNewUserPassword("");
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={!adminPassword || !newUserPassword || newUserPassword.length < 8 || resettingPassword}
            >
              {resettingPassword ? "Verifying..." : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={resetPasswordConfirmOpen} onOpenChange={setResetPasswordConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Password Reset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for <strong>{userToEdit?.name}</strong> ({userToEdit?.email})?
              <br /><br />
              The new password will be: <strong>{newUserPassword}</strong>
              <br /><br />
              This action cannot be undone. The user will need to use this new password to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setResetPasswordConfirmOpen(false);
              setAdminPassword("");
              setNewUserPassword("");
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetPassword}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={resettingPassword}
            >
              {resettingPassword ? "Resetting..." : "Confirm Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Success Dialog */}
      <Dialog open={resetPasswordSuccessOpen} onOpenChange={setResetPasswordSuccessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Password Reset Successful
            </DialogTitle>
            <DialogDescription>
              The password has been reset for {userToEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={resetPasswordValue}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyPassword}
                  className="flex-shrink-0"
                >
                  {passwordCopied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Please copy this password and share it securely with the user. They will need it to log in.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setResetPasswordSuccessOpen(false);
              setResetPasswordValue("");
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}