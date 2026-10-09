import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { stripe, priceIdToPlanKey } from "@/lib/stripe";
import type Stripe from "stripe";

const prisma = new PrismaClient();

/**
 * Stripe webhook — the only place that ever writes User.planId. The app
 * never trusts the client's word for what plan a user is on; it always
 * reflects what Stripe confirms happened.
 *
 * Idempotency: every event is recorded in BillingEvent keyed by Stripe's
 * event id before we act on it, so a retried delivery (Stripe retries on
 * timeout) is a no-op on the second attempt.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  const alreadyProcessed = await prisma.billingEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  await prisma.billingEvent.create({
    data: { stripeEventId: event.id, type: event.type, payload: event.data.object as object },
  });

  async function resolvePlanIdFromPrice(priceId: string | undefined): Promise<string | undefined> {
    const key = priceId ? priceIdToPlanKey(priceId) : null;
    if (!key) return undefined;
    const plan = await prisma.planConfig.findUnique({ where: { key } });
    return plan?.id;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (userId && session.customer && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const planId = await resolvePlanIdFromPrice(subscription.items.data[0]?.price.id);

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...(planId ? { planId } : {}),
          },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const planId = await resolvePlanIdFromPrice(subscription.items.data[0]?.price.id);

      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...(planId ? { planId } : {}),
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });
      if (user) {
        // Subscription ended (cancelled or payment failed permanently) —
        // drop back to the default (Free) plan rather than leaving a stale
        // paid plan active.
        const defaultPlan = await prisma.planConfig.findFirst({ where: { isDefault: true } });
        await prisma.user.update({
          where: { id: user.id },
          data: { planId: defaultPlan?.id ?? null, stripeSubscriptionId: null },
        });
      }
      break;
    }

    default:
      // Other event types are logged (via BillingEvent above) but don't
      // need to change any user state.
      break;
  }

  return NextResponse.json({ received: true });
}
