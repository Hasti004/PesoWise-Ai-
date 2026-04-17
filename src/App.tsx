import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import HomePage from "./pages/marketing/HomePage";
import FeaturesPage from "./pages/FeaturesPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import SecurityPage from "./pages/SecurityPage";
import PricingPage from "./pages/PricingPage";
import ContactPage from "./pages/ContactPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import CookiePolicyPage from "./pages/legal/CookiePolicyPage";
import TermsPage from "./pages/legal/TermsPage";
import DisclaimerPage from "./pages/legal/DisclaimerPage";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import ExpenseForm from "./pages/ExpenseForm";
import ExpenseDetail from "./pages/ExpenseDetail";
import AdminPanel from "./pages/AdminPanel";
import ManagerReview from "./pages/EngineerReview";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";
import Balances from "./pages/Balances";
import Reports from "./pages/Reports";
import CategoryManagement from "./pages/CategoryManagement";
import Settings from "./pages/Settings";
import NotificationSettings from "./pages/NotificationSettings";
import CashierTransactions from "./pages/CashierTransactions";
import CashTransferHistory from "./pages/CashTransferHistory";
import MasterAdminDashboard from "./pages/MasterAdminDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/cookies" element={<CookiePolicyPage />} />
          <Route path="/toc" element={<TermsPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route
            path="/balances"
            element={
              <ProtectedRoute allowedRoles={["admin", "cashier"]}>
                <Layout>
                  <Balances />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/master"
            element={
              <ProtectedRoute allowedRoles={["master_admin"]}>
                <Layout>
                  <MasterAdminDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/home" element={<HomePage />} />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "cashier", "engineer"]}>
                <Layout>
                  <Expenses />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/new"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <ExpenseForm />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/:id"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <ExpenseDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/:id/edit"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <ExpenseForm />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/expenses"
            element={
              <ProtectedRoute allowedRoles={["admin", "cashier"]}>
                <Layout>
                  <AdminPanel />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <UserManagement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <Reports />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Layout>
                  <CategoryManagement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notification-settings"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/review"
            element={
              <ProtectedRoute allowedRoles={["engineer"]}>
                <Layout>
                  <ManagerReview />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                <Layout>
                  <Analytics />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cashier/transactions"
            element={
              <ProtectedRoute allowedRoles={["cashier"]}>
                <Layout>
                  <CashierTransactions />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cash-transfer-history"
            element={
              <ProtectedRoute allowedRoles={["admin", "cashier"]}>
                <Layout>
                  <CashTransferHistory />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <Notifications />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notification-settings"
            element={
              <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                <Layout>
                  <NotificationSettings />
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
