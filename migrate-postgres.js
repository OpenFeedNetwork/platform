/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA DATABASE MIGRATIONS  v2.0.0 — PostgreSQL                  ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Run: node migrate-postgres.js                                  ║
 * ║   Or via npm: npm run db:migrate                                 ║
 * ║                                                                  ║
 * ║   Creates all PostgreSQL tables for:                             ║
 * ║   - Platform (users, posts, governance)                          ║
 * ║   - Truth Shield (verdicts, stats)                               ║
 * ║   - Guardian Shield (scans, verifications)                       ║
 * ║   - Care Shield (detections, resources)                          ║
 * ║   - Care Shield FR (French language detections)                  ║
 * ║   - Terrorism Shield (scans, FBI reports)                        ║
 * ║   - API Keys (keys, usage)                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false }
});

async function migrate(name, schema) {
  console.log(`\n[migrate] → ${name}`);
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log(`[migrate] ✓ ${name} ready`);
  } finally {
    client.release();
  }
}

// ── 1. PLATFORM DATABASE ──────────────────────────────────────────────────────
await migrate("Platform", `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active   TIMESTAMPTZ,
    metadata      JSONB   DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

  CREATE TABLE IF NOT EXISTS posts (
    id             TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id        TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content        TEXT    NOT NULL,
    content_type   TEXT    NOT NULL DEFAULT 'text',
    media_urls     JSONB   DEFAULT '[]',
    ipfs_hash      TEXT,
    arweave_hash   TEXT,
    polygon_tx     TEXT,
    suppress_post  INTEGER NOT NULL DEFAULT 0,
    is_quarantined INTEGER NOT NULL DEFAULT 0,
    truth_verdict  TEXT,
    care_signal    INTEGER NOT NULL DEFAULT 0,
    terror_scan    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata       JSONB   DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_ipfs    ON posts(ipfs_hash);

  CREATE TABLE IF NOT EXISTS governance_proposals (
    id             TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title          TEXT    NOT NULL,
    description    TEXT    NOT NULL,
    proposer_id    TEXT    NOT NULL REFERENCES users(id),
    parameter      TEXT    NOT NULL,
    current_value  TEXT    NOT NULL,
    proposed_value TEXT    NOT NULL,
    votes_for      INTEGER NOT NULL DEFAULT 0,
    votes_against  INTEGER NOT NULL DEFAULT 0,
    status         TEXT    NOT NULL DEFAULT 'active',
    polygon_tx     TEXT,
    ipfs_hash      TEXT,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS governance_votes (
    id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proposal_id TEXT    NOT NULL REFERENCES governance_proposals(id),
    voter_id    TEXT    NOT NULL REFERENCES users(id),
    vote        TEXT    NOT NULL,
    token_weight INTEGER NOT NULL DEFAULT 1,
    polygon_tx  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(proposal_id, voter_id)
  );

  CREATE TABLE IF NOT EXISTS moderation_log (
    id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    post_id     TEXT    REFERENCES posts(id),
    user_id     TEXT    REFERENCES users(id),
    action      TEXT    NOT NULL,
    reason      TEXT    NOT NULL,
    moderator   TEXT    NOT NULL DEFAULT 'system',
    ipfs_hash   TEXT,
    polygon_tx  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_modlog_post ON moderation_log(post_id);
  CREATE INDEX IF NOT EXISTS idx_modlog_time ON moderation_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash     TEXT,
    user_agent  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// ── 2. TRUTH SHIELD ───────────────────────────────────────────────────────────
await migrate("Truth Shield", `
  CREATE TABLE IF NOT EXISTS verdicts (
    id                 TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    content_hash       TEXT    NOT NULL,
    content_preview    TEXT,
    verdict            TEXT    NOT NULL,
    confidence         INTEGER NOT NULL,
    risk_level         TEXT    NOT NULL,
    indicators         JSONB   DEFAULT '[]',
    reasoning          TEXT,
    recommended_action TEXT,
    ipfs_hash          TEXT,
    polygon_tx         TEXT,
    api_key_hash       TEXT,
    customer_id        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms      INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_verdicts_hash    ON verdicts(content_hash);
  CREATE INDEX IF NOT EXISTS idx_verdicts_verdict ON verdicts(verdict);
  CREATE INDEX IF NOT EXISTS idx_verdicts_time    ON verdicts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_verdicts_risk    ON verdicts(risk_level);

  CREATE TABLE IF NOT EXISTS truth_shield_stats (
    id              SERIAL  PRIMARY KEY,
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

// ── 3. GUARDIAN SHIELD ────────────────────────────────────────────────────────
await migrate("Guardian Shield", `
  CREATE TABLE IF NOT EXISTS minor_scans (
    id                 TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username_hash      TEXT    NOT NULL,
    minor_probability  INTEGER NOT NULL,
    age_estimate       TEXT    NOT NULL,
    risk_level         TEXT    NOT NULL,
    layers_triggered   JSONB   DEFAULT '[]',
    indicators         JSONB   DEFAULT '[]',
    confidence         INTEGER NOT NULL,
    recommended_action TEXT    NOT NULL,
    reasoning          TEXT,
    api_key_hash       TEXT,
    customer_id        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms      INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_minor_scans_risk ON minor_scans(risk_level);
  CREATE INDEX IF NOT EXISTS idx_minor_scans_time ON minor_scans(created_at DESC);

  CREATE TABLE IF NOT EXISTS age_verifications (
    id            TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id    TEXT    NOT NULL UNIQUE,
    token_hash    TEXT    NOT NULL UNIQUE,
    age_threshold INTEGER NOT NULL DEFAULT 18,
    verified      INTEGER NOT NULL DEFAULT 0,
    proof_hash    TEXT,
    callback_url  TEXT,
    expires_at    TIMESTAMPTZ NOT NULL,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS grooming_detections (
    id                TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_hash TEXT    NOT NULL,
    grooming_detected INTEGER NOT NULL DEFAULT 0,
    risk_level        TEXT    NOT NULL,
    patterns_found    JSONB   DEFAULT '[]',
    confidence        INTEGER NOT NULL,
    recommended_action TEXT,
    api_key_hash      TEXT,
    customer_id       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS coppa_deletions (
    id           TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id_hash TEXT    NOT NULL,
    customer_id  TEXT    NOT NULL,
    reason       TEXT    NOT NULL,
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
  );
`);

// ── 4. CARE SHIELD ────────────────────────────────────────────────────────────
await migrate("Care Shield", `
  CREATE TABLE IF NOT EXISTS crisis_detections (
    id                 TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id_hash       TEXT    NOT NULL,
    content_hash       TEXT    NOT NULL,
    crisis_score       INTEGER NOT NULL,
    signal_level       INTEGER NOT NULL,
    signals_found      JSONB   DEFAULT '[]',
    is_genuine_crisis  INTEGER NOT NULL DEFAULT 0,
    immediate_danger   INTEGER NOT NULL DEFAULT 0,
    recommended_action TEXT    NOT NULL,
    suppress_post      INTEGER NOT NULL DEFAULT 0,
    resources_sent     JSONB   DEFAULT '[]',
    api_key_hash       TEXT,
    customer_id        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms      INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_crisis_score  ON crisis_detections(crisis_score DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_level  ON crisis_detections(signal_level DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_time   ON crisis_detections(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_danger ON crisis_detections(immediate_danger);

  CREATE TABLE IF NOT EXISTS crisis_resources (
    id          SERIAL  PRIMARY KEY,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    phone       TEXT,
    url         TEXT,
    description TEXT,
    regions     JSONB   DEFAULT '["US"]',
    active      INTEGER NOT NULL DEFAULT 1
  );

  INSERT INTO crisis_resources (name, type, phone, url, description) VALUES
    ('988 Suicide & Crisis Lifeline', 'crisis', '988', 'https://988lifeline.org', 'Call or text 988'),
    ('Crisis Text Line', 'crisis', NULL, 'https://crisistextline.org', 'Text HOME to 741741'),
    ('National Alliance on Eating Disorders', 'eating', '1-866-662-1235', 'https://www.allianceforeatingdisorders.com', 'Eating disorder support'),
    ('SAMHSA Helpline', 'substance', '1-800-662-4357', 'https://findtreatment.samhsa.gov', 'Substance abuse and mental health')
  ON CONFLICT DO NOTHING;
`);

// ── 5. CARE SHIELD FR (French) ────────────────────────────────────────────────
await migrate("Care Shield FR", `
  CREATE TABLE IF NOT EXISTS crisis_detections_fr (
    id                 TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id_hash       TEXT    NOT NULL,
    content_hash       TEXT    NOT NULL,
    crisis_score       INTEGER NOT NULL,
    signal_level       INTEGER NOT NULL,
    signals_found      JSONB   DEFAULT '[]',
    is_genuine_crisis  INTEGER NOT NULL DEFAULT 0,
    immediate_danger   INTEGER NOT NULL DEFAULT 0,
    recommended_action TEXT    NOT NULL,
    suppress_post      INTEGER NOT NULL DEFAULT 0,
    resources_sent     JSONB   DEFAULT '[]',
    language           TEXT    NOT NULL DEFAULT 'fr',
    api_key_hash       TEXT,
    customer_id        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms      INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_crisis_fr_score  ON crisis_detections_fr(crisis_score DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_fr_time   ON crisis_detections_fr(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_crisis_fr_danger ON crisis_detections_fr(immediate_danger);

  CREATE TABLE IF NOT EXISTS crisis_resources_fr (
    id          SERIAL  PRIMARY KEY,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    phone       TEXT,
    url         TEXT,
    description TEXT,
    regions     JSONB   DEFAULT '["FR","CA","BE","CH"]',
    active      INTEGER NOT NULL DEFAULT 1
  );

  INSERT INTO crisis_resources_fr (name, type, phone, url, description) VALUES
    ('3114 - Numéro National de Prévention du Suicide', 'crisis', '3114', 'https://www.3114.fr', 'Appel ou SMS 3114'),
    ('SOS Amitié', 'crisis', '09 72 39 40 50', 'https://www.sos-amitie.com', 'Écoute 24h/24'),
    ('Suicide Écoute', 'crisis', '01 45 39 40 00', 'https://www.suicide-ecoute.fr', 'Disponible 24h/24'),
    ('Fédération Nationale des Associations liées aux Troubles des Conduites Alimentaires', 'eating', NULL, 'https://www.ffab.fr', 'Troubles alimentaires')
  ON CONFLICT DO NOTHING;
`);

// ── 6. TERRORISM SHIELD ───────────────────────────────────────────────────────
await migrate("Terrorism Shield", `
  CREATE TABLE IF NOT EXISTS terror_scans (
    id            TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    content_hash  TEXT    NOT NULL,
    risk_score    INTEGER NOT NULL,
    risk_level    TEXT    NOT NULL,
    result        TEXT    NOT NULL,
    gifct_match   INTEGER NOT NULL DEFAULT 0,
    fto_detected  JSONB   DEFAULT '[]',
    is_journalism INTEGER NOT NULL DEFAULT 0,
    is_counter_ext INTEGER NOT NULL DEFAULT 0,
    is_political  INTEGER NOT NULL DEFAULT 0,
    fbi_reported  INTEGER NOT NULL DEFAULT 0,
    fbi_report_id TEXT,
    ipfs_hash     TEXT,
    api_key_hash  TEXT,
    customer_id   TEXT,
    platform      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_terror_result ON terror_scans(result);
  CREATE INDEX IF NOT EXISTS idx_terror_gifct  ON terror_scans(gifct_match);
  CREATE INDEX IF NOT EXISTS idx_terror_fbi    ON terror_scans(fbi_reported);
  CREATE INDEX IF NOT EXISTS idx_terror_time   ON terror_scans(created_at DESC);

  CREATE TABLE IF NOT EXISTS fbi_reports (
    id            TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    scan_id       TEXT    NOT NULL REFERENCES terror_scans(id),
    ic3_reference TEXT,
    content_type  TEXT    NOT NULL,
    fto_mentioned JSONB   DEFAULT '[]',
    platform      TEXT    NOT NULL,
    user_hash     TEXT    NOT NULL,
    reported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at  TIMESTAMPTZ,
    status        TEXT    NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS gifct_submissions (
    id           TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    scan_id      TEXT    NOT NULL REFERENCES terror_scans(id),
    content_hash TEXT    NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted     INTEGER NOT NULL DEFAULT 0,
    gifct_id     TEXT
  );
`);

// ── 7. API KEYS ───────────────────────────────────────────────────────────────
await migrate("API Keys", `
  CREATE TABLE IF NOT EXISTS api_keys (
    id              SERIAL  PRIMARY KEY,
    key_hash        TEXT    NOT NULL UNIQUE,
    key_prefix      TEXT    NOT NULL,
    product         TEXT    NOT NULL,
    plan            TEXT    NOT NULL,
    customer_id     TEXT    NOT NULL,
    subscription_id TEXT    NOT NULL,
    monthly_scans   INTEGER NOT NULL DEFAULT 10000,
    scans_used      INTEGER NOT NULL DEFAULT 0,
    scans_reset_at  TIMESTAMPTZ NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    metadata        JSONB   DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_customer ON api_keys(customer_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_product  ON api_keys(customer_id, product);
  CREATE INDEX IF NOT EXISTS idx_api_keys_status   ON api_keys(status);

  CREATE TABLE IF NOT EXISTS api_key_usage (
    id          SERIAL  PRIMARY KEY,
    key_hash    TEXT    NOT NULL,
    product     TEXT    NOT NULL,
    endpoint    TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_ms INTEGER,
    status_code INTEGER,
    ip_hash     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_usage_key  ON api_key_usage(key_hash);
  CREATE INDEX IF NOT EXISTS idx_usage_time ON api_key_usage(timestamp);
`);

await pool.end();
console.log("\n✅ All PostgreSQL databases migrated successfully.");
console.log("🐘 PostgreSQL is ready for Open Feed Network.\n");
