import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Bot, Plus } from "lucide-react";

interface AgentRow {
  id: number;
  name: string;
  slug: string;
  provider: string;
  model: string;
  capabilities: string;
  systemPrompt: string;
  status: string;
}
interface AssignmentRow {
  id: number;
  agentId: number;
  projectId: number | null;
  capability: string;
  priority: number;
}

export default function AgentsPage() {
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", provider: "perplexity", model: "sonar", capabilities: "", systemPrompt: "" });

  const agentsQ = useQuery<AgentRow[]>({ queryKey: ["/api/agents"] });
  const assignQ = useQuery<AssignmentRow[]>({ queryKey: ["/api/agent-assignments"] });

  const create = useMutation({
    mutationFn: async (body: any) => {
      const res = await authFetch("POST", "/api/agents", body);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setShowCreate(false);
      setForm({ name: "", slug: "", provider: "perplexity", model: "sonar", capabilities: "", systemPrompt: "" });
      toast({ title: t("agents.created") });
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const submit = () => {
    if (!form.name || !form.slug || !form.provider || !form.model) {
      toast({ title: t("agents.missingFields"), variant: "destructive" });
      return;
    }
    create.mutate({
      ...form,
      capabilities: form.capabilities.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className={`p-6 max-w-5xl mx-auto space-y-4 ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-agents-title">
            <Bot className="w-5 h-5" /> {t("agents.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("agents.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} data-testid="button-new-agent">
          <Plus className="w-4 h-4 mr-1" /> {t("agents.new")}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("agents.newAgent")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("agents.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-agent-name" />
              </div>
              <div>
                <Label>{t("agents.slug")}</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} data-testid="input-agent-slug" />
              </div>
              <div>
                <Label>{t("agents.provider")}</Label>
                <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} data-testid="input-agent-provider" />
              </div>
              <div>
                <Label>{t("agents.model")}</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="input-agent-model" />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("agents.capabilities")}</Label>
                <Input placeholder="chat_reply, financial_modeling" value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} data-testid="input-agent-capabilities" />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("agents.systemPrompt")}</Label>
                <Textarea rows={4} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} data-testid="input-agent-prompt" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={create.isPending} data-testid="button-create-agent">{create.isPending ? t("common.saving") : t("common.save")}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {agentsQ.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-3">
          {(agentsQ.data || []).map((a) => {
            const caps = (() => { try { return JSON.parse(a.capabilities || "[]"); } catch { return []; } })();
            const myAssignments = (assignQ.data || []).filter((x) => x.agentId === a.id);
            return (
              <Card key={a.id} data-testid={`card-agent-${a.slug}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {a.name}
                    <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{a.provider}/{a.model}</Badge>
                    {Array.isArray(caps) && caps.map((c: string) => <Badge key={c} variant="secondary">{c}</Badge>)}
                  </div>
                  {a.systemPrompt && <div className="text-xs text-muted-foreground line-clamp-3">{a.systemPrompt}</div>}
                  {myAssignments.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">{t("agents.assignments")}: </span>
                      {myAssignments.map((m) => (
                        <Badge key={m.id} variant="outline" className="ml-1">
                          {m.capability}{m.projectId ? `@${m.projectId}` : "@global"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
