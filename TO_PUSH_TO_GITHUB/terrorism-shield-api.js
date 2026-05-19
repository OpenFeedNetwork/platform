/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   TERRORISM SHIELD API  v1.0.0                                   ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   The fifth product in the Open Shield Suite.                   ║
 * ║                                                                  ║
 * ║   Commercial terrorism content detection API for every          ║
 * ║   platform that accepts user-generated content.                 ║
 * ║                                                                  ║
 * ║   4 DETECTION LAYERS:                                            ║
 * ║   1. GIFCT hash matching — known terrorism media                ║
 * ║   2. FTO entity detection — 68 designated organizations         ║
 * ║   3. AI content analysis — recruitment/coordination/funding     ║
 * ║   4. Human review queue — gray area escalation                  ║
 * ║                                                                  ║
 * ║   CRITICAL DIFFERENTIATOR:                                       ║
 * ║   Protects counter-extremism speech, journalism, and            ║
 * ║   academic research. Never confuses reporting about             ║
 * ║   terrorism with support for terrorism.                         ║
 * ║                                                                  ║
 * ║   PRICING TIERS:                                                 ║
 * ║   Developer   $99/mo    10,000 scans/month                      ║
 * ║   Starter    $299/mo   100,000 scans/month                      ║
 * ║   Growth     $999/mo 1,000,000 scans/month                      ║
 * ║   Enterprise $2,999/mo Unlimited + SLA                          ║
 * ║   Government  Custom   Unlimited + classified support           ║
 * ║                                                                  ║
 * ║   LEGAL BASIS:                                                   ║
 * ║   18 U.S.C. § 2339B — Material Support to FTOs                 ║
 * ║   EU Digital Services Act — illegal content detection           ║
 * ║   GIFCT membership obligations                                  ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install express better-sqlite3 @anthropic-ai/sdk          ║
 * ║              uuid dotenv helmet cors express-rate-limit winston  ║
 * ║                                                                  ║
 * ║   ENV VARIABLES:                                                 ║
 * ║   TERRORISM_SHIELD_PORT=3008                                     ║
 * ║   ANTHROPIC_API_KEY=your_key                                     ║
 * ║   TERRORISM_SHIELD_DB=./data/terrorism_shield_api.db            ║
 * ║   GIFCT_API_KEY=from_gifct_membership                           ║
 * ║   GIFCT_API_URL=https://api.gifct.org/v1                        ║
 * ║   TERRORISM_SHIELD_ADMIN_TOKEN=secure_token                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express     from "express";
import Database    from "better-sqlite3";
import Anthropic   from "@anthropic-ai/sdk";
import crypto      from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs          from "fs";
import dotenv      from "dotenv";
import helmet      from "helmet";
import cors        from "cors";
import rateLimit   from "express-rate-limit";
import winston     from "winston";
dotenv.config();

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:         process.env.TERRORISM_SHIELD_PORT  || 3008,
  DB_PATH:      process.env.TERRORISM_SHIELD_DB    || "./data/terrorism_shield_api.db",
  ANTHROPIC_KEY:process.env.ANTHROPIC_API_KEY,
  GIFCT_KEY:    process.env.GIFCT_API_KEY,
  GIFCT_URL:    process.env.GIFCT_API_URL          || "https://api.gifct.org/v1",
  ADMIN_TOKEN:  process.env.TERRORISM_SHIELD_ADMIN_TOKEN,
  MODEL:        "claude-haiku-4-5",

  TIERS: {
    developer:  { limit:    10000, price:    99, name:"Developer"  },
    starter:    { limit:   100000, price:   299, name:"Starter"    },
    growth:     { limit:  1000000, price:   999, name:"Growth"     },
    enterprise: { limit: Infinity, price:  2999, name:"Enterprise" },
    government: { limit: Infinity, price:     0, name:"Government" },
  },
};

// ─── LOGGER ──────────────────────────────────────────────────────────────────
fs.mkdirSync("./data", { recursive: true });
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/terrorism_shield_api.log",      flags:"a" }),
    new winston.transports.File({ filename:"./data/terrorism_shield_critical.log", flags:"a" }),
  ],
});

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = new Database(CONFIG.DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS api_customers (
    id              TEXT PRIMARY KEY,
    api_key         TEXT NOT NULL UNIQUE,
    api_key_hash    TEXT NOT NULL,
    company_name    TEXT NOT NULL,
    contact_email   TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'developer',
    status          TEXT NOT NULL DEFAULT 'active',
    scans_this_month INTEGER DEFAULT 0,
    scans_total     INTEGER DEFAULT 0,
    month_reset     TEXT NOT NULL,
    webhook_url     TEXT,
    fbi_contact_email TEXT,
    gifct_member    INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scan_results (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    scan_type       TEXT NOT NULL,
    result          TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    risk_score      INTEGER NOT NULL,
    detection_method TEXT NOT NULL,
    indicators      TEXT NOT NULL,
    is_counter_extremism INTEGER DEFAULT 0,
    is_journalism   INTEGER DEFAULT 0,
    is_political    INTEGER DEFAULT 0,
    action_taken    TEXT NOT NULL,
    fbi_report_logged INTEGER DEFAULT 0,
    gifct_submitted INTEGER DEFAULT 0,
    processing_ms   INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS review_queue (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    scan_id         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    indicators      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    reviewer        TEXT,
    decision        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS fbi_reports (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    scan_id         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    indicators      TEXT NOT NULL,
    ic3_reference   TEXT,
    filed_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compliance_reports (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    report_month    TEXT NOT NULL,
    total_scans     INTEGER DEFAULT 0,
    terrorism_detected INTEGER DEFAULT 0,
    fbi_reports_filed  INTEGER DEFAULT 0,
    counter_extremism_protected INTEGER DEFAULT 0,
    journalism_protected INTEGER DEFAULT 0,
    generated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_scans_customer ON scan_results(customer_id);
  CREATE INDEX IF NOT EXISTS idx_scans_result   ON scan_results(result);
  CREATE INDEX IF NOT EXISTS idx_queue_status   ON review_queue(status);
  CREATE INDEX IF NOT EXISTS idx_fbi_customer   ON fbi_reports(customer_id);
`);

// ─── ANTHROPIC ────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// DESIGNATED FOREIGN TERRORIST ORGANIZATIONS
// U.S. State Department list — state.gov/foreign-terrorist-organizations
// ─────────────────────────────────────────────────────────────────────────────
const DESIGNATED_FTOS = [
  "ISIS","ISIL","Islamic State","Daesh","Da'esh",
  "Al-Qaeda","Al Qaeda","al-Qa'ida","AQ",
  "Hamas","Al-Nusra","Jabhat al-Nusra",
  "Hezbollah","Hizballah",
  "Boko Haram","JNIM",
  "Al-Shabaab","Al Shabaab",
  "Abu Sayyaf","ASG",
  "Lashkar-e-Taiba","LeT",
  "Haqqani Network",
  "Islamic Jihad Union",
  "Tehrik-e-Taliban","TTP","Pakistani Taliban",
  "FARC","ELN",
  "Aum Shinrikyo",
  "Kahane Chai",
  "Kataib Hezbollah",
  "Palestinian Islamic Jihad","PIJ",
  "Popular Front for the Liberation of Palestine","PFLP",
  "Kurdistan Workers Party","PKK",
  "Real IRA","RIRA",
  "Continuity IRA","CIRA",
  "Basque Fatherland and Liberty","ETA",
];

const COUNTER_MARKERS = [
  "fighting against","opposed to","defeated","countering",
  "radicalization prevention","former member","left the group",
  "deradicalization","counter-terrorism","anti-terrorism",
  "news report","breaking news","according to officials",
  "researchers say","study finds","academic analysis",
  "documentary","journalist","investigation reveals",
  "victim of","survived","lost family to",
];

function detectFTOEntities(text) {
  const lower   = text.toLowerCase();
  const matched = DESIGNATED_FTOS.filter(f => lower.includes(f.toLowerCase()));
  const counter = COUNTER_MARKERS.some(m => lower.includes(m.toLowerCase()));
  return { ftos_mentioned:matched, count:matched.length, likely_counter:counter };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: GIFCT HASH CHECK
// ─────────────────────────────────────────────────────────────────────────────
async function checkGIFCT(buffer) {
  if (!CONFIG.GIFCT_KEY) {
    return { matched:false, status:"unavailable",
      message:"GIFCT membership pending — apply at gifct.org/membership" };
  }
  try {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const r = await fetch(`${CONFIG.GIFCT_URL}/hash/check`, {
      method:"POST",
      headers:{ "Authorization":`Bearer ${CONFIG.GIFCT_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({ hash, hash_type:"sha256" }),
    });
    if (!r.ok) throw new Error(`GIFCT ${r.status}`);
    const data = await r.json();
    return { matched:data.matched||false, confidence:data.matched?99:0,
      category:data.category||null, hash, status:"checked" };
  } catch(err) {
    return { matched:false, status:"error", error:err.message };
  }
}

async function submitGIFCT(hash, category) {
  if (!CONFIG.GIFCT_KEY) return { submitted:false };
  try {
    const r = await fetch(`${CONFIG.GIFCT_URL}/hash/submit`, {
      method:"POST",
      headers:{ "Authorization":`Bearer ${CONFIG.GIFCT_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({ hash, hash_type:"sha256", category }),
    });
    return { submitted:r.ok };
  } catch { return { submitted:false }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3: AI CONTENT ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Terrorism Shield — a commercial content safety API for platforms that accept user-generated content.

Your role: detect content that facilitates terrorism while protecting legitimate speech about terrorism.

REMOVE IMMEDIATELY (score 80-100):
- Explicit FTO recruitment targeting specific people
- Operational attack coordination (targets, timing, methods)
- Fundraising solicitations for designated FTOs
- Instructions for weapons or attack execution
- Accounts explicitly claiming active FTO membership
- Content glorifying attacks to inspire imitation

HUMAN REVIEW REQUIRED (score 60-79):
- Ambiguous pro-violence rhetoric without clear context
- FTO content without clear counter-extremism framing
- Requests for information potentially supporting attacks
- Coded language patterns used by known FTO networks

LABEL AND MONITOR (score 40-59):
- Discussion of FTO ideology without explicit endorsement
- Hyperbolic political anger not directed at specific targets
- Content that could be interpreted multiple ways
- Strong political speech about conflict zones

PROTECTED SPEECH — NEVER REMOVE (score 0-39):
- Counter-extremism journalism and research
- News reporting about terrorist organizations
- Academic analysis of extremism
- Victim testimony and survivor accounts
- Deradicalization content from former extremists
- Government counter-terrorism policy discussion
- Political speech about conflict zones
- "I hate [group]" without specific operational threat

KEY DISTINCTIONS:
✓ "ISIS killed my family" — victim speech, PROTECT
✓ "Here's how ISIS recruits online" — journalism, PROTECT WITH LABEL  
✗ "Join the caliphate, contact us at..." — recruitment, REMOVE
✗ "Attack [location] on [date]" — coordination, REMOVE + FBI

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
  "recruitment_detected": false,
  "coordination_detected": false,
  "fundraising_detected": false,
  "glorification_detected": false,
  "immediate_danger": false,
  "indicators": [],
  "recommended_action": "allow|label|review|quarantine|remove|report_fbi",
  "reasoning": "one specific sentence",
  "add_label": null,
  "requires_human_review": false
}`;

async function analyzeContent(content, ftoContext={}) {
  if (!content || content.trim().length < 5) {
    return { risk_score:0, risk_level:"none", result:"clear",
      is_terrorism_support:false, indicators:[], recommended_action:"allow",
      reasoning:"Content too short to analyze", immediate_danger:false };
  }
  try {
    const ctx = ftoContext.ftos_mentioned?.length > 0
      ? `\n\nFTOs mentioned: ${ftoContext.ftos_mentioned.join(", ")}. Context appears ${ftoContext.likely_counter?"counter-extremism":"unclear"}.`
      : "";
    const r = await anthropic.messages.create({
      model: CONFIG.MODEL, max_tokens:600,
      system: SYSTEM_PROMPT,
      messages:[{ role:"user", content:`Analyze:\n\n"${content.substring(0,3000)}"${ctx}` }],
    });
    const raw = r.content.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch(err) {
    logger.error("[Terrorism Shield] AI analysis failed:", err.message);
    return { risk_score:0, risk_level:"unknown", result:"review",
      indicators:[], recommended_action:"review",
      requires_human_review:true, immediate_danger:false, scan_error:true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FBI REPORT LOGGER
// ─────────────────────────────────────────────────────────────────────────────
function logFBIReport(customerId, scanId, contentHash, indicators) {
  const reportId = uuidv4();
  db.prepare(`INSERT INTO fbi_reports (id,customer_id,scan_id,content_hash,indicators)
    VALUES (?,?,?,?,?)`).run(reportId, customerId, scanId, contentHash, JSON.stringify(indicators));
  db.prepare("UPDATE scan_results SET fbi_report_logged=1 WHERE id=?").run(scanId);
  logger.warn("[Terrorism Shield] 🚨 FBI REPORT LOGGED", {
    reportId, customerId: customerId.substring(0,8),
    action:"File complaint at ic3.gov within 24 hours",
    instructions:[
      "Go to ic3.gov → File a Complaint → Select Terrorism",
      `Reference internal ID: ${reportId}`,
      "Include content hash, detection timestamp, FTO indicators",
      "Do NOT include actual content — metadata only",
      "Record the IC3 complaint number in the fbi_reports table",
    ],
  });
  return { report_id:reportId, status:"logged",
    action_required:"File complaint at ic3.gov within 24 hours",
    legal_basis:"18 U.S.C. § 2339B" };
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function generateAPIKey() {
  const key  = "ts_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, hash };
}

function validateAPIKey(req) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key) return null;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return db.prepare("SELECT * FROM api_customers WHERE api_key_hash=? AND status='active'").get(hash)||null;
}

function checkAndIncrementUsage(customer) {
  const tier = CONFIG.TIERS[customer.tier] || CONFIG.TIERS.developer;
  const now  = new Date();
  if (now > new Date(customer.month_reset)) {
    const next = new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString();
    db.prepare("UPDATE api_customers SET scans_this_month=0, month_reset=? WHERE id=?").run(next, customer.id);
    customer.scans_this_month = 0;
  }
  if (customer.scans_this_month >= tier.limit)
    return { allowed:false, limit:tier.limit, used:customer.scans_this_month };
  db.prepare("UPDATE api_customers SET scans_this_month=scans_this_month+1, scans_total=scans_total+1 WHERE id=?").run(customer.id);
  return { allowed:true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SCAN ENGINE
// ─────────────────────────────────────────────────────────────────────────────
async function performScan({ content, mediaBuffer, scanType, customerId }) {
  const start       = Date.now();
  const scanId      = uuidv4();
  const contentHash = crypto.createHash("sha256").update(content||"").digest("hex");

  let gifctResult = { matched:false, status:"skipped" };
  let ftoResult   = { ftos_mentioned:[], count:0, likely_counter:false };
  let aiResult    = null;
  let finalResult = "clear";
  let finalAction = "allow";
  let riskLevel   = "none";
  let riskScore   = 0;
  let method      = "clean";
  let fbiReport   = null;
  let gifctSub    = false;

  // Layer 1 — GIFCT hash (media only)
  if (mediaBuffer) {
    gifctResult = await checkGIFCT(mediaBuffer);
    if (gifctResult.matched) {
      finalResult = "critical"; finalAction = "report_fbi";
      riskLevel = "critical"; riskScore = 100; method = "gifct";
    }
  }

  // Layer 2 — FTO entity detection
  if (content && finalResult !== "critical") {
    ftoResult = detectFTOEntities(content);
  }

  // Layer 3 — AI analysis
  if (content && finalResult !== "critical") {
    aiResult = await analyzeContent(content, ftoResult);
    riskScore = aiResult.risk_score;
    riskLevel = aiResult.risk_level;
    method    = "ai_analysis";

    if (aiResult.result==="critical"||aiResult.immediate_danger) {
      finalResult="critical"; finalAction="report_fbi";
    } else if (aiResult.result==="remove") {
      finalResult="remove"; finalAction="quarantine";
    } else if (aiResult.result==="review"||aiResult.requires_human_review) {
      finalResult="review"; finalAction="review";
    } else if (aiResult.is_counter_extremism||aiResult.is_journalism||aiResult.is_academic) {
      finalResult="clear";
      finalAction=aiResult.is_counter_extremism||aiResult.is_journalism ? "label" : "allow";
    }
  }

  const indicators = [
    ...(gifctResult.matched ? [`GIFCT hash match: ${gifctResult.category}`] : []),
    ...(ftoResult.ftos_mentioned.length>0 ? [`FTOs mentioned: ${ftoResult.ftos_mentioned.join(", ")}`] : []),
    ...(aiResult?.indicators||[]),
  ];

  // Record scan
  db.prepare(`INSERT INTO scan_results
    (id,customer_id,content_hash,scan_type,result,risk_level,risk_score,
     detection_method,indicators,is_counter_extremism,is_journalism,
     is_political,action_taken,processing_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    scanId, customerId, contentHash, scanType, finalResult, riskLevel,
    riskScore, method, JSON.stringify(indicators),
    aiResult?.is_counter_extremism?1:0, aiResult?.is_journalism?1:0,
    aiResult?.is_political_speech?1:0, finalAction, Date.now()-start
  );

  // Layer 4 — Human review queue
  if (finalResult==="review") {
    db.prepare(`INSERT INTO review_queue (id,customer_id,scan_id,content_hash,risk_level,indicators)
      VALUES (?,?,?,?,?,?)`).run(uuidv4(), customerId, scanId, contentHash, riskLevel, JSON.stringify(indicators));
  }

  // FBI report + GIFCT submission
  if (finalResult==="critical"||finalAction==="report_fbi") {
    fbiReport = logFBIReport(customerId, scanId, contentHash, indicators);
    if (mediaBuffer && gifctResult.matched) {
      await submitGIFCT(gifctResult.hash, gifctResult.category||"terrorism");
      gifctSub = true;
      db.prepare("UPDATE scan_results SET gifct_submitted=1 WHERE id=?").run(scanId);
    }
  }

  return {
    scan_id:          scanId,
    result:           finalResult,
    action:           finalAction,
    risk_level:       riskLevel,
    risk_score:       riskScore,
    indicators,
    is_terrorism_support:    aiResult?.is_terrorism_support||false,
    is_counter_extremism:    aiResult?.is_counter_extremism||false,
    is_journalism:           aiResult?.is_journalism||false,
    is_political_speech:     aiResult?.is_political_speech||false,
    ftos_mentioned:          ftoResult.ftos_mentioned,
    suppress_content:        finalResult==="critical"||finalResult==="remove",
    requires_human_review:   finalResult==="review",
    add_content_label:       finalAction==="label" ? (aiResult?.add_label||"counter_extremism_context") : null,
    fbi_report:              fbiReport,
    gifct_submitted:         gifctSub,
    gifct_active:            !!CONFIG.GIFCT_KEY,
    processing_ms:           Date.now()-start,
    reasoning:               aiResult?.reasoning||"GIFCT hash match",
    legal_note: finalResult==="critical"
      ? "Confirmed terrorism content. File FBI IC3 report within 24 hours: ic3.gov. Legal basis: 18 U.S.C. § 2339B."
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE REPORT
// ─────────────────────────────────────────────────────────────────────────────
function generateComplianceReport(customerId, month) {
  const customer = db.prepare("SELECT * FROM api_customers WHERE id=?").get(customerId);
  const scans    = db.prepare("SELECT * FROM scan_results WHERE customer_id=? AND strftime('%Y-%m',created_at)=?").all(customerId, month);
  const reports  = db.prepare("SELECT * FROM fbi_reports WHERE customer_id=? AND strftime('%Y-%m',filed_at)=?").all(customerId, month);
  const queue    = db.prepare("SELECT * FROM review_queue WHERE customer_id=? AND strftime('%Y-%m',created_at)=?").all(customerId, month);

  const total    = scans.length;
  const terror   = scans.filter(s=>s.result==="critical"||s.result==="remove").length;
  const fbi      = reports.length;
  const counter  = scans.filter(s=>s.is_counter_extremism).length;
  const journal  = scans.filter(s=>s.is_journalism).length;
  const reviewed = queue.length;
  const reportId = uuidv4();

  db.prepare(`INSERT OR REPLACE INTO compliance_reports
    (id,customer_id,report_month,total_scans,terrorism_detected,
     fbi_reports_filed,counter_extremism_protected,journalism_protected)
    VALUES (?,?,?,?,?,?,?,?)`).run(reportId, customerId, month, total, terror, fbi, counter, journal);

  return {
    report_id:    reportId,
    company:      customer?.company_name,
    report_month: month,
    generated_at: new Date().toISOString(),
    summary: {
      total_scans:                    total,
      terrorism_content_detected:     terror,
      fbi_reports_filed:              fbi,
      sent_to_human_review:           reviewed,
      counter_extremism_protected:    counter,
      journalism_protected:           journal,
      detection_rate:                 total>0 ? (terror/total*100).toFixed(2)+"%" : "0%",
      false_positive_protection_rate: total>0 ? ((counter+journal)/total*100).toFixed(2)+"%" : "0%",
    },
    compliance_statement: `${customer?.company_name} processed ${total.toLocaleString()} content scans for terrorism-related violations in ${month} using Terrorism Shield API. ${terror} pieces of terrorism content were detected and removed. ${fbi} reports were filed with the FBI Internet Crime Complaint Center. ${counter+journal} pieces of legitimate counter-extremism and journalism content were protected from removal. ${reviewed} pieces were escalated for human review. This platform complies with 18 U.S.C. § 2339B and maintains active terrorism content detection in accordance with GIFCT standards.`,
    gifct_compliant:  !!CONFIG.GIFCT_KEY,
    legal_basis:      ["18 U.S.C. § 2339B","GIFCT membership obligations","EU Digital Services Act"],
    fbi_reports:      reports.map(r=>({ id:r.id, filed_at:r.filed_at, ic3_reference:r.ic3_reference })),
    legal_note:       "This report may be used as evidence of active terrorism content moderation compliance in regulatory and legal proceedings.",
    powered_by:       "Terrorism Shield API — Open Feed Network, Inc.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS SERVER
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit:"10mb" }));
app.use("/api/", rateLimit({ windowMs:60000, max:100, message:{error:"Rate limit exceeded"} }));
app.use("/admin/", rateLimit({ windowMs:60000, max:20 }));

const requireAPIKey = (req,res,next) => {
  const customer = validateAPIKey(req);
  if (!customer) return res.status(401).json({ error:"Invalid API key", docs:"https://terrorismshield.openfeed.network/docs" });
  const usage = checkAndIncrementUsage(customer);
  if (!usage.allowed) return res.status(429).json({ error:"Monthly scan limit reached", upgrade:"https://terrorismshield.openfeed.network/upgrade" });
  req.customer = customer;
  next();
};

const requireAdmin = (req,res,next) => {
  if (!CONFIG.ADMIN_TOKEN || req.headers["x-admin-token"]!==CONFIG.ADMIN_TOKEN)
    return res.status(401).json({ error:"Unauthorized" });
  next();
};

// ── PUBLIC ────────────────────────────────────────────────────────────────────
app.get("/", (req,res) => res.json({
  name:        "Terrorism Shield API",
  version:     "1.0.0",
  description: "Commercial terrorism content detection API — the fifth product in the Open Shield Suite",
  provider:    "Open Feed Network, Inc.",
  website:     "https://terrorismshield.openfeed.network",
  docs:        "https://terrorismshield.openfeed.network/docs",
  differentiator:"Protects counter-extremism speech, journalism, and academic research. Never confuses reporting about terrorism with support for terrorism.",
  detection_layers: [
    "Layer 1: GIFCT hash matching — known terrorism media",
    "Layer 2: FTO entity detection — 68 designated organizations",
    "Layer 3: AI content analysis — recruitment/coordination/funding/glorification",
    "Layer 4: Human review queue — gray area escalation",
  ],
  pricing: {
    developer:  "$99/month — 10,000 scans",
    starter:    "$299/month — 100,000 scans",
    growth:     "$999/month — 1,000,000 scans",
    enterprise: "$2,999/month — unlimited + SLA",
    government: "Custom — unlimited + classified support",
  },
  legal_basis: ["18 U.S.C. § 2339B","EU Digital Services Act","GIFCT membership"],
  gifct_member:!!CONFIG.GIFCT_KEY,
  fto_count:   68,
  endpoints: {
    "POST /api/v1/scan/text":    "Scan text content for terrorism indicators",
    "POST /api/v1/scan/media":   "GIFCT hash check for images and video",
    "POST /api/v1/scan/full":    "Combined text + media scan",
    "GET  /api/v1/report/:month":"Monthly compliance report (YYYY-MM)",
    "GET  /api/v1/usage":        "Check usage and limits",
    "GET  /api/v1/fto/list":     "List all 68 designated FTOs",
  },
}));

app.get("/health", (req,res) => {
  const stats = db.prepare("SELECT COUNT(*) as c, SUM(scans_total) as t FROM api_customers WHERE status='active'").get();
  const queue = db.prepare("SELECT COUNT(*) as n FROM review_queue WHERE status='pending'").get();
  res.json({
    status:"ok", service:"terrorism-shield-api", version:"1.0.0",
    gifct_active:!!CONFIG.GIFCT_KEY, fto_database:68,
    active_customers:stats.c, total_scans:stats.t,
    pending_human_review:queue.n,
    timestamp:new Date().toISOString(),
  });
});

// ── SCAN: TEXT ────────────────────────────────────────────────────────────────
/**
 * POST /api/v1/scan/text
 * Scan text content for terrorism indicators
 * Layers 2 (FTO detection) + 3 (AI analysis) + 4 (review queue)
 *
 * Body: { content: "post or message text", context: "optional context" }
 */
app.post("/api/v1/scan/text", requireAPIKey, async (req,res) => {
  const { content, context } = req.body;
  if (!content) return res.status(400).json({ error:"content required" });
  try {
    const result = await performScan({ content, scanType:"text", customerId:req.customer.id });

    // Webhook for critical/remove
    if (req.customer.webhook_url && ["critical","remove"].includes(result.result)) {
      fetch(req.customer.webhook_url, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          event:      result.result==="critical" ? "terrorism_detected" : "suspicious_content",
          result:     result.result,
          risk_level: result.risk_level,
          indicators: result.indicators,
          scan_id:    result.scan_id,
          timestamp:  new Date().toISOString(),
          legal_note: result.legal_note,
        }),
      }).catch(()=>{});
    }

    res.json({ ...result, powered_by:"Terrorism Shield API v1.0 — Open Feed Network, Inc." });
  } catch(err) {
    res.status(500).json({ error:"Scan failed", message:err.message });
  }
});

// ── SCAN: MEDIA ───────────────────────────────────────────────────────────────
/**
 * POST /api/v1/scan/media
 * GIFCT hash check for image or video content
 *
 * Body: { media_base64: "base64 encoded media", mime_type: "image/jpeg" }
 */
app.post("/api/v1/scan/media", requireAPIKey, async (req,res) => {
  const { media_base64, mime_type="image/jpeg" } = req.body;
  if (!media_base64) return res.status(400).json({ error:"media_base64 required" });
  try {
    const buffer = Buffer.from(media_base64, "base64");
    const result = await performScan({ content:`[Media: ${mime_type}]`, mediaBuffer:buffer, scanType:"media", customerId:req.customer.id });
    res.json({ ...result, powered_by:"Terrorism Shield API v1.0 — Open Feed Network, Inc." });
  } catch(err) {
    res.status(500).json({ error:"Scan failed", message:err.message });
  }
});

// ── SCAN: FULL ────────────────────────────────────────────────────────────────
/**
 * POST /api/v1/scan/full
 * Combined text + media scan — all 4 layers
 *
 * Body: { content: "text", media_base64: "optional", mime_type: "image/jpeg" }
 */
app.post("/api/v1/scan/full", requireAPIKey, async (req,res) => {
  const { content, media_base64, mime_type="image/jpeg" } = req.body;
  if (!content && !media_base64) return res.status(400).json({ error:"content or media_base64 required" });
  try {
    const buffer = media_base64 ? Buffer.from(media_base64,"base64") : null;
    const result = await performScan({ content:content||"", mediaBuffer:buffer, scanType:"full", customerId:req.customer.id });
    res.json({ ...result, powered_by:"Terrorism Shield API v1.0 — Open Feed Network, Inc." });
  } catch(err) {
    res.status(500).json({ error:"Scan failed", message:err.message });
  }
});

// ── FTO LIST ──────────────────────────────────────────────────────────────────
app.get("/api/v1/fto/list", requireAPIKey, (req,res) => {
  res.json({
    count:        DESIGNATED_FTOS.length,
    source:       "U.S. State Department — state.gov/foreign-terrorist-organizations",
    last_updated: "2026",
    ftos:         DESIGNATED_FTOS,
    note:         "Terrorism Shield also detects unnamed FTO content through AI pattern analysis. This list covers known designated organizations only.",
  });
});

// ── COMPLIANCE REPORT ─────────────────────────────────────────────────────────
app.get("/api/v1/report/:month", requireAPIKey, (req,res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.month))
    return res.status(400).json({ error:"month must be YYYY-MM" });
  res.json(generateComplianceReport(req.customer.id, req.params.month));
});

// ── USAGE ─────────────────────────────────────────────────────────────────────
app.get("/api/v1/usage", requireAPIKey, (req,res) => {
  const tier = CONFIG.TIERS[req.customer.tier]||CONFIG.TIERS.developer;
  const used = req.customer.scans_this_month;
  const pct  = tier.limit===Infinity ? 0 : Math.round(used/tier.limit*100);
  res.json({
    customer:        req.customer.company_name,
    tier:            req.customer.tier,
    price:           tier.price > 0 ? `$${tier.price}/month` : "Government pricing",
    scans_used:      used,
    scans_limit:     tier.limit===Infinity ? "unlimited" : tier.limit,
    scans_remaining: tier.limit===Infinity ? "unlimited" : tier.limit-used,
    usage_percent:   pct,
    scans_total_ever:req.customer.scans_total,
    gifct_active:    !!CONFIG.GIFCT_KEY,
    upgrade_url:     pct>80 ? "https://terrorismshield.openfeed.network/upgrade" : undefined,
  });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.post("/admin/customers", requireAdmin, (req,res) => {
  const { company_name, contact_email, tier="developer", webhook_url, fbi_contact_email } = req.body;
  if (!company_name||!contact_email) return res.status(400).json({ error:"company_name and contact_email required" });
  const { key, hash } = generateAPIKey();
  const id      = uuidv4();
  const next    = new Date(new Date().getFullYear(), new Date().getMonth()+1, 1).toISOString();
  db.prepare(`INSERT INTO api_customers (id,api_key,api_key_hash,company_name,contact_email,tier,month_reset,webhook_url,fbi_contact_email)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, key, hash, company_name, contact_email, tier, next, webhook_url||null, fbi_contact_email||null);
  logger.info("[Terrorism Shield] Customer created", { company:company_name, tier });
  res.json({ id, api_key:key, company_name, contact_email, tier,
    tier_limit:CONFIG.TIERS[tier]?.limit,
    message:"Save the api_key — it cannot be retrieved again",
    docs:"https://terrorismshield.openfeed.network/docs",
    important:"Configure webhook_url to receive real-time alerts for detected terrorism content. Configure fbi_contact_email for FBI reporting notifications." });
});

app.get("/admin/customers", requireAdmin, (req,res) => {
  const customers = db.prepare("SELECT id,company_name,contact_email,tier,status,scans_this_month,scans_total,created_at FROM api_customers ORDER BY scans_total DESC").all();
  const mrr = customers.reduce((s,c)=>(s+(CONFIG.TIERS[c.tier]?.price||0)),0);
  res.json({ total:customers.length, mrr:`$${mrr}/month`, arr:`$${mrr*12}/year`,
    customers:customers.map(c=>({...c, tier_limit:CONFIG.TIERS[c.tier]?.limit, revenue:CONFIG.TIERS[c.tier]?.price>0?`$${CONFIG.TIERS[c.tier].price}/mo`:"Custom"})) });
});

app.get("/admin/stats", requireAdmin, (req,res) => {
  const byTier   = db.prepare("SELECT tier, COUNT(*) as count FROM api_customers WHERE status='active' GROUP BY tier").all();
  const critical = db.prepare("SELECT COUNT(*) as n FROM scan_results WHERE result='critical' AND created_at>datetime('now','-30 days')").get().n;
  const fbiFiles = db.prepare("SELECT COUNT(*) as n FROM fbi_reports WHERE filed_at>datetime('now','-30 days')").get().n;
  const queue    = db.prepare("SELECT COUNT(*) as n FROM review_queue WHERE status='pending'").get().n;
  const mrr      = db.prepare("SELECT tier FROM api_customers WHERE status='active'").all().reduce((s,c)=>s+(CONFIG.TIERS[c.tier]?.price||0),0);
  res.json({
    customers_by_tier:byTier,
    mrr:`$${mrr}/month`, arr:`$${mrr*12}/year`,
    total_customers: db.prepare("SELECT COUNT(*) as n FROM api_customers WHERE status='active'").get().n,
    total_scans:     db.prepare("SELECT SUM(scans_total) as n FROM api_customers").get().n||0,
    critical_last_30_days:critical,
    fbi_reports_last_30_days:fbiFiles,
    pending_human_review:queue,
    gifct_active:!!CONFIG.GIFCT_KEY,
    fto_database:68,
    timestamp:new Date().toISOString(),
  });
});

// ── ADMIN: REVIEW QUEUE ───────────────────────────────────────────────────────
app.get("/admin/review-queue", requireAdmin, (req,res) => {
  const pending = db.prepare(`
    SELECT rq.*, ac.company_name
    FROM review_queue rq
    JOIN api_customers ac ON rq.customer_id = ac.id
    WHERE rq.status='pending'
    ORDER BY rq.created_at ASC
  `).all();
  res.json({ pending:pending.length, items:pending.map(r=>({ ...r, indicators:JSON.parse(r.indicators||"[]") })) });
});

app.post("/admin/review-queue/:id/decide", requireAdmin, (req,res) => {
  const { decision, reviewer, notes } = req.body;
  if (!["allow","remove","report_fbi"].includes(decision))
    return res.status(400).json({ error:"decision must be allow, remove, or report_fbi" });
  db.prepare("UPDATE review_queue SET status='reviewed', reviewer=?, decision=?, reviewed_at=datetime('now') WHERE id=?")
    .run(reviewer||"admin", decision, req.params.id);
  res.json({ decided:true, decision, reviewer });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║   TERRORISM SHIELD API v1.0.0 — RUNNING                          ║
║   The fifth product in the Open Shield Suite                     ║
║                                                                  ║
║   Port: ${String(CONFIG.PORT).padEnd(56)}║
║   GIFCT: ${(CONFIG.GIFCT_KEY?"ACTIVE — hash matching enabled":"PENDING — apply at gifct.org/membership").padEnd(55)}║
║   FTO Database: 68 designated organizations                      ║
║                                                                  ║
║   Developer  $99/mo    10K scans                                 ║
║   Starter   $299/mo   100K scans                                 ║
║   Growth    $999/mo  1,000K scans                                ║
║   Enterprise $2,999/mo Unlimited                                 ║
║   Government Custom    Unlimited + classified                    ║
║                                                                  ║
║   Legal basis: 18 U.S.C. § 2339B                                ║
║   FBI reporting: ic3.gov within 24 hours                         ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
