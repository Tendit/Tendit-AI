import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Users, Plus, ArrowRight } from "lucide-react";

interface Arm {
  id: number;
  projectId: number;
  name: string;
  slug: string;
  ownerUserId: number | null;
  armAgentId: number;
  visibility: string;
  isActive: boolean;
  agentDisplayName?: string | null;
  agentSlug?: string | null;
}

interface ArmAgent { id: number; slug: string; displayName: string; name: string; }

export default function ProjectArmsTab({ projectId }: { projectId: number }) {
  const authFetch = useAuthFetch();
  const { t, dir, locale } = useI18n();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [agentId, setAgentId] = useState<string>("");

  const armsQuery = useQuery<Arm[]>({
    queryKey: ["/api/projects", projectId, "arms"],
    queryFn: async () => (await authFetch("GET", `/api/projects/${projectId}/arms`)).json(),
  });

  const agentsQuery = useQuery<ArmAgent[]>({
    queryKey: ["/api/arms/agents"],
    queryFn: async () => (await authFetch("GET", `/api/arms/agents`)).json(),
  });

  const createArm = useMutation({
    mutationFn: async () => {
      const res = await authFetch("POST", `/api/projects/${projectId}/arms`, {
        name, slug, armAgentId: Number(agentId),
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "arms"] });
      setShowCreate(false); setName(""); setSlug(""); setAgentId("");
      toast({ title: t("arms.create.submit") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className={dir === "rtl" ? "text-right" : ""} dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-arms-title">
            <Users className="h-4 w-4" /> {t("arms.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("arms.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)} data-testid="button-new-arm">
          <Plus className="h-4 w-4 mr-1" /> {t("arms.create")}
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-4" data-testid="card-create-arm">
          <CardContent className="p-4 space-y-3">
            <Input placeholder={t("arms.create.name")} value={name}
              onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }}
              data-testid="input-arm-name" />
            <Input placeholder={t("arms.create.slug")} value={slug} onChange={(e) => setSlug(e.target.value)} data-testid="input-arm-slug" />
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger data-testid="select-arm-agent"><SelectValue placeholder={t("arms.create.manager")} /></SelectTrigger>
              <SelectContent>
                {(agentsQuery.data || []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)} data-testid={`option-agent-${a.slug}`}>{a.displayName} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => createArm.mutate()} disabled={!name || !slug || !agentId || createArm.isPending} data-testid="button-submit-arm">
              {t("arms.create.submit")}
            </Button>
          </CardContent>
        </Card>
      )}

      {armsQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
      ) : (armsQuery.data || []).length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground" data-testid="text-arms-empty">{t("arms.empty")}</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(armsQuery.data || []).map((arm) => (
            <Card key={arm.id} data-testid={`card-arm-${arm.slug}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{arm.name}</span>
                  <Badge variant={arm.isActive ? "default" : "outline"}>
                    {arm.isActive ? t("arms.active") : t("arms.inactive")}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  {t("arms.manager")}: <span className="font-medium text-foreground">{arm.agentDisplayName || "—"}</span>
                </div>
                <div className="text-muted-foreground">
                  {t("arms.owner")}: {arm.ownerUserId ? `#${arm.ownerUserId}` : <span className="italic">{t("arms.unassigned")}</span>}
                </div>
                <div>
                  <Badge variant="outline" className="text-xs">
                    {arm.visibility === "project_public" ? t("arms.visibility.projectPublic") : t("arms.visibility.ownerPrivate")}
                  </Badge>
                </div>
                <Link href={`/projects/${projectId}/arms/${arm.slug}`}>
                  <Button size="sm" variant="secondary" className="mt-2" data-testid={`link-open-arm-${arm.slug}`}>
                    {t("arms.open")} <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
