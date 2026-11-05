// Stripe billing: Checkout for upgrades, Customer Portal for management, and a
// signed webhook that keeps each workspace's plan in sync with its subscription.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM.
// Billing is off (everyone unlimited) unless STRIPE_SECRET_KEY is set.

import express, { type Request, type Response } from "express";
import Stripe from "stripe";
import type { PlanId } from "../shared/plans";
import { audit, billingEnabled, HttpError, requireRole } from "./auth";
import { db } from "./db";

let client: Stripe | null = null;
const stripe = () => {
  if (!billingEnabled()) throw new HttpError(400, "Billing isn't enabled on this deployment.");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
};

const prices = (): Partial<Record<PlanId, string | undefined>> => ({
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
});
const planForPrice = (priceId?: string): PlanId => (Object.entries(prices()).find(([, p]) => p && p === priceId)?.[0] as PlanId) ?? "free";

const appUrl = (req: Request) => process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;

export const billingRouter = express.Router();

billingRouter.post("/billing/checkout", requireRole("owner"), async (req, res, next) => {
  try {
    const plan = req.body?.plan as PlanId;
    const price = prices()[plan];
    if (!price) throw new HttpError(400, "Unknown plan.");
    const a = req.auth!;
    const [w] = await db().query(`SELECT stripe_customer_id FROM workspaces WHERE id=$1`, [a.workspace.id]);
    let customer = w?.stripe_customer_id as string | null;
    if (!customer) {
      customer = (await stripe().customers.create({ email: a.user.email, name: a.workspace.name, metadata: { workspaceId: a.workspace.id } })).id;
      await db().query(`UPDATE workspaces SET stripe_customer_id=$2 WHERE id=$1`, [a.workspace.id, customer]);
    }
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: a.workspace.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl(req)}/?billing=success`,
      cancel_url: `${appUrl(req)}/?billing=cancelled`,
      subscription_data: { metadata: { workspaceId: a.workspace.id } },
    });
    await audit(req, "billing.checkout_started", plan);
    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

billingRouter.post("/billing/portal", requireRole("owner"), async (req, res, next) => {
  try {
    const [w] = await db().query(`SELECT stripe_customer_id FROM workspaces WHERE id=$1`, [req.auth!.workspace.id]);
    if (!w?.stripe_customer_id) throw new HttpError(400, "No billing account yet — choose a plan first.");
    const s = await stripe().billingPortal.sessions.create({ customer: w.stripe_customer_id as string, return_url: `${appUrl(req)}/` });
    res.json({ url: s.url });
  } catch (e) {
    next(e);
  }
});

async function applySubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const plan = active ? planForPrice(item?.price.id) : "free";
  // current_period_end lives on the item in newer API versions, on the subscription in older ones.
  const end = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const rows = await db().query(
    `UPDATE workspaces SET plan=$2, stripe_subscription_id=$3, subscription_status=$4, current_period_end=$5
     WHERE stripe_customer_id=$1 OR id=$6 RETURNING id`,
    [customer, plan, sub.id, sub.status, end ? new Date(end * 1000) : null, sub.metadata?.workspaceId ?? null],
  );
  for (const r of rows) await audit(null, "billing.subscription_updated", sub.id, { plan, status: sub.status }, r.id as string);
}

/** Must be mounted with express.raw() — the signature covers the exact bytes. */
export async function stripeWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !billingEnabled()) return void res.status(400).send("Billing not configured");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(req.body as Buffer, req.get("stripe-signature") ?? "", secret);
  } catch (e) {
    return void res.status(400).send(`Webhook signature verification failed: ${(e as Error).message}`);
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.client_reference_id && s.customer) {
          await db().query(`UPDATE workspaces SET stripe_customer_id=$2 WHERE id=$1`, [s.client_reference_id, typeof s.customer === "string" ? s.customer : s.customer.id]);
        }
        if (s.subscription) await applySubscription(await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e);
    res.status(500).send("Webhook handler error");
  }
}
