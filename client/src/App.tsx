import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider, useI18n } from "@/lib/i18n";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import ChatPage from "@/pages/chat";
import ApiKeysPage from "@/pages/api-keys";
import BillingPage from "@/pages/billing";
import NotFound from "@/pages/not-found";
import AdminDashboardPage from "@/pages/admin/admin-dashboard";
import AdminUsersPage from "@/pages/admin/admin-users";
import AdminProvidersPage from "@/pages/admin/admin-providers";
import AdminSettingsPage from "@/pages/admin/admin-settings";
import AdminRateLimitsPage from "@/pages/admin/admin-rate-limits";
import AdminCalendarPage from "@/pages/admin/admin-calendar";
import AdminRulesPage from "@/pages/admin/admin-rules";
import AdminTimelinePage from "@/pages/admin/admin-timeline";
import AdminAgentToolsPage from "@/pages/admin/admin-agent-tools";
import AdminICODemoPage from "@/pages/admin/admin-ico-demo";
import AdminDeployPage from "@/pages/admin/admin-deploy";
import AdminAgentsPage from "@/pages/admin/admin-agents";
import AdminCRMPage from "@/pages/admin/admin-crm";
import SchedulePage from "@/pages/schedule";
import ProjectsListPage from "@/pages/projects-list";
import ProjectDetailPage from "@/pages/project-detail";
import ProviderSessionsPage from "@/pages/provider-sessions";
import InviteAcceptPage from "@/pages/invite-accept";
import AgentsPage from "@/pages/agents";
import CreditsPage from "@/pages/credits";
import SystemQueuePage from "@/pages/system-queue";
import ApprovalsPage from "@/pages/approvals";
import ArmDetailPage from "@/pages/arm-detail";
import AdminArmsDashboardPage from "@/pages/admin-arms-dashboard";
import BuyPage from "@/pages/buy";
import { NotificationBell } from "@/components/notification-bell";
import { Skeleton } from "@/components/ui/skeleton";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/keys" component={ApiKeysPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/admin" component={AdminDashboardPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/providers" component={AdminProvidersPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
      <Route path="/admin/rate-limits" component={AdminRateLimitsPage} />
      <Route path="/admin/calendar" component={AdminCalendarPage} />
      <Route path="/admin/rules" component={AdminRulesPage} />
      <Route path="/admin/timeline" component={AdminTimelinePage} />
      <Route path="/admin/agent-tools" component={AdminAgentToolsPage} />
      <Route path="/admin/ico" component={AdminICODemoPage} />
      <Route path="/admin/deploy" component={AdminDeployPage} />
      <Route path="/admin/agents" component={AdminAgentsPage} />
      <Route path="/admin/crm" component={AdminCRMPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/projects" component={ProjectsListPage} />
      <Route path="/projects/:projectId/arms/:armSlug" component={ArmDetailPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/admin/arms" component={AdminArmsDashboardPage} />
      <Route path="/provider-sessions" component={ProviderSessionsPage} />
      <Route path="/agents" component={AgentsPage} />
      <Route path="/credits" component={CreditsPage} />
      <Route path="/system-queue" component={SystemQueuePage} />
      <Route path="/approvals" component={ApprovalsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { dir } = useI18n();
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties} dir={dir}>
      <div className={`flex h-screen w-full ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className={`flex items-center justify-between px-3 py-2 border-b ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <AppRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppShell() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  // Allow public invite-accept route without authentication
  if (location.startsWith("/invite/")) {
    return <InviteAcceptPage />;
  }

  // Public landing page for productized offers (FTO + Pitch Site)
  if (location === "/buy" || location.startsWith("/buy/")) {
    return <BuyPage />;
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <Skeleton className="h-10 w-10 rounded-lg mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <AuthProvider>
              <AppShell />
            </AuthProvider>
          </Router>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

export default App;
