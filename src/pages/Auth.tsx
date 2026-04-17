import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Removed signup: tabs no longer needed
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { getCachedOrganization, getMostRecentOrganization } from "@/lib/organizationCache";
import { UrlSafety } from "@/lib/UrlSafety";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("/HERO.png"); // Default Pesowise logo
  const [organizationName, setOrganizationName] = useState<string | null>(null); // Organization name from cache
  // signup removed
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
    
    // Load most recent organization logo and name for initial display
    const recentOrg = getMostRecentOrganization();
    const sanitizedRecentLogo = UrlSafety.sanitizeExternalUrl(recentOrg?.logo_url);
    if (sanitizedRecentLogo) {
      setLogoUrl(sanitizedRecentLogo);
    }
    if (recentOrg?.name) {
      setOrganizationName(recentOrg.name);
    }
  }, [navigate]);

  // Update logo and organization name when email changes (check cache for that email)
  useEffect(() => {
    if (email && email.includes('@')) {
      const cachedOrg = getCachedOrganization(email);
      const sanitizedCachedLogo = UrlSafety.sanitizeExternalUrl(cachedOrg?.logo_url);
      
      if (sanitizedCachedLogo) {
        setLogoUrl(sanitizedCachedLogo);
      } else {
        // Fallback to most recent or default
        const recentOrg = getMostRecentOrganization();
        const sanitizedRecentLogo = UrlSafety.sanitizeExternalUrl(recentOrg?.logo_url);
        setLogoUrl(sanitizedRecentLogo || "/HERO.png");
      }
      
      if (cachedOrg?.name) {
        setOrganizationName(cachedOrg.name);
      } else {
        // Fallback to most recent or null
        const recentOrg = getMostRecentOrganization();
        setOrganizationName(recentOrg?.name || null);
      }
    } else {
      // No email entered, show most recent or default
      const recentOrg = getMostRecentOrganization();
      const sanitizedRecentLogo = UrlSafety.sanitizeExternalUrl(recentOrg?.logo_url);
      setLogoUrl(sanitizedRecentLogo || "/HERO.png");
      setOrganizationName(recentOrg?.name || null);
    }
  }, [email]);

  // signup removed

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = authSchema.parse({ email, password });
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (error) throw error;

      navigate("/dashboard");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: error.errors[0].message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Sign in failed",
          description: error.message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src={logoUrl}
              alt="Organization Logo" 
              className="h-16 w-auto object-contain"
              onError={(e) => {
                // Fallback to default logo if cached logo fails to load
                (e.target as HTMLImageElement).src = "/HERO.png";
              }}
            />
          </div>
          {organizationName && (
            <CardTitle className="text-xl font-bold text-primary mb-2">
              {organizationName}
            </CardTitle>
          )}
          <CardTitle className={`text-2xl ${organizationName ? 'text-muted-foreground' : ''}`}>
            PesoWise - Powered by Unimisk
          </CardTitle>
          <CardDescription>
            Petty Cash management app
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <div className="relative">
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-4">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
