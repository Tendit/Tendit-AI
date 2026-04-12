import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Key, Copy, Trash2, Check, Code } from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

export default function ApiKeysPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    try {
      const res = await authFetch("GET", "/api/keys");
      const data = await res.json();
      setKeys(data.filter((k: ApiKey) => k.isActive));
    } catch {}
    setLoading(false);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await authFetch("POST", "/api/keys", { name: newKeyName.trim() });
      const data = await res.json();
      setNewKeyValue(data.fullKey);
      setNewKeyName("");
      loadKeys();
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to create API key", variant: "destructive" });
    }
  };

  const revokeKey = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/keys/${id}`);
      loadKeys();
      toast({ title: "Key revoked" });
    } catch {}
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">Manage your API keys for programmatic access</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setNewKeyValue(""); setNewKeyName(""); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-key">
              <Plus className="w-4 h-4" />
              Create Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                {newKeyValue
                  ? "Copy your API key now. It won't be shown again."
                  : "Give your key a name to identify it."}
              </DialogDescription>
            </DialogHeader>

            {newKeyValue ? (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-md font-mono text-sm break-all" data-testid="text-new-key">
                  {newKeyValue}
                </div>
                <Button onClick={copyKey} className="w-full gap-2" data-testid="button-copy-key">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy Key"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Key Name</Label>
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production, Development"
                    data-testid="input-key-name"
                  />
                </div>
                <Button onClick={createKey} className="w-full" disabled={!newKeyName.trim()} data-testid="button-generate-key">
                  Generate Key
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Existing keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No API keys yet. Create one to start using the API.
            </p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-3 rounded-md border" data-testid={`key-item-${k.id}`}>
                  <div className="flex items-center gap-3">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{k.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{k.prefix}...{" "}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {k.lastUsedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => revokeKey(k.id)}
                      className="h-8 w-8 text-destructive"
                      data-testid={`button-revoke-${k.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Docs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="w-4 h-4" />
            Quick Start
          </CardTitle>
          <CardDescription>Use your API key to make requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <pre className="text-foreground">{`curl -X POST \\
  ${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/v1/chat/completions \\
  -H "Authorization: Bearer pxk-YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "sonar",
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'`}</pre>
          </div>

          <div className="mt-4 space-y-2">
            <h4 className="font-medium text-sm">Available Models</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between p-2 rounded border">
                <span>sonar</span>
                <Badge variant="secondary">0.5 cr</Badge>
              </div>
              <div className="flex justify-between p-2 rounded border">
                <span>sonar-pro</span>
                <Badge variant="secondary">1 cr</Badge>
              </div>
              <div className="flex justify-between p-2 rounded border">
                <span>sonar-reasoning</span>
                <Badge variant="secondary">2 cr</Badge>
              </div>
              <div className="flex justify-between p-2 rounded border">
                <span>sonar-reasoning-pro</span>
                <Badge variant="secondary">3 cr</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
