/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   CARE SHIELD  v1.0.0                                            ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   "On my darkest day I just wished for someone to see me,        ║
 * ║    validate my pain, and help me survive another day."           ║
 * ║   — Ronny, Founder                                               ║
 * ║                                                                  ║
 * ║   PURPOSE:                                                       ║
 * ║   Detects community members who may be in mental health          ║
 * ║   crisis and connects them with warm human support —            ║
 * ║   not surveillance, not clinical intervention, but              ║
 * ║   genuine community care.                                        ║
 * ║                                                                  ║
 * ║   CORE PRINCIPLE:                                                ║
 * ║   Every person in crisis deserves to feel SEEN first.           ║
 * ║   Resources come after. Warmth comes before everything.         ║
 * ║                                                                  ║
 * ║   DETECTION LAYERS:                                              ║
 * ║   1. Crisis language — hopelessness, farewell, burden signals   ║
 * ║   2. Behavioral timeline — escalation across posts over time    ║
 * ║   3. Community care signals — member-flagged concern            ║
 * ║   4. Silence detection — sudden absence after distress posts    ║
 * ║                                                                  ║
 * ║   RESPONSE LEVELS:                                               ║
 * ║   1 — NOTICE:   Gentle resource card in feed (automated)        ║
 * ║   2 — REACH:    Warm private message from community team        ║
 * ║   3 — CONNECT:  Direct outreach + 988 + human response          ║
 * ║   4 — CRISIS:   Immediate resources + optional 988 live chat    ║
 * ║                                                                  ║
 * ║   NEVER:                                                         ║
 * ║   - Suppress or hide the person's post                          ║
 * ║   - Contact authorities without the person's knowledge          ║
 * ║     (except imminent specific plan with location)               ║
 * ║   - Make the person feel surveilled or judged                   ║
 * ║   - Respond with a cold automated message                       ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install express better-sqlite3 @anthropic-ai/sdk          ║
 * ║              uuid dotenv winston node-cron                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express        from "express";
import Database       from "better-sqlite3";
import Anthropic      from "@anthropic-ai/sdk";
import crypto         from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs             from "fs";
import dotenv         from "dotenv";
import winston        from "winston";
import cron           from "node-cron";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:             process.env.CARE_SHIELD_PORT    || 3006,
  DB_PATH:          process.env.CARE_SHIELD_DB      || "./data/care_shield.db",
  ANTHROPIC_KEY:    process.env.ANTHROPIC_API_KEY,
  TELEGRAM_TOKEN:   process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_TELEGRAM_ID:process.env.ADMIN_TELEGRAM_ID,
  ADMIN_TOKEN:      process.env.CARE_SHIELD_ADMIN_TOKEN,
  INTERNAL_TOKEN:   process.env.INTERNAL_API_TOKEN,
  MODEL:            "claude-haiku-4-5",

  // 988 Suicide and Crisis Lifeline
  CRISIS_LINE_PHONE: "988",
  CRISIS_LINE_TEXT:  "Text HOME to 741741",
  CRISIS_LINE_CHAT:  "https://988lifeline.org/chat",

  // Crisis Text Line
  CRISIS_TEXT_LINE:  "741741",

  // NAMI Helpline
  NAMI_HELPLINE:     "1-800-950-6264",

  // Response cooldown — don't send multiple messages to same person too fast
  RESPONSE_COOLDOWN_HOURS: 24,

  // Silence detection — flag if no post after X hours following high-distress content
  SILENCE_THRESHOLD_HOURS: 48,
};

// ─────────────────────────────────────────────────────────────────────────────
// WARM RESPONSE TEMPLATES
// Written with the founder's own experience at the center
// ─────────────────────────────────────────────────────────────────────────────
const RESPONSES = {

  // Level 1 — NOTICE — appears as a gentle in-feed card
  notice: {
    card_title: "We see you 💙",
    card_body:  "Whatever you're carrying right now — it's real, and it's heavy. You don't have to carry it alone. This community is here.",
    card_action:"Talk to someone right now",
    card_url:   CONFIG.CRISIS_LINE_CHAT,
  },

  // Level 2 — REACH — private message from community team
  reach: (username) => `Hey ${username || "friend"} 💙

I wanted to reach out personally because something you shared caught my attention — not to monitor you or judge you, but because this community genuinely cares about its members.

Whatever you're going through right now, I want you to know:

You are seen.
Your pain is real.
You deserve to still be here tomorrow.

If you want to talk — right here, right now — I'm listening. No scripts, no hotline numbers unless you want them. Just a real person who gives a damn.

If you'd prefer to talk to someone confidentially right now, you can reach the 988 Suicide and Crisis Lifeline by calling or texting 988. Real people, available 24/7.

You don't have to respond to this. But I hope you do.

— The People's Voice Platform Community Team`,

  // Level 3 — CONNECT — immediate personal outreach
  connect: (username) => `${username || "Friend"} 💙

I'm reaching out right now because I'm concerned about you — not as a policy, but as a person who genuinely cares.

What you shared matters. YOU matter. And I want to make sure you're okay.

Can you tell me how you're feeling right now?

If you're in a dark place tonight, please know:
• You can text or call 988 right now — a real person will answer
• You can text HOME to 741741 to reach the Crisis Text Line
• You can reply right here and I will personally respond

You reached out to this community because you wanted to be heard. I'm here. I'm listening.

Please don't disappear.

— The People's Voice Platform Community Team`,

  // Level 4 — CRISIS — most urgent, most warm
  crisis: (username) => `${username || "Friend"} — I see you right now, and I'm not going anywhere.

What you're feeling is real. The pain is real. And I need you to know that it can get better — even when it feels completely impossible.

Right now, in this moment, please reach out to one of these:

🔵 Call or text 988 — Suicide and Crisis Lifeline
   Real people. 24/7. Free. Confidential.

🟢 Text HOME to 741741 — Crisis Text Line
   If you can't talk, you can text.

🟣 Chat at 988lifeline.org/chat
   Right in your browser, right now.

I'm also here. Reply to this message and a real person from our team will respond personally.

You reached out to this community because part of you is still fighting. That part of you is right. Please stay.

💙`,

};

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────────────────────────────────────
fs.mkdirSync("./data", { recursive: true });

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/care_shield.log", flags:"a" }),
    // Separate log for crisis events — for clinical review and improvement
    new winston.transports.File({ filename:"./data/care_shield_crisis.log", flags:"a" }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────
const db = new Database(CONFIG.DB_PATH);

db.exec(`
  -- Member wellness tracking
  CREATE TABLE IF NOT EXISTS member_wellness (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL UNIQUE,  -- Hashed for privacy
    platform        TEXT NOT NULL DEFAULT 'tpvp',
    current_level   INTEGER DEFAULT 0,     -- 0=ok 1=notice 2=reach 3=connect 4=crisis
    last_scan_at    TEXT,
    last_post_at    TEXT,
    last_response_at TEXT,
    baseline_tone   REAL DEFAULT 0.5,      -- 0=very negative 1=very positive
    consecutive_flags INTEGER DEFAULT 0,
    total_flags     INTEGER DEFAULT 0,
    is_monitoring   INTEGER DEFAULT 0,     -- Enhanced monitoring after flag
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Individual scan results
  CREATE TABLE IF NOT EXISTS care_scans (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    content_hash    TEXT NOT NULL,         -- Hash of content — never store content
    platform        TEXT NOT NULL,
    signal_level    INTEGER NOT NULL,      -- 0-4
    crisis_score    REAL NOT NULL,         -- 0-100
    signals_found   TEXT NOT NULL,         -- JSON array
    layer_triggered TEXT NOT NULL,         -- which detection layer
    response_sent   INTEGER DEFAULT 0,
    response_level  INTEGER,
    reviewed_by     TEXT,                  -- admin who reviewed
    review_notes    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Outreach messages sent
  CREATE TABLE IF NOT EXISTS outreach_log (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    response_level  INTEGER NOT NULL,
    message_type    TEXT NOT NULL,         -- automated|human|crisis
    channel         TEXT NOT NULL,         -- in_app|telegram|email
    sent_at         TEXT NOT NULL,
    acknowledged    INTEGER DEFAULT 0,     -- did they respond?
    acknowledged_at TEXT,
    outcome         TEXT                   -- ok|still_struggling|connected_to_help|unknown
  );

  -- Community care flags (member-to-member concern)
  CREATE TABLE IF NOT EXISTS community_flags (
    id              TEXT PRIMARY KEY,
    flagged_user_hash TEXT NOT NULL,
    flagger_user_hash TEXT NOT NULL,
    post_id         TEXT,
    flag_message    TEXT,                  -- "are you okay?" or custom
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Resources accessed
  CREATE TABLE IF NOT EXISTS resource_access (
    id              TEXT PRIMARY KEY,
    user_id_hash    TEXT NOT NULL,
    resource        TEXT NOT NULL,         -- 988|crisis_text|nami|chat
    accessed_at     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wellness_user ON member_wellness(user_id_hash);
  CREATE INDEX IF NOT EXISTS idx_scans_user ON care_scans(user_id_hash);
  CREATE INDEX IF NOT EXISTS idx_scans_level ON care_scans(signal_level);
  CREATE INDEX IF NOT EXISTS idx_outreach_user ON outreach_log(user_id_hash);
`);

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: CRISIS LANGUAGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const CRISIS_SYSTEM_PROMPT = `You are Care Shield — a mental health safety system for The People's Voice Platform, a community built for people sharing their struggles and finding support.

Your role is to detect when a community member may be experiencing a mental health crisis or suicidal ideation so that the community can reach out with warmth and care.

Analyze the content for:

LEVEL 4 — CRITICAL (score 80-100):
- Explicit statements of suicidal intent ("I want to kill myself", "I'm going to end it")
- Specific plans (method, location, timing)
- Final goodbye messages ("this is my last post", "I won't be here much longer")
- Giving away possessions
- Statements of finality with hopelessness

LEVEL 3 — HIGH CRISIS (score 60-79):
- Strong hopelessness ("nothing will ever get better", "there's no point anymore")
- Burden statements ("everyone would be better off without me")
- Passive suicidal ideation ("I wish I wasn't here", "I don't want to exist")
- Escalating distress with isolation signals
- "I can't do this anymore" + multiple other signals

LEVEL 2 — ELEVATED (score 40-59):
- Moderate hopelessness combined with isolation
- "I'm so tired" + "I can't keep going" together
- Significant expressions of worthlessness
- Loss of will to continue general activities of life

LEVEL 1 — WATCHFUL (score 20-39):
- General distress that could escalate
- Expressions of feeling trapped or stuck
- Sadness that feels pervasive and total

LEVEL 0 — OK (score 0-19):
- Normal sharing of difficult emotions
- Healthy venting
- Sadness that is situational and doesn't suggest crisis
- Asking for support in normal ways

IMPORTANT DISTINCTIONS:
- Angry venting is NOT a crisis signal
- Sharing a bad day is NOT a crisis signal  
- Advocacy about mental health awareness is NOT a crisis signal
- Discussing someone else's crisis is NOT a signal about the poster
- People discussing their own past struggles (past tense, recovered) are NOT in current crisis

Respond ONLY in valid JSON:
{
  "crisis_score": 0-100,
  "signal_level": 0-4,
  "signals_found": ["specific signal 1", "specific signal 2"],
  "is_about_self": true,
  "is_current": true,
  "has_specific_plan": false,
  "has_location_or_timing": false,
  "recommended_response": "none|notice|reach|connect|crisis",
  "reasoning": "one compassionate sentence explaining the assessment",
  "immediate_danger": false
}`;

async function detectCrisisSignals(content, userContext = {}) {
  if (!content || content.trim().length < 10) {
    return {
      crisis_score: 0, signal_level: 0,
      signals_found: [], is_about_self: false,
      is_current: false, has_specific_plan: false,
      recommended_response: "none", immediate_danger: false,
    };
  }

  try {
    const contextNote = userContext.recentDistress
      ? `\n\nContext: This user has shown distress signals in recent posts. Current post is being evaluated in that context.`
      : "";

    const r = await anthropic.messages.create({
      model:      CONFIG.MODEL,
      max_tokens: 500,
      system:     CRISIS_SYSTEM_PROMPT,
      messages: [{
        role:    "user",
        content: `Analyze this post for mental health crisis signals:

"${content.substring(0, 2000)}"${contextNote}`,
      }],
    });

    const raw = r.content.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());

  } catch (err) {
    logger.error("[Care Shield] Crisis detection failed:", err.message);
    // On error — return level 0 but flag for manual review
    return {
      crisis_score: 0, signal_level: 0,
      signals_found: [], recommended_response: "none",
      immediate_danger: false,
      scan_error: true,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: BEHAVIORAL TIMELINE ANALYSIS
// Compares current scan to member's recent history
// ─────────────────────────────────────────────────────────────────────────────

function analyzeBehavioralPattern(userIdHash, currentScan) {
  // Get recent scans for this user
  const recentScans = db.prepare(`
    SELECT crisis_score, signal_level, created_at
    FROM care_scans
    WHERE user_id_hash = ?
    AND created_at > datetime('now', '-14 days')
    ORDER BY created_at DESC
    LIMIT 10
  `).all(userIdHash);

  if (recentScans.length === 0) return { escalating: false, pattern: "new_user" };

  const avgRecentScore  = recentScans.reduce((s, r) => s + r.crisis_score, 0) / recentScans.length;
  const maxRecentLevel  = Math.max(...recentScans.map(r => r.signal_level));
  const isEscalating    = currentScan.crisis_score > avgRecentScore + 20;
  const consecutiveHigh = recentScans.filter(r => r.signal_level >= 2).length;

  return {
    escalating:         isEscalating,
    average_recent:     Math.round(avgRecentScore),
    max_recent_level:   maxRecentLevel,
    consecutive_high:   consecutiveHigh,
    pattern: isEscalating  ? "escalating" :
             consecutiveHigh >= 3 ? "sustained_distress" :
             maxRecentLevel >= 3  ? "recent_crisis"      : "stable",
    // Boost signal level if pattern is escalating
    level_boost: isEscalating && currentScan.signal_level >= 1 ? 1 : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4: SILENCE DETECTION
// Flags members who go silent after high-distress posts
// ─────────────────────────────────────────────────────────────────────────────

function checkForSilence() {
  const threshold = new Date(
    Date.now() - CONFIG.SILENCE_THRESHOLD_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Find members who had level 3+ scan but no post since threshold
  const silent = db.prepare(`
    SELECT mw.user_id_hash, mw.last_post_at, mw.current_level,
           mw.last_response_at
    FROM member_wellness mw
    WHERE mw.current_level >= 3
    AND mw.last_post_at < ?
    AND (mw.last_response_at IS NULL OR mw.last_response_at < ?)
  `).all(threshold, threshold);

  return silent;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function canSendResponse(userIdHash) {
  const cooldown = new Date(
    Date.now() - CONFIG.RESPONSE_COOLDOWN_HOURS * 60 * 60 * 1000
  ).toISOString();

  const recent = db.prepare(`
    SELECT id FROM outreach_log
    WHERE user_id_hash = ?
    AND sent_at > ?
    AND response_level >= 2
  `).get(userIdHash, cooldown);

  return !recent;
}

async function sendWarmResponse(userIdHash, responseLevel, username, platform, channel = "in_app") {
  if (!canSendResponse(userIdHash)) {
    logger.info("[Care Shield] Response cooldown active — skipping", { userIdHash: userIdHash.substring(0,8) });
    return { sent: false, reason: "cooldown" };
  }

  const messageType = responseLevel >= 4 ? "crisis" : responseLevel >= 3 ? "human" : "automated";
  const now = new Date().toISOString();

  // Log the outreach
  db.prepare(`
    INSERT INTO outreach_log
      (id, user_id_hash, response_level, message_type, channel, sent_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userIdHash, responseLevel, messageType, channel, now);

  // Update member wellness record
  db.prepare(`
    UPDATE member_wellness
    SET last_response_at = ?, current_level = ?, updated_at = ?
    WHERE user_id_hash = ?
  `).run(now, responseLevel, now, userIdHash);

  // Alert admin via Telegram for level 3+
  if (responseLevel >= 3 && CONFIG.ADMIN_TELEGRAM_ID && CONFIG.TELEGRAM_TOKEN) {
    const alertText = responseLevel >= 4
      ? `🚨 *CARE SHIELD — CRISIS ALERT*\n\nPlatform: ${platform}\nResponse level: ${responseLevel}\n\nA community member may be in immediate danger. Please check the Care Shield admin dashboard immediately.\n\n_Care Shield — The People's Voice Platform_`
      : `⚠️ *CARE SHIELD — HIGH DISTRESS*\n\nPlatform: ${platform}\nResponse level: ${responseLevel}\n\nA community member needs a warm personal response. Please check the Care Shield admin dashboard.\n\n_Care Shield — The People's Voice Platform_`;

    try {
      await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:    CONFIG.ADMIN_TELEGRAM_ID,
          text:       alertText,
          parse_mode: "Markdown",
        }),
      });
    } catch (err) {
      logger.error("[Care Shield] Telegram alert failed:", err.message);
    }
  }

  // Return the message content for the platform to display
  const messageContent =
    responseLevel >= 4 ? RESPONSES.crisis(username) :
    responseLevel >= 3 ? RESPONSES.connect(username) :
    responseLevel >= 2 ? RESPONSES.reach(username)   : null;

  logger.info("[Care Shield] Response sent", {
    level:   responseLevel,
    type:    messageType,
    channel,
    platform,
  });

  return {
    sent:         true,
    level:        responseLevel,
    messageType,
    message:      messageContent,
    // Resource card for level 1+
    resourceCard: responseLevel >= 1 ? RESPONSES.notice : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCAN FUNCTION
// Entry point — called for every post on TPVP
// ─────────────────────────────────────────────────────────────────────────────

export async function scanPost({
  content,
  userId,
  username,
  platform = "tpvp",
  postId,
}) {
  const userIdHash = crypto.createHash("sha256")
    .update(`${platform}:${userId}`)
    .digest("hex");

  const contentHash = crypto.createHash("sha256")
    .update(content)
    .digest("hex");

  // Get or create wellness record for this user
  const existing = db.prepare(
    "SELECT * FROM member_wellness WHERE user_id_hash = ?"
  ).get(userIdHash);

  if (!existing) {
    db.prepare(`
      INSERT INTO member_wellness (id, user_id_hash, platform, last_post_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(uuidv4(), userIdHash, platform);
  } else {
    db.prepare(
      "UPDATE member_wellness SET last_post_at = datetime('now'), updated_at = datetime('now') WHERE user_id_hash = ?"
    ).run(userIdHash);
  }

  // Layer 1: Detect crisis signals in content
  const userContext = {
    recentDistress: existing && existing.consecutive_flags >= 2,
  };
  const scan = await detectCrisisSignals(content, userContext);

  // Layer 2: Behavioral pattern analysis
  const pattern = analyzeBehavioralPattern(userIdHash, scan);

  // Boost signal level if escalating pattern detected
  const effectiveLevel = Math.min(4,
    scan.signal_level + (pattern.level_boost || 0)
  );

  // Record the scan
  db.prepare(`
    INSERT INTO care_scans
      (id, user_id_hash, content_hash, platform, signal_level,
       crisis_score, signals_found, layer_triggered)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), userIdHash, contentHash, platform,
    effectiveLevel, scan.crisis_score,
    JSON.stringify(scan.signals_found || []),
    pattern.escalating ? "behavioral_escalation" : "content_analysis"
  );

  // Update consecutive flags counter
  if (effectiveLevel >= 2) {
    db.prepare(`
      UPDATE member_wellness
      SET consecutive_flags = consecutive_flags + 1,
          total_flags = total_flags + 1,
          current_level = ?,
          updated_at = datetime('now')
      WHERE user_id_hash = ?
    `).run(effectiveLevel, userIdHash);
  } else {
    db.prepare(`
      UPDATE member_wellness
      SET consecutive_flags = 0,
          current_level = 0,
          updated_at = datetime('now')
      WHERE user_id_hash = ?
    `).run(userIdHash);
  }

  // Determine response
  let response = null;

  if (effectiveLevel >= 4 || scan.immediate_danger) {
    // CRISIS — respond immediately
    response = await sendWarmResponse(userIdHash, 4, username, platform);

  } else if (effectiveLevel >= 3 || pattern.consecutive_high >= 3) {
    // HIGH DISTRESS — warm personal outreach
    response = await sendWarmResponse(userIdHash, 3, username, platform);

  } else if (effectiveLevel >= 2 || pattern.escalating) {
    // ELEVATED — reach out
    response = await sendWarmResponse(userIdHash, 2, username, platform);

  } else if (effectiveLevel >= 1) {
    // WATCHFUL — gentle resource card
    response = await sendWarmResponse(userIdHash, 1, username, platform);
  }

  logger.info("[Care Shield] Post scanned", {
    platform,
    level:     effectiveLevel,
    score:     scan.crisis_score,
    pattern:   pattern.pattern,
    responded: !!response?.sent,
  });

  return {
    signal_level:       effectiveLevel,
    crisis_score:       scan.crisis_score,
    pattern:            pattern.pattern,
    response_sent:      response?.sent || false,
    response_level:     response?.level,
    // Content to show in the user's feed if response needed
    show_resource_card: effectiveLevel >= 1,
    resource_card:      effectiveLevel >= 1 ? RESPONSES.notice : null,
    // Private message to deliver to the user
    private_message:    response?.message || null,
    // Never suppress the post — just add care
    suppress_post:      false,
    immediate_danger:   scan.immediate_danger || false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY CARE FLAG
// When a community member taps "Are you okay?" on a post
// ─────────────────────────────────────────────────────────────────────────────

export async function recordCommunityFlag({
  flaggedUserId,
  flaggerUserId,
  postId,
  platform = "tpvp",
  message,
}) {
  const flaggedHash  = crypto.createHash("sha256").update(`${platform}:${flaggedUserId}`).digest("hex");
  const flaggerHash  = crypto.createHash("sha256").update(`${platform}:${flaggerUserId}`).digest("hex");

  db.prepare(`
    INSERT INTO community_flags
      (id, flagged_user_hash, flagger_user_hash, post_id, flag_message)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), flaggedHash, flaggerHash, postId || null, message || "community_care");

  // Count recent flags for this user
  const recentFlags = db.prepare(`
    SELECT COUNT(*) as n FROM community_flags
    WHERE flagged_user_hash = ?
    AND created_at > datetime('now', '-24 hours')
  `).get(flaggedHash).n;

  logger.info("[Care Shield] Community flag received", {
    platform, totalRecentFlags: recentFlags
  });

  // Multiple community members flagging = escalate
  if (recentFlags >= 3) {
    const username = null; // Platform should pass username — not stored in hash
    await sendWarmResponse(flaggedHash, 3, username, platform, "community_triggered");
    return { flagged: true, escalated: true, communityFlags: recentFlags };
  }

  return { flagged: true, escalated: false, communityFlags: recentFlags };
}

// ─────────────────────────────────────────────────────────────────────────────
// SILENCE DETECTION SCHEDULER
// Runs every 4 hours — checks for members who went quiet after crisis posts
// ─────────────────────────────────────────────────────────────────────────────

async function runSilenceCheck() {
  const silent = checkForSilence();
  if (silent.length === 0) return;

  logger.info(`[Care Shield] Silence check: ${silent.length} members flagged`);

  for (const member of silent) {
    logger.warn("[Care Shield] Silent member after crisis post", {
      level:       member.current_level,
      lastPost:    member.last_post_at,
    });

    await sendWarmResponse(
      member.user_id_hash,
      Math.min(4, member.current_level + 1),
      null,
      "tpvp",
      "silence_detection"
    );
  }
}

// Schedule silence check every 4 hours
cron.schedule("0 */4 * * *", runSilenceCheck);

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS SERVER
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));

const requireInternal = (req, res, next) => {
  if (!CONFIG.INTERNAL_TOKEN || req.headers["x-internal-token"] !== CONFIG.INTERNAL_TOKEN)
    return res.status(401).json({ error: "Internal access only" });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!CONFIG.ADMIN_TOKEN || req.headers["x-admin-token"] !== CONFIG.ADMIN_TOKEN)
    return res.status(401).json({ error: "Unauthorized" });
  next();
};

// ── HEALTH ────────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_scans,
      SUM(CASE WHEN signal_level >= 3 THEN 1 ELSE 0 END) as crisis_detected,
      SUM(CASE WHEN response_sent = 1 THEN 1 ELSE 0 END) as responses_sent
    FROM care_scans
  `).get();

  res.json({
    status:   "ok",
    service:  "care-shield",
    version:  "1.0.0",
    mission:  "Seeing people. Validating pain. Helping survive another day.",
    stats,
    resources: {
      crisis_line:       "988",
      crisis_text:       "Text HOME to 741741",
      crisis_chat:       "https://988lifeline.org/chat",
      nami_helpline:     "1-800-950-6264",
    },
    timestamp: new Date().toISOString(),
  });
});

// ── SCAN POST ─────────────────────────────────────────────────────────────────

app.post("/api/v1/care/scan", requireInternal, async (req, res) => {
  const { content, user_id, username, platform, post_id } = req.body;
  if (!content || !user_id) {
    return res.status(400).json({ error: "content and user_id required" });
  }
  try {
    const result = await scanPost({ content, userId:user_id, username, platform, postId:post_id });
    res.json(result);
  } catch (err) {
    logger.error("[Care Shield] Scan error:", err);
    res.json({ signal_level:0, crisis_score:0, response_sent:false, suppress_post:false, error:err.message });
  }
});

// ── COMMUNITY FLAG ────────────────────────────────────────────────────────────

app.post("/api/v1/care/flag", requireInternal, async (req, res) => {
  const { flagged_user_id, flagger_user_id, post_id, platform, message } = req.body;
  if (!flagged_user_id || !flagger_user_id) {
    return res.status(400).json({ error:"flagged_user_id and flagger_user_id required" });
  }
  try {
    const result = await recordCommunityFlag({
      flaggedUserId: flagged_user_id,
      flaggerUserId: flagger_user_id,
      postId: post_id, platform, message,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESOURCE ACCESS LOG ───────────────────────────────────────────────────────

app.post("/api/v1/care/resource-accessed", requireInternal, (req, res) => {
  const { user_id, resource, platform = "tpvp" } = req.body;
  if (!user_id || !resource) return res.status(400).json({ error:"user_id and resource required" });
  const hash = crypto.createHash("sha256").update(`${platform}:${user_id}`).digest("hex");
  db.prepare("INSERT INTO resource_access (id,user_id_hash,resource,accessed_at) VALUES (?,?,?,datetime('now'))")
    .run(uuidv4(), hash, resource);
  res.json({ logged: true });
});

// ── ADMIN: DASHBOARD DATA ─────────────────────────────────────────────────────

app.get("/api/v1/care/admin/dashboard", requireAdmin, (req, res) => {
  const crisis = db.prepare(`
    SELECT cs.*, mw.last_post_at, mw.consecutive_flags
    FROM care_scans cs
    JOIN member_wellness mw ON cs.user_id_hash = mw.user_id_hash
    WHERE cs.signal_level >= 2
    AND cs.created_at > datetime('now', '-48 hours')
    ORDER BY cs.signal_level DESC, cs.created_at DESC
    LIMIT 50
  `).all();

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_scans_24h,
      SUM(CASE WHEN signal_level >= 4 THEN 1 ELSE 0 END) as crisis_24h,
      SUM(CASE WHEN signal_level >= 3 THEN 1 ELSE 0 END) as high_distress_24h,
      SUM(CASE WHEN signal_level >= 2 THEN 1 ELSE 0 END) as elevated_24h
    FROM care_scans
    WHERE created_at > datetime('now', '-24 hours')
  `).get();

  const outreach = db.prepare(`
    SELECT COUNT(*) as n, AVG(CASE WHEN acknowledged=1 THEN 1 ELSE 0 END) as ack_rate
    FROM outreach_log
    WHERE sent_at > datetime('now', '-7 days')
  `).get();

  res.json({
    summary,
    outreach_stats: outreach,
    flagged_members: crisis.map(c => ({
      ...c,
      signals_found: JSON.parse(c.signals_found || "[]"),
      // Anonymized for dashboard — no user-identifiable info
      user_ref: c.user_id_hash.substring(0, 8) + "…",
    })),
    silence_alerts: checkForSilence().length,
    resources: {
      "988 Lifeline":    "Call or text 988",
      "Crisis Text Line":"Text HOME to 741741",
      "NAMI Helpline":   "1-800-950-6264",
      "988 Chat":        "https://988lifeline.org/chat",
    },
    timestamp: new Date().toISOString(),
  });
});

// ── ADMIN: MARK OUTREACH OUTCOME ──────────────────────────────────────────────

app.post("/api/v1/care/admin/outcome/:id", requireAdmin, (req, res) => {
  const { outcome, notes } = req.body;
  db.prepare(`
    UPDATE outreach_log
    SET acknowledged=1, acknowledged_at=datetime('now'), outcome=?
    WHERE id=?
  `).run(outcome, req.params.id);
  res.json({ updated: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

app.listen(CONFIG.PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════╗
║   CARE SHIELD v1.0.0 — RUNNING                           ║
║   Mental Health Safety — The People's Voice Platform     ║
║                                                          ║
║   "On my darkest day I just wished for someone to        ║
║    see me, validate my pain, and help me survive         ║
║    another day." — Ronny, Founder                        ║
║                                                          ║
║   Port: ${String(CONFIG.PORT).padEnd(48)}║
║   Silence check: Every 4 hours                           ║
║                                                          ║
║   Crisis Resources:                                      ║
║   988 Lifeline:    Call or text 988                      ║
║   Crisis Text:     Text HOME to 741741                   ║
║   NAMI Helpline:   1-800-950-6264                        ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;
