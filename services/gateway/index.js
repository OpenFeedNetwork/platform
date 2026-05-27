import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.GATEWAY_PORT || 3000;

const SERVICES = {
  feed:     process.env.FEED_URL            || "http://localhost:3001",
  payments: process.env.CANDOR_PAYMENTS_URL || "http://localhost:3006",
  verify:   process.env.CANDOR_VERIFY_URL   || "http://localhost:3005",
  sentinel: process.env.CANDOR_SENTINEL_URL || "http://localhost:3007",
  beacon:   process.env.CANDOR_BEACON_URL   || "https://candor-beacon.fly.dev",
};

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, message: { error: "Rate limit exceeded." } }));

const proxy = (target, pathRewrite = {}) =>
  createProxyMiddleware({ target, changeOrigin: true, pathRewrite,
    onError: (err, req, res) => { console.error("[Gateway] Proxy error:", err.message); res.status(502).json({ error: "Service temporarily unavailable" }); }
  });

app.use("/api/v1/auth",      proxy(SERVICES.feed));
app.use("/api/v1/users",     proxy(SERVICES.feed));
app.use("/api/v1/posts",     proxy(SERVICES.feed));
app.use("/api/v1/feed",      proxy(SERVICES.feed));
app.use("/api/v1/follows",   proxy(SERVICES.feed));
app.use("/api/v1/search",    proxy(SERVICES.feed));
app.use("/api/v1/payments",  proxy(SERVICES.payments, { "^/api/v1/payments":  "/api/v1/payments"  }));
app.use("/api/v1/pow",       proxy(SERVICES.payments, { "^/api/v1/pow":       "/api/v1/pow"       }));
app.use("/api/v1/stream",    proxy(SERVICES.verify,   { "^/api/v1/stream":    "/api/v1/stream"    }));
app.use("/api/v1/verdicts",  proxy(SERVICES.verify,   { "^/api/v1/verdicts":  "/api/v1/verdicts"  }));
app.use("/api/v1/sentinel",  proxy(SERVICES.sentinel, { "^/api/v1/sentinel":  "/api/v1"           }));
app.use("/api/v1/beacon",    proxy(SERVICES.beacon,   { "^/api/v1/beacon":    "/api/v1"           }));

app.get("/health", (req, res) => res.json({ status: "ok", service: "candor-gateway", version: "2.0.0", timestamp: new Date().toISOString() }));

app.get("/api/v1/status", async (req, res) => {
  const checks = await Promise.allSettled(Object.entries(SERVICES).map(async ([name, url]) => {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return { name, status: "ok", ...(await r.json()) };
  }));
  const services = checks.map((c, i) => ({ name: Object.keys(SERVICES)[i], status: c.status === "fulfilled" ? "ok" : "error", ...(c.status === "fulfilled" ? c.value : { error: c.reason?.message }) }));
  res.status(services.every(s => s.status === "ok") ? 200 : 207).json({ platform: "Candor: The Open Feed Network", version: "2.0.0", overall: services.every(s => s.status === "ok") ? "healthy" : "degraded", services, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`[Gateway] Candor v2.0 running on port ${PORT}`));
export default app;
