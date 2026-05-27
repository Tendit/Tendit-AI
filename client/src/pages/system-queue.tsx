import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface QueueRow {
  id: number;
  projectId: number;
  userId: number;
  actionPayload: string;
  estimatedCredits: number;
  status: string;
  requestedAt: string;
  approvedBy: number | null;
  approvedAt: string | null;
  resultRef: string | null;
}

export default function SystemQueuePage() {
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const { toast } = useToast();

  const q = useQuery<QueueRow[]>({ queryKey: ["/api/system-queue"] });

  const approve = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch("POST", `/api/system-queue/${id}/approve`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-queue"] });
      toast({ title: t("systemQueue.approved") });
    },
  });

  const deny = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch("POST", `/api/system-queue/${id}/deny`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-queue"] });
      toast({ title: t("systemQueue.denied") });
    },
  });

  const renderPayload = (p: string) => {
    try {
      const obj = JSON.parse(p);
      return JSON.stringify(obj, null, 2);
    } catch { return p; }
  };

  return (
    <div className={`p-6 max-w-5xl mx-auto space-y-4 ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      <div>
        <h1 className="text-xl font-bold" data-testid="text-system-queue-title">{t("systemQueue.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("systemQueue.subtitle")}</p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : (q.data || []).length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("systemQueue.empty")}</CardContent></Card>
      ) : (
        (q.data || []).map((row) => (
          <Card key={row.id} data-testid={`card-queue-${row.id}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {t("systemQueue.request")} #{row.id}
                <Badge variant={row.status === "awaiting" ? "default" : "outline"}>{row.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <div>{t("systemQueue.project")}: <span className="font-mono">#{row.projectId}</span></div>
                <div>{t("systemQueue.user")}: <span className="font-mono">#{row.userId}</span></div>
                <div>{t("systemQueue.credits")}: <span className="font-mono">{row.estimatedCredits}</span></div>
                <div className="text-xs text-muted-foreground">{new Date(row.requestedAt).toLocaleString()}</div>
              </div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{renderPayload(row.actionPayload)}</pre>
              {row.status === "awaiting" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve.mutate(row.id)} disabled={approve.isPending} data-testid={`button-approve-${row.id}`}>
                    {t("systemQueue.approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deny.mutate(row.id)} disabled={deny.isPending} data-testid={`button-deny-${row.id}`}>
                    {t("systemQueue.deny")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
