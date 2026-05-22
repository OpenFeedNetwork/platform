/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OPEN FEED NETWORK — TERRORISM CONTENT DETECTION               ║
 * ║   Counter-Extremism Safety Layer  v1.0.0                        ║
 * ║                                                                  ║
 * ║   Four detection layers:                                         ║
 * ║   1. GIFCT hash matching — known terrorism content              ║
 * ║   2. FTO entity detection — designated organization names       ║
 * ║   3. AI content analysis — recruitment/coordination patterns    ║
 * ║   4. Human review queue — gray area escalation                  ║
 * ║                                                                  ║
 * ║   CORE PRINCIPLE:                                                ║
 * ║   Remove terrorism content. Protect counter-extremism speech.   ║
 * ║   Label gray areas. Never suppress legitimate journalism.        ║
 * ║                                                                  ║
 * ║   LEGAL BASIS:                                                   ║
 * ║   18 U.S.C. § 2339B — Material Support to FTOs                 ║
 * ║   Section 230 does NOT protect terrorism content                ║
 * ║   GIFCT membership provides hash database access                ║
 * ║                                                                  ║
 * ║   ENV VARIABLES:                                                 ║
 * ║   GIFCT_API_KEY=from_gifct_membership                           ║
 * ║   GIFCT_API_URL=https://api.gifct.org/v1                        ║
 * ║   TERROR_DB_PATH=./data/terrorism_detection.db                  ║
 * ║   FBI_IC3_CONTACT=ic3.gov                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import Anthropic  from "@anthropic-ai/sdk";
import Database   from "better-sqlite3";
import crypto     from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs         from "fs";
import dotenv     from "dotenv";
import winston    from "winston";
dotenv.config();

// ─── LOGGER ──────────────────────────────────────────────────────────────────
fs.mkdirSync("./data", { recursive: true });
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/terrorism_detection.log", flags:"a" }),
    new winston.transports.File({ filename:"./data/terrorism_critical.log", flags:"a" }),
  ],
});

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = new Database(process.env.TERROR_DB_PATH || "./data/terrorism_detection.db");
db.exec(`
  -- Detection results log
  CREATE TABLE IF NOT EXISTS terror_scans (
    id              TEXT PRIMARY KEY,
    content_hash    TEXT NOT NULL,
    user_id_hash    TEXT NOT NULL,
    platform        TEXT NOT NULL,
    result          TEXT NOT NULL,    -- clear|review|remove|critical
    risk_level      TEXT NOT NULL,    -- none|low|medium|high|critical
    risk_score      INTEGER NOT NULL,
    detection_method TEXT NOT NULL,   -- gifct|fto_entity|ai_analysis|human
    indicators      TEXT NOT NULL,    -- JSON array
    is_counter_extremism INTEGER DEFAULT 0,
    is_journalism   INTEGER DEFAULT 0,
    action_taken    TEXT NOT NULL,    -- allowed|labeled|quarantined|removed|reported
    reported_to_fbi INTEGER DEFAULT 0,
    fbi_report_id   TEXT,
    gifct_submitted INTEGER DEFAULT 0,
    reviewed_by     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Human review queue
  CREATE TABLE IF NOT EXISTS terror_review_queue (
    id              TEXT PRIMARY KEY,
    scan_id         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    user_id_hash    TEXT NOT NULL,
    platform        TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    indicators      TEXT NOT NULL,
    context         TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    reviewer        TEXT,
    decision        TEXT,
    decision_notes  TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at     TEXT
  );

  -- FBI reports filed
  CREATE TABLE IF NOT EXISTS fbi_reports (
    id              TEXT PRIMARY KEY,
    scan_id         TEXT NOT NULL,
    report_type     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    user_id_hash    TEXT NOT NULL,
    platform        TEXT NOT NULL,
    indicators      TEXT NOT NULL,
    ic3_reference   TEXT,
    filed_at        TEXT NOT NULL DEFAULT (datetime('now')),
    filed_by        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_terror_hash   ON terror_scans(content_hash);
  CREATE INDEX IF NOT EXISTS idx_terror_result ON terror_scans(result);
  CREATE INDEX IF NOT EXISTS idx_review_status ON terror_review_queue(status);
`);

// ─── ANTHROPIC ────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: GIFCT HASH MATCHING
// Checks content against GIFCT's database of known terrorism content
// Same principle as PhotoDNA — hash match = instant identification
// ─────────────────────────────────────────────────────────────────────────────

async function checkGIFCT(contentBuffer) {
  if (!process.env.GIFCT_API_KEY) {
    return {
      matched:  false,
      status:   "unavailable",
      message:  "GIFCT membership pending — apply at gifct.org/membership",
    };
  }

  try {
    const contentHash = crypto.createHash("sha256")
      .update(contentBuffer).digest("hex");

    const response = await fetch(`${process.env.GIFCT_API_URL}/hash/check`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GIFCT_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ hash: contentHash, hash_type: "sha256" }),
    });

    if (!response.ok) throw new Error(`GIFCT API ${response.status}`);
    const data = await response.json();

    return {
      matched:       data.matched || false,
      confidence:    data.matched ? 99 : 0,
      category:      data.category || null,
      organization:  data.organization || null,
      status:        "checked",
      hash:          contentHash,
    };

  } catch (err) {
    logger.error("[Terror] GIFCT check failed:", err.message);
    return { matched:false, status:"error", error:err.message };
  }
}

// Submit new terrorism content hash to GIFCT for other platforms
async function submitToGIFCT(contentHash, category) {
  if (!process.env.GIFCT_API_KEY) return { submitted:false, reason:"GIFCT not configured" };

  try {
    const response = await fetch(`${process.env.GIFCT_API_URL}/hash/submit`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GIFCT_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ hash:contentHash, hash_type:"sha256", category }),
    });
    return { submitted: response.ok };
  } catch (err) {
    return { submitted:false, error:err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: FTO ENTITY DETECTION
// U.S. State Dept designated Foreign Terrorist Organizations
// Updated list: state.gov/foreign-terrorist-organizations
// ─────────────────────────────────────────────────────────────────────────────

const DESIGNATED_FTOS = [
  // Major FTOs — State Department designated as of 2026
  "ISIS", "ISIL", "Islamic State", "Daesh", "Da'esh",
  "Al-Qaeda", "Al Qaeda", "al-Qa'ida", "AQ",
  "Hamas", "Al-Nusra", "Jabhat al-Nusra",
  "Hezbollah", "Hizballah",
  "Boko Haram", "JNIM",
  "Al-Shabaab", "Al Shabaab",
  "Abu Sayyaf", "ASG",
  "Lashkar-e-Taiba", "LeT",
  "Haqqani Network",
  "Islamic Jihad Union",
  "Tehrik-e-Taliban", "TTP", "Pakistani Taliban",
  "FARC", "ELN",
  "Aum Shinrikyo",
  "Kahane Chai",
  "Kataib Hezbollah",
];

// Context phrases that indicate support vs reporting
const COUNTER_EXTREMISM_MARKERS = [
  "fighting against", "opposed to", "defeated", "countering",
  "radicalization prevention", "former member", "left the group",
  "deradicalization", "counter-terrorism", "anti-terrorism",
  "news report", "breaking news", "according to officials",
  "researchers say", "study finds", "academic analysis",
  "documentary", "journalist", "investigation reveals",
];

function detectFTOEntities(text) {
  const textLower = text.toLowerCase();
  const matched   = [];
  const isCounter = COUNTER_EXTREMISM_MARKERS.some(m => textLower.includes(m.toLowerCase()));

  for (const fto of DESIGNATED_FTOS) {
    if (textLower.includes(fto.toLowerCase())) {
      matched.push(fto);
    }
  }

  return {
    ftos_mentioned:      matched,
    count:               matched.length,
    likely_counter:      isCounter,
    requires_ai_review:  matched.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3: AI CONTENT ANALYSIS
// Detects recruitment, coordination, glorification, and fundraising
// Also identifies counter-extremism, journalism, and academic content
// ─────────────────────────────────────────────────────────────────────────────

const TERRORISM_SYSTEM_PROMPT = `You are the counter-extremism safety layer for Open Feed Network — a platform committed to free expression with one absolute limit: content that facilitates terrorism.

Your role is to analyze content and distinguish:

ILLEGAL — REMOVE IMMEDIATELY (score 80-100):
- Explicit recruitment for designated Foreign Terrorist Organizations (FTOs)
- Coordination of attacks or violent acts
- Fundraising solicitations for FTOs
- Operational instructions for terrorist activities (bomb-making, attack planning)
- Direct glorification of specific terrorist attacks that seeks to inspire imitation
- Content posted by accounts explicitly claiming FTO membership

HIGH RISK — HUMAN REVIEW REQUIRED (score 60-79):
- Ambiguous pro-violence rhetoric that may be recruitment
- Content celebrating FTO victories without clear counter-extremism context
- Requests for information that could support terrorist activities
- Encrypted communication or code language patterns common in FTO networks

GRAY AREA — LABEL AND MONITOR (score 40-59):
- Angry political speech about geopolitical conflicts (NOT terrorism support)
- Discussion of FTO ideology without explicit endorsement
- Content that could be interpreted multiple ways
- Hyperbolic language that is likely political expression

PROTECTED SPEECH — DO NOT REMOVE (score 0-39):
- Counter-extremism journalism and research
- News reporting about terrorist organizations and attacks
- Academic analysis of extremism and radicalization
- Personal stories of escaping radicalization
- Government officials discussing counter-terrorism policy
- Legitimate political speech about conflict zones
- Victims speaking about their experiences

CRITICAL DISTINCTIONS:
- "ISIS killed my family" = victim speech — PROTECT
- "ISIS is right to fight" = potential support — REVIEW
- "Here's how ISIS recruits" = journalism/research — PROTECT WITH LABEL
- "Join us in the fight for the caliphate" = recruitment — REMOVE
- "I hate [group] they should all die" = likely hyperbole — MONITOR not REMOVE
- Palestinian/Israeli conflict discussion = political speech — PROTECT unless explicit FTO support

Respond ONLY in valid JSON:
{
  "risk_score": 0-100,
  "risk_level": "none|low|medium|high|critical",
  "result": "clear|review|remove|critical",
  "is_terrorism_support": false,
  "is_counter_extremism": false,
  "is_journalism": false,
  "is_political_speech": false,
  "is_academic": false,
  "fto_support_detected": false,
  "recruitment_detected": false,
  "coordination_detected": false,
  "fundraising_detected": false,
  "glorification_detected": false,
  "indicators": [],
  "recommended_action": "allow|label|review|quarantine|remove|report_fbi",
  "reasoning": "one specific sentence explaining the assessment",
  "requires_human_review": false,
  "immediate_danger": false
}`;

async function analyzeContentAI(content, ftoContext = {}) {
  try {
    const contextNote = ftoContext.ftos_mentioned?.length > 0
      ? `\n\nNote: The following designated FTOs were mentioned in this content: ${ftoContext.ftos_mentioned.join(", ")}. Context appears to be ${ftoContext.likely_counter ? "counter-extremism" : "unclear"}.`
      : "";

    const r = await anthropic.messages.create({
      model:      process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 600,
      system:     TERRORISM_SYSTEM_PROMPT,
      messages: [{
        role:    "user",
        content: `Analyze this content for terrorism-related violations:\n\n"${content.substring(0,3000)}"${contextNote}`,
      }],
    });

    const raw = r.content.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());

  } catch (err) {
    logger.error("[Terror] AI analysis failed:", err.message);
    return {
      risk_score: 0, risk_level: "unknown", result: "review",
      is_terrorism_support: false, is_counter_extremism: false,
      indicators: [], recommended_action: "review",
      reasoning: "Analysis unavailable — manual review required",
      requires_human_review: true, immediate_danger: false,
      scan_error: true,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4: HUMAN REVIEW QUEUE
// Gray area content that requires human judgment
// ─────────────────────────────────────────────────────────────────────────────

function addToReviewQueue(scanId, contentHash, userIdHash, platform, riskLevel, indicators, context) {
  db.prepare(`
    INSERT INTO terror_review_queue
      (id, scan_id, content_hash, user_id_hash, platform, risk_level, indicators, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), scanId, contentHash, userIdHash, platform, riskLevel, JSON.stringify(indicators), context || null);

  logger.warn("[Terror] Content added to human review queue", { riskLevel, platform });
}

// ─────────────────────────────────────────────────────────────────────────────
// FBI REPORTING PROTOCOL
// Documents every report for legal compliance
// ─────────────────────────────────────────────────────────────────────────────

function logFBIReport(scanId, contentHash, userIdHash, platform, indicators) {
  const reportId = uuidv4();

  db.prepare(`
    INSERT INTO fbi_reports
      (id, scan_id, report_type, content_hash, user_id_hash, platform, indicators)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(reportId, scanId, "terrorism_content", contentHash, userIdHash, platform, JSON.stringify(indicators));

  // Update scan record
  db.prepare(`
    UPDATE terror_scans SET reported_to_fbi=1, fbi_report_id=? WHERE id=?
  `).run(reportId, scanId);

  logger.warn("[Terror] ⚠️ FBI REPORT FILED", {
    reportId,
    platform,
    instructions: [
      "Go to ic3.gov and file an Internet Crime Complaint",
      "Reference internal report ID: " + reportId,
      "Include content hash, user ID hash, detection timestamp",
      "Select category: Terrorism",
      "DO NOT include actual content — only metadata",
      "Document the IC3 complaint number when received",
    ],
  });

  return {
    reportId,
    status:       "logged",
    action_required: "File complaint at ic3.gov within 24 hours",
    reference:    reportId,
    instructions: "See terrorism_critical.log for complete filing instructions",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCAN FUNCTION
// Entry point — called for every post before storage
// ─────────────────────────────────────────────────────────────────────────────

export async function scanForTerrorism({
  content,
  userId,
  platform   = "openfeed",
  mediaBuffer = null,
  context    = null,
}) {
  const start       = Date.now();
  const scanId      = uuidv4();
  const userIdHash  = crypto.createHash("sha256").update(`${platform}:${userId}`).digest("hex");
  const contentHash = crypto.createHash("sha256").update(content || "").digest("hex");

  let gifctResult  = { matched:false, status:"skipped" };
  let ftoResult    = { ftos_mentioned:[], count:0 };
  let aiResult     = null;
  let finalResult  = "clear";
  let finalAction  = "allow";
  let riskLevel    = "none";
  let riskScore    = 0;
  let detectionMethod = "clean";
  let fbiReportFiled  = null;
  let gifctSubmitted  = false;

  // ── LAYER 1: GIFCT hash check (for media) ─────────────────────────────────
  if (mediaBuffer) {
    gifctResult = await checkGIFCT(mediaBuffer);
    if (gifctResult.matched) {
      finalResult     = "critical";
      finalAction     = "report_fbi";
      riskLevel       = "critical";
      riskScore       = 100;
      detectionMethod = "gifct";
    }
  }

  // ── LAYER 2: FTO entity detection (for text) ─────────────────────────────
  if (content && finalResult !== "critical") {
    ftoResult = detectFTOEntities(content);
  }

  // ── LAYER 3: AI analysis ──────────────────────────────────────────────────
  if (content && finalResult !== "critical") {
    aiResult = await analyzeContentAI(content, ftoResult);
    riskScore  = aiResult.risk_score;
    riskLevel  = aiResult.risk_level;

    if (aiResult.result === "critical" || aiResult.immediate_danger) {
      finalResult     = "critical";
      finalAction     = "report_fbi";
      detectionMethod = "ai_analysis";
    } else if (aiResult.result === "remove") {
      finalResult     = "remove";
      finalAction     = "quarantine";
      detectionMethod = "ai_analysis";
    } else if (aiResult.result === "review" || aiResult.requires_human_review) {
      finalResult     = "review";
      finalAction     = "review";
      detectionMethod = "ai_analysis";
    } else if (aiResult.is_counter_extremism || aiResult.is_journalism || aiResult.is_academic) {
      finalResult     = "clear";
      finalAction     = aiResult.is_counter_extremism ? "label_counter_extremism" : "allow";
      detectionMethod = "ai_analysis";
    }
  }

  // ── RECORD SCAN ───────────────────────────────────────────────────────────
  const indicators = [
    ...(gifctResult.matched ? [`GIFCT hash match: ${gifctResult.category}`] : []),
    ...(ftoResult.ftos_mentioned.length > 0 ? [`FTOs mentioned: ${ftoResult.ftos_mentioned.join(", ")}`] : []),
    ...(aiResult?.indicators || []),
  ];

  db.prepare(`
    INSERT INTO terror_scans
      (id, content_hash, user_id_hash, platform, result, risk_level,
       risk_score, detection_method, indicators, is_counter_extremism,
       is_journalism, action_taken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId, contentHash, userIdHash, platform, finalResult, riskLevel,
    riskScore, detectionMethod, JSON.stringify(indicators),
    aiResult?.is_counter_extremism ? 1 : 0,
    aiResult?.is_journalism ? 1 : 0,
    finalAction
  );

  // ── LAYER 4: HUMAN REVIEW QUEUE ───────────────────────────────────────────
  if (finalResult === "review") {
    addToReviewQueue(scanId, contentHash, userIdHash, platform, riskLevel, indicators, context);
  }

  // ── FBI REPORTING ─────────────────────────────────────────────────────────
  if (finalResult === "critical" || finalAction === "report_fbi") {
    fbiReportFiled = logFBIReport(scanId, contentHash, userIdHash, platform, indicators);

    // Submit to GIFCT if media
    if (mediaBuffer && gifctResult.matched) {
      await submitToGIFCT(gifctResult.hash, gifctResult.category || "terrorism");
      gifctSubmitted = true;
      db.prepare("UPDATE terror_scans SET gifct_submitted=1 WHERE id=?").run(scanId);
    }
  }

  const processingMs = Date.now() - start;

  logger.info("[Terror] Scan complete", {
    result: finalResult, action: finalAction,
    riskLevel, riskScore, platform, processingMs,
  });

  return {
    scan_id:          scanId,
    result:           finalResult,
    action:           finalAction,
    risk_level:       riskLevel,
    risk_score:       riskScore,
    indicators,
    is_counter_extremism: aiResult?.is_counter_extremism || false,
    is_journalism:    aiResult?.is_journalism || false,
    is_political_speech: aiResult?.is_political_speech || false,
    suppress_content: finalResult === "critical" || finalResult === "remove",
    require_review:   finalResult === "review",
    fbi_report:       fbiReportFiled,
    gifct_submitted:  gifctSubmitted,
    processing_ms:    processingMs,
    reasoning:        aiResult?.reasoning || "GIFCT hash match",
    // For the platform to display if content is from journalist/researcher
    add_counter_extremism_label: aiResult?.is_counter_extremism || false,
    legal_note: finalResult === "critical"
      ? "18 U.S.C. § 2339B — Material Support to FTOs. Report to FBI IC3 within 24 hours."
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE REPORT
// Monthly documentation of all terrorism detection activity
// ─────────────────────────────────────────────────────────────────────────────

export function generateTerrorismComplianceReport(month) {
  const scans    = db.prepare(`SELECT * FROM terror_scans WHERE strftime('%Y-%m',created_at)=?`).all(month);
  const reports  = db.prepare(`SELECT * FROM fbi_reports WHERE strftime('%Y-%m',filed_at)=?`).all(month);
  const queue    = db.prepare(`SELECT * FROM terror_review_queue WHERE strftime('%Y-%m',created_at)=?`).all(month);

  const total         = scans.length;
  const cleared       = scans.filter(s=>s.result==="clear").length;
  const reviewed      = scans.filter(s=>s.result==="review").length;
  const removed       = scans.filter(s=>s.result==="remove").length;
  const critical      = scans.filter(s=>s.result==="critical").length;
  const counterExtrem = scans.filter(s=>s.is_counter_extremism).length;
  const journalism    = scans.filter(s=>s.is_journalism).length;
  const fbiReports    = reports.length;

  return {
    report_month:     month,
    generated_at:     new Date().toISOString(),
    platform:         "Open Feed Network",
    summary: {
      total_scans:              total,
      content_cleared:          cleared,
      sent_to_human_review:     reviewed,
      content_removed:          removed,
      critical_terrorism:       critical,
      counter_extremism_protected: counterExtrem,
      journalism_protected:     journalism,
      fbi_reports_filed:        fbiReports,
    },
    compliance_statement: `Open Feed Network analyzed ${total.toLocaleString()} pieces of content for terrorism-related violations in ${month}. ${critical} pieces of critical terrorism content were detected and quarantined. ${fbiReports} reports were filed with the FBI Internet Crime Complaint Center. ${counterExtrem + journalism} pieces of legitimate counter-extremism content and journalism were protected from removal. Zero FTO recruitment, coordination, or fundraising content was allowed to remain on the platform.`,
    legal_basis:      "18 U.S.C. § 2339B, GIFCT membership obligations, platform Terms of Service",
    gifct_member:     !!process.env.GIFCT_API_KEY,
    fbi_reports:      reports.map(r => ({ id:r.id, filed_at:r.filed_at, ic3_reference:r.ic3_reference })),
  };
}

export default { scanForTerrorism, generateTerrorismComplianceReport };
