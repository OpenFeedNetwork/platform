/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA SCALE MONITOR  v1.0.0                                      ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Automated traffic monitoring that:                             ║
 * ║   - Detects when viral thresholds are crossed                   ║
 * ║   - Automatically adjusts optimization settings                 ║
 * ║   - Sends Telegram alerts to the founder                        ║
 * ║   - Triggers emergency fundraising mode                         ║
 * ║   - Logs cost projections in real time                          ║
 * ║                                                                  ║
 * ║   THRESHOLDS:                                                    ║
 * ║   NORMAL  < 1,000 req/hour  → Standard settings                 ║
 * ║   WARM    1K-10K req/hour   → Cache + rate limits active        ║
 * ║   HOT     10K-50K req/hour  → Full optimization + alert         ║
 * ║   VIRAL   50K-200K req/hour → Emergency mode + fundraising      ║
 * ║   EXTREME > 200K req/hour   → All hands + investor outreach     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import fs   from "fs";
import cron from "node-cron";
import dotenv from "dotenv";
import winston from "winston";
dotenv.config();

fs.mkdirSync("./data", { recursive: true });

const logger = winston.createLogger({
  level:"info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports:[
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename:"./data/scale_monitor.log", flags:"a" }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// SCALE THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  NORMAL:  { min:0,       max:1000,   label:"Normal",   color:"🟢", action:"standard"   },
  WARM:    { min:1000,    max:10000,  label:"Warm",     color:"🟡", action:"optimize"   },
  HOT:     { min:10000,   max:50000,  label:"Hot",      color:"🟠", action:"full_opt"   },
  VIRAL:   { min:50000,   max:200000, label:"Viral",    color:"🔴", action:"emergency"  },
  EXTREME: { min:200000,  max:Infinity,label:"Extreme", color:"🚨", action:"all_hands"  },
};

// Cost per AI call at each tier (Claude Haiku)
const COST_PER_CALL = 0.0005; // $0.0005 per API call

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM ALERTS
// ─────────────────────────────────────────────────────────────────────────────

async function sendAlert(message, urgent = false) {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const chatId  = process.env.ADMIN_TELEGRAM_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type":"application/json" },
      body:    JSON.stringify({
        chat_id:    chatId,
        text:       message,
        parse_mode: "Markdown",
      }),
    });
    logger.info("[Monitor] Telegram alert sent");
  } catch (err) {
    logger.error("[Monitor] Telegram alert failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCALE DETECTOR
// ─────────────────────────────────────────────────────────────────────────────

class ScaleMonitor {
  constructor() {
    this.currentLevel     = "NORMAL";
    this.requestsLastHour = 0;
    this.peakRequests     = 0;
    this.totalRequests    = 0;
    this.aiCallsLastHour  = 0;
    this.cacheHitsLastHour= 0;
    this.hourlyWindow     = [];
    this.alertsSent       = new Set();
    this.startTime        = Date.now();
  }

  recordRequest(isAICall = false, isCacheHit = false) {
    const now = Date.now();
    this.hourlyWindow.push(now);
    this.totalRequests++;
    if (isAICall)    this.aiCallsLastHour++;
    if (isCacheHit)  this.cacheHitsLastHour++;

    // Maintain rolling hour window
    const hourAgo = now - 3600000;
    this.hourlyWindow = this.hourlyWindow.filter(t => t > hourAgo);
    this.requestsLastHour = this.hourlyWindow.length;

    if (this.requestsLastHour > this.peakRequests) {
      this.peakRequests = this.requestsLastHour;
    }

    // Check scale level
    this._checkThreshold();
  }

  _getLevel(rph) {
    for (const [level, config] of Object.entries(THRESHOLDS)) {
      if (rph >= config.min && rph < config.max) return level;
    }
    return "EXTREME";
  }

  async _checkThreshold() {
    const newLevel = this._getLevel(this.requestsLastHour);

    if (newLevel !== this.currentLevel) {
      const wasLower = Object.keys(THRESHOLDS).indexOf(newLevel) >
                       Object.keys(THRESHOLDS).indexOf(this.currentLevel);

      this.currentLevel = newLevel;
      const config      = THRESHOLDS[newLevel];

      logger.warn(`[Monitor] Scale level changed: ${newLevel}`, {
        requests_per_hour: this.requestsLastHour,
        action: config.action,
      });

      // Send alert for WARM and above
      if (wasLower && ["WARM","HOT","VIRAL","EXTREME"].includes(newLevel)) {
        await this._sendScaleAlert(newLevel, config);
      }
    }
  }

  async _sendScaleAlert(level, config) {
    const alertKey  = `${level}:${Math.floor(Date.now() / 3600000)}`;
    if (this.alertsSent.has(alertKey)) return; // Don't repeat alerts in same hour
    this.alertsSent.add(alertKey);

    const rph         = this.requestsLastHour;
    const aiCost      = (this.aiCallsLastHour * COST_PER_CALL * 24 * 30).toFixed(0);
    const cacheRate   = this.aiCallsLastHour > 0
      ? Math.round(this.cacheHitsLastHour / (this.aiCallsLastHour + this.cacheHitsLastHour) * 100) : 0;

    const messages = {
      WARM: `🟡 *OFA TRAFFIC — WARMING UP*\n\n${rph.toLocaleString()} requests/hour\n\nOptimizations active. Monitoring closely.\n\nProjected AI cost: ~$${aiCost}/month\nCache hit rate: ${cacheRate}%\n\n_No action needed yet._`,

      HOT: `🟠 *OFA TRAFFIC — GETTING HOT*\n\n*${rph.toLocaleString()} requests/hour*\n\n✓ Full optimization active\n✓ Batch processing engaged\n✓ Cache protecting AI budget\n\nProjected AI cost: ~$${aiCost}/month\nCache hit rate: ${cacheRate}%\n\n*Action: Monitor Fly.io dashboard. Consider upgrading to paid Cloudflare.*`,

      VIRAL: `🔴 *OFA IS GOING VIRAL*\n\n🚀 *${rph.toLocaleString()} requests/hour*\n\nThis is the moment we prepared for.\n\n*IMMEDIATE ACTIONS:*\n1. Post emergency fundraising announcement NOW\n2. Check Fly.io auto-scaling is active\n3. Contact Knight/Mozilla/Democracy Fund directly\n4. Prepare press response\n\nProjected AI cost: ~$${aiCost}/month (optimized)\nCache hit rate: ${cacheRate}%\n\n_Emergency fundraising template ready to post._`,

      EXTREME: `🚨 *OFA — EXTREME TRAFFIC EVENT*\n\n⚡ *${rph.toLocaleString()} requests/hour*\n\n*ALL HANDS — IMMEDIATE:*\n1. POST FUNDRAISING NOW — opencollective.com/openfeed\n2. Contact Anthropic for volume pricing\n3. Angel investor outreach TODAY\n4. Hire emergency DevOps contractor\n5. Contact grant funders for bridge funding\n\nProjected AI cost: ~$${aiCost}/month (without emergency optimization)\n\n_This is a company-transforming event. Every action in the next 24 hours matters._`,
    };

    await sendAlert(messages[level] || messages.HOT, level === "VIRAL" || level === "EXTREME");
  }

  // ── EMERGENCY FUNDRAISING TRIGGER ────────────────────────────────────────

  async checkFundraisingNeeded() {
    const projectedMonthlyCost = this.aiCallsLastHour * COST_PER_CALL * 24 * 30;

    if (projectedMonthlyCost > 5000 && !this.alertsSent.has("fundraising_triggered")) {
      this.alertsSent.add("fundraising_triggered");
      await sendAlert(
        `💰 *FUNDRAISING THRESHOLD REACHED*\n\nProjected monthly AI cost: $${projectedMonthlyCost.toFixed(0)}\n\n*Post this to all platforms now:*\n\n"Open Feed Network is experiencing extraordinary traffic. Our infrastructure costs are scaling with our community. If you believe in a platform that cannot suppress your voice — donate now at opencollective.com/openfeed. Every dollar keeps the servers running."\n\n_This message was triggered automatically._`,
        true
      );
    }
  }

  get report() {
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    const projectedMonthlyCost = this.aiCallsLastHour * COST_PER_CALL * 24 * 30;
    const projectedSavings = this.cacheHitsLastHour * COST_PER_CALL * 24 * 30;

    return {
      current_level:         this.currentLevel,
      requests_last_hour:    this.requestsLastHour,
      peak_requests_hour:    this.peakRequests,
      total_requests:        this.totalRequests,
      uptime_hours:          Math.round(uptimeHours * 10) / 10,
      ai_calls_last_hour:    this.aiCallsLastHour,
      cache_hits_last_hour:  this.cacheHitsLastHour,
      cache_hit_rate:        this.aiCallsLastHour > 0
        ? `${Math.round(this.cacheHitsLastHour / (this.aiCallsLastHour + this.cacheHitsLastHour) * 100)}%`
        : "0%",
      projected_monthly_ai_cost:     `$${projectedMonthlyCost.toFixed(2)}`,
      projected_monthly_ai_savings:  `$${projectedSavings.toFixed(2)}`,
      threshold: THRESHOLDS[this.currentLevel],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-SCALER
// Automatically adjusts Fly.io machine count based on traffic
// ─────────────────────────────────────────────────────────────────────────────

async function autoScaleFlyIO(level) {
  const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
  const FLY_APP_NAME  = process.env.FLY_APP_NAME || "openfeed";

  if (!FLY_API_TOKEN) {
    logger.info("[Monitor] Fly.io scaling skipped — FLY_API_TOKEN not set");
    return;
  }

  const machineCount = {
    NORMAL:  1,
    WARM:    2,
    HOT:     4,
    VIRAL:   8,
    EXTREME: 10,
  }[level] || 1;

  try {
    const response = await fetch(`https://api.fly.io/v1/apps/${FLY_APP_NAME}/machines/scale`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${FLY_API_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ count: machineCount }),
    });

    if (response.ok) {
      logger.info(`[Monitor] Fly.io scaled to ${machineCount} machines for ${level} traffic`);
      await sendAlert(`🖥 *Fly.io auto-scaled to ${machineCount} machines*\nTraffic level: ${level}`);
    }
  } catch (err) {
    logger.error("[Monitor] Fly.io scaling failed:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COST DASHBOARD — runs every 5 minutes
// ─────────────────────────────────────────────────────────────────────────────

export class ScaleDashboard {
  constructor() {
    this.monitor = new ScaleMonitor();
    this._setupSchedules();
  }

  _setupSchedules() {
    // Every 5 minutes — check scale and log report
    cron.schedule("*/5 * * * *", () => {
      const report = this.monitor.report;
      logger.info("[Monitor] Scale report", report);

      // Auto-scale Fly.io if level changed
      if (["HOT","VIRAL","EXTREME"].includes(report.current_level)) {
        autoScaleFlyIO(report.current_level);
      }

      // Check if fundraising should be triggered
      this.monitor.checkFundraisingNeeded();
    });

    // Every hour — send summary to Telegram if above WARM
    cron.schedule("0 * * * *", async () => {
      const report = this.monitor.report;
      if (["HOT","VIRAL","EXTREME"].includes(report.current_level)) {
        await sendAlert(
          `📊 *OFA Hourly Scale Report*\n\nLevel: ${report.threshold.color} ${report.current_level}\nRequests/hour: ${report.requests_last_hour.toLocaleString()}\nAI calls/hour: ${report.ai_calls_last_hour.toLocaleString()}\nCache hit rate: ${report.cache_hit_rate}\nProjected monthly AI cost: ${report.projected_monthly_ai_cost}\nProjected savings: ${report.projected_monthly_ai_savings}\n\n_Open Feed Network — ${new Date().toISOString()}_`
        );
      }
    });

    logger.info("[Monitor] Scale monitoring schedules active");
  }

  // Call this from every API request handler
  recordRequest(isAICall = false, isCacheHit = false) {
    this.monitor.recordRequest(isAICall, isCacheHit);
  }

  get report() {
    return this.monitor.report;
  }
}

// Singleton
let _dashboard = null;
export function getDashboard() {
  if (!_dashboard) _dashboard = new ScaleDashboard();
  return _dashboard;
}

export default { ScaleMonitor, ScaleDashboard, getDashboard };
