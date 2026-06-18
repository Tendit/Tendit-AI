import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Zap, Check, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  projectId: number | null;
  read: boolean;
  createdAt: string;
}

interface PendingProposal {
  id: number;
  projectId: number;
  projectName?: string;
  actionKey: string;
  actionLabel?: string;
  inputs: any;
  status: string;
  proposedByAgent: string | null;
  proposedByUserId: number | null;
  createdAt: string;
}

export default function ApprovalsPage() {
  const { t, dir } = useI18n();
  const { toast } = useToast();

  const notifQ = useQuery<NotificationRow[]>({ queryKey: ["/api/notifications"] });
  const proposalsQ = useQuery<PendingProposal[]>({ queryKey: ["/api/actions/proposals/pending"] });

  const approveMut = useMutation({
    mutationFn: async (pid: number) => {
      const res = await apiRequest("POST", `/api/actions/proposals/${pid}/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Action approved & executed" });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/proposals/pending"] });
    },
    onError: (err: any) => {
      toast({ title: "Approval failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const rejectMut = useMutation({
    mutationFn: async (pid: number) => {
      const res = await apiRequest("POST", `/api/actions/proposals/${pid}/reject`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Action rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/proposals/pending"] });
    },
  });

  const approvals = (notifQ.data || []).filter((n) => n.type === "chat_reply_approval" || n.type === "milestone_ready");
  const pendingProposals = proposalsQ.data || [];

  return (
    <div className={`p-6 max-w-3xl mx-auto space-y-4 ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-approvals-title">
          <Inbox className="w-5 h-5" /> {t("approvals.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("approvals.subtitle")}</p>
      </div>

      {/* Pending Action Proposals */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Zap className="w-4 h-4" /> Pending Actions ({pendingProposals.length})
        </h2>
        {proposalsQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : pendingProposals.length === 0 ? (
          <Card><CardContent className="p-4 text-xs text-muted-foreground">No pending actions</CardContent></Card>
        ) : (
          pendingProposals.map((p) => (
            <Card key={p.id} data-testid={`card-proposal-${p.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{p.actionLabel || p.actionKey}</Badge>
                    {p.projectName && <span className="text-xs text-muted-foreground">{p.projectName}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground font-normal">
                    {p.proposedByAgent ? `by ${p.proposedByAgent}` : "Manual"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                  {JSON.stringify(p.inputs, null, 2)}
                </pre>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveMut.mutate(p.id)}
                    disabled={approveMut.isPending}
                    data-testid={`button-approve-${p.id}`}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Approve & Execute
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectMut.mutate(p.id)}
                    disabled={rejectMut.isPending}
                    data-testid={`button-reject-${p.id}`}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Reject
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Legacy chat reply approvals */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Inbox className="w-4 h-4" /> Notifications
        </h2>
        {notifQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : approvals.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("approvals.empty")}</CardContent></Card>
        ) : (
          approvals.map((n) => (
            <Card key={n.id} data-testid={`card-approval-${n.id}`}>
              <CardHeader>
                <CardTitle className="text-base">{n.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {n.body && <div className="text-sm">{n.body}</div>}
                <div className="text-xs text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("approvals.respondViaTelegram")}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
