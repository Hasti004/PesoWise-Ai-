import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  FileText,
  LogOut,
  BarChart3,
  Bell,
  Tag,
  Settings as SettingsIcon,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useAllowCashierExpenseSubmission } from "@/hooks/useAllowCashierExpenseSubmission";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const { userRole, signOut, organization } = useAuth();
  const { allowCashierExpenseSubmission } = useAllowCashierExpenseSubmission();
  const { unreadCount } = useUnreadNotifications();

  const employeeItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Expenses", url: "/expenses", icon: Receipt },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];

  const engineerItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Expenses", url: "/expenses", icon: Receipt },
    { title: "Review Expenses", url: "/review", icon: FileText },
    { title: "Notifications", url: "/notifications", icon: Bell },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];

  const adminItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "All Expenses", url: "/admin/expenses", icon: Receipt },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Manage Users", url: "/admin/users", icon: Users },
    { title: "Categories", url: "/admin/categories", icon: Tag },
    { title: "Reports", url: "/admin/reports", icon: FileText },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];


  const cashierItemsBase = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ...(allowCashierExpenseSubmission === true ? [{ title: "My Expenses", url: "/expenses", icon: Receipt }] : []),
    { title: "All Expenses", url: "/admin/expenses", icon: Receipt },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Transaction History", url: "/cashier/transactions", icon: Clock },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];

  const masterAdminItems = [
    { title: "Master Dashboard", url: "/master", icon: ShieldCheck },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
  ];

  const items =
    userRole === "master_admin" ? masterAdminItems :
    userRole === "admin" ? adminItems :
    userRole === "engineer" ? engineerItems :
    userRole === "cashier" ? cashierItemsBase :
    employeeItems;

  return (
    <Sidebar className="border-r-0 sm:border-r">
      <SidebarContent className="px-2 sm:px-0">
        {/* Mobile-optimized Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <img 
              key={organization?.logo_url || 'default'}
              src={organization?.logo_url || "/HERO.png"} 
              alt={organization?.name || "Logo"} 
              className="h-8 sm:h-10 w-auto flex-shrink-0 object-contain"
              onError={(e) => {
                // Fallback to default logo if organization logo fails to load
                (e.target as HTMLImageElement).src = "/HERO.png";
              }}
            />
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4 sm:px-6 text-xs sm:text-sm">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2 sm:px-0">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink 
                    to={item.url}
                    end={item.url === "/dashboard"}
                    className={({ isActive }) => {
                      const baseClasses = "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors h-10 sm:h-9";
                      if (isActive) {
                        return `${baseClasses} bg-gray-200 text-gray-900 font-semibold`;
                      }
                      return `${baseClasses} text-sidebar-foreground hover:bg-gray-100 hover:text-gray-900`;
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      <item.icon className="h-4 w-4" />
                      {item.title === "Notifications" && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                      )}
                    </div>
                    <span className="truncate flex-1">{item.title}</span>
                    {item.title === "Notifications" && unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs flex items-center justify-center">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Badge>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
              
              {/* Sign Out Button - Higher on Mobile */}
              <SidebarMenuItem className="block sm:hidden mt-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start h-10 text-sm"
                  onClick={() => signOut()}
                >
                  <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span className="truncate">Sign Out</span>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Sign Out Button - Footer for Desktop */}
      <SidebarFooter className="px-2 sm:px-0 hidden sm:block">
        <Button
          variant="ghost"
          className="w-full justify-start h-10 sm:h-9 text-sm"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate">Sign Out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
