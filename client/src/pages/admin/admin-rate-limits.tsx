import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Pencil, Trash2, Clock, Zap, AlertTriangle, Timer } from "lucide-react";

interface RateLimitRule {
  id: number;
  name: string;
  plan: string;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  maxCreditsPerDay: number;
  maxTokensPerRequest: number;
  cooldownSeconds: number;
  isActive: boolean;
}

const planColors: Record<string, string> = {
  all: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  free: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const defaultRule: Omit<RateLimitRule, "id"> = {
  name: "",
  plan: "free",
  maxRequestsPerMinute: 5,
  maxRequestsPerHour: 50,
  maxRequestsPerDay: 200,
  maxCreditsPerDay: 50,
  maxTokensPerRequest: 4096,
  cooldownSeconds: 3,
  isActive: true,
};

export default function AdminRateLimitsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<RateLimitRule> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch("GET", "/api/admin/rate-limits");
      setRules(await res.json());
    } catch {}
    setIsLoading(false);
  };

  const saveRule = async () => {
    if (!editRule?.name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      if (editRule.id) {
        await authFetch("PATCH", `/api/admin/rate-limits/${editRule.id}`, editRule);
        toast({ title: "Rule updated" });
      } else {
        await authFetch("POST", "/api/admin/rate-limits", editRule);
        toast({ title: "Rule created" });
      }
      setIsDialogOpen(false);
      setEditRule(null);
      loadRules();
    } catch (e: any) {
      toast({ title: "Error saving rule", description: e.message, variant: "destructive" });
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/admin/rate-limits/${id}`);
      toast({ title: "Rule deleted" });
      loadRules();
    } catch {}
  };

  const toggleActive = async (rule: RateLimitRule) => {
    try {
      await authFetch("PATCH", `/api/admin/rate-limits/${rule.id}`, { isActive: !rule.isActive });
      loadRules();
    } catch {}
  };

  const openEditDialog = (rule?: RateLimitRule) => {
    setEditRule(rule ? { ...rule } : { ...defaultRule });
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Rate Limits & Usage Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control API usage per plan to prevent abuse and manage costs
          </p>
        </div>
        <Button onClick={() => openEditDialog()} className="gap-2" data-testid="button-add-rule">
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rules.length}</p>
                <p className="text-xs text-muted-foreground">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.filter((r) => r.cooldownSeconds > 0).length}
                </p>
                <p className="text-xs text-muted-foreground">With Cooldown</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.filter((r) => r.plan === "free").length > 0 ? "Yes" : "No"}
                </p>
                <p className="text-xs text-muted-foreground">Free Tier Protected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {rules.filter((r) => r.plan === "enterprise").length > 0 ? "High" : "Standard"}
                </p>
                <p className="text-xs text-muted-foreground">Enterprise Limits</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Rate Limiting Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Each rule applies to a specific plan tier. When a user sends a request, the system checks:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Timer className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium text-foreground">Cooldown</p>
                <p className="text-xs">Forced wait between requests to prevent rapid-fire abuse</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Zap className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium text-foreground">Request Caps</p>
                <p className="text-xs">Per-minute, per-hour, and daily request limits</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Shield className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium text-foreground">Credit Cap</p>
                <p className="text-xs">Maximum credits a user can spend per day</p>
              </div>
            </div>
          </div>
          <p className="pt-2">Admin users are exempt from all rate limits. Rules with the "all" plan apply as a fallback when no plan-specific rule exists.</p>
        </CardContent>
      </Card>

      {/* Rules table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rate Limit Rules</CardTitle>
          <CardDescription>One rule per plan. The system checks plan-specific rules first, then falls back to "all" rules.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">Req/Min</TableHead>
                <TableHead className="text-center">Req/Hour</TableHead>
                <TableHead className="text-center">Req/Day</TableHead>
                <TableHead className="text-center">Credits/Day</TableHead>
                <TableHead className="text-center">Cooldown</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} data-testid={`rule-row-${rule.id}`}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={planColors[rule.plan] || ""}>
                      {rule.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{rule.maxRequestsPerMinute}</TableCell>
                  <TableCell className="text-center font-mono text-sm">{rule.maxRequestsPerHour}</TableCell>
                  <TableCell className="text-center font-mono text-sm">{rule.maxRequestsPerDay}</TableCell>
                  <TableCell className="text-center font-mono text-sm">{rule.maxCreditsPerDay}</TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {rule.cooldownSeconds > 0 ? `${rule.cooldownSeconds}s` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleActive(rule)}
                      data-testid={`toggle-rule-${rule.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(rule)} data-testid={`edit-rule-${rule.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteRule(rule.id)} data-testid={`delete-rule-${rule.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No rate limit rules configured. Default limits will apply.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRule?.id ? "Edit Rule" : "Create Rule"}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  value={editRule.name || ""}
                  onChange={(e) => setEditRule({ ...editRule, name: e.target.value })}
                  placeholder="e.g., Free Tier Limits"
                  data-testid="input-rule-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={editRule.plan || "free"} onValueChange={(v) => setEditRule({ ...editRule, plan: v })}>
                  <SelectTrigger data-testid="select-rule-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plans (fallback)</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Requests / Minute</Label>
                  <Input
                    type="number"
                    value={editRule.maxRequestsPerMinute || 0}
                    onChange={(e) => setEditRule({ ...editRule, maxRequestsPerMinute: parseInt(e.target.value) || 0 })}
                    data-testid="input-req-per-min"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requests / Hour</Label>
                  <Input
                    type="number"
                    value={editRule.maxRequestsPerHour || 0}
                    onChange={(e) => setEditRule({ ...editRule, maxRequestsPerHour: parseInt(e.target.value) || 0 })}
                    data-testid="input-req-per-hour"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requests / Day</Label>
                  <Input
                    type="number"
                    value={editRule.maxRequestsPerDay || 0}
                    onChange={(e) => setEditRule({ ...editRule, maxRequestsPerDay: parseInt(e.target.value) || 0 })}
                    data-testid="input-req-per-day"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Credits / Day</Label>
                  <Input
                    type="number"
                    value={editRule.maxCreditsPerDay || 0}
                    onChange={(e) => setEditRule({ ...editRule, maxCreditsPerDay: parseFloat(e.target.value) || 0 })}
                    data-testid="input-credits-per-day"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens / Request</Label>
                  <Input
                    type="number"
                    value={editRule.maxTokensPerRequest || 0}
                    onChange={(e) => setEditRule({ ...editRule, maxTokensPerRequest: parseInt(e.target.value) || 0 })}
                    data-testid="input-max-tokens"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cooldown (seconds)</Label>
                  <Input
                    type="number"
                    value={editRule.cooldownSeconds || 0}
                    onChange={(e) => setEditRule({ ...editRule, cooldownSeconds: parseInt(e.target.value) || 0 })}
                    data-testid="input-cooldown"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={editRule.isActive !== false}
                  onCheckedChange={(v) => setEditRule({ ...editRule, isActive: v })}
                  data-testid="toggle-rule-active"
                />
                <Label>Rule is active</Label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveRule} data-testid="button-save-rule">Save Rule</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
