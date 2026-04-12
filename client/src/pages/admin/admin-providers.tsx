import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PROVIDERS, MODELS } from "@shared/schema";
import { Check, X, Key, Save } from "lucide-react";

interface ProviderKeyInfo {
  id: number;
  provider: string;
  apiKey: string;
  isActive: boolean;
}

export default function AdminProvidersPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [savedKeys, setSavedKeys] = useState<ProviderKeyInfo[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    try {
      const res = await authFetch("GET", "/api/admin/providers");
      setSavedKeys(await res.json());
    } catch {}
    setLoading(false);
  };

  const saveKey = async (provider: string) => {
    const apiKey = keyInputs[provider];
    if (!apiKey?.trim()) return;
    setSaving(provider);
    try {
      await authFetch("POST", "/api/admin/providers", { provider, apiKey: apiKey.trim() });
      toast({ title: `${provider} API key saved` });
      setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      loadKeys();
    } catch {
      toast({ title: "Error saving key", variant: "destructive" });
    }
    setSaving(null);
  };

  const removeKey = async (provider: string) => {
    try {
      await authFetch("DELETE", `/api/admin/providers/${provider}`);
      toast({ title: `${provider} key removed` });
      loadKeys();
    } catch {}
  };

  const isConfigured = (provider: string) => savedKeys.some((k) => k.provider === provider && k.isActive);
  const getKeyPreview = (provider: string) => savedKeys.find((k) => k.provider === provider)?.apiKey;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">AI Providers</h1>
        <p className="text-sm text-muted-foreground">
          Configure API keys for each provider. Models become available to users when their provider is configured.
        </p>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const models = MODELS.filter((m) => m.provider === provider.id);
          const configured = isConfigured(provider.id);
          const keyPreview = getKeyPreview(provider.id);

          return (
            <Card key={provider.id} className={configured ? "border-primary/30" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }} />
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                  </div>
                  <Badge variant={configured ? "default" : "secondary"}>
                    {configured ? (
                      <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                    ) : (
                      <span className="flex items-center gap-1"><X className="w-3 h-3" /> Not configured</span>
                    )}
                  </Badge>
                </div>
                <CardDescription>
                  {models.length} models available
                  {configured && keyPreview && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{keyPreview}</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Models grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {models.map((model) => (
                    <div key={model.id} className="p-2 rounded border text-xs">
                      <div className="font-medium">{model.name}</div>
                      <div className="text-muted-foreground">{model.cost} cr/req</div>
                      <div className="text-muted-foreground capitalize">{model.category}</div>
                    </div>
                  ))}
                </div>

                {/* API key input */}
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder={`Enter ${provider.name} API key...`}
                        value={keyInputs[provider.id] || ""}
                        onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        className="font-mono text-sm"
                        data-testid={`input-key-${provider.id}`}
                      />
                      <Button
                        onClick={() => saveKey(provider.id)}
                        disabled={!keyInputs[provider.id]?.trim() || saving === provider.id}
                        size="sm"
                        className="gap-1"
                        data-testid={`button-save-${provider.id}`}
                      >
                        <Save className="w-3 h-3" />
                        {saving === provider.id ? "Saving..." : "Save"}
                      </Button>
                      {configured && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeKey(provider.id)}
                          data-testid={`button-remove-${provider.id}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />
            Where to Get API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />
              <span><strong>Perplexity</strong> — <span className="text-muted-foreground">docs.perplexity.ai/docs/getting-started</span></span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
              <span><strong>Anthropic</strong> — <span className="text-muted-foreground">console.anthropic.com/settings/keys</span></span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <span><strong>OpenAI</strong> — <span className="text-muted-foreground">platform.openai.com/api-keys</span></span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span><strong>Google</strong> — <span className="text-muted-foreground">aistudio.google.com/apikey</span></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
