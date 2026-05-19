/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA DATABASE MIGRATIONS  v1.0.0                                ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Run: node migrate.js                                           ║
 * ║   Or via npm: npm run db:migrate                                 ║
 * ║                                                                  ║
 * ║   Creates all SQLite databases for:                              ║
 * ║   - Platform (users, posts, governance)                          ║
 * ║   - Truth Shield (verdicts, stats)                               ║
 * ║   - Guardian Shield (scans, verifications)                       ║
 * ║   - Care Shield (detections, resources)                          ║
 * ║   - Terrorism Shield (scans, FBI reports)                        ║
 * ║   - API Keys (keys, usage)                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR || "./data";

fs.mkdirSync(DATA_DIR, { recursive: true });

function migrate(name, dbPath, schema) {
  console.log(`\n[migrate] → ${name}`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  db.close();
  console.log(`[migrate] ✓ ${name} ready at ${dbPath}`);
}

// ── 1. PLATFORM DATABASE ──────────────────────────────────────────────────────
migrate("Platform", path.join(DATA_DIR, "ofa.db"), `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    UNIQUE,
    password_hash TEXT,
    account_tier  TEXT    NOT NULL DEFAULT 'standard',
    display_name  TEXT,
    bio           TEXT,
    avatar_ipfs   TEXT,
    is_verified   INTEGER NOT NULL DEFAULT 0,
    is_suspended  INTEGER NOT NULL DEFAULT 0,
    suppress_post INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_active   TEXT,
    metadata      TEXT    DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

  CREATE TABLE IF NOT EXISTS posts (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content       TEXT    NOT NULL,
    content_type  TEXT    NOT NULL DEFAULT 'text',
    media_urls    TEXT    DEFAULT '[]',
    ipfs_hash     TEXT,
    arweave_hash  TEXT,
    polygon_tx    TEXT,
    suppress_post INTEGER NOT NULL DEFAULT 0,
    is_quarantined INTEGER NOT NULL DEFAULT 0,
    truth_verdict TEXT,
    care_signal   INTEGER NOT NULL DEFAULT 0,
    terror_scan   TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    metadata      TEXT    DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_ipfs    ON posts(ipfs_hash);

  CREATE TABLE IF NOT EXISTS governance_proposals (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    proposer_id   TEXT    NOT NULL REFERENCES users(id),
    parameter     TEXT    NOT NULL,
    current_value TEXT    NOT NULL,
    proposed_value TEXT   NOT NULL,
    votes_for     INTEGER NOT NULL DEFAULT 0,
    votes_against INTEGER NOT NULL DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'active',
    polygon_tx    TEXT,
    ipfs_hash     TEXT,
    expires_at    TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS governance_votes (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    proposal_id   TEXT    NOT NULL REFERENCES governance_proposals(id),
    voter_id      TEXT    NOT NULL REFERENCES users(id),
    vote          TEXT    NOT NULL,
    token_weight  INTEGER NOT NULL DEFAULT 1,
    polygon_tx    TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(proposal_id, voter_id)
  );

  CREATE TABLE IF NOT EXISTS moderation_log (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id       TEXT    REFERENCES posts(id),
    user_id       TEXT    REFERENCES users(id),
    action        TEXT    NOT NULL,
    reason        TEXT    NOT NULL,
    moderator     TEXT    NOT NULL DEFAULT 'system',
    ipfs_hash     TEXT,
    polygon_tx    TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_modlog_post ON moderation_log(post_id);
  CREATE INDEX IF NOT EXISTS idx_modlog_time ON moderation_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    TEXT    NOT NULL UNIQUE,
    expires_at    TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    ip_hash       TEXT,
    user_agent    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// ── 2. TRUTH SHIELD DATABASE ──────────────────────────────────────────────────
migrate("Truth Shield", path.join(DATA_DIR, "truth_shield.db"), `
  CREATE TABLE IF NOT EXISTS verdicts (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    content_hash    TEXT    NOT NULL,
    content_preview TEXT,
    verdict         TEXT    NOT NULL,
    confidence      INTEGER NOT NULL,
    risk_level      TEXT    NOT NULL,
    indicators      TEXT    DEFAULT '[]',
    reasoning       TEXT,
    recommended_action TEXT,
    ipfs_hash       TEXT,
    polygon_tx      TEXT,
    api_key_hash    TEXT,
    customer_id     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    processing_ms   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_verdicts_hash    ON verdicts(content_hash);
  CREATE INDEX IF NOT EXISTS idx_verdicts_verdict ON verdicts(verdict);
  CREATE INDEX IF NOT EXISTS idx_verdicts_time    ON verdicts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_verdicts_risk    ON verdicts(risk_level);

  CREATE TABLE IF NOT EXISTS truth_shield_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT    NOT NULL UNIQUE,
    total_scans     INTEGER NOT NULL DEFAULT 0,
    false_count     INTEGER NOT NULL DEFAULT 0,
    mostly_false    INTEGER NOT NULL DEFAULT 0,
    mixed_count     INTEGER NOT NULL DEFAULT 0,
    mostly_true     INTEGER NOT NULL DEFAULT 0,
    true_count      INTEGER NOT NULL DEFAULT 0,
    unverifiable    INTEGER NOT NULL DEFAULT 0,
    avg_confidence  REAL    NOT NULL DEFAULT 0,
    avg_response_ms REAL    NOT NULL DEFAULT 0
  );
`);

// ── 3. GUARDIAN SHIELD DATABASE ───────────────────────────────────────────────
migrate("Guardian Shield", path.join(DATA_DIR, "guardian.db"), `
  CREATE TABLE IF NOT EXISTS minor_scans (
    id                TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username_hash     TEXT    NOT NULL,
    minor_probability INTEGER NOT NULL,
    age_estimate      TEXT    NOT NULL,
    risk_level        TEXT    NOT NULL,
    layers_triggered  TEXT    DEFAULT '[]',
    indicators        TEXT    DEFAULT '[]',
    confidence        INTEGER NOT NULL,
    recommended_action TEXT   NOT NULL,
    reasoning         TEXT,
    api_key_hash      TEXT,
    customer_id       TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    processing_ms     INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_minor_scans_risk ON minor_scans(risk_level);
  CREATE INDEX IF NOT EXISTS idx_minor_scans_time ON minor_scans(created_at DESC);

  CREATE TABLE IF NOT EXISTS age_verifications (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id      TEXT    NOT NULL UNIQUE,
    token_hash      TEXT    NOT NULL UNIQUE,
    age_threshold   INTEGER NOT NULL DEFAULT 18,
    verified        INTEGER NOT NULL DEFAULT 0,
    proof_hash      TEXT,
    callback_url    TEXT,
    expires_at      TEXT    NOT NULL,
    completed_at    TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grooming_detections (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    conversation_hash TEXT  NOT NULL,
    grooming_detected INTEGER NOT NULL DEFAULT 0,
    risk_level      TEXT    NOT NULL,
    patterns_found  TEXT    DEFAULT '[]',
    confidence      INTEGER NOT NULL,
    recommended_action TEXT,
    api_key_hash    TEXT,
    customer_id     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coppa_deletions (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id_hash    TEXT    NOT NULL,
    customer_id     TEXT    NOT NULL,
    reason          TEXT    NOT NULL,
    deleted_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    confirmed_at    TEXT
  );
`);

// ── 4. CARE SHIELD DATABASE ───────────────────────────────────────────────────
migrate("Care Shield", path.join(DATA_DIR, "care_shield.db"), `
  CREATE TABLE IF NOT EXISTS crisis_detections (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id_hash    TEXT    NOT NULL,
    content_hash    TEXT    NOT NULL,
    crisis_score    INTEGER NOT NULL,
    signal_level    INTEGER NOT NULL,
    signals_found   TEXT    DEFAULT '[]',
    is_genuine_crisis INTEGER NOT NULL DEFAULT 0,
    immediate_danger  INTEGER NOT NULL DEFAULT 0,
    recommended_action TEXT  NOT NULL,
    suppress_post   INTEGER NOT NULL DEFAULT 0,
    resources_sent  TEXT    DEFAULT '[]',
    api_key_hash    TEXT,
    customer_id     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    processing_ms   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_crisis_score  ON crisis_detections(crisis_score DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_level  ON crisis_detections(signal_level DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_time   ON crisis_detections(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_danger ON crisis_detections(immediate_danger);

  CREATE TABLE IF NOT EXISTS crisis_resources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    phone       TEXT,
    url         TEXT,
    description TEXT,
    regions     TEXT    DEFAULT '["US"]',
    active      INTEGER NOT NULL DEFAULT 1
  );

  INSERT OR IGNORE INTO crisis_resources (name, type, phone, url, description) VALUES
    ('988 Suicide & Crisis Lifeline', 'crisis', '988', 'https://988lifeline.org', 'Call or text 988'),
    ('Crisis Text Line', 'crisis', NULL, 'https://crisistextline.org', 'Text HOME to 741741'),
    ('National Alliance on Eating Disorders', 'eating', '1-866-662-1235', 'https://www.allianceforeatingdisorders.com', 'Eating disorder support'),
    ('SAMHSA Helpline', 'substance', '1-800-662-4357', 'https://findtreatment.samhsa.gov', 'Substance abuse and mental health');
`);

// ── 5. TERRORISM SHIELD DATABASE ──────────────────────────────────────────────
migrate("Terrorism Shield", path.join(DATA_DIR, "terrorism_shield.db"), `
  CREATE TABLE IF NOT EXISTS terror_scans (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    content_hash    TEXT    NOT NULL,
    risk_score      INTEGER NOT NULL,
    risk_level      TEXT    NOT NULL,
    result          TEXT    NOT NULL,
    gifct_match     INTEGER NOT NULL DEFAULT 0,
    fto_detected    TEXT    DEFAULT '[]',
    is_journalism   INTEGER NOT NULL DEFAULT 0,
    is_counter_ext  INTEGER NOT NULL DEFAULT 0,
    is_political    INTEGER NOT NULL DEFAULT 0,
    fbi_reported    INTEGER NOT NULL DEFAULT 0,
    fbi_report_id   TEXT,
    ipfs_hash       TEXT,
    api_key_hash    TEXT,
    customer_id     TEXT,
    platform        TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    processing_ms   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_terror_result  ON terror_scans(result);
  CREATE INDEX IF NOT EXISTS idx_terror_gifct   ON terror_scans(gifct_match);
  CREATE INDEX IF NOT EXISTS idx_terror_fbi     ON terror_scans(fbi_reported);
  CREATE INDEX IF NOT EXISTS idx_terror_time    ON terror_scans(created_at DESC);

  CREATE TABLE IF NOT EXISTS fbi_reports (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    scan_id         TEXT    NOT NULL REFERENCES terror_scans(id),
    ic3_reference   TEXT,
    content_type    TEXT    NOT NULL,
    fto_mentioned   TEXT    DEFAULT '[]',
    platform        TEXT    NOT NULL,
    user_hash       TEXT    NOT NULL,
    reported_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    confirmed_at    TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS gifct_submissions (
    id              TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    scan_id         TEXT    NOT NULL REFERENCES terror_scans(id),
    content_hash    TEXT    NOT NULL,
    submitted_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    accepted        INTEGER NOT NULL DEFAULT 0,
    gifct_id        TEXT
  );
`);

// ── 6. API KEYS DATABASE ──────────────────────────────────────────────────────
migrate("API Keys", path.join(DATA_DIR, "api_keys.db"), `
  CREATE TABLE IF NOT EXISTS api_keys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash        TEXT    NOT NULL UNIQUE,
    key_prefix      TEXT    NOT NULL,
    product         TEXT    NOT NULL,
    plan            TEXT    NOT NULL,
    customer_id     TEXT    NOT NULL,
    subscription_id TEXT    NOT NULL,
    monthly_scans   INTEGER NOT NULL DEFAULT 10000,
    scans_used      INTEGER NOT NULL DEFAULT 0,
    scans_reset_at  TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'active',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at    TEXT,
    revoked_at      TEXT,
    metadata        TEXT    DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_customer ON api_keys(customer_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_product  ON api_keys(customer_id, product);
  CREATE INDEX IF NOT EXISTS idx_api_keys_status   ON api_keys(status);

  CREATE TABLE IF NOT EXISTS api_key_usage (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash    TEXT    NOT NULL,
    product     TEXT    NOT NULL,
    endpoint    TEXT,
    timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
    response_ms INTEGER,
    status_code INTEGER,
    ip_hash     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_usage_key  ON api_key_usage(key_hash);
  CREATE INDEX IF NOT EXISTS idx_usage_time ON api_key_usage(timestamp);
`);

console.log("\n✅ All databases migrated successfully.");
console.log(`📁 Data directory: ${path.resolve(DATA_DIR)}\n`);
