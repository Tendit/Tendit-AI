// Project Actions page — manage connections, propose actions, view history.
// Route: /projects/:id/actions
import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Plug, Plus, Zap, CheckCircle2, XCircle, Clock, AlertCircle, ArrowLeft, Globe, MessageSquare, Mail, Database } from "lucide-react";

type ActionCatalogEntry = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  executorType: string;
  inputSchema: any;
  requiresApproval: boolean;
};

type Connection = {
  id: number;
  projectId: number;
  slug: string;
  label: string;
  executorType: string;
  isActive: boolean;
  createdAt: string;
};

type Proposal = {
  id: number;
  projectId: number;
  armId: number | null;
  actionSlug: string;
  actionName: string;
  actionCategory: string;
  connectionId: number | null;
  proposedBy: number;
  proposedByAgent: string | null;
  input: Record<string, any>;
  reasoning: string | null;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  approvedBy: number | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  executionId: number | null;
  createdAt: string;
};

const CATEGORY_ICONS: Record<string, any> = {
  content: Globe,
  messaging: MessageSquare,
  email: Mail,
  crm: Database,
};

export default function ProjectActionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id);
  const { dir } = useI18n();

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl" dir={dir}>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" size="sm" data-testid="link-back-project">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to project
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" /> Project Actions
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect external services and let AI propose actions you can approve.
          </p>
        </div>
      </div>

      <Tabs defaultValue="propose">
        <TabsList className="mb-4">
          <TabsTrigger value="propose" data-testid="tab-propose">
            <Zap className="h-4 w-4 mr-1.5" /> Propose Action
          </TabsTrigger>
          <TabsTrigger value="connections" data-testid="tab-connections">
            <Plug className="h-4 w-4 mr-1.5" /> Connections
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="propose">
          <ProposeActionTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="connections">
          <ConnectionsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// TAB 1: Propose Action — pick action from catalog, fill inputs, submit
// ============================================================================
function ProposeActionTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<ActionCatalogEntry | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [reasoning, setReasoning] = useState("");

  const catalogQuery = useQuery<ActionCatalogEntry[]>({ queryKey: ["/api/actions/catalog"] });
  const connsQuery = useQuery<Connection[]>({ queryKey: ["/api/projects", projectId, "connections"] });

  const proposeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/actions/propose`, {
        actionSlug: selectedAction!.slug,
        connectionId: selectedConnId ? parseInt(selectedConnId) : null,
        input: inputs,
        reasoning,
      });
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Action proposed", description: `Proposal #${d.id} waiting for approval` });
      setInputs({});
      setReasoning("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "actions/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/proposals/pending"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const matchingConns = (connsQuery.data || []).filter(
    (c) => c.isActive && (!selectedAction || c.executorType === selectedAction.executorType ||
      // also allow http_webhook for any executor that's a webhook variant
      (selectedAction.executorType === "http_webhook" && c.executorType === "http_webhook")),
  );

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose action</CardTitle>
          <CardDescription>Pick what you want the AI to do.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-auto">
            {catalogQuery.isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}
            {(catalogQuery.data || []).map((a) => {
              const Icon = CATEGORY_ICONS[a.category] || Zap;
              const isSelected = selectedAction?.slug === a.slug;
              return (
                <button
                  key={a.slug}
                  onClick={() => { setSelectedAction(a); setInputs({}); }}
                  data-testid={`button-action-${a.slug}`}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{a.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{a.description}</div>
                      <Badge variant="outline" className="mt-1 text-[10px] capitalize">{a.category}</Badge>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Fill inputs</CardTitle>
          <CardDescription>
            {selectedAction
              ? `Configure ${selectedAction.name}.`
              : "Select an action on the left first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedAction && <p className="text-sm text-muted-foreground">No action selected.</p>}
          {selectedAction && (
            <>
              {Object.entries(selectedAction.inputSchema?.properties || {}).map(([key, schema]: any) => {
                const isRequired = (selectedAction.inputSchema?.required || []).includes(key);
                const isLong = key === "body" || key === "message" || key === "notes";
                const isEnum = Array.isArray(schema?.enum);
                return (
                  <div key={key}>
                    <Label className="text-xs">
                      {key}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                      <span className="text-muted-foreground font-normal ml-2">{schema?.description}</span>
                    </Label>
                    {isEnum ? (
                      <Select value={inputs[key] || schema?.default || ""} onValueChange={(v) => setInputs({ ...inputs, [key]: v })}>
                        <SelectTrigger data-testid={`select-${key}`}><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {schema.enum.map((v: string) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : isLong ? (
                      <Textarea
                        rows={4}
                        value={inputs[key] || ""}
                        onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                        data-testid={`textarea-${key}`}
                      />
                    ) : (
                      <Input
                        value={inputs[key] || ""}
                        onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                        data-testid={`input-${key}`}
                      />
                    )}
                  </div>
                );
              })}

              <div>
                <Label className="text-xs">Connection</Label>
                {matchingConns.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-2 rounded border border-dashed">
                    No matching connections. Add one in the <span className="font-medium">Connections</span> tab.
                  </div>
                ) : (
                  <Select value={selectedConnId} onValueChange={setSelectedConnId}>
                    <SelectTrigger data-testid="select-connection"><SelectValue placeholder="Choose connection…" /></SelectTrigger>
                    <SelectContent>
                      {matchingConns.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.label} ({c.slug})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label className="text-xs">Reasoning (optional)</Label>
                <Textarea
                  rows={2}
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="Why this action? (shown to approver)"
                  data-testid="textarea-reasoning"
                />
              </div>

              <Button
                onClick={() => proposeMutation.mutate()}
                disabled={proposeMutation.isPending}
                className="w-full"
                data-testid="button-submit-proposal"
              >
                {proposeMutation.isPending ? "Submitting…" : "Submit for approval"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 2: Connections — list, add, edit per-project credentials
// ============================================================================
function ConnectionsTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "", label: "", executorType: "http_webhook",
    baseUrl: "", method: "POST", path: "", authType: "bearer", authToken: "",
    authUsername: "", authPassword: "", authHeaderName: "", bodyTemplate: "",
    wpUrl: "", phoneNumberId: "",
  });

  const connsQuery = useQuery<Connection[]>({ queryKey: ["/api/projects", projectId, "connections"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const config: any = {};
      if (form.executorType === "http_webhook") {
        Object.assign(config, {
          baseUrl: form.baseUrl, method: form.method, path: form.path || undefined,
          authType: form.authType, authToken: form.authToken || undefined,
          authUsername: form.authUsername || undefined, authPassword: form.authPassword || undefined,
          authHeaderName: form.authHeaderName || undefined,
          bodyTemplate: form.bodyTemplate || undefined,
        });
      } else if (form.executorType === "wordpress") {
        Object.assign(config, { wpUrl: form.wpUrl, authUsername: form.authUsername, authPassword: form.authPassword });
      } else if (form.executorType === "whatsapp") {
        Object.assign(config, { phoneNumberId: form.phoneNumberId, authToken: form.authToken });
      } else if (form.executorType === "email") {
        Object.assign(config, { authToken: form.authToken });
      }
      const res = await apiRequest("POST", `/api/projects/${projectId}/connections`, {
        slug: form.slug, label: form.label, executorType: form.executorType, config,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Connection created" });
      setDialogOpen(false);
      setForm({ ...form, slug: "", label: "", baseUrl: "", path: "", authToken: "", bodyTemplate: "", wpUrl: "", phoneNumberId: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "connections"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (cid: number) => apiRequest("DELETE", `/api/projects/${projectId}/connections/${cid}`),
    onSuccess: () => {
      toast({ title: "Connection deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "connections"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Connections</CardTitle>
          <CardDescription>External services this project can reach (WordPress, WhatsApp, webhooks, etc.).</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-connection"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New connection</DialogTitle>
              <DialogDescription>Configure how this project talks to an external service.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Slug (internal id)</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="shirhadash_wp" data-testid="input-conn-slug" />
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Shirhadash WordPress" data-testid="input-conn-label" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Executor type</Label>
                <Select value={form.executorType} onValueChange={(v) => setForm({ ...form, executorType: v })}>
                  <SelectTrigger data-testid="select-executor-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http_webhook">Generic HTTP webhook (any API)</SelectItem>
                    <SelectItem value="wordpress">WordPress REST API</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp Business Cloud API</SelectItem>
                    <SelectItem value="email">Email (Resend)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.executorType === "http_webhook" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Base URL</Label>
                      <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com" data-testid="input-base-url" />
                    </div>
                    <div>
                      <Label className="text-xs">Method</Label>
                      <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                        <SelectTrigger data-testid="select-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Path (supports {"{{var}}"})</Label>
                    <Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/v1/posts" data-testid="input-path" />
                  </div>
                  <div>
                    <Label className="text-xs">Auth type</Label>
                    <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                      <SelectTrigger data-testid="select-auth-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bearer">Bearer token</SelectItem>
                        <SelectItem value="basic">Basic auth</SelectItem>
                        <SelectItem value="header">Custom header</SelectItem>
                        <SelectItem value="query">Query param</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(form.authType === "bearer" || form.authType === "query") && (
                    <Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Token" type="password" data-testid="input-auth-token" />
                  )}
                  {form.authType === "header" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={form.authHeaderName} onChange={(e) => setForm({ ...form, authHeaderName: e.target.value })} placeholder="Header name (e.g. X-API-Key)" data-testid="input-header-name" />
                      <Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Token" type="password" data-testid="input-header-token" />
                    </div>
                  )}
                  {form.authType === "basic" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={form.authUsername} onChange={(e) => setForm({ ...form, authUsername: e.target.value })} placeholder="Username" data-testid="input-username" />
                      <Input value={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.value })} placeholder="Password" type="password" data-testid="input-password" />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Body template (JSON, supports {"{{var}}"}; leave empty to pass action inputs as-is)</Label>
                    <Textarea rows={4} value={form.bodyTemplate} onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })} placeholder='{"title":"{{title}}","content":"{{body}}"}' data-testid="textarea-body-template" />
                  </div>
                </>
              )}

              {form.executorType === "wordpress" && (
                <>
                  <div>
                    <Label className="text-xs">WordPress site URL</Label>
                    <Input value={form.wpUrl} onChange={(e) => setForm({ ...form, wpUrl: e.target.value })} placeholder="https://shirhadash.co.il" data-testid="input-wp-url" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={form.authUsername} onChange={(e) => setForm({ ...form, authUsername: e.target.value })} placeholder="WP username" data-testid="input-wp-user" />
                    <Input value={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.value })} placeholder="Application password" type="password" data-testid="input-wp-pass" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Generate an application password in WP: Users → Profile → Application Passwords.
                  </p>
                </>
              )}

              {form.executorType === "whatsapp" && (
                <>
                  <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="WhatsApp phone_number_id" data-testid="input-wa-phone" />
                  <Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Meta WhatsApp access token" type="password" data-testid="input-wa-token" />
                </>
              )}

              {form.executorType === "email" && (
                <Input value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Resend API key" type="password" data-testid="input-email-token" />
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.slug || !form.label} data-testid="button-save-connection">
                {createMutation.isPending ? "Saving…" : "Save connection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {connsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {connsQuery.data && connsQuery.data.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No connections yet. Click <span className="font-medium">Add</span> to configure one.
          </div>
        )}
        <div className="space-y-2">
          {(connsQuery.data || []).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded border" data-testid={`row-connection-${c.id}`}>
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  {c.label}
                  {!c.isActive && <Badge variant="secondary" className="text-[10px]">inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <code>{c.slug}</code> · {c.executorType}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)} data-testid={`button-delete-conn-${c.id}`}>
                <XCircle className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TAB 3: History — proposals + executions for this project
// ============================================================================
function HistoryTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const proposalsQuery = useQuery<Proposal[]>({
    queryKey: ["/api/projects", projectId, "actions/proposals"],
  });

  const approveMutation = useMutation({
    mutationFn: async (pid: number) => (await apiRequest("POST", `/api/actions/proposals/${pid}/approve`, {})).json(),
    onSuccess: (d: any) => {
      toast({
        title: d.success ? "Action executed ✓" : "Execution failed",
        description: d.success ? `Status ${d.statusCode}` : d.errorMessage,
        variant: d.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "actions/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/proposals/pending"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (pid: number) => apiRequest("POST", `/api/actions/proposals/${pid}/reject`, { reason: "Rejected from project history" }),
    onSuccess: () => {
      toast({ title: "Proposal rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "actions/proposals"] });
    },
  });

  if (proposalsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!proposalsQuery.data || proposalsQuery.data.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No proposals yet.</CardContent></Card>;
  }

  const STATUS: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200", icon: Clock },
    approved: { label: "Approved", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200", icon: CheckCircle2 },
    executed: { label: "Executed", color: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200", icon: CheckCircle2 },
    rejected: { label: "Rejected", color: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: XCircle },
    failed: { label: "Failed", color: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200", icon: AlertCircle },
  };

  return (
    <div className="space-y-2">
      {proposalsQuery.data.map((p) => {
        const s = STATUS[p.status];
        const Icon = s.icon;
        return (
          <Card key={p.id} data-testid={`row-proposal-${p.id}`}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] ${s.color}`}><Icon className="h-3 w-3 mr-1 inline" />{s.label}</Badge>
                    <span className="font-medium text-sm">{p.actionName}</span>
                    {p.proposedByAgent && <Badge variant="outline" className="text-[10px]">by {p.proposedByAgent}</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                  {p.reasoning && <p className="text-xs text-muted-foreground mt-1 italic">"{p.reasoning}"</p>}
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">View input</summary>
                    <pre className="text-[10px] bg-muted p-2 rounded mt-1 overflow-x-auto" dir="ltr">{JSON.stringify(p.input, null, 2)}</pre>
                  </details>
                  {p.rejectedReason && <p className="text-xs text-red-600 mt-1">Reason: {p.rejectedReason}</p>}
                </div>
                {p.status === "pending" && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending} data-testid={`button-approve-${p.id}`}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(p.id)} data-testid={`button-reject-${p.id}`}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
