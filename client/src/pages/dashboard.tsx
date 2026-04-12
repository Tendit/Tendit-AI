import { useState, useEffect } from "react";
import { useAuth, useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Activity, Zap, TrendingUp } from "lucide-react";
import { PLANS, MODELS, applyMargin } from "@shared/schema";

interface UsageStats {
  totalCredits: number;
  totalRequests: number;
  todayCredits: number;
  todayRequests: number;
}

interface UsageLog {
  id: number;
  model: string;
  creditsUsed: number;
  endpoint: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const { t } = useI18n();
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        authFetch("GET", "/api/usage/stats"),
        authFetch("GET", "/api/usage"),
      ]);
      setStats(await statsRes.json());
      setRecentLogs(await logsRes.json());
    } catch {}
    setLoading(false);
  };

  const [multiplier, setMultiplier] = useState(1);

  useEffect(() => {
    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    fetch(`${API_BASE}/api/settings/margin`)
      .then((r) => r.json())
      .then((d) => setMultiplier(d.multiplier || 1))
      .catch(() => {});
  }, []);

  const plan = user ? PLANS[user.plan as keyof typeof PLANS] : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("nav.dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{t("dash.welcome")}, {user?.username}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dash.creditsBalance")}</CardTitle>
            <Coins className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold" data-testid="text-credits-balance">{user?.credits?.toFixed(1)}</div>
            )}
            <p className="text-xs text-muted-foreground">{plan?.name} plan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dash.todayUsage")}</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold" data-testid="text-today-usage">{stats?.todayRequests || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">{stats?.todayCredits?.toFixed(1) || 0} {t("dash.creditsUsedToday")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dash.totalRequests")}</CardTitle>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold" data-testid="text-total-requests">{stats?.totalRequests || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">{t("dash.allTime")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("dash.totalCredits")}</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold" data-testid="text-total-credits">{stats?.totalCredits?.toFixed(1) || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">{t("dash.allTime")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Model pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dash.modelPricing")}</CardTitle>
          <CardDescription>{t("dash.creditsPerRequest")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MODELS.map((model) => {
              const userCost = applyMargin(model.cost, multiplier);
              return (
                <div key={model.id} className="p-3 rounded-lg border bg-card">
                  <div className="text-sm font-medium">{model.name}</div>
                  <div className="text-lg font-bold text-primary">{userCost} cr</div>
                  <div className="text-xs text-muted-foreground capitalize">{model.provider} · {model.category}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dash.recentActivity")}</CardTitle>
          <CardDescription>Your latest API requests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No activity yet. Start chatting or use the API.</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-md border text-sm" data-testid={`log-item-${log.id}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant={log.endpoint === "chat" ? "default" : "secondary"} className="text-xs">
                      {log.endpoint}
                    </Badge>
                    <span className="text-muted-foreground capitalize">{log.model.replace(/-/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{log.creditsUsed} cr</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
