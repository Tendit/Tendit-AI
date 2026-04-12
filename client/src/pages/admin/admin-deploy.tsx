import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Rocket,
  Settings2,
  Globe,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Server,
  GitBranch,
  Activity,
  Loader2,
  Train,
  Copy,
} from "lucide-react";

interface DeploySettings {
  railway_api_token: string;
  railway_project_id: string;
  railway_service_id: string;
  railway_environment_id: string;
  railway_custom_domain: string;
}

interface Deployment {
  id: string;
  status: string;
  createdAt: string;
  meta?: { commitMessage?: string; branch?: string };
}

interface ServiceInfo {
  name: string;
  id: string;
  updatedAt: string;
}

interface ProjectInfo {
  name: string;
  id: string;
  environments: { edges: { node: { id: string; name: string } }[] };
  services: { edges: { node: ServiceInfo }[] };
}

export default function AdminDeployPage() {
  const { t } = useI18n();
  const { toast } = useToast();

  const [settings, setSettings] = useState<DeploySettings>({
    railway_api_token: "",
    railway_project_id: "",
    railway_service_id: "",
    railway_environment_id: "",
    railway_custom_domain: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [rawToken, setRawToken] = useState(""); // for new token input
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  // Railway live data
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [fetchingProject, setFetchingProject] = useState(false);
  const [fetchingDeploys, setFetchingDeploys] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await apiRequest("GET", "/api/admin/deploy/settings");
      const data = await res.json();
      setSettings(data);
      setConnected(!!data.railway_api_token && data.railway_api_token !== "");
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const payload: any = { ...settings };
      // If user typed a new token, send it
      if (rawToken) {
        payload.railway_api_token = rawToken;
      }
      await apiRequest("PUT", "/api/admin/deploy/settings", payload);
      toast({ title: t("deploy.saved"), description: t("deploy.savedDesc") });
      setRawToken("");
      await loadSettings();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  // GraphQL helper
  const railwayQuery = useCallback(async (query: string, variables?: any) => {
    const res = await apiRequest("POST", "/api/admin/deploy/railway", { query, variables });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || "GraphQL error");
    return data.data;
  }, []);

  // Fetch project info
  async function fetchProjectInfo() {
    if (!settings.railway_project_id) return;
    setFetchingProject(true);
    try {
      const data = await railwayQuery(`
        query($id: String!) {
          project(id: $id) {
            name
            id
            environments { edges { node { id name } } }
            services { edges { node { id name updatedAt } } }
          }
        }
      `, { id: settings.railway_project_id });
      setProjectInfo(data.project);
    } catch (e: any) {
      toast({ title: "Error fetching project", description: e.message, variant: "destructive" });
    }
    setFetchingProject(false);
  }

  // Fetch recent deployments
  async function fetchDeployments() {
    if (!settings.railway_project_id) return;
    setFetchingDeploys(true);
    try {
      const envFilter = settings.railway_environment_id 
        ? `environmentId: "${settings.railway_environment_id}"` 
        : "";
      const svcFilter = settings.railway_service_id
        ? `serviceId: "${settings.railway_service_id}"`
        : "";
      const filters = [envFilter, svcFilter].filter(Boolean).join(", ");
      const data = await railwayQuery(`
        query($pid: String!) {
          deployments(first: 10, input: { projectId: $pid${filters ? ", " + filters : ""} }) {
            edges {
              node {
                id
                status
                createdAt
                meta { commitMessage branch }
              }
            }
          }
        }
      `, { pid: settings.railway_project_id });
      setDeployments(data.deployments?.edges?.map((e: any) => e.node) || []);
    } catch (e: any) {
      toast({ title: "Error fetching deployments", description: e.message, variant: "destructive" });
    }
    setFetchingDeploys(false);
  }

  // Trigger redeploy
  async function triggerRedeploy() {
    setDeploying(true);
    try {
      const res = await apiRequest("POST", "/api/admin/deploy/redeploy");
      const data = await res.json();
      if (data.errors) throw new Error(data.errors[0]?.message || "Redeploy failed");
      toast({ title: t("deploy.redeployTriggered"), description: t("deploy.redeployDesc") });
      // Refresh deployments after a short delay
      setTimeout(() => fetchDeployments(), 3000);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeploying(false);
  }

  // Auto-fetch project info when connected and project ID is set
  useEffect(() => {
    if (connected && settings.railway_project_id && !settings.railway_project_id.startsWith("****")) {
      fetchProjectInfo();
      fetchDeployments();
    }
  }, [connected, settings.railway_project_id]);

  function statusBadge(status: string) {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
      SUCCESS: { variant: "default", icon: CheckCircle2 },
      DEPLOYING: { variant: "secondary", icon: Loader2 },
      BUILDING: { variant: "secondary", icon: Loader2 },
      INITIALIZING: { variant: "secondary", icon: Clock },
      FAILED: { variant: "destructive", icon: XCircle },
      CRASHED: { variant: "destructive", icon: XCircle },
      REMOVED: { variant: "outline", icon: XCircle },
      SLEEPING: { variant: "outline", icon: Clock },
    };
    const m = map[status] || { variant: "outline" as const, icon: AlertTriangle };
    const Icon = m.icon;
    return (
      <Badge variant={m.variant} className="gap-1">
        <Icon className={`h-3 w-3 ${status === "DEPLOYING" || status === "BUILDING" ? "animate-spin" : ""}`} />
        {status}
      </Badge>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="deploy-title">{t("deploy.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("deploy.subtitle")}</p>
        </div>
        <div className="flex-1" />
        {connected && (
          <Badge variant="default" className="gap-1 bg-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> {t("deploy.connected")}
          </Badge>
        )}
      </div>

      {/* Connection Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> {t("deploy.connectionSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("deploy.apiToken")}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder={connected ? settings.railway_api_token : "railway_token_xxxx..."}
                  value={rawToken}
                  onChange={(e) => setRawToken(e.target.value)}
                  data-testid="input-railway-token"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("deploy.apiTokenHint")}</p>
          </div>

          {/* Project & Service IDs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("deploy.projectId")}</label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={settings.railway_project_id}
                onChange={(e) => setSettings({ ...settings, railway_project_id: e.target.value })}
                data-testid="input-project-id"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("deploy.serviceId")}</label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={settings.railway_service_id}
                onChange={(e) => setSettings({ ...settings, railway_service_id: e.target.value })}
                data-testid="input-service-id"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("deploy.environmentId")}</label>
              <Input
                placeholder="Optional — defaults to production"
                value={settings.railway_environment_id}
                onChange={(e) => setSettings({ ...settings, railway_environment_id: e.target.value })}
                data-testid="input-env-id"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("deploy.customDomain")}</label>
              <Input
                placeholder="ai.massive-group.io"
                value={settings.railway_custom_domain}
                onChange={(e) => setSettings({ ...settings, railway_custom_domain: e.target.value })}
                data-testid="input-custom-domain"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={saveSettings} disabled={saving} data-testid="button-save-deploy-settings">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("deploy.saveSettings")}
            </Button>
            {connected && settings.railway_project_id && (
              <Button variant="outline" onClick={fetchProjectInfo} disabled={fetchingProject}>
                {fetchingProject ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {t("deploy.testConnection")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Info (only shown when connected) */}
      {connected && projectInfo && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Train className="h-4 w-4" />
                <span className="text-xs font-medium">{t("deploy.project")}</span>
              </div>
              <div className="font-bold text-lg" data-testid="text-project-name">{projectInfo.name}</div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">{projectInfo.id.slice(0, 12)}...</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Server className="h-4 w-4" />
                <span className="text-xs font-medium">{t("deploy.services")}</span>
              </div>
              <div className="font-bold text-lg">{projectInfo.services.edges.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {projectInfo.services.edges.map(e => e.node.name).join(", ")}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <GitBranch className="h-4 w-4" />
                <span className="text-xs font-medium">{t("deploy.environments")}</span>
              </div>
              <div className="font-bold text-lg">{projectInfo.environments.edges.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {projectInfo.environments.edges.map(e => e.node.name).join(", ")}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deploy Actions */}
      {connected && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Rocket className="h-4 w-4 text-purple-600" /> {t("deploy.actions")}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={triggerRedeploy}
                  disabled={deploying || !settings.railway_service_id}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="button-redeploy"
                >
                  {deploying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
                  {t("deploy.redeploy")}
                </Button>
                <Button variant="outline" onClick={fetchDeployments} disabled={fetchingDeploys}>
                  {fetchingDeploys ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {t("deploy.refresh")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {settings.railway_custom_domain && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
                <Globe className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-medium">{t("deploy.liveSite")}:</span>
                <a
                  href={`https://${settings.railway_custom_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-600 hover:underline flex items-center gap-1"
                >
                  https://{settings.railway_custom_domain} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Deployment History */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("deploy.recentDeploys")}</h3>
              {deployments.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {settings.railway_project_id ? t("deploy.noDeployments") : t("deploy.configureFirst")}
                </div>
              ) : (
                <div className="space-y-2">
                  {deployments.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`deploy-${d.id}`}>
                      <div className="flex items-center gap-3">
                        {statusBadge(d.status)}
                        <div>
                          <div className="text-sm font-medium">
                            {d.meta?.commitMessage || "Manual deploy"}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {d.meta?.branch && (
                              <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{d.meta.branch}</span>
                            )}
                            <span>{new Date(d.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          navigator.clipboard?.writeText(d.id);
                          toast({ title: "Copied", description: "Deployment ID copied" });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Guide (shown when not connected) */}
      {!connected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> {t("deploy.setupGuide")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 text-sm">
              <div className="flex gap-3 items-start">
                <Badge variant="outline" className="shrink-0 mt-0.5">1</Badge>
                <div>
                  <div className="font-medium">{t("deploy.step1Title")}</div>
                  <p className="text-muted-foreground text-xs">{t("deploy.step1Desc")}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Badge variant="outline" className="shrink-0 mt-0.5">2</Badge>
                <div>
                  <div className="font-medium">{t("deploy.step2Title")}</div>
                  <p className="text-muted-foreground text-xs">{t("deploy.step2Desc")}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Badge variant="outline" className="shrink-0 mt-0.5">3</Badge>
                <div>
                  <div className="font-medium">{t("deploy.step3Title")}</div>
                  <p className="text-muted-foreground text-xs">{t("deploy.step3Desc")}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Badge variant="outline" className="shrink-0 mt-0.5">4</Badge>
                <div>
                  <div className="font-medium">{t("deploy.step4Title")}</div>
                  <p className="text-muted-foreground text-xs">{t("deploy.step4Desc")}</p>
                </div>
              </div>
            </div>
            <div className="pt-2">
              <a
                href="https://railway.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-purple-600 hover:underline flex items-center gap-1"
              >
                {t("deploy.openRailway")} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center">
        {t("deploy.disclaimer")}
      </p>
    </div>
  );
}
