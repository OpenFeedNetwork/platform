# OFA Platform — Deployment Guide

## Fastest Path to Live (Fly.io) — 15 Minutes

### Step 1 — Prerequisites
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Create account at fly.io (free)
fly auth signup
```

### Step 2 — Configure
```bash
cp .env.example .env
# Edit .env — add ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN
```

### Step 3 — Deploy
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh fly
```

That's it. The script handles everything:
- Creates the Fly.io app
- Sets secrets securely
- Runs database migrations
- Deploys with zero-downtime rolling update
- Deploys Telegram bot separately
- Verifies all endpoints are healthy
- Sends you a Telegram notification on success

---

## Custom Domain Setup

### Fly.io
```bash
fly certs create openfeed.network
fly certs create www.openfeed.network
```
Then add the CNAME/A records shown to your DNS provider.

### DNS Records (Cloudflare recommended — free)
```
A     @              <fly-ip>    Proxied
CNAME www            @           Proxied
TXT   _dmarc         "v=DMARC1; p=quarantine; rua=mailto:dmarc@openfeed.network"
TXT   @              "v=spf1 include:fly.io ~all"
```

---

## Cost Breakdown

| Service | Cost |
|---------|------|
| Fly.io (4 services) | ~$12-15/month |
| Anthropic API (Truth Shield) | ~$2-25/month |
| Domain (Cloudflare) | ~$1/month |
| Redis (Upstash free tier) | $0 |
| SSL (Let's Encrypt) | $0 |
| **Total** | **~$15-40/month** |

---

## VPS Alternative (~$6/month)

If you want cheaper hosting:
```bash
# Provision a $6/month Hetzner CX11 or DigitalOcean Droplet (Ubuntu 24.04)
VPS_HOST="root@your-vps-ip" ./scripts/deploy.sh vps
```

Then set up Nginx:
```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp nginx/nginx.conf /etc/nginx/sites-available/openfeed
sudo ln -s /etc/nginx/sites-available/openfeed /etc/nginx/sites-enabled/
sudo certbot --nginx -d openfeed.network
sudo systemctl reload nginx
```

---

## CI/CD with GitHub Actions

### Setup
1. Push code to GitHub
2. Go to: Settings → Secrets → Actions
3. Add these secrets:
   - `FLY_API_TOKEN` — from: `fly tokens create deploy`
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `TELEGRAM_BOT_TOKEN` — your bot token
   - `ADMIN_TELEGRAM_ID` — your Telegram user ID for deploy notifications

### Workflow
```
Push to main branch
  → Run tests
  → Security scan (npm audit + CodeQL + secret scanning)
  → Build Docker image
  → Deploy to Fly.io (rolling, zero-downtime)
  → Deploy Telegram bot
  → Verify health endpoints
  → Notify you on Telegram
```

Pull requests run tests + security only — no deploy.

---

## Monitoring

### Check service status
```bash
fly status -a open-feed-platform
fly logs   -a open-feed-platform
```

### Health endpoints
- Platform:  https://openfeed.network/health
- API status: https://openfeed.network/api/v1/status
- TS stats:  https://openfeed.network/api/v1/truthshield/stats

### Scale up (after grant funding)
```bash
fly scale memory 512 -a open-feed-platform   # More RAM
fly scale count  2   -a open-feed-platform   # Two instances
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `JWT_SECRET` | ✅ | Random 64-char string (auto-generated) |
| `NODE_ENV` | ✅ | `production` |
| `IPFS_ENABLED` | Optional | `true` to enable IPFS storage |
| `REDIS_HOST` | Optional | Redis host (default: localhost) |
| `CORS_ORIGIN` | Optional | Your domain for CORS |

---

## Rollback

```bash
./scripts/deploy.sh rollback
# Shows last 5 deployments
# Enter version number to roll back
```

---

## Post-Launch Checklist

- [ ] Domain configured and SSL active
- [ ] Health check passing
- [ ] Telegram bot responding to /start
- [ ] Truth Shield analyzing posts
- [ ] Open Collective page live
- [ ] GitHub Sponsors enabled
- [ ] Grant applications submitted
- [ ] Submit to Product Hunt
