/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA OPTIMIZER INTEGRATION  v1.0.0                              ║
 * ║                                                                  ║
 * ║   Wires the AI optimizer and scale monitor into every           ║
 * ║   existing OFA microservice with minimal code changes.          ║
 * ║                                                                  ║
 * ║   HOW TO INTEGRATE — 3 steps per microservice:                  ║
 * ║                                                                  ║
 * ║   STEP 1: Import at top of each microservice                    ║
 * ║   import { optimizedScan } from "./ofa-ai-optimizer.js";        ║
 * ║   import { getDashboard }  from "./ofa-scale-monitor.js";       ║
 * ║                                                                  ║
 * ║   STEP 2: Replace anthropic.messages.create calls               ║
 * ║   OLD: const r = await anthropic.messages.create({...})         ║
 * ║   NEW: const { result } = await optimizedScan({...})            ║
 * ║                                                                  ║
 * ║   STEP 3: Add to Express middleware                             ║
 * ║   app.use((req,res,next) => { getDashboard().recordRequest(); next(); }) ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import express       from "express";
import { optimizedScan, getOptimizer } from "./ofa-ai-optimizer.js";
import { getDashboard }                from "./ofa-scale-monitor.js";

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE
// Add to every OFA microservice — tracks requests for scale monitoring
// ─────────────────────────────────────────────────────────────────────────────

export function optimizerMiddleware(req, res, next) {
  getDashboard().recordRequest(false, false);
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// METRICS ENDPOINT
// Add to every microservice for real-time cost monitoring
// GET /api/metrics → returns optimization stats
// ─────────────────────────────────────────────────────────────────────────────

export async function metricsHandler(req, res) {
  const optimizer = await getOptimizer();
  const dashboard = getDashboard();

  res.json({
    timestamp:      new Date().toISOString(),
    optimizer:      optimizer.getMetrics(),
    scale:          dashboard.report,
    cost_analysis: {
      description:     "Real-time AI cost optimization metrics",
      without_optimizer: "Baseline cost at current traffic",
      with_optimizer:    "Actual cost after all 5 optimizations",
      monthly_savings:   optimizer.getMetrics().optimizer.projected_monthly_savings,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZED WRAPPERS FOR EACH MICROSERVICE
// These are drop-in replacements for the AI analysis functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truth Shield — optimized disinformation detection
 * Replaces analyzeContent() in truth-shield-microservice.js
 */
export async function optimizedTruthShield(content, userId, userTier = "free") {
  const system = `You are Truth Shield — an AI-powered disinformation detection system.
Analyze the content for disinformation indicators including: false claims, misleading framing, 
out-of-context information, manipulated media descriptions, and coordinated inauthentic behavior.
Respond ONLY in valid JSON:
{
  "verdict": "true|mostly_true|mixed|mostly_false|false|unverifiable",
  "confidence": 0-100,
  "risk_level": "none|low|medium|high|critical",
  "indicators": [],
  "reasoning": "one sentence",
  "recommended_action": "allow|label|review|remove"
}`;

  const { result, fromCache, skipped } = await optimizedScan({
    content, system, userId, userTier,
    scanType: "truth_shield",
    priority: false,
  });

  getDashboard().recordRequest(true, fromCache);
  return { ...result, _cached: fromCache, _skipped: skipped };
}

/**
 * Care Shield — optimized mental health crisis detection
 * Replaces detectCrisisSignals() in care-shield-microservice.js
 */
export async function optimizedCareShield(content, userId, userTier = "free", profession = null) {
  const frContext = profession
    ? `\nThis content is from a ${profession} professional. Understand first responder culture.`
    : "";

  const system = `You are Care Shield — a mental health safety system.
Detect crisis signals indicating the person may be in distress or danger.${frContext}
Respond ONLY in valid JSON:
{
  "crisis_score": 0-100,
  "signal_level": 0-4,
  "signals_found": [],
  "is_genuine_crisis": false,
  "recommended_action": "none|notice|reach|connect|crisis",
  "immediate_danger": false,
  "reasoning": "one compassionate sentence",
  "suppress_post": false
}`;

  const { result, fromCache, skipped } = await optimizedScan({
    content, system, userId, userTier,
    scanType: "care_shield",
    priority: result?.signal_level >= 3,
  });

  getDashboard().recordRequest(true, fromCache);
  return { ...result, suppress_post: false, _cached: fromCache, _skipped: skipped };
}

/**
 * Guardian Shield — optimized minor detection
 * Replaces analyzeUserSignals() in guardian-shield-api.js
 */
export async function optimizedGuardianShield(userData, userId, userTier = "free") {
  const content = `Username: ${userData.username || ""}
Bio: ${userData.bio || ""}
Posts: ${(userData.posts || []).slice(0,3).join(" | ")}
Topics: ${(userData.topics || []).join(", ")}
Account age: ${userData.account_age_days || 0} days`;

  const system = `You are Guardian Shield — child protection AI for COPPA/KOSA/GDPR-K compliance.
Analyze for indicators this account belongs to a minor under 18.
Respond ONLY in valid JSON:
{
  "minor_probability": 0-100,
  "age_estimate_range": "under_13|13_to_15|16_to_17|18_plus|unknown",
  "risk_level": "none|low|medium|high|critical",
  "layers_triggered": [],
  "indicators_found": [],
  "confidence": 0-100,
  "recommended_action": "allow|monitor|verify|restrict|block",
  "reasoning": "one sentence"
}`;

  const { result, fromCache, skipped } = await optimizedScan({
    content, system, userId, userTier,
    scanType: "guardian_shield",
    priority: false,
  });

  getDashboard().recordRequest(true, fromCache);
  return { ...result, _cached: fromCache, _skipped: skipped };
}

/**
 * Terrorism Shield — optimized terrorism content detection
 * Replaces analyzeContentAI() in terrorism-detection-layer.js
 */
export async function optimizedTerrorismShield(content, userId, userTier = "free") {
  const system = `You are the counter-extremism safety layer for Open Feed Network.
Analyze for terrorism-related violations while protecting counter-extremism speech.
Respond ONLY in valid JSON:
{
  "risk_score": 0-100,
  "risk_level": "none|low|medium|high|critical",
  "result": "clear|review|remove|critical",
  "is_terrorism_support": false,
  "is_counter_extremism": false,
  "is_journalism": false,
  "is_political_speech": false,
  "fto_support_detected": false,
  "recruitment_detected": false,
  "indicators": [],
  "recommended_action": "allow|label|review|quarantine|remove|report_fbi",
  "reasoning": "one specific sentence",
  "immediate_danger": false
}`;

  const { result, fromCache, skipped } = await optimizedScan({
    content, system, userId, userTier,
    scanType: "terrorism_shield",
    priority: content.toLowerCase().includes("attack") ||
              content.toLowerCase().includes("isis") ||
              content.toLowerCase().includes("bomb"),
  });

  getDashboard().recordRequest(true, fromCache);
  return { ...result, _cached: fromCache, _skipped: skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK WITH OPTIMIZER STATUS
// Add to every microservice's /health endpoint
// ─────────────────────────────────────────────────────────────────────────────

export async function optimizerHealthCheck() {
  const optimizer = await getOptimizer();
  const metrics   = optimizer.getMetrics();
  const scale     = getDashboard().report;

  return {
    optimizer_active:   true,
    cache_backend:      metrics.config.cache_backend,
    cache_hit_rate:     metrics.cache.hit_rate,
    avoidance_rate:     metrics.optimizer.avoidance_rate,
    scale_level:        scale.current_level,
    requests_per_hour:  scale.requests_last_hour,
    monthly_savings:    metrics.optimizer.projected_monthly_savings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE: HOW TO ADD TO AN EXISTING MICROSERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Example integration for truth-shield-microservice.js
 * Add these 4 lines to the existing file:
 *
 * // At top — add imports:
 * import { optimizerMiddleware, metricsHandler, optimizedTruthShield } from "./ofa-optimizer-integration.js";
 *
 * // After app = express():
 * app.use(optimizerMiddleware);
 *
 * // Add metrics endpoint:
 * app.get("/api/metrics", metricsHandler);
 *
 * // In the analyze function — replace:
 * const result = await analyzeContent(content);
 * // With:
 * const result = await optimizedTruthShield(content, req.user?.id, req.user?.tier);
 */

export default {
  optimizerMiddleware,
  metricsHandler,
  optimizerHealthCheck,
  optimizedTruthShield,
  optimizedCareShield,
  optimizedGuardianShield,
  optimizedTerrorismShield,
};
