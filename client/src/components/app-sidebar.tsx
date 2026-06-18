import { MessageSquare, LayoutDashboard, Key, CreditCard, LogOut, Shield, Users, Settings2, DollarSign, ShieldAlert, CalendarDays, Brain, Activity, BrainCircuit, Coins, Rocket, Bot, Clock, Database, FolderKanban, Globe, Inbox, Wallet, GitBranch, ShoppingBag } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
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
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItemKeys = [
  { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
  { titleKey: "nav.chat", url: "/chat", icon: MessageSquare },
  { titleKey: "nav.projects", url: "/projects", icon: FolderKanban },
  { titleKey: "nav.providerSessions", url: "/provider-sessions", icon: Globe },
  { titleKey: "nav.apiKeys", url: "/keys", icon: Key },
  { titleKey: "nav.billing", url: "/billing", icon: CreditCard },
  { titleKey: "nav.credits", url: "/credits", icon: Wallet },
  { titleKey: "nav.approvals", url: "/approvals", icon: Inbox },
  { titleKey: "nav.schedule", url: "/schedule", icon: Clock },
];

// Customer persona — minimal navigation
const customerNavItems = [
  { titleKey: "nav.dashboard", url: "/my-orders", icon: ShoppingBag, label: "My Orders" },
  { titleKey: "nav.billing", url: "/billing", icon: CreditCard, label: "Billing" },
  { titleKey: "nav.credits", url: "/credits", icon: Wallet, label: "Credits" },
];

// Agent persona — projects/arms focused
const agentNavItems = [
  { titleKey: "nav.projects", url: "/projects", icon: FolderKanban, label: "My Projects" },
  { titleKey: "nav.chat", url: "/chat", icon: MessageSquare, label: "AI Chat" },
  { titleKey: "nav.approvals", url: "/approvals", icon: Inbox, label: "Approvals" },
  { titleKey: "nav.schedule", url: "/schedule", icon: Clock, label: "Schedule" },
];

const adminItemKeys = [
  { titleKey: "admin.overview", url: "/admin", icon: Shield },
  { titleKey: "admin.users", url: "/admin/users", icon: Users },
  { titleKey: "admin.providers", url: "/admin/providers", icon: Settings2 },
  { titleKey: "admin.pricing", url: "/admin/settings", icon: DollarSign },
  { titleKey: "admin.rateLimits", url: "/admin/rate-limits", icon: ShieldAlert },
  { titleKey: "admin.calendar", url: "/admin/calendar", icon: CalendarDays },
  { titleKey: "admin.aiRules", url: "/admin/rules", icon: Brain },
  { titleKey: "admin.agentTools", url: "/admin/agent-tools", icon: BrainCircuit },
  { titleKey: "admin.crm", url: "/admin/crm", icon: Database },
  { titleKey: "admin.userTimeline", url: "/admin/timeline", icon: Activity },
  { titleKey: "admin.icoDashboard", url: "/admin/ico", icon: Coins },
  { titleKey: "admin.deployment", url: "/admin/deploy", icon: Rocket },
  { titleKey: "admin.agents", url: "/admin/agents", icon: Bot },
  { titleKey: "admin.p9Agents", url: "/agents", icon: Bot },
  { titleKey: "admin.systemQueue", url: "/system-queue", icon: Inbox },
  { titleKey: "admin.armsDashboard", url: "/admin/arms", icon: GitBranch },
];

export function AppSidebar() {
  const { user, logout, isImpersonating } = useAuth();
  const [location] = useLocation();
  const { t, dir } = useI18n();

  // Determine which nav items to show based on persona
  const isCustomerPersona = isImpersonating && user?.email === "customer.demo@tendit.io";
  const isAgentPersona = isImpersonating && user?.email === "agent.demo@tendit.io";
  const activeNavItems = isCustomerPersona
    ? customerNavItems.map((i) => ({ titleKey: i.titleKey, url: i.url, icon: i.icon, fallbackLabel: i.label }))
    : isAgentPersona
    ? agentNavItems.map((i) => ({ titleKey: i.titleKey, url: i.url, icon: i.icon, fallbackLabel: i.label }))
    : navItemKeys.map((i) => ({ titleKey: i.titleKey, url: i.url, icon: i.icon, fallbackLabel: undefined as string | undefined }));

  return (
    <Sidebar side={dir === "rtl" ? "right" : "left"}>
      <SidebarHeader className="p-4">
        <div className={`flex items-center gap-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
          <img src="/tendit-logo.jpg" alt="Tendit" className="w-8 h-8 rounded-lg object-cover" />
          <div className={dir === "rtl" ? "text-right" : ""}>
            <div className="font-bold text-sm">Tendit</div>
            <div className="text-xs text-muted-foreground">AI Platform</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("common.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {activeNavItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}>
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.fallbackLabel || t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user?.role === "admin" && !isImpersonating && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("admin.label")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItemKeys.map((item) => (
                  <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton asChild isActive={location === item.url} data-testid={`nav-admin-${item.url.replace("/admin", "").replace("/", "") || "overview"}`}>
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <div className={`flex items-center justify-between px-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
          <div className={dir === "rtl" ? "text-right" : ""}>
            <div className="font-medium truncate text-sm">{user?.username}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {user?.credits?.toFixed(1)} {t("common.credits")}
          </Badge>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
              <span>{t("nav.signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
