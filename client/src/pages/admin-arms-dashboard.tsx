import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LayoutGrid, CheckCircle2, UserX, Inbox, Bot, Activity } from "lucide-react";

interface ByAgent { agentId: number; displayName: string | null; slug: string; armCount: number; messageCount: number; creditsSpent: number; }
interface ActivityRow { id: number; armId: number; action: string; creditsCost: number | null; armName?: string; projectId?: number; createdAt: string; }
interface DashArm {
  id: number; projectId: number; name: string; slug: string; isActive: boolean;
  visibility: string; projectName?: string; agentDisplayName?: string | null;
  ownerEmail?: string | null; messageCount: number; targetCount: number; creditsSpent: number;
}
interface Dashboard {
  totalArms: number; activeArms: number; ownerlessArms: number; pendingInstructions: number;
  byAgent: ByAgent[]; recentActivity: ActivityRow[]; arms: DashArm[];
}

function StatCard({ icon, label, value, testid }: { icon: React.ReactNode; label: string; value: number; testid: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div>
          <div className="text-2xl font-semibold" data-testid={testid}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminArmsDashboardPage() {
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";

  const q = useQuery<Dashboard>({
    queryKey: ["/api/admin/arms/dashboard"],
    queryFn: async () => (await authFetch("GET", "/api/admin/arms/dashboard")).json(),
  });

  const d = q.data;

  return (
    <div className={`p-4 max-w-6xl mx-auto ${isRtl ? "text-right" : ""}`} dir={dir}>
      <div className="mb-4">
        <h1 className="text-xl font-semibold" data-testid="text-dashboard-title">{t("arms.dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("arms.dashboard.subtitle")}</p>
      </div>

      {q.isLoading || !d ? (
        <div className="grid gap-3 md:grid-cols-4 mb-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4 mb-6">
            <StatCard icon={<LayoutGrid className="h-4 w-4" />} label={t("arms.dashboard.totalArms")} value={d.totalArms} testid="stat-total-arms" />
            <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label={t("arms.dashboard.activeArms")} value={d.activeArms} testid="stat-active-arms" />
            <StatCard icon={<UserX className="h-4 w-4" />} label={t("arms.dashboard.ownerless")} value={d.ownerlessArms} testid="stat-ownerless" />
            <StatCard icon={<Inbox className="h-4 w-4" />} label={t("arms.dashboard.pending")} value={d.pendingInstructions} testid="stat-pending" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" />{t("arms.dashboard.byAgent")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.byAgent.length === 0 ? <p className="text-sm text-muted-foreground">—</p> :
                  d.byAgent.map((a) => (
                    <div key={a.agentId} className="flex items-center justify-between text-sm border rounded p-2" data-testid={`row-agent-${a.slug}`}>
                      <span className="font-medium">{a.displayName || a.slug}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.armCount} · {a.messageCount} {t("arms.dashboard.messages")} · {a.creditsSpent} {t("arms.dashboard.credits")}
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />{t("arms.dashboard.recentActivity")}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 max-h-64 overflow-auto">
                {d.recentActivity.length === 0 ? <p className="text-sm text-muted-foreground">—</p> :
                  d.recentActivity.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs border-b last:border-0 py-1" data-testid={`activity-${r.id}`}>
                      <span><span className="font-medium">{r.armName || `arm#${r.armId}`}</span> · {r.action}</span>
                      {r.creditsCost ? <Badge variant="outline" className="text-[10px]">{r.creditsCost} cr</Badge> : null}
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{t("arms.dashboard.title")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("arms.dashboard.arm")}</TableHead>
                    <TableHead>{t("arms.dashboard.project")}</TableHead>
                    <TableHead>{t("arms.manager")}</TableHead>
                    <TableHead>{t("arms.owner")}</TableHead>
                    <TableHead className="text-right">{t("arms.dashboard.messages")}</TableHead>
                    <TableHead className="text-right">{t("arms.dashboard.targets")}</TableHead>
                    <TableHead className="text-right">{t("arms.dashboard.credits")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.arms.map((a) => (
                    <TableRow key={a.id} data-testid={`row-arm-${a.id}`}>
                      <TableCell>
                        <Link href={`/projects/${a.projectId}/arms/${a.slug}`}>
                          <span className="font-medium hover:underline cursor-pointer flex items-center gap-1.5">
                            {a.name}
                            {!a.isActive && <Badge variant="outline" className="text-[10px]">{t("arms.inactive")}</Badge>}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.projectName || `#${a.projectId}`}</TableCell>
                      <TableCell>{a.agentDisplayName || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.ownerEmail || <span className="italic">{t("arms.unassigned")}</span>}
                      </TableCell>
                      <TableCell className="text-right">{a.messageCount}</TableCell>
                      <TableCell className="text-right">{a.targetCount}</TableCell>
                      <TableCell className="text-right">{a.creditsSpent}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
