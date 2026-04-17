import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cacheOrganization } from "@/lib/organizationCache";
import { capabilityService, SystemCapabilities } from "@/services/CapabilityService";
import { UrlSafety } from "@/lib/UrlSafety";

type AppRole = "admin" | "engineer" | "employee" | "cashier" | "master_admin";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  organization_id: string | null;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logo_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  userProfile: UserProfile | null;
  organization: Organization | null;
  organizationId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUserProfile: (userId?: string) => Promise<void>;
  refreshOrganization: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Fetch user role, profile, and organization when session changes
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchUserProfile(session.user.id);
            fetchOrganization(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setUserProfile(null);
          setOrganization(null);
          setOrganizationId(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    const bootstrap = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load capabilities first
        const caps = await capabilityService.getCapabilities();
        setCapabilities(caps);

        if (session?.user) {
          await Promise.all([
            fetchUserRole(session.user.id, caps),
            fetchUserProfile(session.user.id),
            fetchOrganization(session.user.id, caps)
          ]);
        }
      } catch (error) {
        console.error("Bootstrap error:", error);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string, capsOveride?: SystemCapabilities) => {
    const currentCaps = capsOveride || capabilities || await capabilityService.getCapabilities();
    
    try {
      // Check master admin ONLY if supported by schema
      if (currentCaps.masterAdminSupported) {
        // 1. Check profiles column
        const { data: profile, error: profileError } = await (supabase as any)
          .from("profiles")
          .select("is_master_admin")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profileError && profile?.is_master_admin === true) {
          setUserRole("master_admin");
          return;
        }

        // 2. Check memberships table
        const { data: membership, error: membershipError } = await (supabase as any)
          .from("master_admin_memberships")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (!membershipError && membership) {
          setUserRole("master_admin");
          return;
        }
      }

      // Get role from organization_memberships (standard flow)
      const { data, error } = await (supabase as any)
        .from("organization_memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      setUserRole((data?.role as AppRole) || null);
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, name, email, organization_id")
        .eq("user_id", userId)
        .single() as { data: UserProfile | null; error: Error | null };

      if (error) throw error;
      setUserProfile(data);
      // Master admins may have null organization_id
      if (data?.organization_id) {
        setOrganizationId(data.organization_id);
      } else {
        setOrganizationId(null);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganization = async (userId: string, capsOveride?: SystemCapabilities) => {
    const currentCaps = capsOveride || capabilities || await capabilityService.getCapabilities();

    try {
      // Skip if likely a master admin
      if (currentCaps.masterAdminSupported) {
        const { data: profile, error: profileError } = await (supabase as any)
          .from("profiles")
          .select("is_master_admin")
          .eq("user_id", userId)
          .maybeSingle();
        
        if (!profileError && profile?.is_master_admin === true) {
          setOrganization(null);
          setOrganizationId(null);
          return;
        }
      }

      // Standard organization fetch
      const { data: membership, error: membershipError } = await (supabase as any)
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.organization_id) return;

      // Fetch organization details
      const { data: orgData, error: orgError } = await (supabase as any)
        .from("organizations")
        .select("id, name, slug, plan, logo_url")
        .eq("id", membership.organization_id)
        .single() as { data: Organization | null; error: Error | null };

      if (orgError) throw orgError;
      const sanitizedLogo = orgData ? UrlSafety.sanitizeExternalUrl(orgData.logo_url) : null;
      if (orgData) {
        setOrganization({ ...orgData, logo_url: sanitizedLogo });
        setOrganizationId(orgData.id);
      }

      // Cache organization data for login page logo display
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.email && orgData) {
          cacheOrganization(currentUser.email, {
            id: orgData.id,
            name: orgData.name,
            logo_url: sanitizedLogo
          });
        }
      } catch (cacheError) {
        console.warn('Could not cache organization:', cacheError);
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
    }
  };

  const refreshUserProfile = async (userIdOverride?: string) => {
    const id = userIdOverride || user?.id;
    if (!id) return;
    await fetchUserProfile(id);
  };

  const refreshOrganization = async () => {
    if (!user?.id) return;
    await fetchOrganization(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      userProfile,
      organization,
      organizationId,
      loading,
      signOut,
      refreshUserProfile,
      refreshOrganization
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
