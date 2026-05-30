// ============================================================
// CANDOR PROOF OF WORK + ATTACK MONETIZATION
// Add to services/gateway/index.js
// ============================================================
// npm install @anthropic-ai/sdk ethers node-fetch
// fly secrets set HETZNER_API_TOKEN=xxx POLYGON_PRIVATE_KEY=xxx -a open-feed-platform
// ============================================================

import crypto from 'crypto';
import { ethers } from 'ethers';

// ── Config ────────────────────────────────────────────────
const POW_DIFFICULTY = 4;        // Leading zeros required (higher = harder)
const ATTACK_THRESHOLD = 100;    // Requests/min before PoW kicks in
const HETZNER_TRIGGER_USD = 0.05; // Collect $0.05 → spin up Hetzner
const POLYGON_RPC = 'https://polygon-rpc.com';
const CONTRACT_ADDRESS = '0x24Dd7C623102052341ca8289E08b743b4C2F3661';

// ── Attack State ──────────────────────────────────────────
const attackState = {
  ips: new Map(),           // IP → { count, firstSeen, fees, pow_required }
  totalFeesCollected: 0,    // USD equivalent
  hetznerTriggerCount: 0,
  activeAttackers: new Set(),
  blockedIPs: new Set(),
};

// ── Proof of Work Challenge Generator ────────────────────
function generateChallenge() {
  const challenge = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return { challenge, timestamp, difficulty: POW_DIFFICULTY };
}

function verifyPoW(challenge, nonce, difficulty) {
  const hash = crypto.createHash('sha256')
    .update(challenge + nonce)
    .digest('hex');
  return hash.startsWith('0'.repeat(difficulty));
}

// ── Attack Fee Calculator ─────────────────────────────────
function calculateAttackFee(requestCount, computeMs) {
  // Based on AWS Lambda pricing model: $0.0000002 per 100ms compute
  const computeCost = (computeMs / 100) * 0.0000002;
  // Plus bandwidth cost: $0.09/GB, assume 1KB per request
  const bandwidthCost = (requestCount * 1024) / (1024 * 1024 * 1024) * 0.09;
  return computeCost + bandwidthCost;
}

// ── Hetzner Auto-Provisioner ──────────────────────────────
async function provisionHetzner() {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) { console.log('[Hetzner] No API token — skipping provision'); return null; }

  console.log('[Hetzner] Provisioning CX21 bare metal server...');

  try {
    // Create server
    const res = await fetch('https://api.hetzner.cloud/v1/servers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `candor-overflow-${Date.now()}`,
        server_type: 'cx21',
        image: 'ubuntu-22.04',
        location: 'ash',  // Ashburn, VA — closest to your Fly.io iad region
        user_data: `#!/bin/bash
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
git clone https://github.com/OpenFeedNetwork/platform.git /app
cd /app/services/feed
npm install --production
${Object.entries(process.env)
  .filter(([k]) => ['DATABASE_URL','JWT_SECRET','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_URL'].includes(k))
  .map(([k,v]) => `export ${k}="${v}"`)
  .join('\n')}
node index.js &
echo "Candor overflow node running" > /var/log/candor.log`,
        labels: { purpose: 'candor-overflow', auto: 'true' },
      }),
    });

    const data = await res.json();
    if (data.server) {
      const server = data.server;
      attackState.hetznerTriggerCount++;
      console.log(`[Hetzner] ✅ Server ${server.id} provisioned at ${server.public_net.ipv4.ip}`);
      console.log(`[Hetzner] Startup takes ~60s then redirecting overflow traffic`);

      // Schedule decommission after 2 hours if load drops
      setTimeout(() => decommissionHetzner(server.id, token), 2 * 60 * 60 * 1000);

      return { id: server.id, ip: server.public_net.ipv4.ip };
    }
  } catch (err) {
    console.error('[Hetzner] Provision error:', err.message);
  }
  return null;
}

async function decommissionHetzner(serverId, token) {
  try {
    await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log(`[Hetzner] ✅ Server ${serverId} decommissioned`);
  } catch (err) {
    console.error('[Hetzner] Decommission error:', err.message);
  }
}

// ── Polygon Payment Collection ────────────────────────────
async function collectAttackFee(attackerIP, feeUSD) {
  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!privateKey) return;

  // Convert USD to POL (approximate — in production use price oracle)
  const polPrice = 0.35; // approximate POL price
  const feeInPOL = feeUSD / polPrice;
  const feeInWei = ethers.parseEther(feeInPOL.toFixed(18));

  // Log the fee (actual collection requires attacker to sign — this logs for billing)
  console.log(`[AttackFee] ${attackerIP} owes ${feeUSD.toFixed(6)} USD (${feeInPOL.toFixed(6)} POL)`);
  attackState.totalFeesCollected += feeUSD;

  // Check if we've collected enough to fund Hetzner
  if (attackState.totalFeesCollected >= HETZNER_TRIGGER_USD) {
    console.log(`[AttackFee] 💰 $${attackState.totalFeesCollected.toFixed(4)} collected — triggering Hetzner`);
    attackState.totalFeesCollected = 0; // Reset after trigger
    await provisionHetzner();
  }
}

// ── Middleware: Rate Track + PoW Enforcement ──────────────
export function attackMonetizationMiddleware(req, res, next) {
  const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  const now = Date.now();

  // Init IP state
  if (!attackState.ips.has(ip)) {
    attackState.ips.set(ip, { count: 0, firstSeen: now, fees: 0, pow_required: false, windowStart: now });
  }

  const ipState = attackState.ips.get(ip);

  // Reset window every minute
  if (now - ipState.windowStart > 60000) {
    ipState.count = 0;
    ipState.windowStart = now;
    ipState.pow_required = false;
  }

  ipState.count++;

  // Check if attack threshold exceeded
  if (ipState.count > ATTACK_THRESHOLD) {
    attackState.activeAttackers.add(ip);
    ipState.pow_required = true;

    // Calculate and collect fee
    const computeMs = Math.random() * 50 + 10; // Simulated compute time
    const fee = calculateAttackFee(ipState.count, computeMs);
    ipState.fees += fee;
    collectAttackFee(ip, fee);

    // Check for PoW solution in headers
    const powChallenge = req.headers['x-pow-challenge'];
    const powNonce = req.headers['x-pow-nonce'];

    if (!powChallenge || !powNonce) {
      // Issue new challenge
      const challenge = generateChallenge();
      return res.status(429).json({
        error: 'Rate limit exceeded — Proof of Work required',
        pow_challenge: challenge.challenge,
        pow_difficulty: challenge.difficulty,
        pow_timestamp: challenge.timestamp,
        message: 'Solve the PoW puzzle and retry with x-pow-challenge and x-pow-nonce headers',
        fee_accrued: ipState.fees.toFixed(6),
      });
    }

    // Verify PoW solution
    if (!verifyPoW(powChallenge, powNonce, POW_DIFFICULTY)) {
      return res.status(429).json({
        error: 'Invalid Proof of Work solution',
        fee_accrued: ipState.fees.toFixed(6),
      });
    }

    // PoW solved — allow request but log the fee
    console.log(`[PoW] ${ip} solved challenge after ${ipState.count} requests — fee: $${ipState.fees.toFixed(6)}`);
  }

  // Attach attack state to request for logging
  req.attackState = { ip, count: ipState.count, fees: ipState.fees };
  next();
}

// ── Attack Stats Endpoint ─────────────────────────────────
// Add this route to your express app:
/*
app.get('/api/v1/admin/attack-stats', adminAuth, (req, res) => {
  res.json({
    activeAttackers: attackState.activeAttackers.size,
    totalFeesCollected: attackState.totalFeesCollected,
    hetznerTriggers: attackState.hetznerTriggerCount,
    topAttackers: [...attackState.ips.entries()]
      .filter(([,v]) => v.fees > 0)
      .sort((a,b) => b[1].fees - a[1].fees)
      .slice(0,10)
      .map(([ip,v]) => ({ ip, requests: v.count, fees: v.fees.toFixed(6) })),
  });
});
*/

export { attackState, provisionHetzner, generateChallenge, verifyPoW };
