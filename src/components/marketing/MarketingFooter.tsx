import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useConsent } from "@/components/legal/CookieConsentBanner";
import { Button } from "@/components/ui/button";

const PRODUCT_LINKS = [
  { to: "/", label: "Home" },
  { to: "/features", label: "Features" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
] as const;

const COMPANY_LINKS = [
  { to: "/security", label: "Security" },
  { to: "/contact", label: "Contact" },
  { to: "#", label: "Documentation" },
] as const;

const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy" },
  { to: "/cookies", label: "Cookies" },
  { to: "/toc", label: "Terms" },
  { to: "/disclaimer", label: "Disclaimer" },
] as const;

const linkClass =
  "block py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded touch-manipulation";

interface MarketingFooterProps {
  className?: string;
}

export function MarketingFooter({ className }: MarketingFooterProps) {
  const currentYear = new Date().getFullYear();
  const consent = useConsent();

  return (
    <footer className={cn("border-t border-border/50 bg-muted/30", className)}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand column (spans 2 on md+) */}
          <div className="md:col-span-2">
            <Link
              to="/"
              className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
            >
              <img src="/HERO.png" alt="PesoWise Logo" className="h-9 w-auto flex-shrink-0 rounded-lg" />
              <span className="text-xl font-bold text-foreground">PesoWise</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Petty cash and expense management made simple. Track expenses, automate approvals,
              and control balances.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Product</h3>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map(({ to, label }) => (
                <li key={to + label}>
                  <Link to={to} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-3">
              {COMPANY_LINKS.map(({ to, label }) => (
                <li key={to + label}>
                  <Link to={to} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <h3 className="mb-4 mt-6 text-sm font-semibold text-foreground">Legal</h3>
            <ul className="space-y-3">
              {LEGAL_LINKS.map(({ to, label }) => (
                <li key={to + label}>
                  <Link to={to} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            {consent && (
              <Button
                variant="link"
                className="mt-3 h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                onClick={consent.openPreferences}
              >
                Cookie preferences
              </Button>
            )}
          </div>
        </div>

        {/* Bottom bar (copyright) */}
        <div className="mt-12 border-t border-border/50 pt-8">
          <p className="text-center text-sm text-muted-foreground">
            © {currentYear} PesoWise by Unimisk. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
