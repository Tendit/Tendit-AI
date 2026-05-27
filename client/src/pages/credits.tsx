import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Coins, Zap, AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface UserCreditsRow {
  userId: number;
  balance: number;
  overdraftBalance: number;
  updatedAt: string;
}
interface CreditPackageRow {
  id: number;
  slug: string;
  name: string;
  credits: number;
  priceUsd: number;
  priceIls: number;
  active: boolean;
}
interface LedgerRow {
  id: number;
  userId: number;
  projectId: number | null;
  txnType: string;
  amount: number;
  balanceAfter: number;
  actionRef: string | null;
  note: string | null;
  createdAt: string;
}

export default function CreditsPage() {
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const { toast } = useToast();

  const balanceQ = useQuery<UserCreditsRow>({ queryKey: ["/api/credits/me"] });
  const packagesQ = useQuery<CreditPackageRow[]>({ queryKey: ["/api/credits/packages"] });
  const ledgerQ = useQuery<LedgerRow[]>({ queryKey: ["/api/credits/ledger"] });

  const buy = useMutation({
    mutationFn: async (slug: string) => {
      const res = await authFetch("POST", "/api/billing/checkout", { packageSlug: slug });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ title: t("credits.checkoutUnavailable"), description: data?.message || "Stripe not configured", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Checkout failed", variant: "destructive" }),
  });

  const balance = balanceQ.data?.balance ?? 0;
  const overdraft = balanceQ.data?.overdraftBalance ?? 0;

  return (
    <div className={`p-6 max-w-5xl mx-auto space-y-6 ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      <div>
        <h1 className="text-xl font-bold" data-testid="text-credits-title">{t("credits.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("credits.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="w-4 h-4" /> {t("credits.balance")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balanceQ.isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xl font-bold" data-testid="text-balance">{balance}</div>
                <div className="text-xs text-muted-foreground">{t("credits.available")}</div>
              </div>
              {overdraft > 0 && (
                <div>
                  <div className="text-xl font-bold text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {overdraft}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("credits.overdraft")}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-3">{t("credits.packages")}</h2>
        {packagesQ.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(packagesQ.data || []).map((p) => (
              <Card key={p.id} data-testid={`card-package-${p.slug}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    {p.name}
                  </CardTitle>
                  <CardDescription>{p.credits} {t("common.credits")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-lg font-bold">${(p.priceUsd / 100).toFixed(2)}</div>
                  <Button
                    className="w-full"
                    onClick={() => buy.mutate(p.slug)}
                    disabled={buy.isPending}
                    data-testid={`button-buy-${p.slug}`}
                  >
                    {buy.isPending ? t("credits.processing") : t("credits.buy")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("credits.ledger")}</CardTitle>
        </CardHeader>
        <CardContent>
          {ledgerQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : (ledgerQ.data || []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("credits.noLedger")}</div>
          ) : (
            <div className="space-y-2">
              {(ledgerQ.data || []).slice(0, 20).map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-2" data-testid={`row-ledger-${row.id}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.txnType}</Badge>
                    <span className="text-muted-foreground">{row.note || row.actionRef || ""}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={row.amount < 0 ? "text-destructive" : "text-green-600"}>
                      {row.amount > 0 ? "+" : ""}{row.amount}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
