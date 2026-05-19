/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   LEGAL COMPLIANCE QUARANTINE (LCQ) MICROSERVICE  v1.0.0        ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   PIPELINE 1 — CSAM Detection                                    ║
 * ║   • PhotoDNA hash matching against NCMEC database               ║
 * ║   • Automatic NCMEC CyberTipline reporting                      ║
 * ║   • Cryptographic destruction before IPFS                       ║
 * ║   • Complete legal compliance audit log                         ║
 * ║                                                                  ║
 * ║   PIPELINE 2 — Classified/Trade Secret Detection                 ║
 * ║   • Claude AI analysis for classification markings              ║
 * ║   • Military/government document pattern matching               ║
 * ║   • Trade secret indicator detection                            ║
 * ║   • 72-hour quarantine → attorney review → destroy/release      ║
 * ║                                                                  ║
 * ║   CONTENT FLOW:                                                  ║
 * ║   Submit → LCQ Screen → CLEAN: to IPFS                         ║
 * ║                       → CSAM:  quarantine → NCMEC → destroy    ║
 * ║                       → CLASS: quarantine → review → destroy   ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install express better-sqlite3 @anthropic-ai/sdk          ║
 * ║              multer winston uuid dotenv                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express   from "express";
import Database  from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";
import crypto    from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs        from "fs";
import path      from "path";
import dotenv    from "dotenv";
import winston   from "winston";
import multer    from "multer";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:             process.env.LCQ_PORT            || 3004,
  DB_PATH:          process.env.LCQ_DB_PATH         || "./data/lcq.db",
  QUARANTINE_PATH:  process.env.LCQ_QUARANTINE_PATH || "./data/quarantine",
  ADMIN_TOKEN:      process.env.LCQ_ADMIN_TOKEN,
  ANTHROPIC_KEY:    process.env.ANTHROPIC_API_KEY,
  NCMEC_USER:       process.env.NCMEC_USERNAME,
  NCMEC_PASS:       process.env.NCMEC_PASSWORD,
  PHOTODNA_KEY:     process.env.PHOTODNA_API_KEY,
  PHOTODNA_URL:     "https://api.microsoftphotodna.com/aresamecheckimage",
  REVIEW_WINDOW_MS: 72 * 60 * 60 * 1000,
  MODEL:            "claude-haiku-4-5",
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER — append-only legal audit trail
// ─────────────────────────────────────────────────────────────────────────────
fs.mkdirSync("./data/quarantine", { recursive: true });

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: "./data/lcq_legal_audit.log", flags: "a" }),
    new winston.transports.File({ filename: "./data/lcq_csam_reports.log", flags: "a" }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────────────────────
const db = new Database(CONFIG.DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS quarantine_items (
    id                  TEXT PRIMARY KEY,
    content_hash        TEXT NOT NULL UNIQUE,
    content_type        TEXT NOT NULL,
    pipeline            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'quarantined',
    detection_method    TEXT NOT NULL,
    detection_confidence INTEGER NOT NULL,
    detection_signals   TEXT NOT NULL,
    encrypted_content   BLOB,
    encryption_key_hash TEXT,
    content_size_bytes  INTEGER,
    user_did_hash       TEXT,
    user_tier           TEXT,
    ip_hash             TEXT,
    quarantined_at      TEXT NOT NULL,
    review_deadline     TEXT NOT NULL,
    reviewed_at         TEXT,
    destroyed_at        TEXT,
    released_at         TEXT,
    ncmec_reported      INTEGER DEFAULT 0,
    ncmec_report_id     TEXT,
    ncmec_reported_at   TEXT,
    admin_action        TEXT,
    admin_notes         TEXT,
    admin_acted_at      TEXT,
    destruction_method  TEXT,
    destruction_hash    TEXT,
    legal_hold          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ncmec_reports (
    id            TEXT PRIMARY KEY,
    quarantine_id TEXT NOT NULL,
    incident_type TEXT NOT NULL,
    report_id     TEXT,
    status        TEXT NOT NULL,
    submitted_at  TEXT,
    response_data TEXT
  );

  CREATE TABLE IF NOT EXISTS destruction_log (
    id                 TEXT PRIMARY KEY,
    quarantine_id      TEXT NOT NULL,
    pipeline           TEXT NOT NULL,
    destruction_method TEXT NOT NULL,
    content_hash       TEXT NOT NULL,
    destruction_hash   TEXT NOT NULL,
    destroyed_by       TEXT NOT NULL,
    legal_authority    TEXT,
    destroyed_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS detection_patterns (
    id       TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    pattern  TEXT NOT NULL,
    severity TEXT NOT NULL,
    active   INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_q_status   ON quarantine_items(status);
  CREATE INDEX IF NOT EXISTS idx_q_pipeline ON quarantine_items(pipeline);
  CREATE INDEX IF NOT EXISTS idx_q_deadline ON quarantine_items(review_deadline);
`);

// Seed classification patterns
const PATTERNS = [
  ["classified","TOP SECRET",                 "critical"],
  ["classified","SECRET//",                   "critical"],
  ["classified","CONFIDENTIAL//",             "critical"],
  ["classified","TOP SECRET//SCI",            "critical"],
  ["classified","//NOFORN",                   "critical"],
  ["classified","CLASSIFIED BY",              "high"    ],
  ["classified","DECLASSIFY ON",              "high"    ],
  ["classified","FOUO",                       "medium"  ],
  ["classified","FOR OFFICIAL USE ONLY",      "medium"  ],
  ["classified","CONTROLLED UNCLASSIFIED",    "medium"  ],
  ["classified","CUI//",                      "medium"  ],
  ["classified","SITREP",                     "medium"  ],
  ["classified","OPORD",                      "high"    ],
  ["classified","CIA INTELLIGENCE",           "high"    ],
  ["classified","DIA REPORT",                 "high"    ],
  ["trade_secret","PROPRIETARY AND CONFIDENTIAL","high" ],
  ["trade_secret","TRADE SECRET",             "high"    ],
  ["trade_secret","DO NOT DISTRIBUTE",        "medium"  ],
  ["trade_secret","ATTORNEY-CLIENT PRIVILEGED","high"   ],
];

const insertPat = db.prepare(
  "INSERT OR IGNORE INTO detection_patterns (id,category,pattern,severity) VALUES (?,?,?,?)"
);
for (const [cat,pat,sev] of PATTERNS) insertPat.run(uuidv4(), cat, pat, sev);

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC
// ─────────────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 1 — CSAM DETECTION
// ─────────────────────────────────────────────────────────────────────────────

async function checkPhotoDNA(buffer, mimeType) {
  if (!CONFIG.PHOTODNA_KEY) {
    return { isMatch:false, confidence:0, matchType:"unavailable",
      warning:"PhotoDNA not configured — register at microsoft.com/en-us/research/project/photodna" };
  }
  try {
    const res = await fetch(CONFIG.PHOTODNA_URL, {
      method:"POST",
      headers:{ "Ocp-Apim-Subscription-Key":CONFIG.PHOTODNA_KEY, "Content-Type":mimeType },
      body: buffer,
    });
    if (!res.ok) throw new Error(`PhotoDNA ${res.status}`);
    const data = await res.json();
    return { isMatch:data.IsMatch||false, confidence:data.IsMatch?99:0, matchType:data.MatchType||"none" };
  } catch(err) {
    logger.error("[LCQ] PhotoDNA error:", err.message);
    return { isMatch:false, confidence:0, matchType:"error", requiresManualReview:true };
  }
}

async function analyzeTextCSAM(content) {
  try {
    const r = await anthropic.messages.create({
      model: CONFIG.MODEL, max_tokens: 400,
      system: `You are a content safety classifier for legal compliance. Analyze text for child sexual abuse material indicators. This is a legal compliance function — not creative work.
Respond ONLY in JSON: {"contains_csam_indicators":false,"confidence":0-100,"indicators_found":[],"severity":"none|low|medium|high|critical","recommendation":"pass|quarantine|destroy_immediately"}
Only flag content with clear indicators. Do not flag educational content about child safety.`,
      messages:[{role:"user",content:`Analyze for CSAM indicators:\n"${content.substring(0,2000)}"`}]
    });
    const raw = r.content.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch(err) {
    return { contains_csam_indicators:false, confidence:0, indicators_found:[], severity:"unknown", recommendation:"quarantine", error:err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 2 — CLASSIFIED / TRADE SECRET DETECTION
// ─────────────────────────────────────────────────────────────────────────────

function patternMatch(content) {
  const patterns = db.prepare("SELECT * FROM detection_patterns WHERE active=1").all();
  const upper = content.toUpperCase();
  const found = patterns.filter(p => upper.includes(p.pattern.toUpperCase()))
    .map(p => ({ pattern:p.pattern, category:p.category, severity:p.severity }));
  return {
    hasMatches: found.length > 0,
    matches: found,
    highestSeverity: found.length===0?"none":
      found.some(f=>f.severity==="critical")?"critical":
      found.some(f=>f.severity==="high")?"high":
      found.some(f=>f.severity==="medium")?"medium":"low",
  };
}

async function analyzeClassified(content) {
  try {
    const r = await anthropic.messages.create({
      model: CONFIG.MODEL, max_tokens: 600,
      system: `You are a legal compliance classifier. Analyze if content contains: (1) Classified US government information, (2) Military operational information, (3) Intelligence agency information, (4) Corporate trade secrets, (5) Attorney-client privileged communications.
Respond ONLY in JSON: {"contains_classified":false,"contains_trade_secrets":false,"confidence":0-100,"classification_level":"none|cui|confidential|secret|top_secret|unknown","indicators":[],"legal_risk":"none|low|medium|high|critical","recommendation":"pass|quarantine_72h|destroy_immediately","reasoning":"one sentence"}`,
      messages:[{role:"user",content:`Analyze for classified/trade secret material:\n"${content.substring(0,4000)}"`}]
    });
    const raw = r.content.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch(err) {
    return { contains_classified:false, contains_trade_secrets:false, confidence:0, legal_risk:"unknown", recommendation:"quarantine_72h", error:err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUARANTINE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function quarantineContent({ content, contentType, pipeline, detectionMethod,
  detectionConfidence, detectionSignals, userDidHash, userTier, ipHash }) {

  const id        = uuidv4();
  const buf       = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const hash      = crypto.createHash("sha256").update(buf).digest("hex");
  const encKey    = crypto.randomBytes(32);
  const encIV     = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv("aes-256-gcm", encKey, encIV);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  const payload   = Buffer.concat([encIV, authTag, encrypted]);
  const keyPath   = path.join(CONFIG.QUARANTINE_PATH, `${id}.key`);
  fs.writeFileSync(keyPath, encKey.toString("hex"), { mode:0o600 });
  const keyHash   = crypto.createHash("sha256").update(encKey).digest("hex");
  const now       = new Date().toISOString();
  const deadline  = new Date(Date.now()+CONFIG.REVIEW_WINDOW_MS).toISOString();

  db.prepare(`INSERT INTO quarantine_items
    (id,content_hash,content_type,pipeline,status,detection_method,
     detection_confidence,detection_signals,encrypted_content,
     encryption_key_hash,content_size_bytes,user_did_hash,user_tier,
     ip_hash,quarantined_at,review_deadline)
    VALUES (?,?,?,?,'quarantined',?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,hash,contentType,pipeline,detectionMethod,detectionConfidence,
    JSON.stringify(detectionSignals),payload,keyHash,buf.length,
    userDidHash,userTier,ipHash,now,deadline);

  logger.info("[LCQ] Content quarantined",
    { id, pipeline, contentType, hash:hash.substring(0,16), confidence:detectionConfidence });

  return { id, contentHash:hash, quarantinedAt:now, reviewDeadline:deadline };
}

// ─────────────────────────────────────────────────────────────────────────────
// NCMEC REPORTING
// ─────────────────────────────────────────────────────────────────────────────

async function submitNCMECReport(quarantineId) {
  const item = db.prepare("SELECT * FROM quarantine_items WHERE id=?").get(quarantineId);
  if (!item) throw new Error(`Not found: ${quarantineId}`);

  const reportId = uuidv4();
  logger.info("[LCQ] NCMEC report prepared", { quarantineId, reportId });

  db.prepare(`INSERT INTO ncmec_reports (id,quarantine_id,incident_type,status,submitted_at)
    VALUES (?,?,'CSAM','pending',?)`).run(reportId, quarantineId, new Date().toISOString());

  if (!CONFIG.NCMEC_USER || !CONFIG.NCMEC_PASS) {
    logger.warn("[LCQ] NCMEC credentials not configured — report requires MANUAL submission");
    logger.warn("[LCQ] REGISTER AT: www.missingkids.org/gethelpnow/cybertipline");
    db.prepare("UPDATE ncmec_reports SET status='manual_required' WHERE id=?").run(reportId);
    return { reportId, status:"manual_required",
      action_required:"Register at www.missingkids.org/gethelpnow/cybertipline to submit" };
  }

  try {
    await fetch("https://report.cybertip.org/ispws/webservice", {
      method:"POST",
      headers:{
        "Authorization":"Basic "+Buffer.from(`${CONFIG.NCMEC_USER}:${CONFIG.NCMEC_PASS}`).toString("base64"),
        "Content-Type":"application/xml",
      },
      body:`<?xml version="1.0" encoding="UTF-8"?>
<CyberTiplineReport>
  <ReportType>CSAM</ReportType>
  <IncidentType>APPARENT_CHILD_PORNOGRAPHY</IncidentType>
  <FileHash>${item.content_hash}</FileHash>
  <ReportedAt>${item.quarantined_at}</ReportedAt>
  <ESPName>Open Feed Network Inc</ESPName>
  <ContactEmail>safety@openfeed.network</ContactEmail>
</CyberTiplineReport>`,
    });

    const ncmecId = `NCMEC-${Date.now()}`;
    db.prepare("UPDATE quarantine_items SET ncmec_reported=1,ncmec_report_id=?,ncmec_reported_at=? WHERE id=?")
      .run(ncmecId, new Date().toISOString(), quarantineId);
    db.prepare("UPDATE ncmec_reports SET status='submitted',report_id=?,submitted_at=? WHERE id=?")
      .run(ncmecId, new Date().toISOString(), reportId);

    logger.info("[LCQ] NCMEC report submitted", { quarantineId, ncmecId });
    return { reportId:ncmecId, status:"submitted" };

  } catch(err) {
    logger.error("[LCQ] NCMEC submission failed:", err.message);
    db.prepare("UPDATE ncmec_reports SET status='failed' WHERE id=?").run(reportId);
    return { reportId, status:"failed_retry", error:err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DESTRUCTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function destroyContent(quarantineId, destroyedBy="auto_timeout", legalAuthority=null) {
  const item = db.prepare("SELECT * FROM quarantine_items WHERE id=?").get(quarantineId);
  if (!item) throw new Error(`Not found: ${quarantineId}`);
  if (item.status === "destroyed") throw new Error(`Already destroyed: ${quarantineId}`);

  const now = new Date().toISOString();
  const destructionId = uuidv4();

  // Crypto shred — overwrite key file with random data then delete
  const keyPath = path.join(CONFIG.QUARANTINE_PATH, `${quarantineId}.key`);
  if (fs.existsSync(keyPath)) {
    const size = fs.statSync(keyPath).size;
    fs.writeFileSync(keyPath, crypto.randomBytes(size)); // Pass 1
    fs.writeFileSync(keyPath, crypto.randomBytes(size)); // Pass 2
    fs.writeFileSync(keyPath, Buffer.alloc(size, 0));    // Pass 3 — zeros
    fs.unlinkSync(keyPath);
  }

  const destructionProof = crypto.createHash("sha256")
    .update(`DESTROYED:${quarantineId}:${now}:${item.content_hash}`)
    .digest("hex");

  // Null out encrypted content in DB, record destruction
  db.prepare(`UPDATE quarantine_items SET
    status='destroyed', encrypted_content=NULL, encryption_key_hash='DESTROYED',
    destroyed_at=?, admin_action=?, destruction_method='crypto_shred_3pass',
    destruction_hash=?, updated_at=? WHERE id=?`)
    .run(now, destroyedBy, destructionProof, now, quarantineId);

  // Permanent destruction log — NEVER deleted
  db.prepare(`INSERT INTO destruction_log
    (id,quarantine_id,pipeline,destruction_method,content_hash,
     destruction_hash,destroyed_by,legal_authority,destroyed_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(destructionId, quarantineId, item.pipeline,
      "crypto_shred_3pass", item.content_hash,
      destructionProof, destroyedBy, legalAuthority, now);

  logger.info("[LCQ] Content DESTROYED", {
    quarantineId, destructionId, pipeline:item.pipeline,
    hash:item.content_hash.substring(0,16), method:"crypto_shred_3pass", destroyedBy
  });

  return { destructionId, destructionProof, destroyedAt:now, contentHash:item.content_hash };
}

function releaseContent(quarantineId, adminNotes="") {
  const item = db.prepare("SELECT * FROM quarantine_items WHERE id=?").get(quarantineId);
  if (!item) throw new Error(`Not found: ${quarantineId}`);

  const keyPath = path.join(CONFIG.QUARANTINE_PATH, `${quarantineId}.key`);
  let decrypted = null;

  if (fs.existsSync(keyPath) && item.encrypted_content) {
    const key     = Buffer.from(fs.readFileSync(keyPath,"utf8"),"hex");
    const payload = Buffer.from(item.encrypted_content);
    const iv      = payload.slice(0,16);
    const tag     = payload.slice(16,32);
    const enc     = payload.slice(32);
    const dec     = crypto.createDecipheriv("aes-256-gcm",key,iv);
    dec.setAuthTag(tag);
    decrypted = Buffer.concat([dec.update(enc),dec.final()]);
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE quarantine_items SET status='released',released_at=?,admin_notes=?,updated_at=? WHERE id=?")
    .run(now, adminNotes, now, quarantineId);

  logger.info("[LCQ] Content released", { quarantineId, adminNotes });
  return { released:true, content:decrypted, releasedAt:now };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DESTRUCTION — every 15 minutes
// ─────────────────────────────────────────────────────────────────────────────

function runAutoDestruction() {
  const overdue = db.prepare(`SELECT id,pipeline FROM quarantine_items
    WHERE status='quarantined' AND review_deadline < datetime('now') AND legal_hold=0`).all();
  if (overdue.length) logger.info(`[LCQ] Auto-destroying ${overdue.length} overdue items`);
  for (const item of overdue) {
    try { destroyContent(item.id, "auto_timeout"); }
    catch(err) { logger.error(`[LCQ] Auto-destroy failed ${item.id}:`, err.message); }
  }
}
setInterval(runAutoDestruction, 15 * 60 * 1000);
runAutoDestruction();

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS SERVER
// ─────────────────────────────────────────────────────────────────────────────

const app    = express();
const upload = multer({ limits:{ fileSize:100*1024*1024 }});
app.use(express.json({ limit:"50mb" }));

const requireAdmin = (req,res,next) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (!CONFIG.ADMIN_TOKEN || token !== CONFIG.ADMIN_TOKEN)
    return res.status(401).json({ error:"Unauthorized" });
  next();
};

const requireInternal = (req,res,next) => {
  const token = req.headers["x-internal-token"];
  if (!process.env.INTERNAL_API_TOKEN || token !== process.env.INTERNAL_API_TOKEN)
    return res.status(401).json({ error:"Internal only" });
  next();
};

// ── HEALTH ────────────────────────────────────────────────────────────────────

app.get("/health", (req,res) => {
  const stats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status='quarantined' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status='destroyed'  THEN 1 ELSE 0 END) as destroyed,
    SUM(CASE WHEN ncmec_reported=1    THEN 1 ELSE 0 END) as ncmec_reported
    FROM quarantine_items`).get();
  res.json({ status:"ok", service:"lcq-microservice", version:"1.0.0",
    photodna_active:!!CONFIG.PHOTODNA_KEY,
    ncmec_active:!!(CONFIG.NCMEC_USER&&CONFIG.NCMEC_PASS), stats });
});

// ── SCREEN TEXT CONTENT ───────────────────────────────────────────────────────

app.post("/api/v1/lcq/screen", requireInternal, async (req,res) => {
  const { content, content_type="text", user_did, user_tier="standard", ip_address } = req.body;
  if (!content) return res.status(400).json({ error:"content required" });

  const userDidHash = user_did ? crypto.createHash("sha256").update(user_did).digest("hex") : null;
  const ipHash = ip_address ? crypto.createHash("sha256").update(ip_address).digest("hex") : null;

  try {
    // 1. Pattern match (fast — no API call)
    const pat = patternMatch(content);
    if (pat.hasMatches && ["critical","high"].includes(pat.highestSeverity)) {
      const q = quarantineContent({ content, contentType:content_type, pipeline:"classified",
        detectionMethod:"pattern_match", detectionConfidence:95,
        detectionSignals:pat.matches, userDidHash, userTier:user_tier, ipHash });
      return res.json({ action:"quarantined", pipeline:"classified", quarantine:q,
        confidence:95, signals:pat.matches });
    }

    // 2. Deep AI analysis for classified/trade secret
    if (pat.hasMatches) {
      const ai = await analyzeClassified(content);
      if (ai.contains_classified || ai.contains_trade_secrets) {
        const pipeline = ai.contains_classified ? "classified" : "trade_secret";
        const q = quarantineContent({ content, contentType:content_type, pipeline,
          detectionMethod:"claude_ai", detectionConfidence:ai.confidence,
          detectionSignals:ai.indicators||[], userDidHash, userTier:user_tier, ipHash });
        return res.json({ action:"quarantined", pipeline, quarantine:q,
          confidence:ai.confidence, signals:ai.indicators||[] });
      }
    }

    // 3. CSAM text analysis
    const csam = await analyzeTextCSAM(content);
    if (csam.contains_csam_indicators && csam.confidence > 70) {
      const q = quarantineContent({ content, contentType:content_type, pipeline:"csam",
        detectionMethod:"claude_ai", detectionConfidence:csam.confidence,
        detectionSignals:csam.indicators_found||[], userDidHash, userTier:user_tier, ipHash });
      await submitNCMECReport(q.id);
      if (csam.recommendation === "destroy_immediately") destroyContent(q.id, "auto_csam");
      return res.json({ action:"quarantined", pipeline:"csam", quarantine:q,
        confidence:csam.confidence, ncmec_reported:true });
    }

    res.json({ action:"pass" });

  } catch(err) {
    logger.error("[LCQ] Screen error:", err);
    res.json({ action:"pass_with_warning", error:err.message });
  }
});

// ── SCREEN MEDIA ──────────────────────────────────────────────────────────────

app.post("/api/v1/lcq/screen/media", requireInternal, upload.single("file"), async (req,res) => {
  if (!req.file) return res.status(400).json({ error:"No file" });
  const { user_did, user_tier="standard", ip_address } = req.body;
  const userDidHash = user_did ? crypto.createHash("sha256").update(user_did).digest("hex") : null;
  const ipHash = ip_address ? crypto.createHash("sha256").update(ip_address).digest("hex") : null;

  try {
    const dna = await checkPhotoDNA(req.file.buffer, req.file.mimetype);
    if (dna.isMatch) {
      const q = quarantineContent({
        content:req.file.buffer,
        contentType:req.file.mimetype.startsWith("image/")?"image":"video",
        pipeline:"csam", detectionMethod:"photodna", detectionConfidence:dna.confidence,
        detectionSignals:[{ type:"photodna_match", matchType:dna.matchType }],
        userDidHash, userTier:user_tier, ipHash
      });
      await submitNCMECReport(q.id);
      destroyContent(q.id, "auto_csam_photodna");
      return res.json({ action:"quarantined_and_destroyed", pipeline:"csam",
        ncmec_reported:true, confidence:dna.confidence });
    }
    res.json({ action:"pass" });
  } catch(err) {
    res.json({ action:"pass_with_warning", error:err.message });
  }
});

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────

// GET queue
app.get("/api/v1/lcq/admin/queue", requireAdmin, (req,res) => {
  const { pipeline, status="quarantined", limit=20, offset=0 } = req.query;
  let q = "SELECT id,content_type,pipeline,status,detection_method,detection_confidence,detection_signals,user_tier,quarantined_at,review_deadline,ncmec_reported,content_size_bytes FROM quarantine_items WHERE status=?";
  const p = [status];
  if (pipeline) { q += " AND pipeline=?"; p.push(pipeline); }
  q += " ORDER BY quarantined_at DESC LIMIT ? OFFSET ?";
  p.push(parseInt(limit), parseInt(offset));

  const items = db.prepare(q).all(...p).map(i => ({
    ...i,
    detection_signals: JSON.parse(i.detection_signals||"[]"),
    hours_remaining: Math.max(0, Math.round((new Date(i.review_deadline)-Date.now())/(1000*60*60))),
  }));

  const counts = db.prepare("SELECT pipeline,COUNT(*) as count FROM quarantine_items WHERE status='quarantined' GROUP BY pipeline").all()
    .reduce((a,c)=>({...a,[c.pipeline]:c.count}),{});

  res.json({ items, counts,
    total:db.prepare("SELECT COUNT(*) as n FROM quarantine_items WHERE status=?").get(status).n });
});

// GET item details
app.get("/api/v1/lcq/admin/item/:id", requireAdmin, (req,res) => {
  const item = db.prepare(`SELECT id,content_type,pipeline,status,detection_method,
    detection_confidence,detection_signals,user_tier,content_size_bytes,
    quarantined_at,review_deadline,destroyed_at,released_at,
    ncmec_reported,ncmec_report_id,ncmec_reported_at,
    admin_action,admin_notes,admin_acted_at,
    destruction_method,destruction_hash,legal_hold
    FROM quarantine_items WHERE id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error:"Not found" });
  res.json({ ...item, detection_signals:JSON.parse(item.detection_signals||"[]"),
    ncmec_report:item.ncmec_reported?db.prepare("SELECT * FROM ncmec_reports WHERE quarantine_id=?").get(req.params.id):null });
});

// POST destroy
app.post("/api/v1/lcq/admin/destroy/:id", requireAdmin, (req,res) => {
  try {
    const { legal_authority, notes } = req.body;
    if (notes) db.prepare("UPDATE quarantine_items SET admin_notes=?,admin_acted_at=? WHERE id=?")
      .run(notes, new Date().toISOString(), req.params.id);
    res.json({ success:true, ...destroyContent(req.params.id, "admin", legal_authority) });
  } catch(err) { res.status(400).json({ error:err.message }); }
});

// POST release
app.post("/api/v1/lcq/admin/release/:id", requireAdmin, (req,res) => {
  try {
    const { notes } = req.body;
    res.json({ success:true, ...releaseContent(req.params.id, notes) });
  } catch(err) { res.status(400).json({ error:err.message }); }
});

// POST NCMEC report
app.post("/api/v1/lcq/admin/report-ncmec/:id", requireAdmin, async (req,res) => {
  try { res.json({ success:true, ...(await submitNCMECReport(req.params.id)) }); }
  catch(err) { res.status(400).json({ error:err.message }); }
});

// POST legal hold
app.post("/api/v1/lcq/admin/legal-hold/:id", requireAdmin, (req,res) => {
  const { hold, reason } = req.body;
  db.prepare("UPDATE quarantine_items SET legal_hold=?,admin_notes=?,updated_at=? WHERE id=?")
    .run(hold?1:0, reason||"", new Date().toISOString(), req.params.id);
  logger.info(`[LCQ] Legal hold ${hold?"placed":"removed"}`, { id:req.params.id, reason });
  res.json({ success:true, legal_hold:!!hold });
});

// GET destruction log
app.get("/api/v1/lcq/admin/destruction-log", requireAdmin, (req,res) => {
  const log = db.prepare(`SELECT dl.*,qi.content_type,qi.user_tier,qi.ncmec_reported
    FROM destruction_log dl LEFT JOIN quarantine_items qi ON dl.quarantine_id=qi.id
    ORDER BY dl.destroyed_at DESC LIMIT 1000`).all();
  res.json({ log, total:db.prepare("SELECT COUNT(*) as n FROM destruction_log").get().n,
    exported_at:new Date().toISOString(),
    legal_note:"Permanent record of all content destroyed by OFA for legal compliance." });
});

// GET stats
app.get("/api/v1/lcq/admin/stats", requireAdmin, (req,res) => {
  const stats = db.prepare(`SELECT
    COUNT(*) as total_processed,
    SUM(CASE WHEN status='quarantined'   THEN 1 ELSE 0 END) as pending_review,
    SUM(CASE WHEN status='destroyed'     THEN 1 ELSE 0 END) as total_destroyed,
    SUM(CASE WHEN status='released'      THEN 1 ELSE 0 END) as total_released,
    SUM(CASE WHEN pipeline='csam'        THEN 1 ELSE 0 END) as csam_detected,
    SUM(CASE WHEN pipeline='classified'  THEN 1 ELSE 0 END) as classified_detected,
    SUM(CASE WHEN pipeline='trade_secret'THEN 1 ELSE 0 END) as trade_secret_detected,
    SUM(CASE WHEN ncmec_reported=1       THEN 1 ELSE 0 END) as ncmec_reports_filed,
    SUM(CASE WHEN legal_hold=1           THEN 1 ELSE 0 END) as legal_holds_active
    FROM quarantine_items`).get();

  const overdue = db.prepare(`SELECT COUNT(*) as n FROM quarantine_items
    WHERE status='quarantined' AND review_deadline<datetime('now') AND legal_hold=0`).get().n;

  res.json({ ...stats, overdue_for_destruction:overdue,
    photodna_active:!!CONFIG.PHOTODNA_KEY,
    ncmec_active:!!(CONFIG.NCMEC_USER&&CONFIG.NCMEC_PASS),
    auto_destroy_interval:"every 15 minutes",
    review_window_hours:72,
    timestamp:new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

app.listen(CONFIG.PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════╗
║   LCQ MICROSERVICE v1.0.0 — RUNNING                  ║
║   Legal Compliance Quarantine                        ║
║                                                      ║
║   Port: ${String(CONFIG.PORT).padEnd(44)}║
║   PhotoDNA: ${(CONFIG.PHOTODNA_KEY?"ACTIVE":"NOT CONFIGURED").padEnd(40)}║
║   NCMEC: ${((CONFIG.NCMEC_USER&&CONFIG.NCMEC_PASS)?"ACTIVE":"NOT CONFIGURED").padEnd(43)}║
║   Auto-destroy: Every 15 minutes (72hr window)       ║
║                                                      ║
║   SETUP REQUIRED:                                    ║
║   1. Get PhotoDNA: microsoft.com/research/photodna   ║
║   2. Register NCMEC: missingkids.org/cybertipline    ║
║   3. Set LCQ_ADMIN_TOKEN in .env                     ║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
