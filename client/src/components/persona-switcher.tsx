import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type PersonaUser = {
  id: number;
  email: string;
  username: string;
  role: string;
};

/**
 * Persona Switcher — admin-only header control.
 * Lets an admin impersonate Customer / Agent demo users without logging out.
 * Uses the in-memory impersonate flow exposed by AuthContext.
 */
export function PersonaSwitcher() {
  const { user, isImpersonating, impersonate, returnToOriginal } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);

  // Only render for admins (real admins, or admins currently impersonating)
  const isAdminContext = user?.role === "admin" || isImpersonating;

  // Fetch available demo personas (only when admin context is active)
  const { data: personas } = useQuery<PersonaUser[]>({
    queryKey: ["/api/admin/personas"],
    enabled: user?.role === "admin",
  });

  if (!isAdminContext) return null;

  const customerDemo = personas?.find((p) => p.email === "customer.demo@tendit.io");
  const agentDemo = personas?.find((p) => p.email === "agent.demo@tendit.io");

  async function doImpersonate(email: string, label: string) {
    setSwitching(true);
    try {
      const target = await impersonate(email);
      toast({ title: `Now viewing as ${label}`, description: target.email });
      // Invalidate cached queries so persona-specific data refetches
      queryClient.clear();
      // Navigate to root so persona-specific routing takes effect
      window.location.hash = "#/";
    } catch (e: any) {
      toast({ title: "Switch failed", description: e.message, variant: "destructive" });
    } finally {
      setSwitching(false);
    }
  }

  async function doReturn() {
    setSwitching(true);
    try {
      await returnToOriginal();
      toast({ title: "Returned to Admin" });
      queryClient.clear();
      window.location.hash = "#/";
    } finally {
      setSwitching(false);
    }
  }

  const currentLabel = !isImpersonating
    ? "Admin"
    : user?.email === "customer.demo@tendit.io"
    ? "Customer"
    : user?.email === "agent.demo@tendit.io"
    ? "Agent"
    : user?.username || "User";

  const currentColor = !isImpersonating
    ? "text-slate-700 dark:text-slate-200"
    : currentLabel === "Customer"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-indigo-700 dark:text-indigo-300";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={switching}
          data-testid="button-persona-switcher"
          className="h-8"
        >
          <span className="text-xs text-muted-foreground mr-1.5 hidden sm:inline">View as:</span>
          <span className={`font-medium ${currentColor}`}>{currentLabel}</span>
          <svg className="w-3 h-3 ml-1.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Switch perspective
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isImpersonating ? (
          <DropdownMenuItem onClick={doReturn} data-testid="menu-return-admin" className="cursor-pointer">
            <div className="flex flex-col">
              <span className="font-medium">↩ Return to Admin</span>
              <span className="text-xs text-muted-foreground">Resume your real session</span>
            </div>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <div className="flex flex-col">
              <span className="font-medium">✓ Admin (current)</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => doImpersonate(customerDemo?.email || "customer.demo@tendit.io", "Customer")}
          disabled={!customerDemo || switching}
          data-testid="menu-view-customer"
          className="cursor-pointer"
        >
          <div className="flex flex-col">
            <span className="font-medium">👤 Customer</span>
            <span className="text-xs text-muted-foreground">
              {customerDemo?.email || "customer.demo@tendit.io (seed pending)"}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => doImpersonate(agentDemo?.email || "agent.demo@tendit.io", "Agent")}
          disabled={!agentDemo || switching}
          data-testid="menu-view-agent"
          className="cursor-pointer"
        >
          <div className="flex flex-col">
            <span className="font-medium">🤝 Agent</span>
            <span className="text-xs text-muted-foreground">
              {agentDemo?.email || "agent.demo@tendit.io (seed pending)"}
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
