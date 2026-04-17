import { ReactNode } from "react";
import { HomeNavbar } from "@/components/HomeNavbar";

interface MarketingLayoutProps {
  children: ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <HomeNavbar />
      <main className="min-h-screen">
        {children}
      </main>
    </div>
  );
}
