import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
});

/**
 * Maps a Stripe Price ID (from a completed Checkout session or a
 * subscription webhook) back to one of our PlanConfig `key` values
 * ("starter" | "pro" | "scale"). Price IDs are env-configured
 * (STRIPE_PRICE_STARTER / _PRO / _SCALE), never hardcoded, so they can
 * differ between test and live mode without a code change. The caller is
 * responsible for resolving this key to an actual PlanConfig row (its id
 * may differ per deployment, and an admin may have edited the row).
 */
export function priceIdToPlanKey(priceId: string): string | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_SCALE) return "scale";
  return null;
}
