import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

const prisma = new PrismaClient();

const CheckoutSchema = z.object({
  tier: z.enum(["STARTER", "PRO", "SCALE"]),
});

const PRICE_ENV_BY_TIER: Record<string, string | undefined> = {
  STARTER: process.env.STRIPE_PRICE_STARTER,
  PRO: process.env.STRIPE_PRICE_PRO,
  SCALE: process.env.STRIPE_PRICE_SCALE,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const priceId = PRICE_ENV_BY_TIER[parsed.data.tier];
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price for ${parsed.data.tier} is not configured on the server.` },
      { status: 500 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Reuse an existing Stripe Customer if we already created one for this
  // user (e.g. they're changing plans), otherwise Checkout creates one.
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing?checkout=cancelled`,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Could not create checkout session." }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
