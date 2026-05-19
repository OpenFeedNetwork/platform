/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   API KEY SERVICE  v1.0.0                                        ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Handles: key generation, hashed storage, usage tracking,       ║
 * ║   rate limiting, rotation, and per-key authentication            ║
 * ║                                                                  ║
 * ║   Key format: ofa_ts_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx            ║
 * ║   Prefixes:   ofa_ts_ (Truth Shield)                            ║
 * ║               ofa_gs_ (Guardian Shield)                         ║
 * ║               ofa_cs_ (Care Shield)                             ║
 * ║               ofa_fr_ (Care Shield FR)                          ║
 * ║               ofa_te_ (Terrorism Shield)                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import crypto from "crypto";
import Database from "better-sqlite3";
import express from "express";
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = process.env.API_KEYS_DB_PATH || "./data/api_keys.db";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

// ── KEY PREFIX MAP ────────────────────────────────────────────────────────────
const KEY_PREFIXES = {
  truth_shield:    "ofa_ts_",
  guardian_shield: "ofa_gs_",
  care_shield:     "ofa_cs_",
  care_shield_fr:  "ofa_fr_",
  terrorism_shield:"ofa_te_",
};

// ── DATABASE SETUP ────────────────────────────────────────────────────────────
let db;

function getDb() {
  if (!db) {
    const fs = await import("fs");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash       ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_customer   ON api_keys(customer_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_product    ON api_keys(customer_id, product);
    CREATE INDEX IF NOT EXISTS idx_api_keys_status     ON api_keys(status);

    CREATE TABLE IF NOT EXISTS api_key_usage (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash   TEXT    NOT NULL,
      product    TEXT    NOT NULL,
      endpoint   TEXT,
      timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
      response_ms INTEGER,
      status_code INTEGER,
      ip_hash    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_usage_key      ON api_key_usage(key_hash);
    CREATE INDEX IF NOT EXISTS idx_usage_time     ON api_key_usage(timestamp);
  `);
  logger.info("[API Keys] Database schema initialized");
}

// ── KEY GENERATION ────────────────────────────────────────────────────────────

/**
 * Generate a new API key and store its hash
 * Returns the plaintext key ONCE — never stored in plaintext
 */
export async function generateApiKey({
  customerId,
  subscriptionId,
  product,
  plan,
  monthlyScans = 10000,
  status = "active",
  metadata = {},
}) {
  const database = getDb();
  const prefix   = KEY_PREFIXES[product];
  if (!prefix) throw new Error(`Unknown product: ${product}`);

  // Generate 32 random bytes → 64 hex chars
  const rawKey    = crypto.randomBytes(32).toString("hex");
  const fullKey   = `${prefix}${rawKey}`;
  const keyHash   = hashKey(fullKey);
  const keyPrefix = fullKey.substring(0, 12) + "...";

  // Reset scans at start of next month
  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1);
  resetDate.setDate(1);
  resetDate.setHours(0, 0, 0, 0);

  database.prepare(`
    INSERT INTO api_keys
      (key_hash, key_prefix, product, plan, customer_id, subscription_id,
       monthly_scans, scans_used, scans_reset_at, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    keyHash, keyPrefix, product, plan, customerId, subscriptionId,
    monthlyScans, resetDate.toISOString(), status, JSON.stringify(metadata)
  );

  logger.info("[API Keys] Key generated", {
    key_prefix:  keyPrefix,
    product,
    plan,
    customer_id: customerId,
  });

  // Return plaintext key ONCE — this is the ONLY time it exists in plaintext
  return {
    api_key:       fullKey,
    key_prefix:    keyPrefix,
    product,
    plan,
    monthly_scans: monthlyScans,
    status,
    created_at:    new Date().toISOString(),
    warning:       "Store this key securely. It will not be shown again.",
  };
}

// ── KEY VALIDATION ────────────────────────────────────────────────────────────

/**
 * Validate an API key and check rate limits
 * Returns key data if valid, throws if invalid or rate limited
 */
export async function validateApiKey(rawKey, product = null) {
  const database = getDb();
  const keyHash  = hashKey(rawKey);

  const key = database.prepare(`
    SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'
  `).get(keyHash);

  if (!key) {
    throw new Error("Invalid or inactive API key");
  }

  // Check product match if specified
  if (product && key.product !== product) {
    throw new Error(`This key is not authorized for ${product}`);
  }

  // Check if monthly scans reset is due
  const now      = new Date();
  const resetAt  = new Date(key.scans_reset_at);
  if (now >= resetAt) {
    // Reset scan count and push reset date forward
    const nextReset = new Date(resetAt);
    nextReset.setMonth(nextReset.getMonth() + 1);
    database.prepare(`
      UPDATE api_keys SET scans_used = 0, scans_reset_at = ? WHERE key_hash = ?
    `).run(nextReset.toISOString(), keyHash);
    key.scans_used = 0;
  }

  // Check rate limit
  if (key.monthly_scans !== -1 && key.scans_used >= key.monthly_scans) {
    throw new Error(
      `Monthly scan limit reached (${key.monthly_scans.toLocaleString()} scans). ` +
      `Upgrade your plan at openfeed.network/dashboard`
    );
  }

  // Update last_used_at
  database.prepare(`
    UPDATE api_keys SET last_used_at = datetime('now') WHERE key_hash = ?
  `).run(keyHash);

  return {
    key_hash:      keyHash,
    key_prefix:    key.key_prefix,
    product:       key.product,
    plan:          key.plan,
    customer_id:   key.customer_id,
    monthly_scans: key.monthly_scans,
    scans_used:    key.scans_used,
    scans_remaining: key.monthly_scans === -1 ? Infinity : key.monthly_scans - key.scans_used,
    status:        key.status,
  };
}

// ── SCAN INCREMENT ────────────────────────────────────────────────────────────

/**
 * Increment scan count after a successful API call
 */
export async function incrementScanCount(keyHash, { endpoint, responseMs, statusCode, ipHash } = {}) {
  const database = getDb();

  database.prepare(`
    UPDATE api_keys SET scans_used = scans_used + 1 WHERE key_hash = ?
  `).run(keyHash);

  if (endpoint) {
    database.prepare(`
      INSERT INTO api_key_usage (key_hash, product, endpoint, response_ms, status_code, ip_hash)
      SELECT key_hash, product, ?, ?, ?, ?
      FROM api_keys WHERE key_hash = ?
    `).run(endpoint, responseMs || null, statusCode || null, ipHash || null, keyHash);
  }
}

// ── KEY LOOKUP ────────────────────────────────────────────────────────────────

export async function getKeyByCustomer(customerId, product) {
  const database = getDb();
  const key = database.prepare(`
    SELECT * FROM api_keys
    WHERE customer_id = ? AND product = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(customerId, product);

  if (!key) return null;
  return {
    key_prefix:    key.key_prefix,
    product:       key.product,
    plan:          key.plan,
    monthly_scans: key.monthly_scans,
    scans_used:    key.scans_used,
    status:        key.status,
    created_at:    key.created_at,
    last_used_at:  key.last_used_at,
  };
}

// ── KEY REVOCATION ────────────────────────────────────────────────────────────

export async function revokeApiKey(customerId, product) {
  const database = getDb();
  const result = database.prepare(`
    UPDATE api_keys
    SET status = 'revoked', revoked_at = datetime('now')
    WHERE customer_id = ? AND product = ? AND status = 'active'
  `).run(customerId, product);

  logger.info("[API Keys] Key revoked", { customer_id: customerId, product, changes: result.changes });
  return { revoked: result.changes > 0 };
}

// ── KEY ROTATION ──────────────────────────────────────────────────────────────

export async function rotateApiKey(rawKey) {
  const database = getDb();
  const keyHash  = hashKey(rawKey);

  const existing = database.prepare(`
    SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'
  `).get(keyHash);

  if (!existing) throw new Error("Key not found or already inactive");

  // Revoke old key
  database.prepare(`
    UPDATE api_keys SET status = 'rotated', revoked_at = datetime('now') WHERE key_hash = ?
  `).run(keyHash);

  // Generate new key with same settings
  return generateApiKey({
    customerId:     existing.customer_id,
    subscriptionId: existing.subscription_id,
    product:        existing.product,
    plan:           existing.plan,
    monthlyScans:   existing.monthly_scans,
    metadata:       JSON.parse(existing.metadata || "{}"),
  });
}

// ── USAGE STATS ───────────────────────────────────────────────────────────────

export async function getUsageStats(customerId) {
  const database = getDb();

  const keys = database.prepare(`
    SELECT product, plan, monthly_scans, scans_used, status, created_at, last_used_at
    FROM api_keys WHERE customer_id = ? ORDER BY created_at DESC
  `).all(customerId);

  return keys.map(k => ({
    ...k,
    scans_remaining: k.monthly_scans === -1 ? "Unlimited" : Math.max(0, k.monthly_scans - k.scans_used),
    usage_percent:   k.monthly_scans === -1 ? 0 : Math.round((k.scans_used / k.monthly_scans) * 100),
  }));
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

/**
 * Express middleware — validates API key from x-api-key header
 * Attaches keyData to req.apiKey
 */
export function apiKeyMiddleware(product = null) {
  return async (req, res, next) => {
    const rawKey = req.headers["x-api-key"] || req.query.api_key;

    if (!rawKey) {
      return res.status(401).json({
        error: "API key required",
        hint:  "Include your key in the x-api-key header",
        docs:  "https://openfeed.network/docs/authentication",
      });
    }

    try {
      const keyData = await validateApiKey(rawKey, product);
      req.apiKey = keyData;

      // Increment usage after response
      res.on("finish", () => {
        const ipHash = req.ip ? crypto.createHash("sha256").update(req.ip).digest("hex").substring(0, 16) : null;
        incrementScanCount(keyData.key_hash, {
          endpoint:   req.path,
          responseMs: Date.now() - req._startTime,
          statusCode: res.statusCode,
          ipHash,
        }).catch(err => logger.error("[API Keys] Usage increment failed:", err.message));
      });

      next();
    } catch (err) {
      logger.warn("[API Keys] Auth failed", { error: err.message, ip: req.ip });
      return res.status(401).json({
        error: err.message,
        docs:  "https://openfeed.network/docs/authentication",
      });
    }
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function hashKey(key) {
  return crypto.createHash("sha256").update(key + (process.env.API_KEY_SALT || "ofa-salt-change-in-production")).digest("hex");
}

// ── EXPRESS ROUTER ────────────────────────────────────────────────────────────

export function createApiKeyRouter() {
  const router = express.Router();

  // POST /api/v1/keys/rotate — Rotate an existing key
  router.post("/rotate", async (req, res) => {
    const rawKey = req.headers["x-api-key"];
    if (!rawKey) return res.status(401).json({ error: "x-api-key header required" });

    try {
      const newKey = await rotateApiKey(rawKey);
      res.json(newKey);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/v1/keys/usage — Get usage stats for authenticated key
  router.get("/usage", apiKeyMiddleware(), async (req, res) => {
    try {
      const stats = await getUsageStats(req.apiKey.customer_id);
      res.json({ usage: stats });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/v1/keys/me — Get current key info
  router.get("/me", apiKeyMiddleware(), (req, res) => {
    res.json({
      key_prefix:      req.apiKey.key_prefix,
      product:         req.apiKey.product,
      plan:            req.apiKey.plan,
      monthly_scans:   req.apiKey.monthly_scans,
      scans_used:      req.apiKey.scans_used,
      scans_remaining: req.apiKey.scans_remaining,
      status:          req.apiKey.status,
    });
  });

  return router;
}

export default {
  generateApiKey,
  validateApiKey,
  incrementScanCount,
  getKeyByCustomer,
  revokeApiKey,
  rotateApiKey,
  getUsageStats,
  apiKeyMiddleware,
  createApiKeyRouter,
};
