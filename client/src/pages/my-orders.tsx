import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";

type MyOrder = {
  id: number;
  productSku: string;
  productName: string;
  amountUsd: number;
  status: string;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
};

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  paid: { label: "Paid · In progress", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-800 dark:text-emerald-300" },
  pending: { label: "Pending payment", bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-300" },
  refunded: { label: "Refunded", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300" },
  failed: { label: "Failed", bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-800 dark:text-rose-300" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {s.label}
    </span>
  );
}

export default function MyOrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery<MyOrder[]>({
    queryKey: ["/api/my/orders"],
  });

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
          My Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user?.username}. Here's the status of your purchases.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-24 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-24 bg-muted/40 rounded-lg animate-pulse" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      {/* CTA always visible */}
      <div className="mt-12 p-6 rounded-xl border border-dashed border-border bg-card">
        <h3 className="font-semibold text-foreground">Looking for more?</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Browse our productized services and add to your order in seconds.
        </p>
        <a
          href="/buy"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90"
          data-testid="link-browse-services"
        >
          Browse services →
        </a>
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: MyOrder }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card hover:border-foreground/20 transition-colors"
         data-testid={`card-order-${order.id}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold text-foreground" data-testid={`text-order-name-${order.id}`}>
            {order.productName}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Order #{order.id} · {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <span className="text-sm text-muted-foreground">Amount paid</span>
        <span className="font-semibold text-foreground" data-testid={`text-order-amount-${order.id}`}>
          ${order.amountUsd.toLocaleString()}
        </span>
      </div>

      {order.status === "paid" && (
        <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          <strong>What happens next:</strong> Our team has been notified. You'll receive
          your deliverable by email within the promised timeframe. Reply to any of our messages
          if you need to update the brief.
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-6 rounded-xl border border-dashed border-border bg-card/50">
      <div className="text-4xl mb-3">📦</div>
      <h3 className="font-semibold text-foreground">No orders yet</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-md mx-auto">
        Once you purchase a service from our catalog, it will appear here with status updates.
      </p>
      <a
        href="/buy"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90"
        data-testid="link-browse-empty"
      >
        Browse services
      </a>
    </div>
  );
}
