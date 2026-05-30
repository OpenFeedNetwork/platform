// ============================================================
// CANDOR HETZNER AUTO-SCALE TRIGGER
// Add to services/gateway/index.js
// fly secrets set HETZNER_API_TOKEN=xxx --app open-feed-platform
// ============================================================

const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;
const HETZNER_SERVER_TYPE = process.env.HETZNER_SERVER_TYPE || 'cx21';
const HETZNER_IMAGE = process.env.HETZNER_IMAGE || 'ubuntu-22.04';
const HETZNER_LOCATION = process.env.HETZNER_LOCATION || 'ash'; // Ashburn, VA
const SCALE_THRESHOLD = parseFloat(process.env.SCALE_THRESHOLD || '0.85');
const SCALE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between provisions

const hetznerState = {
  active: false,
  serverId: null,
  serverIp: null,
  provisionedAt: null,
  lastScaleAttempt: null,
  totalProvisions: 0,
  totalCostUSD: 0,
};

async function provisionHetzner(reason) {
  if (!HETZNER_TOKEN) { console.warn('[Hetzner] No API token set'); return null; }
  if (hetznerState.active) { console.log('[Hetzner] Already active'); return hetznerState.serverIp; }
  const now = Date.now();
  if (hetznerState.lastScaleAttempt && (now - hetznerState.lastScaleAttempt) < SCALE_COOLDOWN_MS) {
    console.log('[Hetzner] Cooldown active, skipping'); return null;
  }
  hetznerState.lastScaleAttempt = now;
  console.log(`[Hetzner] Provisioning bare-metal — reason: ${reason}`);
  try {
    const res = await fetch('https://api.hetzner.cloud/v1/servers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HETZNER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `candor-overflow-${Date.now()}`,
        server_type: HETZNER_SERVER_TYPE,
        image: HETZNER_IMAGE,
        location: HETZNER_LOCATION,
        user_data: `#!/bin/bash
apt-get update -y
apt-get install -y nginx
cat > /etc/nginx/sites-available/default << 'NGINX'
server {
  listen 80;
  location / {
    proxy_pass https://open-feed-platform.fly.dev;
    proxy_set_header Host open-feed-platform.fly.dev;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
  }
}
NGINX
systemctl restart nginx
echo "Candor overflow node ready" > /var/www/html/index.html`
      })
    });
    if (!res.ok) { const err = await res.json(); console.error('[Hetzner] Provision failed:', err); return null; }
    const data = await res.json();
    hetznerState.active = true;
    hetznerState.serverId = data.server.id;
    hetznerState.serverIp = data.server.public_net?.ipv4?.ip;
    hetznerState.provisionedAt = new Date().toISOString();
    hetznerState.totalProvisions++;
    hetznerState.totalCostUSD += 0.006; // ~$0.006/hr for cx21
    console.log(`[Hetzner] ✅ Provisioned: ${hetznerState.serverIp} (id: ${hetznerState.serverId})`);
    // Auto-deprovision after 2 hours
    setTimeout(() => deprovisionHetzner('auto-expire'), 2 * 60 * 60 * 1000);
    return hetznerState.serverIp;
  } catch(e) { console.error('[Hetzner] Error:', e.message); return null; }
}

async function deprovisionHetzner(reason) {
  if (!hetznerState.active || !hetznerState.serverId) return;
  console.log(`[Hetzner] Deprovisioning — reason: ${reason}`);
  try {
    await fetch(`https://api.hetzner.cloud/v1/servers/${hetznerState.serverId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${HETZNER_TOKEN}` }
    });
    hetznerState.active = false;
    hetznerState.serverId = null;
    hetznerState.serverIp = null;
    console.log('[Hetzner] ✅ Deprovisioned');
  } catch(e) { console.error('[Hetzner] Deprovision error:', e.message); }
}

// Auto-scale trigger — call this from Sentinel when threat score is high
export function checkAutoScale(sentinelScore, requestRate) {
  if (sentinelScore >= SCALE_THRESHOLD || requestRate > 500) {
    provisionHetzner(`sentinel_score=${sentinelScore} rate=${requestRate}`);
  }
  if (hetznerState.active && sentinelScore < 0.3 && requestRate < 100) {
    deprovisionHetzner('attack_subsided');
  }
}

export function getHetznerStatus() {
  return {
    active: hetznerState.active,
    serverIp: hetznerState.serverIp,
    provisionedAt: hetznerState.provisionedAt,
    totalProvisions: hetznerState.totalProvisions,
    estimatedCostUSD: hetznerState.totalCostUSD.toFixed(4),
  };
}

export { provisionHetzner, deprovisionHetzner, hetznerState };
