import { powMiddleware, attackMonetization } from "./attack-monetization.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
dotenv.config();

const app  = express();
const PORT = process.env.GATEWAY_PORT || 3000;

const SERVICES = {
  feed:     process.env.FEED_URL            || "https://candor-feed.fly.dev",
  payments: process.env.CANDOR_PAYMENTS_URL || "https://candor-payments.fly.dev",
  verify:   process.env.CANDOR_VERIFY_URL   || "https://candor-broadcast.fly.dev",
  sentinel: process.env.CANDOR_SENTINEL_URL || "https://candor-sentinel.fly.dev",
  beacon:   process.env.CANDOR_BEACON_URL   || "https://candor-beacon.fly.dev",
  shield:   process.env.CANDOR_SHIELD_URL   || "https://candor-shield.fly.dev",
};

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, message: { error: "Rate limit exceeded." } }));

const proxy = (target, pathRewrite) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    ...(pathRewrite ? { pathRewrite } : {}),
    on: {
      error: (err, req, res) => {
        console.error("[Gateway] Proxy error:", err.message);
        res.status(502).json({ error: "Service temporarily unavailable" });
      }
    }
  });

// ── SENTINEL MIDDLEWARE ────────────────────────────────────────────────────────
const sentinelState = {
  ipStore: new Map(),
  blocked: new Map(),
  metrics: { total: 0, blocked: 0, challenged: 0, clean: 0 }
};

function getSentinelScore(ip, userAgent) {
  const now = Date.now();
  const rec = sentinelState.ipStore.get(ip) || { count: 0, first: now, flags: [] };
  if (now - rec.first > 60000) { rec.count = 0; rec.first = now; rec.flags = []; }
  rec.count++;
  sentinelState.ipStore.set(ip, rec);
  const flags = [];
  if (rec.count > 120) flags.push("high_frequency");
  if (rec.count > 60)  flags.push("elevated_frequency");
  if (!userAgent)      flags.push("missing_useragent");
  if (userAgent && /bot|crawl|spider|scan/i.test(userAgent)) flags.push("bot_useragent");
  const score = Math.min(
    (flags.includes("high_frequency") ? 0.7 : 0) +
    (flags.includes("elevated_frequency") ? 0.3 : 0) +
    (flags.includes("missing_useragent") ? 0.2 : 0) +
    (flags.includes("bot_useragent") ? 0.5 : 0), 1.0
  );
  return { score, flags, count: rec.count };
}

function isBlocked(ip) {
  const b = sentinelState.blocked.get(ip);
  if (!b) return false;
  if (Date.now() > b.until) { sentinelState.blocked.delete(ip); return false; }
  return true;
}

const sentinelGuard = (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  const ua = req.headers["user-agent"] || "";
  sentinelState.metrics.total++;
  if (req.path === "/health" || req.path === "/api/v1/status") return next();
  if (isBlocked(ip)) {
    sentinelState.metrics.blocked++;
    return res.status(429).json({ error: "Your IP has been temporarily blocked.", retry_after: 300, candor_sentinel: true });
  }
  const { score, flags } = getSentinelScore(ip, ua);
  if (score >= 0.9) {
    sentinelState.blocked.set(ip, { until: Date.now() + 300000, reason: flags.join(",") });
    sentinelState.metrics.blocked++;
    console.warn("[Sentinel] BLOCK:", ip, score, flags);
    return res.status(429).json({ error: "Automated threat detected. Blocked for 5 minutes.", score, flags, candor_sentinel: true });
  }
  if (score >= 0.6) {
    sentinelState.metrics.challenged++;
    if (!req.headers["x-candor-pow"]) {
      const nonce = Math.random().toString(36).slice(2);
      return res.status(429).json({ error: "Complete the PoW challenge.", challenge: { nonce, difficulty: 16, expires_at: Date.now() + 120000 }, score, candor_sentinel: true });
    }
  }
  sentinelState.metrics.clean++;
  res.setHeader("X-Candor-Sentinel-Score", score.toFixed(2));
  next();
};

app.get("/api/v1/sentinel/metrics", (req, res) => {
  res.json({ service: "candor-sentinel-gateway", metrics: sentinelState.metrics, active_blocks: sentinelState.blocked.size, tracked_ips: sentinelState.ipStore.size, timestamp: new Date().toISOString() });
});

app.use(sentinelGuard);

app.use(attackMonetization); app.use(powMiddleware); app.use("/api/v1/auth",      proxy(SERVICES.feed));
app.use("/api/v1/users",     proxy(SERVICES.feed));
app.use("/api/v1/posts",     proxy(SERVICES.feed));
app.use("/api/v1/feed",      proxy(SERVICES.feed));
app.use("/api/v1/follows",   proxy(SERVICES.feed));
app.use("/api/v1/search",    proxy(SERVICES.feed));
app.use("/api/v1/payments",  proxy(SERVICES.payments));
app.use("/api/v1/pow",       proxy(SERVICES.payments));
app.use("/api/v1/stream",    proxy(SERVICES.verify));
app.use("/api/v1/verdicts",  proxy(SERVICES.verify));
app.use("/api/v1/sentinel",  proxy(SERVICES.sentinel));
app.use("/api/v1/beacon",    proxy(SERVICES.beacon));
app.use("/api/v1/admin",     proxy(SERVICES.feed));
app.use("/api/v1/shield",    proxy(SERVICES.shield));

app.get("/health", (req, res) => res.json({ status: "ok", service: "candor-gateway", version: "2.0.0", timestamp: new Date().toISOString() }));

app.get("/api/v1/status", async (req, res) => {
  const checks = await Promise.allSettled(Object.entries(SERVICES).map(async ([name, url]) => {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return { name, status: "ok", ...(await r.json()) };
  }));
  const services = checks.map((c, i) => ({ name: Object.keys(SERVICES)[i], status: c.status === "fulfilled" ? "ok" : "error", ...(c.status === "fulfilled" ? c.value : { error: c.reason?.message }) }));
  res.status(services.every(s => s.status === "ok") ? 200 : 207).json({ platform: "Candor: The Open Feed Network", version: "2.0.0", overall: services.every(s => s.status === "ok") ? "healthy" : "degraded", services, timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => console.log(`[Gateway] Candor v2.0 running on port ${PORT}`));
export default app;
