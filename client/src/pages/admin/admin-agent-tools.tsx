import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Terminal, Globe, FileOutput, Search, BarChart3, Zap, Plus, Trash2, Pencil, Shield,
  AlertTriangle, BookOpen, RotateCcw, Clock, Hash, BrainCircuit, ChevronDown, ChevronRight,
  GripVertical, Save, XCircle, CheckCircle2,
} from "lucide-react";

interface AgentToolConfig {
  id: number;
  toolId: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  creditMultiplier: number;
  maxExecutionTime: number;
  maxCallsPerRequest: number;
  customInstructions: string | null;
  inputSchema: string | null;
  config: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentToolRule {
  id: number;
  toolId: string;
  name: string;
  description: string | null;
  ruleType: string;
  condition: string | null;
  action: string;
  priority: number;
  enabled: boolean;
  scope: string;
  createdAt: string;
}

const iconMap: Record<string, any> = {
  Terminal, Globe, FileOutput, Search, BarChart3, Zap, BrainCircuit, Shield,
};

const ruleTypeInfo: Record<string, { label: string; color: string; icon: any; description: string }> = {
  instruction: { label: "Instruction", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: BookOpen, description: "Guidance injected into the AI prompt" },
  guard: { label: "Guard", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", icon: Shield, description: "Safety rule that blocks certain behaviors" },
  restrict: { label: "Restrict", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertTriangle, description: "Limits tool usage for specific plans" },
  transform: { label: "Transform", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", icon: RotateCcw, description: "Modifies tool input/output" },
};

export default function AdminAgentToolsPage() {
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const [tools, setTools] = useState<AgentToolConfig[]>([]);
  const [rules, setRules] = useState<AgentToolRule[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<AgentToolConfig | null>(null);
  const [showAddRule, setShowAddRule] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({ name: "", ruleType: "instruction", action: "", priority: 10, scope: "all", description: "" });
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await authFetch("GET", "/api/admin/agent-tools");
      const data = await res.json();
      setTools(data.tools || []);
      setRules(data.rules || []);
    } catch {}
  };

  const updateTool = async (id: number, updates: Partial<AgentToolConfig>) => {
    setSaving(id);
    try {
      await authFetch("PUT", `/api/admin/agent-tools/${id}`, updates);
      await loadData();
    } catch {}
    setSaving(null);
  };

  const deleteTool = async (id: number) => {
    if (!confirm("Delete this tool? Associated rules will also be removed.")) return;
    try {
      await authFetch("DELETE", `/api/admin/agent-tools/${id}`);
      await loadData();
    } catch {}
  };

  const addRule = async (toolId: string) => {
    try {
      await authFetch("POST", "/api/admin/agent-tool-rules", { ...newRule, toolId });
      setNewRule({ name: "", ruleType: "instruction", action: "", priority: 10, scope: "all", description: "" });
      setShowAddRule(null);
      await loadData();
    } catch {}
  };

  const toggleRule = async (id: number, enabled: boolean) => {
    try {
      await authFetch("PUT", `/api/admin/agent-tool-rules/${id}`, { enabled });
      await loadData();
    } catch {}
  };

  const deleteRule = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/admin/agent-tool-rules/${id}`);
      await loadData();
    } catch {}
  };

  const enabledCount = tools.filter(t => t.enabled).length;
  const totalRules = rules.filter(r => r.enabled).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-agent-tools-title">
            <BrainCircuit className="w-5 h-5 text-violet-600" />
            {t("agentTools.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("agentTools.subtitle")}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{tools.length}</div>
            <div className="text-xs text-muted-foreground">{t("agentTools.totalTools")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-600">{enabledCount}</div>
            <div className="text-xs text-muted-foreground">{t("agentTools.active")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-violet-600">{totalRules}</div>
            <div className="text-xs text-muted-foreground">{t("agentTools.activeRules")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-amber-600">{rules.filter(r => r.ruleType === "guard").length}</div>
            <div className="text-xs text-muted-foreground">{t("agentTools.guardRules")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tools list */}
      <div className="space-y-3">
        {tools.map((tool) => {
          const Icon = iconMap[tool.icon] || Zap;
          const toolRules = rules.filter(r => r.toolId === tool.toolId);
          const isExpanded = expandedTool === tool.toolId;

          return (
            <Card key={tool.id} className={`transition-all ${!tool.enabled ? "opacity-60" : ""}`} data-testid={`agent-tool-${tool.toolId}`}>
              <CardContent className="p-0">
                {/* Tool header row */}
                <div className="flex items-center gap-4 p-4">
                  <button onClick={() => setExpandedTool(isExpanded ? null : tool.toolId)} className="shrink-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tool.enabled ? "bg-violet-100 dark:bg-violet-900/30" : "bg-muted"}`}>
                    <Icon className={`w-5 h-5 ${tool.enabled ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{tool.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{tool.toolId}</Badge>
                      {toolRules.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">{toolRules.filter(r => r.enabled).length} rules</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{tool.description}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-center">
                          <div className="text-sm font-bold">{tool.creditMultiplier}x</div>
                          <div className="text-[10px] text-muted-foreground">credits</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Credit multiplier applied when this tool is used</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-center">
                          <div className="text-sm font-bold flex items-center gap-1"><Clock className="w-3 h-3" />{tool.maxExecutionTime}s</div>
                          <div className="text-[10px] text-muted-foreground">timeout</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Maximum execution time</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-center">
                          <div className="text-sm font-bold flex items-center gap-1"><Hash className="w-3 h-3" />{tool.maxCallsPerRequest}</div>
                          <div className="text-[10px] text-muted-foreground">max/req</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Max calls per agent request</TooltipContent>
                    </Tooltip>
                    <Switch
                      checked={tool.enabled}
                      onCheckedChange={(v) => updateTool(tool.id, { enabled: v })}
                      data-testid={`toggle-tool-${tool.toolId}`}
                    />
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/20">
                    {/* Settings row */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">{t("agentTools.creditMultiplier")}</Label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[tool.creditMultiplier]}
                            min={0.5}
                            max={5}
                            step={0.5}
                            onValueChange={([v]) => updateTool(tool.id, { creditMultiplier: v })}
                            className="flex-1"
                          />
                          <span className="text-sm font-bold w-10 text-right">{tool.creditMultiplier}x</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t("agentTools.maxExecTime")}</Label>
                        <Input
                          type="number"
                          value={tool.maxExecutionTime}
                          min={5}
                          max={120}
                          onChange={(e) => updateTool(tool.id, { maxExecutionTime: parseInt(e.target.value) || 30 })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t("agentTools.maxCallsPerReq")}</Label>
                        <Input
                          type="number"
                          value={tool.maxCallsPerRequest}
                          min={1}
                          max={10}
                          onChange={(e) => updateTool(tool.id, { maxCallsPerRequest: parseInt(e.target.value) || 3 })}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Custom instructions */}
                    <div className="space-y-2">
                      <Label className="text-xs">{t("agentTools.customInstructions")}</Label>
                      <Textarea
                        value={tool.customInstructions || ""}
                        onChange={(e) => {
                          setTools(prev => prev.map(t => t.id === tool.id ? { ...t, customInstructions: e.target.value } : t));
                        }}
                        placeholder="E.g., 'Always validate inputs before execution. Never access external networks.'"
                        rows={3}
                        className="text-sm"
                        data-testid={`input-instructions-${tool.toolId}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateTool(tool.id, { customInstructions: tool.customInstructions })}
                        className="gap-1"
                        disabled={saving === tool.id}
                      >
                        <Save className="w-3 h-3" />
                        {t("agentTools.saveInstructions")}
                      </Button>
                    </div>

                    {/* Tool rules */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">{t("agentTools.boundRules")} ({toolRules.length})</Label>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 text-xs"
                          onClick={() => setShowAddRule(showAddRule === tool.toolId ? null : tool.toolId)}
                        >
                          <Plus className="w-3 h-3" />
                          {t("agentTools.addRule")}
                        </Button>
                      </div>

                      {/* Add rule form */}
                      {showAddRule === tool.toolId && (
                        <Card className="border-dashed">
                          <CardContent className="p-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px]">{t("agentTools.ruleName")}</Label>
                                <Input value={newRule.name} onChange={(e) => setNewRule(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" placeholder="E.g., No network access" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px]">{t("agentTools.ruleType")}</Label>
                                <Select value={newRule.ruleType} onValueChange={(v) => setNewRule(p => ({ ...p, ruleType: v }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(ruleTypeInfo).map(([key, info]) => (
                                      <SelectItem key={key} value={key}>
                                        <span className="flex items-center gap-1.5">
                                          <info.icon className="w-3 h-3" /> {info.label}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">{t("agentTools.ruleAction")}</Label>
                              <Textarea value={newRule.action} onChange={(e) => setNewRule(p => ({ ...p, action: e.target.value }))} className="text-sm" rows={2} placeholder="The rule text that gets injected into the AI prompt..." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px]">Scope</Label>
                                <Select value={newRule.scope} onValueChange={(v) => setNewRule(p => ({ ...p, scope: v }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All users</SelectItem>
                                    <SelectItem value="free">Free plan</SelectItem>
                                    <SelectItem value="starter">Starter plan</SelectItem>
                                    <SelectItem value="pro">Pro plan</SelectItem>
                                    <SelectItem value="enterprise">Enterprise plan</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px]">Priority (lower = higher)</Label>
                                <Input type="number" value={newRule.priority} min={1} max={100} onChange={(e) => setNewRule(p => ({ ...p, priority: parseInt(e.target.value) || 10 }))} className="h-8 text-sm" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => addRule(tool.toolId)} disabled={!newRule.name || !newRule.action} className="gap-1">
                                <Plus className="w-3 h-3" /> {t("agentTools.createRule")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowAddRule(null)}>{t("agentTools.cancel")}</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Existing rules */}
                      {toolRules.length > 0 && (
                        <div className="space-y-1.5">
                          {toolRules.map(rule => {
                            const info = ruleTypeInfo[rule.ruleType] || ruleTypeInfo.instruction;
                            const RuleIcon = info.icon;
                            return (
                              <div key={rule.id} className={`flex items-start gap-2 p-2.5 rounded-md border text-sm ${!rule.enabled ? "opacity-50" : ""}`} data-testid={`rule-${rule.id}`}>
                                <RuleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-xs">{rule.name}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${info.color}`}>{info.label}</span>
                                    {rule.scope !== "all" && (
                                      <Badge variant="outline" className="text-[10px]">{rule.scope}</Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground">P{rule.priority}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.action}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Switch
                                    checked={rule.enabled}
                                    onCheckedChange={(v) => toggleRule(rule.id, v)}
                                    className="scale-75"
                                  />
                                  <button onClick={() => deleteRule(rule.id)} className="p-1 hover:text-destructive transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {toolRules.length === 0 && showAddRule !== tool.toolId && (
                        <p className="text-xs text-muted-foreground italic">No rules bound to this tool yet.</p>
                      )}
                    </div>

                    {/* Delete tool */}
                    <div className="pt-2 border-t">
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1 text-xs" onClick={() => deleteTool(tool.id)}>
                        <Trash2 className="w-3 h-3" /> {t("agentTools.deleteTool")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
