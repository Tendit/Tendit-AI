import { useState } from "react";
import { useAuth, useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Coins, CreditCard } from "lucide-react";
import { PLANS } from "@shared/schema";

const planOrder = ["free", "starter", "pro", "enterprise"] as const;

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const subscribe = async (plan: string) => {
    if (plan === user?.plan) return;
    setLoading(plan);
    try {
      const res = await authFetch("POST", "/api/billing/subscribe", { plan });
      const data = await res.json();
      await refreshUser();
      toast({ title: "Plan updated", description: data.message });
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update plan", variant: "destructive" });
    }
    setLoading(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription and credits</p>
      </div>

      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-primary" />
              <div>
                <div className="font-medium capitalize">{user?.plan} Plan</div>
                <div className="text-sm text-muted-foreground">
                  {user?.credits?.toFixed(1)} credits remaining
                </div>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <Coins className="w-3 h-3" />
              {user?.credits?.toFixed(1)} cr
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {planOrder.map((planKey) => {
          const plan = PLANS[planKey];
          const isCurrent = user?.plan === planKey;
          const isPopular = planKey === "pro";

          return (
            <Card
              key={planKey}
              className={`relative ${isPopular ? "border-primary" : ""} ${isCurrent ? "bg-accent/50" : ""}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary">Popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    ${plan.price}
                  </span>
                  {plan.price > 0 && <span className="text-muted-foreground">/mo</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    {plan.credits} credits/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    {plan.requests} requests/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    Chat UI access
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    API access
                  </li>
                  {planKey !== "free" && (
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      Priority support
                    </li>
                  )}
                </ul>

                <Button
                  className="w-full"
                  variant={isCurrent ? "secondary" : isPopular ? "default" : "outline"}
                  disabled={isCurrent || loading !== null}
                  onClick={() => subscribe(planKey)}
                  data-testid={`button-plan-${planKey}`}
                >
                  {loading === planKey ? "Processing..." : isCurrent ? "Current Plan" : `Upgrade to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Note about Stripe */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground text-center">
            In production, payments are processed securely via Stripe. This demo simulates plan changes and credit allocation instantly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
