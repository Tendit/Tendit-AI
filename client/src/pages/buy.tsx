import { useQuery } from "@tanstack/react-query";

type Product = {
  sku: string;
  name: string;
  description: string;
  priceUsd: number;
  stripePaymentLink: string;
  deliveryDays: number;
  highlights: string[];
};

function ProductCard({ product, accent }: { product: Product; accent: "patent" | "pitch" }) {
  const accentBg = accent === "patent" ? "bg-slate-900" : "bg-indigo-900";
  const accentRing = accent === "patent" ? "ring-slate-200" : "ring-indigo-200";
  const accentBadge = accent === "patent" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
  const btnClass = accent === "patent"
    ? "bg-slate-900 hover:bg-slate-800 text-white"
    : "bg-indigo-600 hover:bg-indigo-500 text-white";

  return (
    <div className={`rounded-2xl bg-white shadow-xl ring-1 ${accentRing} overflow-hidden flex flex-col`}
         data-testid={`card-product-${product.sku}`}>
      <div className={`${accentBg} text-white px-8 py-10`}>
        <div className={`inline-block ${accentBadge} text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mb-4`}>
          {accent === "patent" ? "Patent Intelligence" : "Fundraise Ready"}
        </div>
        <h2 className="text-2xl font-bold leading-tight" data-testid={`text-product-name-${product.sku}`}>
          {product.name}
        </h2>
        <div className="mt-5 flex items-baseline gap-2">
          <span className="text-5xl font-bold tracking-tight" data-testid={`text-product-price-${product.sku}`}>
            ${product.priceUsd.toLocaleString()}
          </span>
          <span className="text-white/60 text-sm">USD · one-time</span>
        </div>
        <p className="mt-3 text-white/80 text-sm leading-relaxed">
          {product.description}
        </p>
      </div>

      <div className="flex-1 p-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">What's included</h3>
        <ul className="space-y-3">
          {product.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
              <svg className="w-5 h-5 flex-shrink-0 text-emerald-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-8 pt-0">
        <a
          href={product.stripePaymentLink}
          className={`block w-full text-center px-6 py-3.5 rounded-lg font-semibold text-sm transition-colors ${btnClass}`}
          data-testid={`button-buy-${product.sku}`}
        >
          Get started — ${product.priceUsd.toLocaleString()}
        </a>
        <p className="mt-3 text-xs text-slate-500 text-center">
          Secure payment via Stripe · Delivery in {product.deliveryDays} business days
        </p>
      </div>
    </div>
  );
}

export default function BuyPage() {
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Hero */}
      <header className="px-6 pt-16 pb-12 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Tendit · Done-for-you services
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight max-w-3xl mx-auto leading-tight">
          Skip the months of work. Get the deliverable.
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Two productized offers used by founders to move faster: a Freedom-to-Operate
          patent search and a VC-ready pitch package. Real human review, AI-accelerated delivery.
        </p>
      </header>

      {/* Products */}
      <main className="px-6 pb-20 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            {products.map((p) => (
              <ProductCard
                key={p.sku}
                product={p}
                accent={p.sku === "fto_patent_report" ? "patent" : "pitch"}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-500 py-20">
            <p>Unable to load products. Please try again or contact support.</p>
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-16 pt-12 border-t border-slate-200 grid sm:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl mb-2">🔒</div>
            <h4 className="font-semibold text-slate-900 text-sm mb-1">Stripe-secured</h4>
            <p className="text-xs text-slate-500">Industry-standard payment encryption</p>
          </div>
          <div>
            <div className="text-2xl mb-2">⚡</div>
            <h4 className="font-semibold text-slate-900 text-sm mb-1">AI-accelerated</h4>
            <p className="text-xs text-slate-500">Faster than agencies. Reviewed by humans.</p>
          </div>
          <div>
            <div className="text-2xl mb-2">🛡️</div>
            <h4 className="font-semibold text-slate-900 text-sm mb-1">Refund within 7 days</h4>
            <p className="text-xs text-slate-500">If we miss the brief, we refund. No friction.</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-xs text-slate-400">
          <p>© Tendit AI · <a href="mailto:hello@tendit.io" className="underline hover:text-slate-600">hello@tendit.io</a></p>
        </footer>
      </main>
    </div>
  );
}
