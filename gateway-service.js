/**
 * OFA API GATEWAY
 * Single entry point — routes requests to microservices
 * Handles auth, rate limiting, CORS, logging
 */
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
  truth:    process.env.TRUTH_SHIELD_URL    || "http://localhost:3001",
  guardian: process.env.GUARDIAN_SHIELD_URL || "http://localhost:3002",
  feed:     process.env.OFA_FEED_URL        || "http://localhost:3003",
};

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(morgan("combined"));
app.use(express.json({ limit: "2mb" }));

// Global rate limit
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  message: { error: "Rate limit exceeded. Please slow down." }
}));

// ── PROXY ROUTES ──────────────────────────────────────────────────────────────
const proxy = (target, pathRewrite = {}) =>
  createProxyMiddleware({ target, changeOrigin: true, pathRewrite,
    on: { error: (err, req, res) => {
      console.error(`[Gateway] Proxy error to ${target}:`, err.message);
      res.status(502).json({ error: "Service temporarily unavailable" });
    }}
  });

app.use("/api/v1/truthshield", proxy(SERVICES.truth,    { "^/api/v1/truthshield": "/api/v1" }));
app.use("/api/v1/guardian",    proxy(SERVICES.guardian, { "^/api/v1/guardian":    "/api/v1/guardian" }));
app.use("/api/v1/feed",        proxy(SERVICES.feed,     { "^/api/v1/feed":        "/api/v1/feed" }));
app.use("/api/v1/posts",       proxy(SERVICES.feed,     { "^/api/v1/posts":       "/api/v1/posts" }));
app.use("/api/v1/users",       proxy(SERVICES.feed,     { "^/api/v1/users":       "/api/v1/users" }));
app.use("/api/v1/governance",  proxy(SERVICES.feed,     { "^/api/v1/governance":  "/api/v1/governance" }));
app.use("/api/v1/admin",       proxy(SERVICES.feed,     { "^/api/v1/admin":       "/api/v1/admin" }));

// ── HEALTH + STATUS ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "ofa-gateway", version: "1.0.0" }));

app.get("/api/v1/status", async (req, res) => {
  const checks = await Promise.allSettled(
    Object.entries(SERVICES).map(async ([name, url]) => {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      return { name, status: "ok", ...data };
    })
  );
  const services = checks.map((c, i) => ({
    name: Object.keys(SERVICES)[i],
    status: c.status === "fulfilled" ? "ok" : "error",
    ...(c.status === "fulfilled" ? c.value : { error: c.reason?.message })
  }));
  const allOk = services.every(s => s.status === "ok");
  res.status(allOk ? 200 : 207).json({
    platform: "Open Feed Platform", version: "1.0.0",
    overall: allOk ? "healthy" : "degraded",
    services, timestamp: new Date().toISOString()
  });
});
// SUBDOMAIN ROUTING
app.use((req, res, next) => {
  const host = req.hostname;
  if (host.startsWith("sentinel.")) return res.sendFile(new URL("public/sentinel/index.html", import.meta.url).pathname);
  if (host.startsWith("reach.")) return res.sendFile(new URL("public/reach/index.html", import.meta.url).pathname);
  if (host.startsWith("shield.")) return res.sendFile(new URL("public/shield/index.html", import.meta.url).pathname);
  if (host.startsWith("canary.")) return res.sendFile(new URL("public/canary/index.html", import.meta.url).pathname);
  next();
});
app.listen(PORT, () => console.log(`[Gateway] Running on port ${PORT}`));
export default app;

// ── SUBDOMAIN STATIC SITE ROUTING ─────────────────────────────────────────────
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

app.use((req, res, next) => {
  const host = req.hostname;
  if (host.startsWith("sentinel.")) {
    return res.sendFile(join(__dirname, "public/sentinel/index.html"));
  }
  if (host.startsWith("reach.")) {
    return res.sendFile(join(__dirname, "public/reach/index.html"));
  }
  if (host.startsWith("shield.")) {
    return res.sendFile(join(__dirname, "public/shield/index.html"));
  }
  if (host.startsWith("canary.")) {
    return res.sendFile(join(__dirname, "public/canary/index.html"));
  }
  next();
});
