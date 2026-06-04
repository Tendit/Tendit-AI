import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Send, Mic, Square, Save, Sparkles, History, RotateCcw,
  Plus, FileText, Target, MessageSquare, Bot, ShieldCheck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Arm {
  id: number; projectId: number; name: string; slug: string;
  ownerUserId: number | null; armAgentId: number; visibility: string; isActive: boolean;
  agent?: { id: number; slug: string; displayName: string; systemPrompt: string } | null;
  documentId?: number | null;
}
interface ArmMsg {
  id: number; armId: number; role: string; content: string;
  authorUserId: number | null; agentId: number | null; audioUrl?: string | null;
  transcript?: string | null; createdAt: string;
}
interface DocVersion {
  id: number; documentId: number; versionNumber: number; content: string;
  authorUserId: number | null; authorAgentId: number | null; changeNote: string | null; createdAt: string;
}
interface DocResp { document: { id: number; title: string; currentVersionId: number | null }; current: DocVersion | null; versionCount: number; }
interface Instruction {
  id: number; targetId: number; generatedByAgentId: number; content: string;
  status: string; pendingActionId: number | null; createdAt: string;
}
interface TargetT {
  id: number; armId: number; name: string; contactInfo: string | null;
  notes: string | null; isActive: boolean; instructions: Instruction[];
}

export default function ArmDetailPage() {
  const { projectId: pid, armSlug } = useParams<{ projectId: string; armSlug: string }>();
  const projectId = Number(pid);
  const authFetch = useAuthFetch();
  const { t, dir, locale } = useI18n();
  const { toast } = useToast();
  const isRtl = dir === "rtl";

  // Resolve arm by slug from the project's arms list
  const armsQuery = useQuery<(Arm & { agentDisplayName?: string | null })[]>({
    queryKey: ["/api/projects", projectId, "arms"],
    queryFn: async () => (await authFetch("GET", `/api/projects/${projectId}/arms`)).json(),
  });
  const armRef = (armsQuery.data || []).find((a) => a.slug === armSlug);
  const armId = armRef?.id;

  const armQuery = useQuery<Arm>({
    queryKey: ["/api/arms", armId],
    queryFn: async () => (await authFetch("GET", `/api/arms/${armId}`)).json(),
    enabled: !!armId,
  });
  const arm = armQuery.data;

  if (armsQuery.isLoading || (armId && armQuery.isLoading)) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }
  if (!armRef) {
    return (
      <div className="p-6" dir={dir}>
        <Card><CardContent className="p-6 text-sm text-muted-foreground" data-testid="text-arm-notfound">
          {t("arms.empty")}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className={`p-4 max-w-5xl mx-auto ${isRtl ? "text-right" : ""}`} dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" data-testid="link-back-project"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-arm-name">
              {arm?.name || armRef.name}
              <Badge variant={arm?.isActive ?? armRef.isActive ? "default" : "outline"}>
                {(arm?.isActive ?? armRef.isActive) ? t("arms.active") : t("arms.inactive")}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              {t("arms.manager")}: <span className="font-medium text-foreground" data-testid="text-arm-manager">
                {arm?.agent?.displayName || armRef.agentDisplayName || "—"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="chat">
        <TabsList className="mb-4">
          <TabsTrigger value="chat" data-testid="tab-arm-chat"><MessageSquare className="h-4 w-4 mr-1.5" />{t("arms.tab.chat")}</TabsTrigger>
          <TabsTrigger value="document" data-testid="tab-arm-document"><FileText className="h-4 w-4 mr-1.5" />{t("arms.tab.document")}</TabsTrigger>
          <TabsTrigger value="targets" data-testid="tab-arm-targets"><Target className="h-4 w-4 mr-1.5" />{t("arms.tab.targets")}</TabsTrigger>
        </TabsList>

        <TabsContent value="chat">{armId && <ChatTab armId={armId} isRtl={isRtl} />}</TabsContent>
        <TabsContent value="document">{armId && <DocumentTab armId={armId} isRtl={isRtl} />}</TabsContent>
        <TabsContent value="targets">{armId && <TargetsTab armId={armId} arm={arm} isRtl={isRtl} />}</TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Chat Tab ──────────────────────────────────────────────────────────────────
function ChatTab({ armId, isRtl }: { armId: number; isRtl: boolean }) {
  const authFetch = useAuthFetch();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [deepWork, setDeepWork] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const msgsQuery = useQuery<ArmMsg[]>({
    queryKey: ["/api/arms", armId, "messages"],
    queryFn: async () => (await authFetch("GET", `/api/arms/${armId}/messages`)).json(),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgsQuery.data]);

  const send = useMutation({
    mutationFn: async () => {
      const res = await authFetch("POST", `/api/arms/${armId}/messages`, { content: input, deepWork, lang: locale });
      return res.json();
    },
    onSuccess: (d: any) => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "messages"] });
      if (d?.creditsCharged) toast({ title: `−${d.creditsCharged} cr`, description: deepWork ? "Claude deep work" : "Tier-1 reply" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendVoice = useMutation({
    mutationFn: async (blob: Blob) => {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      const res = await authFetch("POST", `/api/arms/${armId}/messages/voice`, fd, true);
      return res.json();
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "messages"] });
      if (d?.creditsCharged) toast({ title: `−${d.creditsCharged} cr`, description: "Voice transcription" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function toggleRecord() {
    if (recording) {
      mediaRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((tr) => tr.stop());
        if (blob.size > 0) sendVoice.mutate(blob);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast({ title: "Microphone unavailable", variant: "destructive" });
    }
  }

  const msgs = msgsQuery.data || [];

  return (
    <Card>
      <CardContent className="p-4 flex flex-col h-[60vh]">
        <div className="flex-1 overflow-auto space-y-3 pr-1" data-testid="list-arm-messages">
          {msgsQuery.isLoading ? (
            <><Skeleton className="h-12 w-2/3" /><Skeleton className="h-12 w-2/3 ml-auto" /></>
          ) : msgs.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8" data-testid="text-chat-empty">{t("arms.chat.empty")}</div>
          ) : (
            msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  data-testid={`msg-arm-${m.id}`}>
                  {m.audioUrl && <span className="text-xs opacity-70 flex items-center gap-1 mb-1"><Mic className="h-3 w-3" /> voice</span>}
                  {m.content}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t pt-3 mt-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={deepWork} onChange={(e) => setDeepWork(e.target.checked)} data-testid="checkbox-deepwork" />
            {t("arms.chat.deepWork")}
            <span className="ml-auto">{deepWork ? "" : t("arms.chat.t1Note")}</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant={recording ? "destructive" : "outline"} size="icon" onClick={toggleRecord}
              disabled={sendVoice.isPending} data-testid="button-arm-voice" title={t("arms.chat.voice")}>
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && input.trim()) { e.preventDefault(); send.mutate(); } }}
              placeholder={t("arms.chat.placeholder")} data-testid="input-arm-message" />
            <Button onClick={() => send.mutate()} disabled={!input.trim() || send.isPending} data-testid="button-arm-send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Living Document Tab ────────────────────────────────────────────────────────
function DocumentTab({ armId, isRtl }: { armId: number; isRtl: boolean }) {
  const authFetch = useAuthFetch();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const docQuery = useQuery<DocResp>({
    queryKey: ["/api/arms", armId, "document"],
    queryFn: async () => (await authFetch("GET", `/api/arms/${armId}/document`)).json(),
  });
  const versionsQuery = useQuery<DocVersion[]>({
    queryKey: ["/api/arms", armId, "document", "versions"],
    queryFn: async () => (await authFetch("GET", `/api/arms/${armId}/document/versions`)).json(),
    enabled: showHistory,
  });

  const currentContent = docQuery.data?.current?.content ?? "";
  const value = draft ?? currentContent;

  const save = useMutation({
    mutationFn: async (aiAssist: boolean) => {
      const res = await authFetch("POST", `/api/arms/${armId}/document`, {
        content: value, changeNote: changeNote || undefined, aiAssist, lang: locale,
      });
      return res.json();
    },
    onSuccess: (_d, aiAssist) => {
      setDraft(null); setChangeNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "document"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "document", "versions"] });
      toast({ title: aiAssist ? `${t("arms.doc.aiAssist")} ✓` : `${t("arms.doc.save")} ✓` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const restore = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await authFetch("POST", `/api/arms/${armId}/document/versions/${versionId}/restore`);
      return res.json();
    },
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "document"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "document", "versions"] });
      toast({ title: `${t("arms.doc.restore")} ✓` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">{t("arms.doc.title")}</CardTitle>
          {docQuery.data?.current && (
            <Badge variant="outline" className="text-xs" data-testid="badge-doc-version">
              {t("arms.doc.version")} {docQuery.data.current.versionNumber}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {docQuery.isLoading ? <Skeleton className="h-64" /> : (
            <Textarea value={value} onChange={(e) => setDraft(e.target.value)} rows={16}
              placeholder={t("arms.doc.empty")} className="font-mono text-sm" data-testid="textarea-doc-content" />
          )}
          <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)}
            placeholder={t("arms.doc.changeNote")} data-testid="input-doc-changenote" />
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => save.mutate(false)} disabled={save.isPending} data-testid="button-doc-save">
              <Save className="h-4 w-4 mr-1.5" />{t("arms.doc.save")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => save.mutate(true)} disabled={save.isPending} data-testid="button-doc-aiassist">
              <Sparkles className="h-4 w-4 mr-1.5" />{t("arms.doc.aiAssist")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)} data-testid="button-doc-history">
              <History className="h-4 w-4 mr-1.5" />{t("arms.doc.versions")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showHistory && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("arms.doc.versions")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {versionsQuery.isLoading ? <Skeleton className="h-24" /> :
              (versionsQuery.data || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("arms.doc.empty")}</p>
              ) : (
                (versionsQuery.data || []).map((v) => (
                  <div key={v.id} className="flex items-center justify-between border rounded p-2 text-sm" data-testid={`row-doc-version-${v.id}`}>
                    <div>
                      <div className="font-medium">{t("arms.doc.version")} {v.versionNumber}</div>
                      <div className="text-xs text-muted-foreground">{v.changeNote || "—"}</div>
                      <div className="text-xs text-muted-foreground">{v.authorAgentId ? "AI" : "User"}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => restore.mutate(v.id)} disabled={restore.isPending}
                      data-testid={`button-restore-${v.id}`}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("arms.doc.restore")}
                    </Button>
                  </div>
                ))
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Targets Tab ────────────────────────────────────────────────────────────────
function TargetsTab({ armId, arm, isRtl }: { armId: number; arm?: Arm; isRtl: boolean }) {
  const authFetch = useAuthFetch();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  const targetsQuery = useQuery<TargetT[]>({
    queryKey: ["/api/arms", armId, "targets"],
    queryFn: async () => (await authFetch("GET", `/api/arms/${armId}/targets`)).json(),
  });

  const addTarget = useMutation({
    mutationFn: async () => {
      const res = await authFetch("POST", `/api/arms/${armId}/targets`, { name, contactInfo: contact || undefined, notes: notes || undefined });
      return res.json();
    },
    onSuccess: () => {
      setShowAdd(false); setName(""); setContact(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "targets"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generate = useMutation({
    mutationFn: async (targetId: number) => {
      const res = await authFetch("POST", `/api/arms/targets/${targetId}/generate-instructions`, { lang: locale });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "targets"] });
      toast({ title: t("arms.targets.generate"), description: t("arms.instruction.gateNote") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await authFetch("POST", `/api/arm-instructions/${id}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arms", armId, "targets"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      draft: t("arms.instruction.draft"), approved: t("arms.instruction.approved"),
      rejected: t("arms.instruction.rejected"), sent: t("arms.instruction.sent"),
    };
    const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "outline";
    return <Badge variant={variant as any}>{map[status] || status}</Badge>;
  }

  const targets = targetsQuery.data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">{t("arms.targets.title")}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{t("arms.instruction.gateNote")}</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)} data-testid="button-add-target"><Plus className="h-4 w-4 mr-1" />{t("arms.targets.add")}</Button>
      </div>

      {showAdd && (
        <Card className="mb-4" data-testid="card-add-target">
          <CardContent className="p-4 space-y-3">
            <Input placeholder={t("arms.targets.name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-target-name" />
            <Input placeholder={t("arms.targets.contact")} value={contact} onChange={(e) => setContact(e.target.value)} data-testid="input-target-contact" />
            <Textarea placeholder={t("arms.targets.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="textarea-target-notes" />
            <Button size="sm" onClick={() => addTarget.mutate()} disabled={!name || addTarget.isPending} data-testid="button-submit-target">{t("arms.targets.add")}</Button>
          </CardContent>
        </Card>
      )}

      {targetsQuery.isLoading ? <Skeleton className="h-40" /> :
        targets.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground" data-testid="text-targets-empty">{t("arms.targets.empty")}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {targets.map((tg) => (
              <Card key={tg.id} data-testid={`card-target-${tg.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{tg.name}</span>
                    <Button size="sm" variant="secondary" onClick={() => generate.mutate(tg.id)} disabled={generate.isPending}
                      data-testid={`button-generate-${tg.id}`}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" />{t("arms.targets.generate")}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {tg.contactInfo && <div className="text-muted-foreground">{t("arms.targets.contact")}: {tg.contactInfo}</div>}
                  {tg.notes && <div className="text-muted-foreground">{tg.notes}</div>}
                  {tg.instructions && tg.instructions.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-medium text-xs uppercase text-muted-foreground">{t("arms.targets.instructions")}</div>
                      {tg.instructions.map((ins) => (
                        <div key={ins.id} className="border rounded p-3 space-y-2" data-testid={`instruction-${ins.id}`}>
                          <div className="flex items-center justify-between">
                            {statusBadge(ins.status)}
                            {ins.status === "draft" && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="default" onClick={() => decide.mutate({ id: ins.id, action: "approve" })}
                                  disabled={decide.isPending} data-testid={`button-approve-${ins.id}`}>{t("arms.instruction.approve")}</Button>
                                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: ins.id, action: "reject" })}
                                  disabled={decide.isPending} data-testid={`button-reject-${ins.id}`}>{t("arms.instruction.reject")}</Button>
                              </div>
                            )}
                          </div>
                          <div className="text-xs whitespace-pre-wrap bg-muted rounded p-2 max-h-48 overflow-auto">{ins.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
