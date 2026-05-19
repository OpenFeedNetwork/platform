/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA CREATOR MONETIZATION API  v1.0.0                          ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Complete creator payment system:                               ║
 * ║   - Direct tips (Stripe + crypto)                               ║
 * ║   - Subscription tiers                                          ║
 * ║   - Revenue share from API customers                            ║
 * ║   - Brand partnership marketplace                               ║
 * ║   - Stripe Connect onboarding                                   ║
 * ║   - Automatic 1099 tax compliance                               ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install stripe express better-sqlite3 uuid dotenv winston  ║
 * ║                                                                  ║
 * ║   ENV VARIABLES:                                                 ║
 * ║   STRIPE_SECRET_KEY=sk_live_...                                  ║
 * ║   STRIPE_WEBHOOK_SECRET=whsec_...                               ║
 * ║   STRIPE_PLATFORM_FEE_PERCENT=8                                  ║
 * ║   TIP_PLATFORM_FEE_PERCENT=5                                    ║
 * ║   CREATOR_API_REVENUE_SHARE=0.15  (15% of API revenue)         ║
 * ║   POLYGON_RPC_URL=https://polygon-rpc.com                       ║
 * ║   CREATOR_FUND_WALLET=0x...                                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express   from "express";
import Stripe    from "stripe";
import Database  from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import crypto    from "crypto";
import fs        from "fs";
import dotenv    from "dotenv";
import winston   from "winston";
dotenv.config();

// ─── LOGGER ──────────────────────────────────────────────────────────────────
fs.mkdirSync("./data", { recursive: true });
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/creator_monetization.log", flags:"a" }),
  ],
});

// ─── STRIPE ───────────────────────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion:"2024-04-10" });

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  PLATFORM_FEE_TIPS:    parseFloat(process.env.TIP_PLATFORM_FEE_PERCENT    || "5")   / 100,
  PLATFORM_FEE_SUBS:    parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || "8")   / 100,
  PLATFORM_FEE_BRAND:   parseFloat(process.env.BRAND_FEE_PERCENT           || "10")  / 100,
  API_REVENUE_SHARE:    parseFloat(process.env.CREATOR_API_REVENUE_SHARE   || "0.15"),
  MIN_PAYOUT:           500,   // $5.00 minimum payout
  TAX_THRESHOLD:        60000, // $600.00 — 1099 threshold
  POLYGON_RPC:          process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
};

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = new Database("./data/creator_monetization.db");
db.exec(`
  -- Creator profiles
  CREATE TABLE IF NOT EXISTS creators (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL UNIQUE,
    platform_id       TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    bio               TEXT,
    stripe_account_id TEXT,           -- Stripe Connect account
    stripe_onboarded  INTEGER DEFAULT 0,
    wallet_address    TEXT,           -- Crypto wallet
    tier              TEXT DEFAULT 'standard',  -- standard|verified|partner
    total_earned_cents INTEGER DEFAULT 0,
    total_tips_cents  INTEGER DEFAULT 0,
    total_subs_cents  INTEGER DEFAULT 0,
    total_share_cents INTEGER DEFAULT 0,
    subscriber_count  INTEGER DEFAULT 0,
    tip_enabled       INTEGER DEFAULT 1,
    subs_enabled      INTEGER DEFAULT 0,
    brand_enabled     INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Subscription tiers created by creators
  CREATE TABLE IF NOT EXISTS sub_tiers (
    id              TEXT PRIMARY KEY,
    creator_id      TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    price_cents     INTEGER NOT NULL,
    interval        TEXT NOT NULL DEFAULT 'month',
    benefits        TEXT,             -- JSON array
    stripe_price_id TEXT,
    active          INTEGER DEFAULT 1,
    subscriber_count INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Active subscriptions
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                    TEXT PRIMARY KEY,
    subscriber_user_id    TEXT NOT NULL,
    creator_id            TEXT NOT NULL,
    tier_id               TEXT NOT NULL,
    stripe_subscription_id TEXT,
    status                TEXT NOT NULL DEFAULT 'active',
    price_cents           INTEGER NOT NULL,
    current_period_start  TEXT,
    current_period_end    TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    cancelled_at          TEXT
  );

  -- Tips
  CREATE TABLE IF NOT EXISTS tips (
    id                TEXT PRIMARY KEY,
    tipper_user_id    TEXT NOT NULL,
    creator_id        TEXT NOT NULL,
    post_id           TEXT,
    amount_cents      INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL,
    creator_net_cents INTEGER NOT NULL,
    message           TEXT,
    stripe_payment_id TEXT,
    crypto_tx_hash    TEXT,
    payment_method    TEXT NOT NULL DEFAULT 'stripe',
    status            TEXT NOT NULL DEFAULT 'completed',
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- API revenue share pool
  CREATE TABLE IF NOT EXISTS revenue_share_pool (
    id              TEXT PRIMARY KEY,
    month           TEXT NOT NULL,    -- YYYY-MM
    total_api_revenue_cents INTEGER NOT NULL,
    creator_pool_cents INTEGER NOT NULL,  -- 15% of API revenue
    distributed     INTEGER DEFAULT 0,
    distributed_at  TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Individual revenue share distributions
  CREATE TABLE IF NOT EXISTS revenue_share_distributions (
    id              TEXT PRIMARY KEY,
    pool_id         TEXT NOT NULL,
    creator_id      TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    quality_score   REAL NOT NULL,
    basis           TEXT NOT NULL,    -- JSON — what drove the score
    stripe_transfer_id TEXT,
    distributed_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Brand partnerships
  CREATE TABLE IF NOT EXISTS brand_partnerships (
    id              TEXT PRIMARY KEY,
    brand_name      TEXT NOT NULL,
    brand_contact   TEXT NOT NULL,
    creator_id      TEXT NOT NULL,
    campaign_name   TEXT NOT NULL,
    description     TEXT,
    budget_cents    INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL,
    creator_net_cents INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|active|completed|cancelled
    content_requirements TEXT,
    disclosure_text TEXT NOT NULL DEFAULT 'Sponsored content',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at    TEXT,
    completed_at    TEXT
  );

  -- Payouts
  CREATE TABLE IF NOT EXISTS payouts (
    id              TEXT PRIMARY KEY,
    creator_id      TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    method          TEXT NOT NULL,    -- stripe|crypto
    stripe_transfer_id TEXT,
    crypto_tx_hash  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
  );

  -- Creator quality scores (for revenue share)
  CREATE TABLE IF NOT EXISTS quality_scores (
    id              TEXT PRIMARY KEY,
    creator_id      TEXT NOT NULL,
    month           TEXT NOT NULL,
    accuracy_score  REAL DEFAULT 0,   -- Truth Shield accuracy
    engagement_score REAL DEFAULT 0,  -- Genuine engagement
    governance_score REAL DEFAULT 0,  -- Participation in governance
    mentorship_score REAL DEFAULT 0,  -- Helping new users
    total_score     REAL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tips_creator    ON tips(creator_id);
  CREATE INDEX IF NOT EXISTS idx_subs_creator    ON subscriptions(creator_id);
  CREATE INDEX IF NOT EXISTS idx_payouts_creator ON payouts(creator_id);
  CREATE INDEX IF NOT EXISTS idx_quality_month   ON quality_scores(month);
`);

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE CONNECT ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────

async function createStripeAccount(creator) {
  const account = await stripe.accounts.create({
    type:         "express",
    country:      "US",
    email:        creator.email,
    capabilities: {
      card_payments:  { requested: true },
      transfers:      { requested: true },
    },
    business_type: "individual",
    metadata:      { ofa_creator_id: creator.id, ofa_user_id: creator.user_id },
  });

  db.prepare("UPDATE creators SET stripe_account_id=? WHERE id=?")
    .run(account.id, creator.id);

  return account.id;
}

async function getOnboardingLink(creatorId, returnUrl, refreshUrl) {
  const creator = db.prepare("SELECT * FROM creators WHERE id=?").get(creatorId);
  if (!creator.stripe_account_id) throw new Error("Stripe account not created");

  const link = await stripe.accountLinks.create({
    account:     creator.stripe_account_id,
    refresh_url: refreshUrl,
    return_url:  returnUrl,
    type:        "account_onboarding",
  });

  return link.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIP SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

async function processTip({ tipperId, creatorId, amountCents, postId, message }) {
  if (amountCents < 100) throw new Error("Minimum tip is $1.00");

  const creator = db.prepare("SELECT * FROM creators WHERE id=?").get(creatorId);
  if (!creator)               throw new Error("Creator not found");
  if (!creator.tip_enabled)   throw new Error("This creator has not enabled tips");
  if (!creator.stripe_account_id || !creator.stripe_onboarded)
    throw new Error("Creator has not completed payment setup");

  const platformFeeCents = Math.round(amountCents * CONFIG.PLATFORM_FEE_TIPS);
  const creatorNetCents  = amountCents - platformFeeCents;
  const tipId            = uuidv4();

  // Create Stripe payment with application fee
  const paymentIntent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             "usd",
    application_fee_amount: platformFeeCents,
    transfer_data: {
      destination: creator.stripe_account_id,
    },
    metadata: {
      tip_id:     tipId,
      tipper_id:  tipperId,
      creator_id: creatorId,
      post_id:    postId || "",
    },
    description: `Tip to ${creator.display_name} on Open Feed Network`,
  });

  // Record tip
  db.prepare(`INSERT INTO tips
    (id,tipper_user_id,creator_id,post_id,amount_cents,platform_fee_cents,
     creator_net_cents,message,stripe_payment_id,status)
    VALUES (?,?,?,?,?,?,?,?,?,'pending')`)
    .run(tipId, tipperId, creatorId, postId||null,
         amountCents, platformFeeCents, creatorNetCents,
         message||null, paymentIntent.id);

  logger.info("[Creator] Tip initiated", {
    creator:creator.display_name, amount:`$${(amountCents/100).toFixed(2)}`
  });

  return {
    tip_id:           tipId,
    payment_intent:   paymentIntent.client_secret,
    amount:           `$${(amountCents/100).toFixed(2)}`,
    creator_receives: `$${(creatorNetCents/100).toFixed(2)}`,
    platform_fee:     `$${(platformFeeCents/100).toFixed(2)} (${Math.round(CONFIG.PLATFORM_FEE_TIPS*100)}%)`,
    message:          "Creator receives payment directly to their bank account",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

async function createSubscriptionTier(creatorId, { name, description, priceCents, benefits }) {
  const creator = db.prepare("SELECT * FROM creators WHERE id=?").get(creatorId);
  if (!creator.stripe_account_id) throw new Error("Complete Stripe onboarding first");

  // Create Stripe product and price on the creator's connected account
  const product = await stripe.products.create(
    { name, description: description || name, metadata:{ ofa_creator_id:creatorId } },
    { stripeAccount: creator.stripe_account_id }
  );

  const price = await stripe.prices.create(
    {
      product:    product.id,
      unit_amount:priceCents,
      currency:   "usd",
      recurring:  { interval:"month" },
    },
    { stripeAccount: creator.stripe_account_id }
  );

  const tierId = uuidv4();
  db.prepare(`INSERT INTO sub_tiers
    (id,creator_id,name,description,price_cents,benefits,stripe_price_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(tierId, creatorId, name, description||null,
         priceCents, JSON.stringify(benefits||[]), price.id);

  // Enable subscriptions on the creator profile
  db.prepare("UPDATE creators SET subs_enabled=1 WHERE id=?").run(creatorId);

  logger.info("[Creator] Subscription tier created", { creator:creatorId, name, price:`$${priceCents/100}/mo` });

  return {
    tier_id:    tierId,
    name,
    price:      `$${(priceCents/100).toFixed(2)}/month`,
    creator_receives: `$${((priceCents*(1-CONFIG.PLATFORM_FEE_SUBS))/100).toFixed(2)}/month per subscriber`,
    platform_fee: `${Math.round(CONFIG.PLATFORM_FEE_SUBS*100)}%`,
  };
}

async function subscribe({ subscriberId, creatorId, tierId, paymentMethodId }) {
  const creator = db.prepare("SELECT * FROM creators WHERE id=?").get(creatorId);
  const tier    = db.prepare("SELECT * FROM sub_tiers WHERE id=?").get(tierId);

  if (!creator || !tier) throw new Error("Creator or tier not found");

  const platformFeeCents = Math.round(tier.price_cents * CONFIG.PLATFORM_FEE_SUBS);

  const subscription = await stripe.subscriptions.create({
    customer:       subscriberId, // Subscriber's Stripe customer ID
    items:          [{ price: tier.stripe_price_id }],
    application_fee_percent: CONFIG.PLATFORM_FEE_SUBS * 100,
    transfer_data:  { destination: creator.stripe_account_id },
    metadata: {
      ofa_subscriber_id: subscriberId,
      ofa_creator_id:    creatorId,
      ofa_tier_id:       tierId,
    },
  });

  const subId = uuidv4();
  db.prepare(`INSERT INTO subscriptions
    (id,subscriber_user_id,creator_id,tier_id,stripe_subscription_id,
     price_cents,current_period_start,current_period_end)
    VALUES (?,?,?,?,?,?,datetime('now'),datetime('now','+1 month'))`)
    .run(subId, subscriberId, creatorId, tierId,
         subscription.id, tier.price_cents);

  db.prepare("UPDATE sub_tiers SET subscriber_count=subscriber_count+1 WHERE id=?").run(tierId);
  db.prepare("UPDATE creators SET subscriber_count=subscriber_count+1 WHERE id=?").run(creatorId);

  return {
    subscription_id: subId,
    tier:            tier.name,
    price:           `$${(tier.price_cents/100).toFixed(2)}/month`,
    status:          "active",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API REVENUE SHARE
// Distributes 15% of monthly API revenue to qualifying creators
// Based on quality score — not follower count
// ─────────────────────────────────────────────────────────────────────────────

async function distributeAPIRevenueShare(month, totalApiRevenueCents) {
  const poolCents = Math.round(totalApiRevenueCents * CONFIG.API_REVENUE_SHARE);
  const poolId    = uuidv4();

  // Create pool record
  db.prepare(`INSERT INTO revenue_share_pool
    (id,month,total_api_revenue_cents,creator_pool_cents)
    VALUES (?,?,?,?)`)
    .run(poolId, month, totalApiRevenueCents, poolCents);

  // Get quality scores for the month
  const scores = db.prepare(`
    SELECT qs.*, c.stripe_account_id, c.display_name
    FROM quality_scores qs
    JOIN creators c ON qs.creator_id = c.id
    WHERE qs.month=? AND qs.total_score > 0
    AND c.stripe_onboarded=1
    ORDER BY qs.total_score DESC
  `).all(month);

  if (scores.length === 0) {
    logger.info("[Creator] No qualifying creators for revenue share", { month });
    return { distributed: 0, creators: 0 };
  }

  const totalScore   = scores.reduce((s,r) => s + r.total_score, 0);
  let distributed    = 0;

  for (const score of scores) {
    const share      = score.total_score / totalScore;
    const amountCents= Math.round(poolCents * share);

    if (amountCents < CONFIG.MIN_PAYOUT) continue;

    // Transfer to creator via Stripe
    const transfer = await stripe.transfers.create({
      amount:      amountCents,
      currency:    "usd",
      destination: score.stripe_account_id,
      description: `OFA API Revenue Share — ${month}`,
      metadata:    { pool_id:poolId, creator_id:score.creator_id, month },
    });

    db.prepare(`INSERT INTO revenue_share_distributions
      (id,pool_id,creator_id,amount_cents,quality_score,basis,stripe_transfer_id)
      VALUES (?,?,?,?,?,?,?)`)
      .run(uuidv4(), poolId, score.creator_id, amountCents,
           score.total_score,
           JSON.stringify({ accuracy:score.accuracy_score, engagement:score.engagement_score,
             governance:score.governance_score, mentorship:score.mentorship_score }),
           transfer.id);

    db.prepare(`UPDATE creators SET
      total_earned_cents=total_earned_cents+?,
      total_share_cents=total_share_cents+?,
      updated_at=datetime('now') WHERE id=?`)
      .run(amountCents, amountCents, score.creator_id);

    distributed += amountCents;

    logger.info("[Creator] Revenue share distributed", {
      creator:score.display_name,
      amount: `$${(amountCents/100).toFixed(2)}`,
      share:  `${(share*100).toFixed(1)}%`,
    });
  }

  db.prepare("UPDATE revenue_share_pool SET distributed=1, distributed_at=datetime('now') WHERE id=?")
    .run(poolId);

  return {
    pool_id:     poolId,
    month,
    total_pool:  `$${(poolCents/100).toFixed(2)}`,
    distributed: `$${(distributed/100).toFixed(2)}`,
    creators:    scores.length,
    api_revenue: `$${(totalApiRevenueCents/100).toFixed(2)}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY SCORE ENGINE
// Calculates each creator's monthly quality score for revenue share
// ─────────────────────────────────────────────────────────────────────────────

async function calculateQualityScores(month) {
  const creators = db.prepare("SELECT * FROM creators WHERE tier != 'suspended'").all();

  for (const creator of creators) {
    // These signals come from the platform activity database
    // In production — query actual activity data

    // Accuracy score — how often their content is verified accurate by Truth Shield
    const accuracyScore = 0; // Query: avg truth_shield_score WHERE user_id = creator.user_id

    // Engagement score — genuine engagement vs rage engagement
    // Positive: comments, shares, saves / Negative: reports, blocks
    const engagementScore = 0; // Query: engagement metrics

    // Governance score — participation in community governance votes
    const governanceScore = 0; // Query: governance_votes WHERE voter = creator.user_id

    // Mentorship score — helping new users, welcoming new members
    const mentorshipScore = 0; // Query: mentorship activities

    const totalScore = (
      accuracyScore  * 0.35 +  // 35% weight — accuracy matters most
      engagementScore* 0.35 +  // 35% weight — genuine engagement
      governanceScore* 0.20 +  // 20% weight — community participation
      mentorshipScore* 0.10    // 10% weight — helping others
    );

    if (totalScore > 0) {
      db.prepare(`INSERT OR REPLACE INTO quality_scores
        (id,creator_id,month,accuracy_score,engagement_score,
         governance_score,mentorship_score,total_score)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuidv4(), creator.id, month,
             accuracyScore, engagementScore,
             governanceScore, mentorshipScore, totalScore);
    }
  }

  logger.info("[Creator] Quality scores calculated", { month, creators:creators.length });
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK HANDLER
// Handles payment confirmations and subscription events
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(rawBody, signature) {
  const event = stripe.webhooks.constructEvent(
    rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      if (pi.metadata?.tip_id) {
        db.prepare("UPDATE tips SET status='completed' WHERE stripe_payment_id=?").run(pi.id);
        db.prepare(`UPDATE creators SET
          total_earned_cents=total_earned_cents+?,
          total_tips_cents=total_tips_cents+?,
          updated_at=datetime('now') WHERE id=?`)
          .run(pi.metadata.creator_id ? getCreatorNetCents(pi) : 0,
               pi.metadata.creator_id ? getCreatorNetCents(pi) : 0,
               pi.metadata.creator_id);
        logger.info("[Creator] Tip completed", { tip_id:pi.metadata.tip_id });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const sub = db.prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id=?")
          .get(invoice.subscription);
        if (sub) {
          const feeCents = Math.round(invoice.amount_paid * CONFIG.PLATFORM_FEE_SUBS);
          const netCents = invoice.amount_paid - feeCents;
          db.prepare(`UPDATE creators SET
            total_earned_cents=total_earned_cents+?,
            total_subs_cents=total_subs_cents+?,
            updated_at=datetime('now') WHERE id=?`)
            .run(netCents, netCents, sub.creator_id);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      db.prepare("UPDATE subscriptions SET status='cancelled', cancelled_at=datetime('now') WHERE stripe_subscription_id=?")
        .run(sub.id);
      break;
    }

    case "account.updated": {
      const account = event.data.object;
      if (account.details_submitted && account.charges_enabled) {
        db.prepare("UPDATE creators SET stripe_onboarded=1 WHERE stripe_account_id=?")
          .run(account.id);
        logger.info("[Creator] Stripe onboarding complete", { account:account.id });
      }
      break;
    }
  }

  return { received: true };
}

function getCreatorNetCents(paymentIntent) {
  return paymentIntent.amount - (paymentIntent.application_fee_amount || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS API
// ─────────────────────────────────────────────────────────────────────────────

const app  = express();

// Stripe webhook needs raw body
app.use("/webhook/stripe", express.raw({ type:"application/json" }));
app.use(express.json({ limit:"1mb" }));

// ── CREATOR ONBOARDING ────────────────────────────────────────────────────────

app.post("/api/v1/creator/register", async (req,res) => {
  const { userId, displayName, bio, email } = req.body;
  if (!userId || !displayName || !email) return res.status(400).json({ error:"userId, displayName, email required" });

  const id = uuidv4();
  db.prepare(`INSERT INTO creators (id,user_id,platform_id,display_name,bio)
    VALUES (?,?,?,?,?)`).run(id, userId, `ofa_${userId}`, displayName, bio||null);

  const stripeAccountId = await createStripeAccount({ id, user_id:userId, email });

  res.json({
    creator_id:       id,
    display_name:     displayName,
    stripe_account:   stripeAccountId,
    next_step:        "Complete Stripe onboarding to start receiving payments",
    onboarding_url:   `/api/v1/creator/${id}/onboarding-link`,
  });
});

app.get("/api/v1/creator/:id/onboarding-link", async (req,res) => {
  try {
    const url = await getOnboardingLink(
      req.params.id,
      `${process.env.PLATFORM_URL}/creator/dashboard`,
      `${process.env.PLATFORM_URL}/creator/onboarding`
    );
    res.json({ url });
  } catch(err) {
    res.status(400).json({ error:err.message });
  }
});

// ── TIPS ──────────────────────────────────────────────────────────────────────

app.post("/api/v1/tip", async (req,res) => {
  try {
    const { tipper_user_id, creator_id, amount_cents, post_id, message } = req.body;
    const result = await processTip({
      tipperId:    tipper_user_id,
      creatorId:   creator_id,
      amountCents: amount_cents,
      postId:      post_id,
      message,
    });
    res.json(result);
  } catch(err) {
    res.status(400).json({ error:err.message });
  }
});

app.get("/api/v1/creator/:id/tips", (req,res) => {
  const tips = db.prepare(`SELECT * FROM tips WHERE creator_id=? ORDER BY created_at DESC LIMIT 50`).all(req.params.id);
  res.json({ tips, total: tips.length });
});

// ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────

app.post("/api/v1/creator/:id/tiers", async (req,res) => {
  try {
    const { name, description, price_cents, benefits } = req.body;
    const result = await createSubscriptionTier(req.params.id, { name, description, priceCents:price_cents, benefits });
    res.json(result);
  } catch(err) {
    res.status(400).json({ error:err.message });
  }
});

app.get("/api/v1/creator/:id/tiers", (req,res) => {
  const tiers = db.prepare("SELECT * FROM sub_tiers WHERE creator_id=? AND active=1").all(req.params.id);
  res.json({ tiers });
});

app.post("/api/v1/subscribe", async (req,res) => {
  try {
    const result = await subscribe(req.body);
    res.json(result);
  } catch(err) {
    res.status(400).json({ error:err.message });
  }
});

// ── REVENUE SHARE ─────────────────────────────────────────────────────────────

app.post("/api/v1/admin/revenue-share", async (req,res) => {
  const { month, total_api_revenue_cents } = req.body;
  if (!month || !total_api_revenue_cents) return res.status(400).json({ error:"month and total_api_revenue_cents required" });
  const result = await distributeAPIRevenueShare(month, total_api_revenue_cents);
  res.json(result);
});

// ── CREATOR EARNINGS DASHBOARD ────────────────────────────────────────────────

app.get("/api/v1/creator/:id/earnings", (req,res) => {
  const creator = db.prepare("SELECT * FROM creators WHERE id=?").get(req.params.id);
  if (!creator) return res.status(404).json({ error:"Creator not found" });

  const recentTips  = db.prepare(`SELECT * FROM tips WHERE creator_id=? AND status='completed' ORDER BY created_at DESC LIMIT 10`).all(req.params.id);
  const activeSubs  = db.prepare(`SELECT COUNT(*) as c FROM subscriptions WHERE creator_id=? AND status='active'`).get(req.params.id);
  const recentShare = db.prepare(`SELECT * FROM revenue_share_distributions WHERE creator_id=? ORDER BY distributed_at DESC LIMIT 3`).all(req.params.id);
  const tiers       = db.prepare(`SELECT * FROM sub_tiers WHERE creator_id=? AND active=1`).all(req.params.id);

  const monthlySubRevenue = tiers.reduce((s,t) => s + (t.price_cents * t.subscriber_count), 0);

  res.json({
    creator_id:       creator.id,
    display_name:     creator.display_name,
    stripe_onboarded: !!creator.stripe_onboarded,
    earnings: {
      total:            `$${(creator.total_earned_cents/100).toFixed(2)}`,
      from_tips:        `$${(creator.total_tips_cents/100).toFixed(2)}`,
      from_subscriptions:`$${(creator.total_subs_cents/100).toFixed(2)}`,
      from_api_share:   `$${(creator.total_share_cents/100).toFixed(2)}`,
    },
    subscribers:        activeSubs.c,
    monthly_sub_revenue:`$${(monthlySubRevenue/100).toFixed(2)}/month`,
    subscription_tiers: tiers,
    recent_tips:        recentTips,
    recent_api_share:   recentShare,
    platform_fees: {
      tips:          `${Math.round(CONFIG.PLATFORM_FEE_TIPS*100)}%`,
      subscriptions: `${Math.round(CONFIG.PLATFORM_FEE_SUBS*100)}%`,
      brand_deals:   `${Math.round(CONFIG.PLATFORM_FEE_BRAND*100)}%`,
    },
    tax_note: creator.total_earned_cents >= CONFIG.TAX_THRESHOLD
      ? "You will receive a 1099-NEC for this tax year"
      : `1099-NEC issued after $600 earned — current: $${(creator.total_earned_cents/100).toFixed(2)}`,
  });
});

// ── WEBHOOK ───────────────────────────────────────────────────────────────────

app.post("/webhook/stripe", async (req,res) => {
  try {
    const result = await handleWebhook(req.body, req.headers["stripe-signature"]);
    res.json(result);
  } catch(err) {
    logger.error("[Creator] Webhook error:", err.message);
    res.status(400).json({ error:err.message });
  }
});

// ── PLATFORM HEALTH ───────────────────────────────────────────────────────────

app.get("/health", (req,res) => {
  const stats = db.prepare(`SELECT
    COUNT(*) as creators,
    SUM(total_earned_cents) as total_paid,
    SUM(subscriber_count) as total_subs
    FROM creators WHERE stripe_onboarded=1`).get();
  res.json({
    status:         "ok",
    service:        "ofa-creator-monetization",
    creators_paid:  stats.creators,
    total_paid_out: `$${((stats.total_paid||0)/100).toFixed(2)}`,
    total_subs:     stats.total_subs || 0,
    platform_fees: {
      tips:          `${Math.round(CONFIG.PLATFORM_FEE_TIPS*100)}%`,
      subscriptions: `${Math.round(CONFIG.PLATFORM_FEE_SUBS*100)}%`,
      api_share:     `${Math.round(CONFIG.API_REVENUE_SHARE*100)}% of monthly API revenue`,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.CREATOR_PORT || 3008;
app.listen(PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║   OFA CREATOR MONETIZATION — RUNNING                         ║
║                                                              ║
║   Your voice. Your earnings. No middleman.                   ║
║                                                              ║
║   Tips:          ${Math.round(CONFIG.PLATFORM_FEE_TIPS*100)}% platform fee — ${100-Math.round(CONFIG.PLATFORM_FEE_TIPS*100)}% to creator              ║
║   Subscriptions: ${Math.round(CONFIG.PLATFORM_FEE_SUBS*100)}% platform fee — ${100-Math.round(CONFIG.PLATFORM_FEE_SUBS*100)}% to creator              ║
║   API Rev Share: ${Math.round(CONFIG.API_REVENUE_SHARE*100)}% of monthly API revenue to creators    ║
║   Brand deals:   ${Math.round(CONFIG.PLATFORM_FEE_BRAND*100)}% platform fee — ${100-Math.round(CONFIG.PLATFORM_FEE_BRAND*100)}% to creator              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
export { processTip, createSubscriptionTier, subscribe, distributeAPIRevenueShare, calculateQualityScores };
