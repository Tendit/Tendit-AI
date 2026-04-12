import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { MODELS } from "@shared/schema";
import { Settings, DollarSign, TrendingUp, Calculator, Check } from "lucide-react";

const PRESET_MULTIPLIERS = [
  { value: 1, label: "1x", desc: "No markup (break-even)" },
  { value: 1.5, label: "1.5x", desc: "50% margin" },
  { value: 2, label: "2x", desc: "100% margin" },
  { value: 3, label: "3x", desc: "200% margin" },
  { value: 5, label: "5x", desc: "400% margin" },
];

export default function AdminSettingsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [multiplier, setMultiplier] = useState(2);
  const [savedMultiplier, setSavedMultiplier] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const res = await authFetch("GET", "/api/admin/settings");
      const data = await res.json();
      const val = parseFloat(data.margin_multiplier) || 2;
      setMultiplier(val);
      setSavedMultiplier(val);
    } catch {}
    setLoading(false);
  };

  const saveMultiplier = async () => {
    setSaving(true);
    try {
      await authFetch("PATCH", "/api/admin/settings", {
        key: "margin_multiplier",
        value: String(multiplier),
      });
      setSavedMultiplier(multiplier);
      toast({ title: "Margin multiplier updated", description: `Users will now be charged ${multiplier}x the base API cost.` });
    } catch {
      toast({ title: "Error saving", variant: "destructive" });
    }
    setSaving(false);
  };

  const hasChanges = multiplier !== savedMultiplier;

  // Calculate margin percentage
  const marginPct = Math.round((multiplier - 1) * 100);

  // Example models for preview
  const previewModels = MODELS.filter((m) =>
    ["sonar", "claude-sonnet-4", "gpt-4o", "gemini-2.5-flash"].includes(m.id)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure profit margins and platform-wide pricing
        </p>
      </div>

      {/* Margin Multiplier Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Profit Margin Multiplier</CardTitle>
                <CardDescription>
                  How much users pay relative to your actual API cost
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-lg font-bold px-3 py-1" data-testid="text-current-multiplier">
              {multiplier}x
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Slider */}
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1x (no profit)</span>
              <span>10x (high margin)</span>
            </div>
            <Slider
              min={1}
              max={10}
              step={0.1}
              value={[multiplier]}
              onValueChange={([v]) => setMultiplier(Math.round(v * 10) / 10)}
              data-testid="slider-multiplier"
            />
            <div className="text-center">
              <span className="text-2xl font-bold text-primary">{multiplier}x</span>
              <span className="text-sm text-muted-foreground ml-2">
                = {marginPct}% profit margin
              </span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {PRESET_MULTIPLIERS.map((preset) => (
              <Button
                key={preset.value}
                variant={multiplier === preset.value ? "default" : "outline"}
                size="sm"
                className="gap-1"
                onClick={() => setMultiplier(preset.value)}
                data-testid={`button-preset-${preset.value}`}
              >
                {multiplier === preset.value && <Check className="w-3 h-3" />}
                {preset.label}
                <span className="text-xs opacity-70">({preset.desc})</span>
              </Button>
            ))}
          </div>

          {/* How it works explanation */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="w-4 h-4" />
              How it works
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                If a model's base API cost is <strong>1 credit</strong> and your multiplier is <strong>{multiplier}x</strong>,
                users will be charged <strong>{Math.round(1 * multiplier * 10) / 10} credits</strong> per request.
              </p>
              <p>
                Your profit: <strong>{Math.round((multiplier - 1) * 10) / 10} credits</strong> per request ({marginPct}% margin).
              </p>
            </div>
          </div>

          {/* Save button */}
          <Button
            onClick={saveMultiplier}
            disabled={!hasChanges || saving}
            className="w-full"
            data-testid="button-save-margin"
          >
            {saving ? "Saving..." : hasChanges ? `Save Multiplier (${multiplier}x)` : "No changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Live Pricing Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            <CardTitle className="text-base">Pricing Preview</CardTitle>
          </div>
          <CardDescription>
            What users will actually pay per request with your {multiplier}x multiplier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-right p-3 font-medium">Base Cost</th>
                  <th className="text-right p-3 font-medium">User Pays</th>
                  <th className="text-right p-3 font-medium">Your Profit</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((model) => {
                  const userCost = Math.round(model.cost * multiplier * 100) / 100;
                  const profit = Math.round((userCost - model.cost) * 100) / 100;
                  return (
                    <tr key={model.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{model.name}</td>
                      <td className="p-3 text-muted-foreground capitalize">{model.provider}</td>
                      <td className="p-3 text-right text-muted-foreground">{model.cost} cr</td>
                      <td className="p-3 text-right font-bold text-primary">{userCost} cr</td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">+{profit} cr</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Estimator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            <CardTitle className="text-base">Revenue Estimator</CardTitle>
          </div>
          <CardDescription>Estimated monthly revenue based on user activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { users: 50, reqs: 20, label: "Small" },
              { users: 200, reqs: 30, label: "Medium" },
              { users: 1000, reqs: 50, label: "Large" },
            ].map((scenario) => {
              const avgBaseCost = MODELS.reduce((s, m) => s + m.cost, 0) / MODELS.length;
              const dailyReqs = scenario.users * scenario.reqs;
              const monthlyReqs = dailyReqs * 30;
              const monthlyApiCost = monthlyReqs * avgBaseCost;
              const monthlyRevenue = monthlyApiCost * multiplier;
              const monthlyProfit = monthlyRevenue - monthlyApiCost;

              return (
                <div key={scenario.label} className="p-4 rounded-lg border space-y-2">
                  <div className="text-sm font-medium">{scenario.label} Platform</div>
                  <div className="text-xs text-muted-foreground">
                    {scenario.users} users × {scenario.reqs} req/day
                  </div>
                  <div className="space-y-1 pt-2 border-t">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">API cost/mo</span>
                      <span>${Math.round(monthlyApiCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Revenue/mo</span>
                      <span className="font-medium">${Math.round(monthlyRevenue).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-green-600 dark:text-green-400">Profit/mo</span>
                      <span className="text-green-600 dark:text-green-400">
                        +${Math.round(monthlyProfit).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
