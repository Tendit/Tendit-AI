import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, FolderKanban, UserPlus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InviteInfo {
  email: string;
  projectId: number;
  projectName: string;
  role: string;
  status: string;
  inviterUsername?: string;
}

// ─── Public invite-accept page ─────────────────────────────────────────────────
// No auth required. Reads :token from route params.

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);

  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

  // Fetch invite info (public endpoint, no auth header)
  useEffect(() => {
    if (!token) {
      setInviteError("No invite token provided.");
      setLoadingInvite(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/invites/${token}`);
        if (!res.ok) {
          const text = await res.text();
          setInviteError(text || "Invite not found or expired.");
        } else {
          const data = await res.json();
          setInvite(data);
        }
      } catch {
        setInviteError("Failed to load invite. Please check your connection.");
      } finally {
        setLoadingInvite(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!form.username.trim()) {
      setSubmitError("Username is required.");
      return;
    }
    if (form.password.length < 6) {
      setSubmitError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/invites/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          username: form.username.trim(),
          password: form.password,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setSubmitError(text || "Failed to accept invite.");
        return;
      }

      const data = await res.json();

      // Store token in memory (same as auth.tsx pattern)
      if (data.token) {
        (window as any).__AUTH_TOKEN__ = data.token;
      }

      setSuccess(true);

      // Redirect to project page after 2 seconds
      setTimeout(() => {
        if (invite?.projectId) {
          navigate(`/projects/${invite.projectId}`);
        } else {
          navigate("/");
        }
        // Force page reload to trigger auth re-check
        window.location.reload();
      }, 1500);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────────

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Invalid Invite</h2>
            <p className="text-sm text-muted-foreground">{inviteError ?? "This invite link is invalid or has expired."}</p>
            <Button variant="outline" onClick={() => navigate("/")}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Already accepted / expired ──────────────────────────────────────────────

  if (invite.status !== "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Invite {invite.status}</h2>
            <p className="text-sm text-muted-foreground">
              This invite has already been {invite.status}. Please ask for a new invite link.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Success ──────────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold">Welcome aboard!</h2>
            <p className="text-sm text-muted-foreground">
              You've joined <strong>{invite.projectName}</strong>. Redirecting…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Brand header */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <img src="/tendit-logo.jpg" alt="Tendit" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-bold text-lg">Tendit</span>
          </div>
          <p className="text-sm text-muted-foreground">AI Platform</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Project Invitation</CardTitle>
            </div>
            <CardDescription>
              You've been invited to join{" "}
              <strong className="text-foreground">{invite.projectName}</strong>{" "}
              as a{" "}
              <Badge variant="outline" className="text-xs capitalize">{invite.role}</Badge>
              {invite.inviterUsername && (
                <> by <strong className="text-foreground">{invite.inviterUsername}</strong></>
              )}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pre-filled email */}
            <div className="space-y-1">
              <Label htmlFor="invite-email-display">Email</Label>
              <Input
                id="invite-email-display"
                data-testid="input-invite-email-display"
                value={invite.email}
                disabled
                className="bg-muted"
              />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="invite-username">Choose a Username</Label>
                <Input
                  id="invite-username"
                  data-testid="input-invite-username"
                  placeholder="yourname"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  id="invite-password"
                  data-testid="input-invite-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-confirm-password">Confirm Password</Label>
                <Input
                  id="invite-confirm-password"
                  data-testid="input-invite-confirm-password"
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  autoComplete="new-password"
                  required
                />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={isSubmitting}
                data-testid="button-accept-invite"
              >
                <UserPlus className="w-4 h-4" />
                {isSubmitting ? "Joining…" : "Accept & Join Project"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            className="underline hover:text-foreground transition-colors"
            onClick={() => navigate("/")}
            data-testid="button-go-to-login"
          >
            Sign in instead
          </button>
        </p>
      </div>
    </div>
  );
}
