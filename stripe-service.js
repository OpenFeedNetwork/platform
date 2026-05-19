/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   STRIPE SERVICE  v1.0.0                                         ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Handles: API subscriptions, webhook events, key provisioning   ║
 * ║                                                                  ║
 * ║   REQUIRED ENV VARS:                                             ║
 * ║   STRIPE_SECRET_KEY=sk_live_xxx                                  ║
 * ║   STRIPE_WEBHOOK_SECRET=whsec_xxx                                ║
 * ║   STRIPE_PRICE_TRUTH_SHIELD_STARTER=price_xxx                   ║
 * ║   STRIPE_PRICE_GUARDIAN_STARTER=price_xxx                       ║
 * ║   STRIPE_PRICE_CARE_SHIELD_STARTER=price_xxx                    ║
 * ║   STRIPE_PRICE_CARE_FR_STARTER=price_xxx                        ║
 * ║   STRIPE_PRICE_TERRORISM_STARTER=price_xxx                      ║
 * ║                                                                  ║
 * ║   SETUP:                                                         ║
 * ║   npm install stripe                                             ║
 * ║   Create products + prices in Stripe dashboard                   ║
 * ║   Set webhook endpoint: POST /api/v1/stripe/webhook             ║
 * ║   Events to listen: customer.subscription.created,              ║
 * ║     customer.subscription.deleted, invoice.payment_failed       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import Stripe from "stripe";
import express from "express";
import { generateApiKey, revokeApiKey, getKeyByCustomer } from "./api-key-service.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// ── PRODUCT & PRICE CONFIGURATION ────────────────────────────────────────────
// Map API products to Stripe Price IDs and plan limits
// Create these in your Stripe dashboard first, then set env vars

export const PRODUCTS = {
  truth_shield: {
    name: "Truth Shield API",
    description: "AI-powered disinformation detection",
    plans: {
      starter:    { price_env: "STRIPE_PRICE_TRUTH_SHIELD_STARTER",    scans: 10000,    price_usd: 29 },
      growth:     { price_env: "STRIPE_PRICE_TRUTH_SHIELD_GROWTH",     scans: 100000,   price_usd: 99 },
      platform:   { price_env: "STRIPE_PRICE_TRUTH_SHIELD_PLATFORM",   scans: 1000000,  price_usd: 299 },
      enterprise: { price_env: "STRIPE_PRICE_TRUTH_SHIELD_ENTERPRISE", scans: Infinity, price_usd: 999 },
    },
  },
  guardian_shield: {
    name: "Guardian Shield API",
    description: "7-layer child protection — COPPA/KOSA/GDPR-K",
    plans: {
      starter:    { price_env: "STRIPE_PRICE_GUARDIAN_STARTER",    scans: 10000,    price_usd: 79.99 },
      growth:     { price_env: "STRIPE_PRICE_GUARDIAN_GROWTH",     scans: 100000,   price_usd: 299 },
      platform:   { price_env: "STRIPE_PRICE_GUARDIAN_PLATFORM",   scans: 1000000,  price_usd: 999 },
      enterprise: { price_env: "STRIPE_PRICE_GUARDIAN_ENTERPRISE", scans: Infinity, price_usd: 2999 },
    },
  },
  care_shield: {
    name: "Care Shield API",
    description: "Mental health crisis detection",
    plans: {
      starter:    { price_env: "STRIPE_PRICE_CARE_STARTER",    scans: 10000,    price_usd: 99 },
      growth:     { price_env: "STRIPE_PRICE_CARE_GROWTH",     scans: 100000,   price_usd: 299 },
      platform:   { price_env: "STRIPE_PRICE_CARE_PLATFORM",   scans: 1000000,  price_usd: 999 },
      enterprise: { price_env: "STRIPE_PRICE_CARE_ENTERPRISE", scans: Infinity, price_usd: 2999 },
    },
  },
  care_shield_fr: {
    name: "Care Shield FR API",
    description: "First responder mental health monitoring",
    plans: {
      starter:    { price_env: "STRIPE_PRICE_CARE_FR_STARTER",    scans: 10000,    price_usd: 99 },
      growth:     { price_env: "STRIPE_PRICE_CARE_FR_GROWTH",     scans: 100000,   price_usd: 299 },
      platform:   { price_env: "STRIPE_PRICE_CARE_FR_PLATFORM",   scans: 1000000,  price_usd: 999 },
      enterprise: { price_env: "STRIPE_PRICE_CARE_FR_ENTERPRISE", scans: Infinity, price_usd: 2999 },
    },
  },
  terrorism_shield: {
    name: "Terrorism Shield API",
    description: "4-layer terrorism detection with GIFCT hash matching",
    plans: {
      developer:  { price_env: "STRIPE_PRICE_TERRORISM_DEVELOPER",  scans: 10000,    price_usd: 99 },
      starter:    { price_env: "STRIPE_PRICE_TERRORISM_STARTER",    scans: 100000,   price_usd: 299 },
      growth:     { price_env: "STRIPE_PRICE_TERRORISM_GROWTH",     scans: 1000000,  price_usd: 999 },
      enterprise: { price_env: "STRIPE_PRICE_TERRORISM_ENTERPRISE", scans: Infinity, price_usd: 2999 },
    },
  },
};

// ── CHECKOUT SESSION ──────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for API subscription
 * @param {Object} params
 * @param {string} params.product   - Product key from PRODUCTS
 * @param {string} params.plan      - Plan key (starter, growth, etc.)
 * @param {string} params.email     - Customer email
 * @param {string} params.successUrl - Redirect URL on success
 * @param {string} params.cancelUrl  - Redirect URL on cancel
 */
export async function createCheckoutSession({ product, plan, email, successUrl, cancelUrl }) {
  const productConfig = PRODUCTS[product];
  if (!productConfig) throw new Error(`Unknown product: ${product}`);

  const planConfig = productConfig.plans[plan];
  if (!planConfig) throw new Error(`Unknown plan: ${plan} for product: ${product}`);

  const priceId = process.env[planConfig.price_env];
  if (!priceId) throw new Error(`Missing env var: ${planConfig.price_env}`);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [{
      price:    priceId,
      quantity: 1,
    }],
    metadata: {
      ofa_product: product,
      ofa_plan:    plan,
      ofa_scans:   String(planConfig.scans),
    },
    subscription_data: {
      metadata: {
        ofa_product: product,
        ofa_plan:    plan,
        ofa_scans:   String(planConfig.scans),
      },
    },
    success_url: successUrl || `${process.env.APP_URL}/dashboard?session={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url:  cancelUrl  || `${process.env.APP_URL}/pricing?status=cancelled`,
    allow_promotion_codes: true,
  });

  logger.info("[Stripe] Checkout session created", {
    session_id: session.id,
    product,
    plan,
    email,
  });

  return {
    session_id:   session.id,
    checkout_url: session.url,
    product:      productConfig.name,
    plan,
    monthly_scans: planConfig.scans,
    price_usd:     planConfig.price_usd,
  };
}

// ── CUSTOMER PORTAL ───────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for subscription management
 */
export async function createPortalSession(customerId) {
  const session = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${process.env.APP_URL}/dashboard`,
  });
  return session.url;
}

// ── WEBHOOK HANDLER ───────────────────────────────────────────────────────────

/**
 * Handle Stripe webhook events
 * Automatically provisions/revokes API keys based on subscription status
 */
export async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error("[Stripe] Webhook signature verification failed:", err.message);
    throw new Error("Invalid webhook signature");
  }

  logger.info("[Stripe] Webhook received", { type: event.type, id: event.id });

  switch (event.type) {

    // ── Subscription created or reactivated ──────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      if (sub.status !== "active") break;

      const product = sub.metadata.ofa_product;
      const plan    = sub.metadata.ofa_plan;
      const scans   = parseInt(sub.metadata.ofa_scans) || 10000;

      if (!product) {
        logger.warn("[Stripe] Subscription missing ofa_product metadata", { sub_id: sub.id });
        break;
      }

      // Check if key already exists for this customer
      const existing = await getKeyByCustomer(sub.customer, product).catch(() => null);
      if (existing) {
        logger.info("[Stripe] API key already exists for customer", {
          customer: sub.customer,
          product,
        });
        break;
      }

      // Generate new API key
      const keyData = await generateApiKey({
        customerId:     sub.customer,
        subscriptionId: sub.id,
        product,
        plan,
        monthlyScans:   scans,
        status:         "active",
      });

      logger.info("[Stripe] API key provisioned", {
        customer:    sub.customer,
        product,
        plan,
        key_prefix:  keyData.key_prefix,
      });
      break;
    }

    // ── Subscription cancelled ────────────────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const product = sub.metadata.ofa_product;

      if (product) {
        await revokeApiKey(sub.customer, product);
        logger.info("[Stripe] API key revoked", {
          customer: sub.customer,
          product,
        });
      }
      break;
    }

    // ── Payment failed ────────────────────────────────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      logger.warn("[Stripe] Payment failed", {
        customer:   invoice.customer,
        invoice_id: invoice.id,
        amount:     invoice.amount_due,
      });
      // Keys remain active during grace period — Stripe handles dunning
      // Key will be revoked when subscription moves to "canceled" status
      break;
    }

    // ── Checkout completed ────────────────────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object;
      logger.info("[Stripe] Checkout completed", {
        customer:    session.customer,
        session_id:  session.id,
        product:     session.metadata?.ofa_product,
      });
      break;
    }

    default:
      logger.info("[Stripe] Unhandled webhook event", { type: event.type });
  }

  return { received: true, event_type: event.type };
}

// ── SUBSCRIPTION LOOKUP ───────────────────────────────────────────────────────

/**
 * Get subscription details for a customer
 */
export async function getSubscription(customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status:   "active",
    limit:    10,
  });

  return subscriptions.data.map(sub => ({
    id:         sub.id,
    product:    sub.metadata.ofa_product,
    plan:       sub.metadata.ofa_plan,
    status:     sub.status,
    scans:      parseInt(sub.metadata.ofa_scans) || 0,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
  }));
}

// ── EXPRESS ROUTER ────────────────────────────────────────────────────────────

export function createStripeRouter() {
  const router = express.Router();

  // POST /api/v1/stripe/checkout — Create checkout session
  router.post("/checkout", async (req, res) => {
    try {
      const { product, plan, email } = req.body;
      if (!product || !plan || !email) {
        return res.status(400).json({ error: "product, plan, and email are required" });
      }

      const session = await createCheckoutSession({
        product, plan, email,
        successUrl: req.body.success_url,
        cancelUrl:  req.body.cancel_url,
      });

      res.json(session);
    } catch (err) {
      logger.error("[Stripe] Checkout error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/v1/stripe/portal — Customer portal
  router.post("/portal", async (req, res) => {
    try {
      const { customer_id } = req.body;
      if (!customer_id) return res.status(400).json({ error: "customer_id required" });

      const url = await createPortalSession(customer_id);
      res.json({ portal_url: url });
    } catch (err) {
      logger.error("[Stripe] Portal error:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/v1/stripe/webhook — Stripe webhook (raw body required)
  router.post("/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const signature = req.headers["stripe-signature"];
        const result = await handleWebhook(req.body, signature);
        res.json(result);
      } catch (err) {
        logger.error("[Stripe] Webhook error:", err.message);
        res.status(400).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/stripe/products — List available products and pricing
  router.get("/products", (req, res) => {
    const available = Object.entries(PRODUCTS).map(([key, product]) => ({
      id:          key,
      name:        product.name,
      description: product.description,
      plans:       Object.entries(product.plans).map(([planKey, plan]) => ({
        id:           planKey,
        price_usd:    plan.price_usd,
        monthly_scans: plan.scans === Infinity ? "Unlimited" : plan.scans.toLocaleString(),
      })),
    }));
    res.json({ products: available });
  });

  return router;
}

export default {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getSubscription,
  createStripeRouter,
  PRODUCTS,
};
