// =====================================================
// Stripe Client — Part IX
// Graceful: returns null when STRIPE_SECRET_KEY is not set; never crashes on import.
// =====================================================

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;
let initialized = false;

export function getStripe(): Stripe | null {
  if (initialized) return stripeInstance;
  initialized = true;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("[stripe-client] STRIPE_SECRET_KEY not set — Stripe features disabled.");
    return null;
  }
  try {
    stripeInstance = new Stripe(key, {
      apiVersion: "2024-12-18.acacia" as any,
    });
    return stripeInstance;
  } catch (e: any) {
    console.error("[stripe-client] init failed:", e?.message);
    return null;
  }
}

export function getWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}
