import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Coins, TrendingUp, Zap, DollarSign } from "lucide-react";

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, providerRes, logsRes] = await Promise.all([
        authFetch("GET", "/api/admin/stats"),
        authFetch("GET", "/api/admin/usage/by-provider"),
        authFetch("GET", "/api/admin/usage"),
      ]);
      setStats(await statsRes.json());
      setProviderUsage(await providerRes.json());
      setRecentLogs(await logsRes.json());
    } catch {}
    setLoading(false);
  };

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
