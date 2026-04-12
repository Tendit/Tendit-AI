import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Coins, TrendingUp, Zap, DollarSign, CheckCircle2, XCircle, Globe, Server, Key, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PROVIDERS } from "@shared/schema";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalCreditsUsed: number;
  totalRequests: number;
  todayRequests: number;
  todayCreditsUsed: number;
  revenueEstimate: number;
}

interface UsageByProvider {
  provider: string;
  count: number;
  credits: number;
}

interface ProviderKeyInfo {
  provider: string;
  isActive: boolean;
}

interface DeploySettings {
  railwayApiToken?: string;
  railwayProjectId?: string;
}

interface RecentLog {
  id: number;
  userId: number;
  model: string;
  provider: string;
  creditsUsed: number;
  endpoint: string;
  createdAt: string;
  username?: string;
}

export default function AdminDashboardPage() {
  const authFetch = useAuthFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [providerUsage, setProviderUsage] = useState<UsageByProvider[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyInfo[]>([]);
  const [deploySettings, setDeploySettings] = useState<DeploySettings | null>(null);
  const [railwayStatus, setRailwayStatus] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, providerRes, logsRes, keysRes] = await Promise.all([
        authFetch("GET", "/api/admin/stats"),
        authFetch("GET", "/api/admin/usage/by-provider"),
        authFetch("GET", "/api/admin/usage"),
        authFetch("GET", "/api/admin/providers"),
      ]);
      setStats(await statsRes.json());
      setProviderUsage(await providerRes.json());
      setRecentLogs(await logsRes.json());
      setProviderKeys(await keysRes.json());
    } catch {}
    // Load deploy settings
    try {
      const deployRes = await authFetch("GET", "/api/admin/deploy/settings");
      const settings = await deployRes.json();
      setDeploySettings(settings);
      if (settings.railwayApiToken && settings.railwayProjectId) {
        setRailwayStatus("connected");
        // Try to get deployment status
        try {
          const railwayRes = await authFetch("GET", "/api/admin/deploy/railway");
          const railwayData = await railwayRes.json();
          if (railwayData.latestDeployment?.status === "SUCCESS") {
            setRailwayStatus("deployed");
          } else if (railwayData.latestDeployment?.status === "DEPLOYING" || railwayData.latestDeployment?.status === "BUILDING") {
            setRailwayStatus("deploying");
          } else if (railwayData.latestDeployment?.status === "FAILED") {
            setRailwayStatus("failed");
          }
        } catch {}
      }
    } catch {}
    setLoading(false);
  };

  const connectedProviders = providerKeys.filter(k => k.isActive);
  const totalProviders = PROVIDERS.length;

  const providerColors: Record<string, string> = {
    perplexity: "bg-teal-500",
    anthropic: "bg-orange-500",
    openai: "bg-green-500",
    google: "bg-blue-500",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview and analytics</p>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Providers Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${connectedProviders.length === totalProviders ? "bg-green-100 dark:bg-green-900/30" : connectedProviders.length > 0 ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                <Key className={`w-5 h-5 ${connectedProviders.length === totalProviders ? "text-green-600 dark:text-green-400" : connectedProviders.length > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">AI Providers</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {connectedProviders.length === totalProviders ? (
                    <Badge variant="default" className="bg-green-600 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />All connected</Badge>
                  ) : connectedProviders.length > 0 ? (
                    <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />{connectedProviders.length}/{totalProviders} connected</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />Not configured</Badge>
                  )}
                </div>
                {connectedProviders.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {PROVIDERS.map(p => {
                      const connected = connectedProviders.some(k => k.provider === p.id);
                      return (
                        <span key={p.id} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${connected ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: connected ? p.color : undefined }} />
                          {p.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Railway Deployment Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${railwayStatus === "deployed" ? "bg-green-100 dark:bg-green-900/30" : railwayStatus === "deploying" ? "bg-blue-100 dark:bg-blue-900/30" : railwayStatus === "connected" ? "bg-yellow-100 dark:bg-yellow-900/30" : railwayStatus === "failed" ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"}`}>
                <Rocket className={`w-5 h-5 ${railwayStatus === "deployed" ? "text-green-600 dark:text-green-400" : railwayStatus === "deploying" ? "text-blue-600 dark:text-blue-400" : railwayStatus === "connected" ? "text-yellow-600 dark:text-yellow-400" : railwayStatus === "failed" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Railway Deployment</div>
                <div className="mt-0.5">
                  {railwayStatus === "deployed" ? (
                    <Badge variant="default" className="bg-green-600 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Live</Badge>
                  ) : railwayStatus === "deploying" ? (
                    <Badge variant="secondary" className="text-xs gap-1 bg-blue-600 text-white"><Activity className="w-3 h-3 animate-pulse" />Deploying...</Badge>
                  ) : railwayStatus === "connected" ? (
                    <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Connected</Badge>
                  ) : railwayStatus === "failed" ? (
                    <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />Failed</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs gap-1"><XCircle className="w-3 h-3" />Not configured</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Domain Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${railwayStatus === "deployed" ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}>
                <Globe className={`w-5 h-5 ${railwayStatus === "deployed" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Domain</div>
                <div className="mt-0.5">
                  {railwayStatus === "deployed" ? (
                    <Badge variant="default" className="bg-green-600 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs gap-1">Pending</Badge>
                  )}
                </div>
                {railwayStatus === "deployed" && (
                  <div className="text-xs text-muted-foreground mt-1 truncate">tendit-ai-production.up.railway.app</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Total Users", value: stats?.totalUsers, icon: Users },
          { label: "Active Users", value: stats?.activeUsers, icon: Users },
          { label: "Today Requests", value: stats?.todayRequests, icon: Activity },
          { label: "Total Requests", value: stats?.totalRequests, icon: Zap },
          { label: "Credits Used", value: stats?.totalCreditsUsed?.toFixed(1), icon: Coins },
          { label: "Est. Revenue", value: `$${stats?.revenueEstimate || 0}`, icon: DollarSign },
        ].map((item, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-xl font-bold" data-testid={`admin-stat-${i}`}>{item.value ?? 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage by provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          {providerUsage.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No usage data yet</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {providerUsage.map((p) => (
                <div key={p.provider} className="p-3 rounded-lg border">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${providerColors[p.provider] || "bg-gray-400"}`} />
                    <span className="text-sm font-medium capitalize">{p.provider}</span>
                  </div>
                  <div className="text-lg font-bold">{p.count}</div>
                  <div className="text-xs text-muted-foreground">{p.credits.toFixed(1)} credits</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Platform Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No activity yet</p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-auto">
              {recentLogs.slice(0, 30).map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${providerColors[log.provider] || "bg-gray-400"}`} />
                    <span className="font-medium">{log.username || `User #${log.userId}`}</span>
                    <span className="text-muted-foreground">{log.model}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{log.endpoint}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{log.creditsUsed} cr</span>
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
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
