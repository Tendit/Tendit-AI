import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface GoogleStatus {
  oauthConfigured: boolean;
  connected: boolean;
  email: string | null;
  scope: string | null;
  connectedAt: string | null;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusBanner, setStatusBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Handle OAuth callback redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") {
      setStatusBanner({ kind: "ok", msg: "Google connected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      // clean URL
      window.history.replaceState({}, "", "/settings");
    } else if (g === "error") {
      setStatusBanner({
        kind: "err",
        msg: `Google connection failed: ${params.get("reason") || "unknown"}`,
      });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const statusQ = useQuery<GoogleStatus>({
    queryKey: ["/api/google/status"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/google/oauth/start");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (e: any) => {
      toast({
        title: "Could not start Google OAuth",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/google/disconnect");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Disconnected from Google" });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
    },
  });

  const status = statusQ.data;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Integrations and account preferences</p>
      </div>

      {statusBanner && (
        <Card className={statusBanner.kind === "ok" ? "border-green-500" : "border-red-500"}>
          <CardContent className="p-3 text-sm flex items-center gap-2">
            {statusBanner.kind === "ok" ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            {statusBanner.msg}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-google-integration">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google Drive
          </CardTitle>
          <CardDescription>
            Connect your Google account so projects can browse, read, and create files in linked Drive folders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQ.isLoading ? (
            <Skeleton className="h-20" />
          ) : !status?.oauthConfigured ? (
            <div className="text-sm bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="font-medium text-yellow-900">Google OAuth not configured on server</div>
              <div className="text-yellow-800 mt-1">
                The admin needs to set <code className="bg-yellow-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="bg-yellow-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in environment variables.
              </div>
            </div>
          ) : status?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">Connected</Badge>
                <span className="text-sm">{status.email}</span>
              </div>
              {status.connectedAt && (
                <div className="text-xs text-muted-foreground">Connected on {new Date(status.connectedAt + "Z").toLocaleString()}</div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                  data-testid="button-google-disconnect"
                >
                  Disconnect Google
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                  data-testid="button-google-reconnect"
                >
                  Re-authorize (refresh scopes)
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in with your Google account. We&apos;ll ask for read-only access to files you share with us, and the ability to create files in folders you pick.
              </p>
              <Button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                data-testid="button-google-connect"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
