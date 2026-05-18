import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, ShieldCheck, AlertCircle, Clock, CheckCircle2, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagedSession {
  id: number;
  userId: number;
  name: string;
  site: string;
  runtime: string;
  status: string;
  accountLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PendingAction {
  id: number;
  sessionId: number;
  actionType: string;
  payload: string;
  reasoning: string | null;
  pageStateHash: string | null;
  screenshotUrl: string | null;
  status: string;
  createdBy: string;
  reminderSentAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SITE_OPTIONS = [
  { value: "fiverr", label: "Fiverr" },
  { value: "alibaba", label: "Alibaba" },
  { value: "other", label: "Other" },
];

const RUNTIME_OPTIONS = [
  { value: "mock", label: "Mock (Phase A)" },
  { value: "local_chrome", label: "Local Chrome (coming soon)" },
  { value: "browserless", label: "Browserless (coming soon)" },
];

const STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  active: { variant: "default", icon: CheckCircle2 },
  paused: { variant: "secondary", icon: Clock },
  expired: { variant: "destructive", icon: XCircle },
};

const ACTION_STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Pending" },
  approved: { variant: "default", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  executed: { variant: "default", label: "Executed" },
  failed: { variant: "destructive", label: "Failed" },
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffSec = (Date.now() - d.getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString();
}

function prettyPayload(payload: string): string {
  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
}

// ─── New Session Dialog ───────────────────────────────────────────────────────

function NewSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", site: "fiverr", runtime: "mock", accountLabel: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      await authFetch("POST", "/api/managed-sessions", {
        name: form.name.trim(),
        site: form.site,
        runtime: form.runtime,
        accountLabel: form.accountLabel.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/managed-sessions"] });
      toast({ title: t("providerSessions.created") });
      setForm({ name: "", site: "fiverr", runtime: "mock", accountLabel: "" });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("providerSessions.newSession")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-name">{t("providerSessions.name")}</Label>
            <Input
              id="session-name"
              data-testid="input-session-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Roy's Fiverr seller account"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-site">{t("providerSessions.site")}</Label>
            <Select value={form.site} onValueChange={(v) => setForm({ ...form, site: v })}>
              <SelectTrigger id="session-site" data-testid="select-session-site"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SITE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-runtime">{t("providerSessions.runtime")}</Label>
            <Select value={form.runtime} onValueChange={(v) => setForm({ ...form, runtime: v })}>
              <SelectTrigger id="session-runtime" data-testid="select-session-runtime"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RUNTIME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.value !== "mock"}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-label">{t("providerSessions.accountLabel")}</Label>
            <Input
              id="session-label"
              data-testid="input-session-label"
              value={form.accountLabel}
              onChange={(e) => setForm({ ...form, accountLabel: e.target.value })}
              placeholder="Roy personal Fiverr"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {t("providerSessions.credentialsHint")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-session">
              {t("providerSessions.cancel")}
            </Button>
            <Button type="submit" disabled={submitting} data-testid="button-create-session">
              {submitting ? t("providerSessions.creating") : t("providerSessions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending Action Row ───────────────────────────────────────────────────────

function PendingActionRow({ action, sessions }: { action: PendingAction; sessions: ManagedSession[] }) {
  const { t } = useI18n();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const session = sessions.find((s) => s.id === action.sessionId);
  const statusStyle = ACTION_STATUS_STYLES[action.status] || ACTION_STATUS_STYLES.pending;

  async function decide(verb: "approve" | "reject") {
    setBusy(true);
    try {
      await authFetch("POST", `/api/pending-actions/${action.id}/${verb}`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/pending-actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/managed-sessions"] });
      toast({ title: verb === "approve" ? t("providerSessions.approved") : t("providerSessions.rejected") });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid={`card-pending-action-${action.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusStyle.variant} data-testid={`badge-action-status-${action.id}`}>{statusStyle.label}</Badge>
              <span className="font-medium text-sm truncate">{action.actionType}</span>
              {session && <span className="text-xs text-muted-foreground truncate">· {session.name} ({session.site})</span>}
            </div>
            {action.reasoning && (
              <p className="text-xs text-muted-foreground italic">{action.reasoning}</p>
            )}
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32" data-testid={`text-action-payload-${action.id}`}>
              {prettyPayload(action.payload)}
            </pre>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" /> {formatRelative(action.createdAt)}
            </div>
          </div>
          {action.status === "pending" && (
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button size="sm" disabled={busy} onClick={() => decide("approve")} data-testid={`button-approve-${action.id}`}>
                {t("providerSessions.approve")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")} data-testid={`button-reject-${action.id}`}>
                {t("providerSessions.reject")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProviderSessionsPage() {
  const { t } = useI18n();
  const authFetch = useAuthFetch();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: sessions, isLoading: sessionsLoading } = useQuery<ManagedSession[]>({
    queryKey: ["/api/managed-sessions"],
    queryFn: async () => (await authFetch("GET", "/api/managed-sessions")).json(),
  });

  const { data: pending, isLoading: pendingLoading } = useQuery<PendingAction[]>({
    queryKey: ["/api/pending-actions"],
    queryFn: async () => (await authFetch("GET", "/api/pending-actions")).json(),
    refetchInterval: 15_000,
  });

  const pendingOnly = pending?.filter((a) => a.status === "pending") || [];
  const historyOnly = pending?.filter((a) => a.status !== "pending") || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Globe className="w-5 h-5" />
            {t("providerSessions.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("providerSessions.subtitle")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-session">
          <Plus className="w-4 h-4 mr-2" /> {t("providerSessions.newSession")}
        </Button>
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions" data-testid="tab-sessions">{t("providerSessions.sessionsTab")}</TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            {t("providerSessions.pendingTab")}
            {pendingOnly.length > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingOnly.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">{t("providerSessions.historyTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-3">
          {sessionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center space-y-2">
                <Globe className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="font-medium" data-testid="text-empty-sessions">{t("providerSessions.empty")}</p>
                <p className="text-sm text-muted-foreground">{t("providerSessions.emptyHint")}</p>
              </CardContent>
            </Card>
          ) : (
            sessions.map((s) => {
              const style = STATUS_STYLES[s.status] || STATUS_STYLES.active;
              const Icon = style.icon;
              return (
                <Card key={s.id} data-testid={`card-session-${s.id}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate" data-testid={`text-session-name-${s.id}`}>{s.name}</h3>
                        <Badge variant="outline">{s.site}</Badge>
                        <Badge variant="outline">{s.runtime}</Badge>
                        <Badge variant={style.variant} className="flex items-center gap-1">
                          <Icon className="w-3 h-3" /> {s.status}
                        </Badge>
                      </div>
                      {s.accountLabel && (
                        <p className="text-xs text-muted-foreground truncate">{s.accountLabel}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("providerSessions.lastUsed")}: {formatRelative(s.lastUsedAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          {pendingLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : pendingOnly.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="font-medium" data-testid="text-empty-pending">{t("providerSessions.noPending")}</p>
                <p className="text-sm text-muted-foreground">{t("providerSessions.noPendingHint")}</p>
              </CardContent>
            </Card>
          ) : (
            pendingOnly.map((a) => (
              <PendingActionRow key={a.id} action={a} sessions={sessions || []} />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {historyOnly.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center space-y-2">
                <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="font-medium" data-testid="text-empty-history">{t("providerSessions.noHistory")}</p>
              </CardContent>
            </Card>
          ) : (
            historyOnly.map((a) => (
              <PendingActionRow key={a.id} action={a} sessions={sessions || []} />
            ))
          )}
        </TabsContent>
      </Tabs>

      <NewSessionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
