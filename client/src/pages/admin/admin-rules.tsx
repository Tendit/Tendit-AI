import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Brain, Plus, Pencil, Trash2, Play, Filter, ChevronDown, ChevronUp, Zap, Shield, Calendar, MessageSquare, Users, Sparkles } from "lucide-react";

interface RuleCondition {
  type: string;
  operator: string;
  field: string;
  value: string;
  metadata?: string;
}

interface RuleAction {
  type: string;
  value: string;
  position?: string;
}

interface AiRule {
  id: number;
  name: string;
  description?: string;
  conditions: string;
  conditionLogic: string;
  actions: string;
  priority: number;
  category: string;
  appliesTo: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  totalRulesChecked: number;
  matchedRules: { ruleId: number; ruleName: string; priority: number; matchedConditions: string[] }[];
  contextSnapshot: { season: string; upcomingHolidays: any[]; date: string };
}

const categoryIcons: Record<string, any> = {
  calendar: Calendar,
  topic: MessageSquare,
  user: Users,
  safety: Shield,
  quality: Sparkles,
  general: Brain,
};

const categoryColors: Record<string, string> = {
  calendar: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  topic: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  user: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  safety: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  quality: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  general: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

const conditionTypes = [
  { value: "topic", label: "Topic/Message", description: "Match user message content" },
  { value: "calendar", label: "Calendar", description: "Match holidays, seasons, dates" },
  { value: "user_plan", label: "User Plan", description: "Match user subscription tier" },
  { value: "user_role", label: "User Role", description: "Match user/admin role" },
  { value: "model", label: "Model", description: "Match AI model being used" },
  { value: "provider", label: "Provider", description: "Match AI provider" },
  { value: "tool", label: "Agent Tool", description: "Match active agent tool" },
  { value: "time_of_day", label: "Time of Day", description: "Match current hour" },
  { value: "day_of_week", label: "Day of Week", description: "Match current day" },
];

const operators = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "in", label: "in list" },
  { value: "not_in", label: "not in list" },
  { value: "regex", label: "regex match" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "between", label: "between" },
  { value: "near_date", label: "near date" },
];

const actionTypes = [
  { value: "inject_system_prompt", label: "Inject System Prompt", description: "Add instructions to the AI" },
  { value: "inject_user_context", label: "Inject Context", description: "Add context information" },
  { value: "add_disclaimer", label: "Add Disclaimer", description: "Show disclaimer to user" },
  { value: "force_model", label: "Force Model", description: "Override the AI model" },
  { value: "block_request", label: "Block Request", description: "Deny the request" },
];

const calendarFields = [
  { value: "season", label: "Season (spring/summer/fall/winter)" },
  { value: "holiday_nearby", label: "Specific holiday within N days" },
  { value: "holiday_category_nearby", label: "Holiday category within N days" },
  { value: "any_holiday_within", label: "Any holiday within N days" },
  { value: "month", label: "Month number (1-12)" },
  { value: "quarter", label: "Quarter (Q1-Q4)" },
];

function getFieldOptions(type: string) {
  if (type === "calendar") return calendarFields;
  if (type === "topic" || type === "custom") return [{ value: "message", label: "User message" }];
  if (type === "user_plan") return [{ value: "plan", label: "User plan" }];
  if (type === "user_role") return [{ value: "role", label: "User role" }];
  if (type === "model") return [{ value: "model", label: "Model ID" }];
  if (type === "provider") return [{ value: "provider", label: "Provider" }];
  if (type === "tool") return [{ value: "tool", label: "Tool ID" }];
  if (type === "time_of_day") return [{ value: "hour", label: "Hour (0-23)" }];
  if (type === "day_of_week") return [{ value: "day", label: "Day name" }];
  return [{ value: "message", label: "Message" }];
}

export default function AdminRulesPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [rules, setRules] = useState<AiRule[]>([]);
  const [stats, setStats] = useState<{ total: number; active: number; byCategory: Record<string, number> }>({ total: 0, active: 0, byCategory: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRule, setExpandedRule] = useState<number | null>(null);

  // Edit state
  const [editRule, setEditRule] = useState<Partial<AiRule> | null>(null);
  const [editConditions, setEditConditions] = useState<RuleCondition[]>([]);
  const [editActions, setEditActions] = useState<RuleAction[]>([]);

  // Test state
  const [testMessage, setTestMessage] = useState("");
  const [testPlan, setTestPlan] = useState("free");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rulesRes, statsRes] = await Promise.all([
        authFetch("GET", "/api/admin/rules"),
        authFetch("GET", "/api/admin/rules/stats"),
      ]);
      setRules(await rulesRes.json());
      setStats(await statsRes.json());
    } catch {}
    setIsLoading(false);
  };

  const saveRule = async () => {
    if (!editRule?.name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const payload = {
      ...editRule,
      conditions: JSON.stringify(editConditions),
      actions: JSON.stringify(editActions),
    };

    try {
      if (editRule.id) {
        await authFetch("PATCH", `/api/admin/rules/${editRule.id}`, payload);
        toast({ title: "Rule updated" });
      } else {
        await authFetch("POST", "/api/admin/rules", payload);
        toast({ title: "Rule created" });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const deleteRule = async (id: number) => {
    await authFetch("DELETE", `/api/admin/rules/${id}`);
    toast({ title: "Rule deleted" });
    loadData();
  };

  const toggleRule = async (rule: AiRule) => {
    await authFetch("PATCH", `/api/admin/rules/${rule.id}`, { isActive: !rule.isActive });
    loadData();
  };

  const openEdit = (rule?: AiRule) => {
    if (rule) {
      setEditRule({ ...rule });
      try { setEditConditions(JSON.parse(rule.conditions)); } catch { setEditConditions([]); }
      try { setEditActions(JSON.parse(rule.actions)); } catch { setEditActions([]); }
    } else {
      setEditRule({ name: "", description: "", conditionLogic: "AND", priority: 50, category: "general", appliesTo: "all", isActive: true, createdBy: "admin" });
      setEditConditions([]);
      setEditActions([]);
    }
    setIsDialogOpen(true);
  };

  const addCondition = () => {
    setEditConditions([...editConditions, { type: "topic", operator: "contains", field: "message", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setEditConditions(editConditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, updates: Partial<RuleCondition>) => {
    const newConds = [...editConditions];
    newConds[idx] = { ...newConds[idx], ...updates };
    // Auto-set field when type changes
    if (updates.type) {
      const fields = getFieldOptions(updates.type);
      newConds[idx].field = fields[0]?.value || "message";
    }
    setEditConditions(newConds);
  };

  const addAction = () => {
    setEditActions([...editActions, { type: "inject_system_prompt", value: "", position: "before" }]);
  };

  const removeAction = (idx: number) => {
    setEditActions(editActions.filter((_, i) => i !== idx));
  };

  const updateAction = (idx: number, updates: Partial<RuleAction>) => {
    const newActions = [...editActions];
    newActions[idx] = { ...newActions[idx], ...updates };
    setEditActions(newActions);
  };

  const runTest = async () => {
    setIsTesting(true);
    try {
      const res = await authFetch("POST", "/api/admin/rules/test", {
        message: testMessage,
        plan: testPlan,
      });
      setTestResult(await res.json());
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    }
    setIsTesting(false);
  };

  const filtered = rules.filter((r) => {
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const categories = [...new Set(rules.map(r => r.category))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Rule Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conditional rules that inject instructions into every AI request
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTestDialogOpen(true)} className="gap-2" data-testid="button-test-rules">
            <Play className="w-4 h-4" />
            Test Rules
          </Button>
          <Button onClick={() => openEdit()} className="gap-2" data-testid="button-add-rule">
            <Plus className="w-4 h-4" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        {Object.entries(stats.byCategory).slice(0, 4).map(([cat, count]) => {
          const Icon = categoryIcons[cat] || Brain;
          return (
            <Card key={cat}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Icon className="w-3 h-3" /> {cat}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search rules..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-48" data-testid="input-search-rules" />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} rules shown</span>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rule) => {
                  const Icon = categoryIcons[rule.category] || Brain;
                  const isExpanded = expandedRule === rule.id;
                  let conditions: RuleCondition[] = [];
                  let actions: RuleAction[] = [];
                  try { conditions = JSON.parse(rule.conditions); } catch {}
                  try { actions = JSON.parse(rule.actions); } catch {}

                  return (
                    <>
                      <TableRow key={rule.id} data-testid={`rule-row-${rule.id}`} className="cursor-pointer" onClick={() => setExpandedRule(isExpanded ? null : rule.id)}>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              {rule.name}
                            </span>
                            {rule.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{rule.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={categoryColors[rule.category] || ""}>{rule.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{rule.priority}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{rule.appliesTo}</span>
                        </TableCell>
                        <TableCell>
                          <Switch checked={rule.isActive} onCheckedChange={() => toggleRule(rule)} onClick={(e) => e.stopPropagation()} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRule(rule.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${rule.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">Conditions ({rule.conditionLogic})</p>
                                {conditions.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">Always active (no conditions)</p>
                                ) : (
                                  <div className="space-y-1">
                                    {conditions.map((c, i) => (
                                      <div key={i} className="bg-background rounded px-2 py-1 text-xs font-mono">
                                        IF <span className="text-blue-600 dark:text-blue-400">{c.type}.{c.field}</span>{" "}
                                        <span className="text-amber-600 dark:text-amber-400">{c.operator}</span>{" "}
                                        <span className="text-green-600 dark:text-green-400">"{c.value}"</span>
                                        {c.metadata && <span className="text-muted-foreground"> (within {c.metadata} days)</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
                                <div className="space-y-1">
                                  {actions.map((a, i) => (
                                    <div key={i} className="bg-background rounded px-2 py-1 text-xs">
                                      <span className="font-medium text-primary">{a.type}</span>
                                      {a.position && <span className="text-muted-foreground"> ({a.position})</span>}
                                      <p className="text-muted-foreground mt-0.5 line-clamp-2">{a.value.substring(0, 150)}{a.value.length > 150 ? "..." : ""}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Created by: {rule.createdBy || "system"} | Last updated: {new Date(rule.updatedAt).toLocaleDateString()}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Rule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRule?.id ? "Edit Rule" : "Create Rule"}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <Tabs defaultValue="basic" className="mt-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="conditions">Conditions ({editConditions.length})</TabsTrigger>
                <TabsTrigger value="actions">Actions ({editActions.length})</TabsTrigger>
              </TabsList>

              {/* Basic Tab */}
              <TabsContent value="basic" className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Rule Name</Label>
                  <Input value={editRule.name || ""} onChange={(e) => setEditRule({ ...editRule, name: e.target.value })} data-testid="input-rule-name" placeholder="e.g., Holiday Sensitivity - Christmas" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={editRule.description || ""} onChange={(e) => setEditRule({ ...editRule, description: e.target.value })} rows={2} placeholder="What does this rule do?" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={editRule.category || "general"} onValueChange={(v) => setEditRule({ ...editRule, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="calendar">Calendar</SelectItem>
                        <SelectItem value="topic">Topic</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="safety">Safety</SelectItem>
                        <SelectItem value="quality">Quality</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority (1=highest)</Label>
                    <Input type="number" min={1} max={100} value={editRule.priority ?? 50} onChange={(e) => setEditRule({ ...editRule, priority: parseInt(e.target.value) || 50 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Applies To</Label>
                    <Select value={editRule.appliesTo || "all"} onValueChange={(v) => setEditRule({ ...editRule, appliesTo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Requests</SelectItem>
                        <SelectItem value="chat">Chat Only</SelectItem>
                        <SelectItem value="api">API Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Condition Logic</Label>
                  <Select value={editRule.conditionLogic || "AND"} onValueChange={(v) => setEditRule({ ...editRule, conditionLogic: v })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">ALL conditions must match (AND)</SelectItem>
                      <SelectItem value="OR">ANY condition can match (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* Conditions Tab */}
              <TabsContent value="conditions" className="space-y-3 pt-2">
                {editConditions.map((cond, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Condition {idx + 1}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCondition(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={cond.type} onValueChange={(v) => updateCondition(idx, { type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {conditionTypes.map(ct => (
                              <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={cond.field} onValueChange={(v) => updateCondition(idx, { field: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {getFieldOptions(cond.type).map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={cond.operator} onValueChange={(v) => updateCondition(idx, { operator: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {operators.map(op => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input value={cond.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} placeholder="Value to match (text, regex, JSON array, etc.)" />
                      {(cond.type === "calendar" && cond.field?.includes("nearby")) && (
                        <Input value={cond.metadata || ""} onChange={(e) => updateCondition(idx, { metadata: e.target.value })} placeholder="Days threshold (e.g., 7)" className="w-48" />
                      )}
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" onClick={addCondition} className="w-full gap-2">
                  <Plus className="w-4 h-4" /> Add Condition
                </Button>
                {editConditions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No conditions = rule always fires (global rule)</p>
                )}
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="space-y-3 pt-2">
                {editActions.map((action, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Action {idx + 1}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeAction(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={action.type} onValueChange={(v) => updateAction(idx, { type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {actionTypes.map(at => (
                              <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(action.type === "inject_system_prompt" || action.type === "inject_user_context") && (
                          <Select value={action.position || "before"} onValueChange={(v) => updateAction(idx, { position: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="before">Inject Before</SelectItem>
                              <SelectItem value="after">Inject After</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Textarea
                        value={action.value}
                        onChange={(e) => updateAction(idx, { value: e.target.value })}
                        rows={3}
                        placeholder={action.type === "inject_system_prompt" ? "System prompt to inject..." : action.type === "force_model" ? "Model ID (e.g., sonar-pro)" : action.type === "block_request" ? "Reason for blocking..." : "Value..."}
                      />
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" onClick={addAction} className="w-full gap-2">
                  <Plus className="w-4 h-4" /> Add Action
                </Button>
              </TabsContent>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveRule} data-testid="button-save-rule">Save Rule</Button>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Rules Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-4 h-4" /> Test Rule Engine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Sample Message</Label>
              <Textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} placeholder="Type a sample user message to see which rules would fire..." data-testid="input-test-message" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>User Plan</Label>
                <Select value={testPlan} onValueChange={setTestPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={runTest} disabled={isTesting} className="w-full gap-2" data-testid="button-run-test">
                  <Zap className="w-4 h-4" />
                  {isTesting ? "Testing..." : "Run Test"}
                </Button>
              </div>
            </div>

            {testResult && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rules checked: {testResult.totalRulesChecked}</span>
                  <Badge variant={testResult.matchedRules.length > 0 ? "default" : "secondary"}>
                    {testResult.matchedRules.length} matched
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Season: {testResult.contextSnapshot.season} | Nearest holidays: {testResult.contextSnapshot.upcomingHolidays.map(h => h.name).join(", ") || "None"}
                </div>
                {testResult.matchedRules.length > 0 ? (
                  <div className="space-y-1">
                    {testResult.matchedRules.map((mr, i) => (
                      <Card key={i}>
                        <CardContent className="p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{mr.ruleName}</span>
                            <span className="text-xs text-muted-foreground font-mono">P{mr.priority}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Matched: {mr.matchedConditions.join(" & ") || "Always active"}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No rules matched this message</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
