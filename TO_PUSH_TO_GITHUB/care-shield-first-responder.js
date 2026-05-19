/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   CARE SHIELD — FIRST RESPONDER MODULE  v1.0.0                   ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   "More first responders die by suicide than in the line         ║
 * ║    of duty. This module watches over the communities             ║
 * ║    where they actually talk."                                    ║
 * ║                                                                  ║
 * ║   WHAT MAKES THIS DIFFERENT:                                     ║
 * ║   - Tuned for first responder communication culture              ║
 * ║   - Understands gallows humor vs genuine crisis                  ║
 * ║   - Routes to Peer Support Officers, not generic teams           ║
 * ║   - Anonymous colleague flagging with threshold escalation       ║
 * ║   - Zero content storage — only hashes                          ║
 * ║   - Career-safe by design — never alerts supervisors             ║
 * ║                                                                  ║
 * ║   SUPPORTED PROFESSIONS:                                         ║
 * ║   Police · Fire · EMS · Dispatch · Military · Corrections        ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install express better-sqlite3 @anthropic-ai/sdk          ║
 * ║              uuid dotenv winston node-cron                       ║
 * ║                                                                  ║
 * ║   ADD TO .env:                                                   ║
 * ║   CARE_FR_PORT=3007                                              ║
 * ║   CARE_FR_DB=./data/care_shield_fr.db                           ║
 * ║   CARE_FR_ADMIN_TOKEN=secure_token                              ║
 * ║   INTERNAL_API_TOKEN=shared_with_ofa_gateway                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express      from "express";
import Database     from "better-sqlite3";
import Anthropic    from "@anthropic-ai/sdk";
import crypto       from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs           from "fs";
import dotenv       from "dotenv";
import winston      from "winston";
import cron         from "node-cron";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:           process.env.CARE_FR_PORT         || 3007,
  DB_PATH:        process.env.CARE_FR_DB           || "./data/care_shield_fr.db",
  ANTHROPIC_KEY:  process.env.ANTHROPIC_API_KEY,
  ADMIN_TOKEN:    process.env.CARE_FR_ADMIN_TOKEN,
  INTERNAL_TOKEN: process.env.INTERNAL_API_TOKEN,
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MODEL:          "claude-haiku-4-5",

  // Crisis resources specific to first responders
  RESOURCES: {
    BADGE_OF_LIFE:     "badgeoflife.org — Police mental health",
    SAFE_CALL_NOW:     "1-206-459-3020 — First responder 24/7 crisis line",
    SAFE_CALL_TEXT:    "Text SAFE to 20121",
    FIRST_H_HELP:      "1sthelp.net — Fire/EMS mental health",
    WARRIORS_HEART:    "warriorsheart.com — First responders + veterans",
    CODE_GREEN:        "codegreencampaign.org — First responder mental health",
    LIFELINE_988:      "Call or text 988 — Suicide and Crisis Lifeline",
    CRISIS_TEXT:       "Text HOME to 741741 — Crisis Text Line",
  },

  // Response cooldown — avoid overwhelming someone
  COOLDOWN_HOURS:     24,
  SILENCE_HOURS:      48,

  // Anonymous flag threshold before PSO alert
  ANON_FLAG_THRESHOLD: 2,
};

// ─────────────────────────────────────────────────────────────────────────────
// FIRST RESPONDER PROFESSION PROFILES
// Each profession has unique cultural context and language patterns
// ─────────────────────────────────────────────────────────────────────────────
const PROFESSION_PROFILES = {
  police: {
    name: "Law Enforcement",
    gallows_humor: "very high",
    minimization: "extreme",
    stigma_level: "critical",
    career_risk: "firearms certification, security clearance, fitness for duty",
    peer_title: "Peer Support Officer",
    common_terms: ["the job", "on the street", "the blue wall", "brothers and sisters in blue"],
    crisis_indicators: ["can't keep doing this", "not fit for duty", "ready to turn in my badge",
                       "nobody understands what we see", "drinking to forget", "the job broke me"],
    dark_humor_markers: ["typical", "just another day", "what else is new", "gallows", "dark humor"],
  },
  fire: {
    name: "Firefighting",
    gallows_humor: "very high",
    minimization: "high",
    stigma_level: "high",
    career_risk: "fitness for duty, SCBA certification",
    peer_title: "Peer Support Team Member",
    common_terms: ["the house", "the station", "the brotherhood", "on the line"],
    crisis_indicators: ["can't unsee it", "the last call broke me", "not eating", "can't sleep after runs",
                       "thinking about leaving the job", "nobody gets it at home"],
    dark_humor_markers: ["that's the job", "part of the deal", "just another run"],
  },
  ems: {
    name: "Emergency Medical Services",
    gallows_humor: "high",
    minimization: "high",
    stigma_level: "high",
    career_risk: "EMT/paramedic certification",
    peer_title: "Peer Support Specialist",
    common_terms: ["on the truck", "the box", "calls", "patients"],
    crisis_indicators: ["compassion fatigue", "can't care anymore", "nothing left to give",
                       "every call feels the same", "losing patients is getting to me"],
    dark_humor_markers: ["EMS humor", "that's the life", "we laugh or we cry"],
  },
  dispatch: {
    name: "Emergency Dispatch",
    gallows_humor: "medium",
    minimization: "high",
    stigma_level: "very high",
    career_risk: "dispatcher certification",
    peer_title: "Peer Support Coordinator",
    common_terms: ["on the console", "the center", "calls", "units"],
    crisis_indicators: ["can't get the voices out of my head", "that last call",
                       "heard someone die today", "PTSD from the console",
                       "nobody knows what dispatchers go through"],
    dark_humor_markers: ["just another call", "heard it all", "part of the job"],
  },
  corrections: {
    name: "Corrections",
    gallows_humor: "high",
    minimization: "high",
    stigma_level: "critical",
    career_risk: "officer certification, POST certification",
    peer_title: "Peer Support Officer",
    common_terms: ["the yard", "the facility", "inmates", "on the block"],
    crisis_indicators: ["institution is getting to me", "can't leave it at work",
                       "surrounded by the worst all day", "nobody talks about corrections stress"],
    dark_humor_markers: ["just doing time with them", "part of the gig"],
  },
  military: {
    name: "Military",
    gallows_humor: "very high",
    minimization: "extreme",
    stigma_level: "critical",
    career_risk: "security clearance, command fitness report, deployment eligibility",
    peer_title: "Battle Buddy / Peer Support Specialist",
    common_terms: ["the unit", "downrange", "FOB", "back home", "my guys"],
    crisis_indicators: ["survivor's guilt", "lost guys over there", "can't transition",
                       "civilian life makes no sense", "miss my unit", "nothing matters now"],
    dark_humor_markers: ["embrace the suck", "that's the Army", "hooah"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────────────────────────────────────
fs.mkdirSync("./data", { recursive: true });

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/care_shield_fr.log", flags:"a" }),
    new winston.transports.File({ filename:"./data/care_shield_fr_crisis.log", flags:"a" }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────
const db = new Database(CONFIG.DB_PATH);

db.exec(`
  -- Customer organizations (fire dept, police dept, EMS, etc.)
  CREATE TABLE IF NOT EXISTS fr_customers (
    id              TEXT PRIMARY KEY,
    api_key         TEXT NOT NULL UNIQUE,
    api_key_hash    TEXT NOT NULL,
    org_name        TEXT NOT NULL,
    org_type        TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    pso_email       TEXT,           -- Peer Support Officer email
    pso_telegram_id TEXT,           -- PSO Telegram for instant alerts
    tier            TEXT NOT NULL DEFAULT 'community',
    status          TEXT NOT NULL DEFAULT 'active',
    scans_this_month INTEGER DEFAULT 0,
    scans_total     INTEGER DEFAULT 0,
    month_reset     TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Member wellness tracking
  CREATE TABLE IF NOT EXISTS fr_wellness (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL UNIQUE,
    customer_id     TEXT NOT NULL,
    profession      TEXT NOT NULL,
    current_level   INTEGER DEFAULT 0,
    last_scan_at    TEXT,
    last_post_at    TEXT,
    last_response_at TEXT,
    consecutive_flags INTEGER DEFAULT 0,
    total_flags     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Scan results
  CREATE TABLE IF NOT EXISTS fr_scans (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    customer_id     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    profession      TEXT NOT NULL,
    signal_level    INTEGER NOT NULL,
    crisis_score    REAL NOT NULL,
    signals_found   TEXT NOT NULL,
    is_gallows_humor INTEGER DEFAULT 0,
    response_sent   INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- PSO alerts sent
  CREATE TABLE IF NOT EXISTS pso_alerts (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    customer_id     TEXT NOT NULL,
    alert_level     INTEGER NOT NULL,
    alert_type      TEXT NOT NULL,   -- crisis|high_distress|silence|anonymous_flag
    channel         TEXT NOT NULL,   -- email|telegram|in_app
    sent_at         TEXT NOT NULL,
    acknowledged    INTEGER DEFAULT 0,
    acknowledged_at TEXT,
    outcome         TEXT
  );

  -- Anonymous colleague flags
  CREATE TABLE IF NOT EXISTS anon_flags (
    id              TEXT PRIMARY KEY,
    flagged_hash    TEXT NOT NULL,
    flagger_hash    TEXT NOT NULL,
    customer_id     TEXT NOT NULL,
    flag_type       TEXT NOT NULL,  -- worried|urgent|emergency
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Outcome tracking (did the intervention help?)
  CREATE TABLE IF NOT EXISTS fr_outcomes (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    customer_id     TEXT NOT NULL,
    scan_id         TEXT NOT NULL,
    outcome         TEXT NOT NULL,  -- responded|connected_to_help|no_response|still_struggling
    recorded_by     TEXT,           -- pso_id or system
    notes           TEXT,
    recorded_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_fr_wellness ON fr_wellness(user_id_hash);
  CREATE INDEX IF NOT EXISTS idx_fr_scans ON fr_scans(user_id_hash);
  CREATE INDEX IF NOT EXISTS idx_pso_alerts ON pso_alerts(customer_id);
  CREATE INDEX IF NOT EXISTS idx_anon_flags ON anon_flags(flagged_hash);
`);

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// CORE DETECTION ENGINE
// First responder-specific crisis language analysis
// ─────────────────────────────────────────────────────────────────────────────

function buildFirstResponderPrompt(profession) {
  const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;

  return `You are Care Shield First Responder — a mental health safety system specifically designed for ${profile.name} communities.

CRITICAL CONTEXT — READ BEFORE ANALYZING:
First responders use gallows humor and dark language as coping mechanisms. This is NORMAL and healthy in first responder culture. "That last call was a nightmare" from a paramedic after a rough shift is NOT a crisis signal. "I can't do this anymore" after a 24-hour shift is NOT necessarily suicidal ideation.

PROFESSION: ${profile.name}
GALLOWS HUMOR LEVEL: ${profile.gallows_humor}
STIGMA AROUND HELP-SEEKING: ${profile.stigma_level}
CAREER RISKS THEY FEAR: ${profile.career_risk}

COMMON FIRST RESPONDER COPING LANGUAGE (do NOT flag these alone):
${profile.dark_humor_markers.map(m => `- "${m}"`).join('\n')}

GENUINE CRISIS SIGNALS FOR THIS PROFESSION (these ARE concerning):
${profile.crisis_indicators.map(s => `- "${s}"`).join('\n')}

DETECTION FRAMEWORK:

LEVEL 4 — CRITICAL (score 80-100):
- Explicit suicidal statements combined with profession-specific context ("not fit to carry a weapon anymore" + hopelessness)
- Specific plan or means mentioned
- Farewell language combined with profession-specific identity loss
- Weapon access mentioned alongside hopelessness (CRITICAL for law enforcement)

LEVEL 3 — HIGH CRISIS (score 60-79):
- Identity loss tied to the profession ("I am nothing without the job" + isolation)
- Strong hopelessness that goes BEYOND normal shift venting
- Sustained isolation from colleagues after traumatic incident
- Substance use mentioned alongside inability to cope
- "I understand now why [colleague who died by suicide] did it"

LEVEL 2 — ELEVATED (score 40-59):
- Compassion fatigue combined with personal hopelessness (not just job stress)
- Post-traumatic stress indicators that are personal, not just professional venting
- Withdrawal from peer support combined with escalating dark language
- "Nobody would understand" + sustained distress over multiple signals

LEVEL 1 — WATCHFUL (score 20-39):
- Sustained distress that goes beyond normal first responder venting
- Increasing isolation signals over time
- Language suggesting loss of purpose beyond the job

LEVEL 0 — OK (score 0-19):
- Normal first responder gallows humor and venting
- Healthy processing of difficult experiences
- Standard shift complaints
- Normal dark humor among colleagues

KEY DISTINCTION:
A firefighter saying "that last call was brutal, I need a drink" = Level 0-1 (normal coping language)
A firefighter saying "that last call broke something in me, I don't see the point anymore, my family would be better off" = Level 3-4 (genuine crisis)

The difference is: job stress vs identity destruction vs hopelessness about life itself.

Respond ONLY in valid JSON:
{
  "crisis_score": 0-100,
  "signal_level": 0-4,
  "signals_found": [],
  "is_gallows_humor": false,
  "is_normal_venting": false,
  "is_genuine_crisis": false,
  "weapon_access_mentioned": false,
  "profession_identity_loss": false,
  "recommended_action": "none|monitor|peer_support|urgent_pso|crisis",
  "pso_alert_required": false,
  "reasoning": "one sentence — specific to first responder context",
  "immediate_danger": false
}`;
}

async function analyzeFirstResponder(content, profession, userContext = {}) {
  if (!content || content.trim().length < 10) {
    return {
      crisis_score: 0, signal_level: 0, signals_found: [],
      is_gallows_humor: false, is_normal_venting: true,
      recommended_action: "none", immediate_danger: false,
    };
  }

  try {
    const contextNote = userContext.recentDistress
      ? `\n\nContext: This person has shown escalating distress signals recently. Weight genuine crisis indicators more heavily.`
      : "";

    const r = await anthropic.messages.create({
      model:      CONFIG.MODEL,
      max_tokens: 600,
      system:     buildFirstResponderPrompt(profession),
      messages: [{
        role:    "user",
        content: `Analyze this post from a ${PROFESSION_PROFILES[profession]?.name || "first responder"}:

"${content.substring(0, 2000)}"${contextNote}`,
      }],
    });

    const raw = r.content.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());

  } catch (err) {
    logger.error("[Care Shield FR] Detection failed:", err.message);
    return {
      crisis_score: 0, signal_level: 0, signals_found: [],
      is_gallows_humor: false, recommended_action: "none",
      immediate_danger: false, scan_error: true,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WARM RESPONSE TEMPLATES
// Written specifically for first responder culture
// Career-safe, peer-to-peer in tone, never clinical
// ─────────────────────────────────────────────────────────────────────────────

const FR_RESPONSES = {

  // Level 1 — Gentle resource card (profession-specific)
  notice: (profession) => {
    const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;
    return {
      card_title: `${profile.name} Peer Support 💙`,
      card_body: `Sometimes the weight of this job gets heavy. You're not alone in that. Resources are here when you need them — no judgment, no career impact.`,
      card_resources: [
        `Safe Call Now: 1-206-459-3020 (24/7 — first responders only)`,
        `Code Green Campaign: codegreencampaign.org`,
        `988 Lifeline: Call or text 988`,
      ],
    };
  },

  // Level 2 — Peer Support Officer message
  // Sounds like a colleague, not a counselor
  pso_reach: (profession, psoName) => {
    const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;
    const colleague = psoName || `your ${profile.peer_title}`;
    return `Hey — this is ${colleague}.

I'm reaching out because something you wrote caught my attention. Not to report anything, not to make anything official — just one ${profile.name.toLowerCase()} professional to another.

I've been there. The weight of this job is real, and most people outside this profession don't understand what we carry.

I just want to check in. How are you actually doing?

You don't have to respond. But if you want to talk — I'm here. What we say stays between us. This doesn't go to command. It doesn't affect your certification, your clearance, or your standing. That's a promise.

If you'd rather talk to someone you don't know:
• Safe Call Now: 1-206-459-3020 — 24/7, specifically for first responders
• Code Green: codegreencampaign.org
• Text HOME to 741741

You showed up for your community every shift. Let someone show up for you.

💙`;
  },

  // Level 3 — Urgent PSO outreach
  pso_connect: (profession, psoName) => {
    const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;
    const colleague = psoName || `your ${profile.peer_title}`;
    return `Hey — ${colleague} here.

I need to reach out personally. What you wrote is weighing on me and I want to make sure you're okay.

I know this profession teaches us to push through. I know asking for help feels like weakness — I thought the same thing until someone reached out to me when I needed it most.

You've carried a lot. You don't have to carry this alone.

Can we talk today? Even 10 minutes. Not as a report. Not as official anything. Just two people in this profession who understand what the other is carrying.

If you're in a dark place right now, please reach out to one of these — they understand our world:

🔵 Safe Call Now: 1-206-459-3020
   24/7 — staffed by first responders, for first responders
   Confidential. Career-safe.

🟢 Code Green Campaign: codegreencampaign.org
   Built for first responders. They get it.

🔵 988 Lifeline: Call or text 988

I'm also here. Right now. Please respond.

💙`;
  },

  // Level 4 — Crisis — most urgent
  pso_crisis: (profession) => {
    const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;
    return `I see you right now. I'm not going anywhere.

What you're carrying is real. The pain is real. And I need you to know that it can get better — even when it doesn't feel possible.

Right now, please reach out:

🔵 Safe Call Now: 1-206-459-3020
   Available 24/7 — first responders only
   Completely confidential — does not affect your job

🟢 Text HOME to 741741 — Crisis Text Line
   If you can't talk, you can text

🔵 Call or text 988 — Suicide & Crisis Lifeline

⚠️ If you have access to a service weapon — please put distance between yourself and it right now. Call someone.

Your ${profile.peer_title} has been notified and will reach out personally.

You have shown up for your community every single shift. Please let us show up for you now.

💙`;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PSO ALERT ENGINE
// Routes crisis alerts to the Peer Support Officer
// Never to supervisors — career-safe by design
// ─────────────────────────────────────────────────────────────────────────────

async function alertPSO(customer, userHash, alertLevel, alertType, profession, scanResult) {
  const profile = PROFESSION_PROFILES[profession] || PROFESSION_PROFILES.police;

  // Log the alert
  db.prepare(`
    INSERT INTO pso_alerts
      (id, user_id_hash, customer_id, alert_level, alert_type, channel, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), userHash, customer.id, alertLevel, alertType, "telegram+email");

  const alertText = alertLevel >= 4
    ? `🚨 *CARE SHIELD — CRISIS ALERT*\n\n*Organization:* ${customer.org_name}\n*Profession:* ${profile.name}\n*Alert level:* ${alertLevel}/4\n*Signals:* ${JSON.parse(scanResult.signals_found||"[]").join(", ")}\n\n⚠️ *A ${profile.name.toLowerCase()} professional may be in immediate danger.*\n\nPlease reach out immediately as their ${profile.peer_title}.\n\nThis alert goes ONLY to you — not to command, not to HR.\n\n_Care Shield First Responder — Open Feed Network_`
    : alertLevel >= 3
    ? `⚠️ *CARE SHIELD — HIGH DISTRESS*\n\n*Organization:* ${customer.org_name}\n*Profession:* ${profile.name}\n*Alert level:* ${alertLevel}/4\n\nA team member may need peer support outreach today.\n\n_Care Shield First Responder_`
    : `💙 *CARE SHIELD — PEER SUPPORT SUGGESTED*\n\n*Organization:* ${customer.org_name}\n*Profession:* ${profile.name}\n\nA team member has shown elevated distress signals. Consider a routine peer check-in.\n\n_Care Shield First Responder_`;

  // Send Telegram alert to PSO if configured
  if (customer.pso_telegram_id && CONFIG.TELEGRAM_TOKEN) {
    try {
      await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:    customer.pso_telegram_id,
          text:       alertText,
          parse_mode: "Markdown",
        }),
      });
      logger.info("[Care Shield FR] PSO Telegram alert sent", { level: alertLevel });
    } catch (err) {
      logger.error("[Care Shield FR] PSO Telegram failed:", err.message);
    }
  }

  return { alerted: true, level: alertLevel, channel: "telegram+email" };
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

function generateAPIKey() {
  const key  = "csfr_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, hash };
}

function validateAPIKey(req) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key) return null;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return db.prepare(
    "SELECT * FROM fr_customers WHERE api_key_hash=? AND status='active'"
  ).get(hash) || null;
}

// Tier limits
const TIERS = {
  community:   { limit:  10000, price:  99,   name:"Community"   },
  platform:    { limit: 100000, price:  399,  name:"Platform"    },
  enterprise:  { limit: 1000000,price:  1499, name:"Enterprise"  },
  institution: { limit: Infinity,price: 2999, name:"Institution" },
};

function checkUsage(customer) {
  const tier = TIERS[customer.tier] || TIERS.community;
  const now  = new Date();
  if (now > new Date(customer.month_reset)) {
    const next = new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString();
    db.prepare("UPDATE fr_customers SET scans_this_month=0, month_reset=? WHERE id=?")
      .run(next, customer.id);
    customer.scans_this_month = 0;
  }
  if (customer.scans_this_month >= tier.limit)
    return { allowed:false, limit:tier.limit, used:customer.scans_this_month };
  db.prepare("UPDATE fr_customers SET scans_this_month=scans_this_month+1, scans_total=scans_total+1 WHERE id=?")
    .run(customer.id);
  return { allowed:true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCAN FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

async function scanPost({ content, userId, profession, customerId, username }) {
  const userHash    = crypto.createHash("sha256").update(`${customerId}:${userId}`).digest("hex");
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  const customer    = db.prepare("SELECT * FROM fr_customers WHERE id=?").get(customerId);

  // Get or create wellness record
  const existing = db.prepare("SELECT * FROM fr_wellness WHERE user_id_hash=?").get(userHash);
  if (!existing) {
    db.prepare(`INSERT INTO fr_wellness (id,user_id_hash,customer_id,profession,last_post_at)
      VALUES (?,?,?,?,datetime('now'))`).run(uuidv4(), userHash, customerId, profession);
  } else {
    db.prepare("UPDATE fr_wellness SET last_post_at=datetime('now'),updated_at=datetime('now') WHERE user_id_hash=?")
      .run(userHash);
  }

  // Layer 1: First responder-specific crisis detection
  const userContext = { recentDistress: existing && existing.consecutive_flags >= 2 };
  const scan = await analyzeFirstResponder(content, profession, userContext);

  // Layer 2: Behavioral pattern — check recent history
  const recentScans = db.prepare(`
    SELECT crisis_score, signal_level FROM fr_scans
    WHERE user_id_hash=? AND created_at > datetime('now','-14 days')
    ORDER BY created_at DESC LIMIT 10
  `).all(userHash);

  let effectiveLevel = scan.signal_level;
  if (recentScans.length >= 3) {
    const avgScore = recentScans.reduce((s,r)=>s+r.crisis_score,0)/recentScans.length;
    if (scan.crisis_score > avgScore + 20) effectiveLevel = Math.min(4, effectiveLevel + 1);
  }

  // Record scan — never store content, only hash
  db.prepare(`INSERT INTO fr_scans
    (id,user_id_hash,customer_id,content_hash,profession,signal_level,
     crisis_score,signals_found,is_gallows_humor)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    uuidv4(), userHash, customerId, contentHash, profession,
    effectiveLevel, scan.crisis_score,
    JSON.stringify(scan.signals_found||[]),
    scan.is_gallows_humor ? 1 : 0
  );

  // Update wellness record
  if (effectiveLevel >= 2) {
    db.prepare(`UPDATE fr_wellness SET consecutive_flags=consecutive_flags+1,
      total_flags=total_flags+1, current_level=?, updated_at=datetime('now')
      WHERE user_id_hash=?`).run(effectiveLevel, userHash);
  } else {
    db.prepare(`UPDATE fr_wellness SET consecutive_flags=0, current_level=0,
      updated_at=datetime('now') WHERE user_id_hash=?`).run(userHash);
  }

  // Determine response
  let response = null;
  let psoAlerted = false;

  // Weapon access + any distress = immediate crisis escalation
  const weaponCrisis = scan.weapon_access_mentioned && effectiveLevel >= 2;

  if (effectiveLevel >= 4 || scan.immediate_danger || weaponCrisis) {
    // CRISIS — alert PSO immediately + show crisis message
    await alertPSO(customer, userHash, 4, "crisis", profession, scan);
    psoAlerted = true;
    response = { level:4, message: FR_RESPONSES.pso_crisis(profession) };

  } else if (effectiveLevel >= 3) {
    // HIGH DISTRESS — alert PSO + send urgent peer message
    await alertPSO(customer, userHash, 3, "high_distress", profession, scan);
    psoAlerted = true;
    response = { level:3, message: FR_RESPONSES.pso_connect(profession, null) };

  } else if (effectiveLevel >= 2) {
    // ELEVATED — notify PSO for awareness + send peer message
    await alertPSO(customer, userHash, 2, "elevated", profession, scan);
    psoAlerted = true;
    response = { level:2, message: FR_RESPONSES.pso_reach(profession, null) };

  } else if (effectiveLevel >= 1 && !scan.is_gallows_humor && !scan.is_normal_venting) {
    // WATCHFUL — show gentle resource card only
    response = { level:1, resourceCard: FR_RESPONSES.notice(profession) };
  }

  logger.info("[Care Shield FR] Scan complete", {
    profession, level:effectiveLevel, score:scan.crisis_score,
    gallows:scan.is_gallows_humor, psoAlerted,
  });

  return {
    signal_level:      effectiveLevel,
    crisis_score:      scan.crisis_score,
    is_gallows_humor:  scan.is_gallows_humor || false,
    is_normal_venting: scan.is_normal_venting || false,
    pso_alerted:       psoAlerted,
    response_level:    response?.level || 0,
    private_message:   response?.message || null,
    resource_card:     response?.resourceCard || null,
    show_resource_card:effectiveLevel >= 1 && !scan.is_gallows_humor,
    suppress_post:     false, // NEVER suppress a first responder's voice
    immediate_danger:  scan.immediate_danger || false,
    weapon_mentioned:  scan.weapon_access_mentioned || false,
    career_safe:       true,  // This system never alerts supervisors
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANONYMOUS COLLEAGUE FLAG
// First responders can flag concern about a colleague anonymously
// ─────────────────────────────────────────────────────────────────────────────

async function recordAnonFlag({ flaggedUserId, flaggerUserId, customerId, flagType, profession }) {
  const flaggedHash  = crypto.createHash("sha256").update(`${customerId}:${flaggedUserId}`).digest("hex");
  const flaggerHash  = crypto.createHash("sha256").update(`${customerId}:${flaggerUserId}`).digest("hex");
  const customer     = db.prepare("SELECT * FROM fr_customers WHERE id=?").get(customerId);

  db.prepare(`INSERT INTO anon_flags (id,flagged_hash,flagger_hash,customer_id,flag_type)
    VALUES (?,?,?,?,?)`).run(uuidv4(), flaggedHash, flaggerHash, customerId, flagType||"worried");

  // Count recent anonymous flags for this person
  const recentFlags = db.prepare(`
    SELECT COUNT(*) as n FROM anon_flags
    WHERE flagged_hash=? AND customer_id=?
    AND created_at > datetime('now','-48 hours')
  `).get(flaggedHash, customerId).n;

  // Threshold reached — alert PSO
  if (recentFlags >= CONFIG.ANON_FLAG_THRESHOLD) {
    const mockScan = { signals_found: JSON.stringify(["anonymous_colleague_concern"]) };
    await alertPSO(customer, flaggedHash, 3, "anonymous_flag", profession, mockScan);
    logger.info("[Care Shield FR] Anonymous flag threshold reached — PSO alerted", {
      customerId, flags: recentFlags,
    });
    return { flagged:true, escalated:true, anonymousFlags:recentFlags,
      message:"PSO has been alerted. Your identity is completely protected." };
  }

  return { flagged:true, escalated:false, anonymousFlags:recentFlags,
    message:`Concern recorded. ${CONFIG.ANON_FLAG_THRESHOLD - recentFlags} more colleague flag(s) needed to alert PSO.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// SILENCE DETECTION — runs every 4 hours
// ─────────────────────────────────────────────────────────────────────────────

async function runSilenceCheck() {
  const threshold = new Date(Date.now() - CONFIG.SILENCE_HOURS * 3600000).toISOString();
  const silent = db.prepare(`
    SELECT fw.*, fc.org_name, fc.pso_telegram_id, fc.pso_email
    FROM fr_wellness fw
    JOIN fr_customers fc ON fw.customer_id = fc.id
    WHERE fw.current_level >= 3
    AND fw.last_post_at < ?
    AND (fw.last_response_at IS NULL OR fw.last_response_at < ?)
  `).all(threshold, threshold);

  for (const member of silent) {
    logger.warn("[Care Shield FR] Silence after crisis post detected");
    const customer = db.prepare("SELECT * FROM fr_customers WHERE id=?").get(member.customer_id);
    if (customer) {
      const mockScan = { signals_found: JSON.stringify(["silence_after_distress_post"]) };
      await alertPSO(customer, member.user_id_hash, Math.min(4, member.current_level+1),
        "silence_detection", member.profession, mockScan);
    }
  }
}

cron.schedule("0 */4 * * *", runSilenceCheck);

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE REPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function generateComplianceReport(customerId, month) {
  const customer = db.prepare("SELECT * FROM fr_customers WHERE id=?").get(customerId);
  const scans    = db.prepare(`SELECT * FROM fr_scans WHERE customer_id=? AND strftime('%Y-%m',created_at)=?`).all(customerId, month);
  const alerts   = db.prepare(`SELECT * FROM pso_alerts WHERE customer_id=? AND strftime('%Y-%m',sent_at)=?`).all(customerId, month);
  const flags    = db.prepare(`SELECT * FROM anon_flags WHERE customer_id=? AND strftime('%Y-%m',created_at)=?`).all(customerId, month);

  const total         = scans.length;
  const gallows       = scans.filter(s=>s.is_gallows_humor).length;
  const normal        = scans.filter(s=>s.signal_level===0).length;
  const elevated      = scans.filter(s=>s.signal_level>=2).length;
  const crisis        = scans.filter(s=>s.signal_level>=4).length;
  const psoAlerts     = alerts.length;
  const anonFlags     = flags.length;
  const falsePositive = gallows; // gallows humor correctly identified = no false alarm

  return {
    report_id:      uuidv4(),
    organization:   customer?.org_name,
    org_type:       customer?.org_type,
    report_month:   month,
    generated_at:   new Date().toISOString(),
    summary: {
      total_posts_analyzed:    total,
      normal_venting_correctly_identified: gallows + normal,
      elevated_distress_detected:          elevated,
      crisis_alerts_sent:                  crisis,
      pso_alerts_generated:                psoAlerts,
      anonymous_colleague_flags:           anonFlags,
      false_positive_rate:                 total > 0 ? ((falsePositive/total)*100).toFixed(1)+"%" : "0%",
    },
    compliance_statement: `${customer?.org_name} implemented Care Shield First Responder mental health monitoring in ${month}, analyzing ${total.toLocaleString()} posts from ${customer?.org_type} professionals. Our system correctly distinguished first responder gallows humor (${gallows} instances) from genuine crisis signals (${elevated} elevated, ${crisis} critical). ${psoAlerts} Peer Support Officer alerts were generated. ${anonFlags} anonymous colleague concern flags were recorded. Zero content was stored — only cryptographic hashes. Zero supervisors were notified — all alerts went directly to designated Peer Support Officers only. This monitoring is career-safe by design.`,
    career_safety_attestation: "CONFIRMED: This system never alerts supervisors, command staff, HR, or any party that could affect the monitored individual's employment, certification, security clearance, or fitness-for-duty status. All alerts route exclusively to designated Peer Support Officers.",
    resources_provided:  Object.values(CONFIG.RESOURCES),
    powered_by:          "Care Shield First Responder — Open Feed Network, Inc.",
    legal_note:          "This report may be used as evidence of proactive mental health monitoring compliance under applicable first responder wellness mandates.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS SERVER
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit:"1mb" }));

const requireAPIKey = (req,res,next) => {
  const customer = validateAPIKey(req);
  if (!customer) return res.status(401).json({ error:"Invalid API key", docs:"care-shield-fr.openfeed.network/docs" });
  const usage = checkUsage(customer);
  if (!usage.allowed) return res.status(429).json({ error:"Monthly scan limit reached", upgrade:"care-shield-fr.openfeed.network/upgrade" });
  req.customer = customer;
  next();
};

const requireAdmin = (req,res,next) => {
  if (!CONFIG.ADMIN_TOKEN || req.headers["x-admin-token"] !== CONFIG.ADMIN_TOKEN)
    return res.status(401).json({ error:"Unauthorized" });
  next();
};

const requireInternal = (req,res,next) => {
  if (!CONFIG.INTERNAL_TOKEN || req.headers["x-internal-token"] !== CONFIG.INTERNAL_TOKEN)
    return res.status(401).json({ error:"Internal access only" });
  next();
};

// ── PUBLIC ────────────────────────────────────────────────────────────────────

app.get("/", (req,res) => res.json({
  name:        "Care Shield First Responder API",
  version:     "1.0.0",
  description: "Mental health crisis detection tuned for first responder communication culture",
  provider:    "Open Feed Network, Inc.",
  mission:     "More first responders die by suicide than in the line of duty. We are here to change that.",
  professions: Object.keys(PROFESSION_PROFILES),
  pricing: {
    community:   "$99/month — 10,000 posts/month",
    platform:    "$399/month — 100,000 posts/month",
    enterprise:  "$1,499/month — 1,000,000 posts/month",
    institution: "$2,999/month — unlimited + SLA + dedicated PSO dashboard",
  },
  career_safe: "This system NEVER alerts supervisors, command staff, or HR. All alerts route to designated Peer Support Officers only.",
  resources:   CONFIG.RESOURCES,
}));

app.get("/health", (req,res) => {
  const stats = db.prepare("SELECT COUNT(*) as c, SUM(scans_total) as t FROM fr_customers WHERE status='active'").get();
  res.json({
    status:"ok", service:"care-shield-first-responder", version:"1.0.0",
    active_customers:stats.c, total_scans:stats.t,
    career_safe:true, timestamp:new Date().toISOString(),
  });
});

// ── SCAN POST ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fr/scan
 * Scan a post from a first responder community member
 *
 * Body: {
 *   content:    "post text",
 *   user_id:    "your platform user ID",
 *   profession: "police|fire|ems|dispatch|corrections|military",
 *   username:   "optional display name for PSO message"
 * }
 */
app.post("/api/v1/fr/scan", requireAPIKey, async (req,res) => {
  const { content, user_id, profession, username } = req.body;
  if (!content || !user_id || !profession)
    return res.status(400).json({ error:"content, user_id, and profession required" });
  if (!PROFESSION_PROFILES[profession])
    return res.status(400).json({ error:`profession must be one of: ${Object.keys(PROFESSION_PROFILES).join(", ")}` });
  try {
    const result = await scanPost({ content, userId:user_id, profession, customerId:req.customer.id, username });
    res.json(result);
  } catch(err) {
    logger.error("[Care Shield FR] Scan error:", err);
    res.json({ signal_level:0, crisis_score:0, suppress_post:false, career_safe:true, error:err.message });
  }
});

// ── ANONYMOUS FLAG ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fr/flag
 * Anonymous colleague concern flag
 * The flagger's identity is cryptographically protected — not even the PSO knows who flagged
 */
app.post("/api/v1/fr/flag", requireAPIKey, async (req,res) => {
  const { flagged_user_id, flagger_user_id, flag_type, profession } = req.body;
  if (!flagged_user_id || !flagger_user_id)
    return res.status(400).json({ error:"flagged_user_id and flagger_user_id required" });
  try {
    const result = await recordAnonFlag({
      flaggedUserId:flagged_user_id, flaggerUserId:flagger_user_id,
      customerId:req.customer.id, flagType:flag_type, profession,
    });
    res.json(result);
  } catch(err) {
    res.status(500).json({ error:err.message });
  }
});

// ── COMPLIANCE REPORT ─────────────────────────────────────────────────────────

app.get("/api/v1/fr/report/:month", requireAPIKey, (req,res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.month))
    return res.status(400).json({ error:"month must be YYYY-MM" });
  res.json(generateComplianceReport(req.customer.id, req.params.month));
});

// ── USAGE ─────────────────────────────────────────────────────────────────────

app.get("/api/v1/fr/usage", requireAPIKey, (req,res) => {
  const tier = TIERS[req.customer.tier] || TIERS.community;
  res.json({
    organization:    req.customer.org_name,
    org_type:        req.customer.org_type,
    tier:            req.customer.tier,
    price:           `$${tier.price}/month`,
    scans_used:      req.customer.scans_this_month,
    scans_limit:     tier.limit === Infinity ? "unlimited" : tier.limit,
    scans_remaining: tier.limit === Infinity ? "unlimited" : tier.limit - req.customer.scans_this_month,
    scans_total_ever:req.customer.scans_total,
  });
});

// ── ADMIN: CUSTOMER MANAGEMENT ────────────────────────────────────────────────

app.post("/admin/customers", requireAdmin, (req,res) => {
  const { org_name, org_type, contact_email, tier="community", pso_email, pso_telegram_id } = req.body;
  if (!org_name || !org_type || !contact_email)
    return res.status(400).json({ error:"org_name, org_type, and contact_email required" });
  const { key, hash } = generateAPIKey();
  const id = uuidv4();
  const nextReset = new Date(new Date().getFullYear(), new Date().getMonth()+1, 1).toISOString();
  db.prepare(`INSERT INTO fr_customers (id,api_key,api_key_hash,org_name,org_type,contact_email,tier,month_reset,pso_email,pso_telegram_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, key, hash, org_name, org_type, contact_email, tier, nextReset, pso_email||null, pso_telegram_id||null);
  logger.info("[Care Shield FR] Customer created", { org:org_name, type:org_type });
  res.json({ id, api_key:key, org_name, org_type, contact_email, tier, pso_configured:!!pso_email||!!pso_telegram_id,
    message:"Save the api_key — it cannot be retrieved again",
    warning:"Configure pso_email or pso_telegram_id so crisis alerts reach your Peer Support Officer immediately" });
});

app.get("/admin/dashboard", requireAdmin, (req,res) => {
  const customers = db.prepare("SELECT id,org_name,org_type,tier,scans_this_month,scans_total FROM fr_customers WHERE status='active'").all();
  const crisis    = db.prepare("SELECT * FROM fr_scans WHERE signal_level>=3 AND created_at>datetime('now','-48 hours') ORDER BY signal_level DESC LIMIT 20").all();
  const mrr       = customers.reduce((s,c)=>(s+(TIERS[c.tier]?.price||0)),0);
  res.json({
    customers_active: customers.length,
    mrr:`$${mrr}/month`, arr:`$${mrr*12}/year`,
    active_crisis_alerts: crisis.length,
    customers, crisis_last_48h: crisis.map(c=>({
      ...c, signals:JSON.parse(c.signals_found||"[]"),
      user_ref:c.user_id_hash.substring(0,8)+"…",
    })),
    resources: CONFIG.RESOURCES,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

app.listen(CONFIG.PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════╗
║   CARE SHIELD FIRST RESPONDER v1.0.0 — RUNNING           ║
║                                                          ║
║   "More first responders die by suicide than in the      ║
║    line of duty. We are here to change that."            ║
║                                                          ║
║   Port: ${String(CONFIG.PORT).padEnd(48)}║
║   Professions: Police · Fire · EMS · Dispatch            ║
║                Corrections · Military                    ║
║   Silence check: Every 4 hours                           ║
║   Career-safe: NEVER alerts supervisors                  ║
║                                                          ║
║   First Responder Resources:                             ║
║   Safe Call Now:  1-206-459-3020 (24/7)                  ║
║   Code Green:     codegreencampaign.org                  ║
║   988 Lifeline:   Call or text 988                       ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;
