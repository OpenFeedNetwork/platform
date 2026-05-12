#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# OFA PLATFORM — Full Deployment Script
# Handles: Fly.io, VPS, or local production
#
# USAGE:
#   chmod +x deploy.sh
#   ./deploy.sh fly        # Deploy to Fly.io (recommended, ~$10-20/mo)
#   ./deploy.sh vps        # Deploy to VPS via SSH
#   ./deploy.sh local      # Run production locally
#   ./deploy.sh check      # Pre-flight checks only
#   ./deploy.sh rollback   # Roll back last deployment
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'

# ── Config (edit these) ───────────────────────────────────────────────────
FLY_APP="open-feed-platform"
FLY_BOT="ofa-telegram-bot"
VPS_HOST="${VPS_HOST:-root@your-vps-ip}"
VPS_DIR="/opt/ofa-platform"
DOMAIN="${DOMAIN:-openfeed.network}"
MIN_NODE_VERSION=20

# ── Helpers ───────────────────────────────────────────────────────────────
log()     { echo -e "${CYAN}[OFA]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗ ERROR:${NC} $*" >&2; exit 1; }
banner()  { echo -e "\n${WHITE}═══ $* ═══${NC}\n"; }

# ── Pre-flight checks ─────────────────────────────────────────────────────
preflight() {
  banner "PRE-FLIGHT CHECKS"

  # Node version
  NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
  [ "$NODE_VER" -ge "$MIN_NODE_VERSION" ] \
    && success "Node.js v$NODE_VER (≥$MIN_NODE_VERSION required)" \
    || error "Node.js $MIN_NODE_VERSION+ required. Install from nodejs.org"

  # .env file
  [ -f ".env" ] \
    && success ".env file found" \
    || error ".env not found. Copy .env.example and fill in values:\n  cp .env.example .env"

  # Required env vars
  source .env 2>/dev/null || true
  [ -n "${ANTHROPIC_API_KEY:-}" ] \
    && success "ANTHROPIC_API_KEY set" \
    || error "ANTHROPIC_API_KEY not set in .env"
  [ -n "${JWT_SECRET:-}" ] \
    && success "JWT_SECRET set" \
    || warn "JWT_SECRET not set — generating one now"
  if [ -z "${JWT_SECRET:-}" ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    echo "JWT_SECRET=$JWT_SECRET" >> .env
    success "JWT_SECRET generated and added to .env"
  fi

  # Docker
  command -v docker &>/dev/null \
    && success "Docker $(docker --version | grep -oP '\d+\.\d+')" \
    || warn "Docker not found — required for containerized deployment"

  # npm dependencies
  [ -d "node_modules" ] \
    && success "node_modules present" \
    || { log "Installing dependencies..."; npm ci; }

  success "All pre-flight checks passed"
}

# ── Database migration ────────────────────────────────────────────────────
migrate() {
  banner "DATABASE MIGRATION"
  mkdir -p ./data
  log "Running database migrations..."
  node scripts/migrate.js && success "Databases initialized"
}

# ── Fly.io deployment ─────────────────────────────────────────────────────
deploy_fly() {
  banner "DEPLOYING TO FLY.IO"

  command -v flyctl &>/dev/null || {
    log "Installing flyctl..."
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
  }

  # Check login
  flyctl auth whoami &>/dev/null || {
    log "Please log in to Fly.io:"
    flyctl auth login
  }

  # Source env
  source .env 2>/dev/null || true

  # Set secrets
  log "Setting production secrets..."
  flyctl secrets set \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
    JWT_SECRET="${JWT_SECRET}" \
    NODE_ENV="production" \
    ${TELEGRAM_BOT_TOKEN:+TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"} \
    -a "$FLY_APP" --stage

  # Create app if it doesn't exist
  flyctl apps list | grep -q "$FLY_APP" || {
    log "Creating Fly.io app: $FLY_APP"
    flyctl apps create "$FLY_APP" --machines
    flyctl volumes create ofa_data --size 3 --region mia -a "$FLY_APP"
  }

  # Deploy platform
  log "Deploying platform (rolling update — zero downtime)..."
  flyctl deploy --config fly.toml --strategy rolling --wait-timeout 120
  success "Platform deployed: https://${FLY_APP}.fly.dev"

  # Deploy Telegram bot (if token set)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
    log "Deploying Telegram bot..."
    flyctl secrets set TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}" \
      OFA_API_BASE="https://${FLY_APP}.fly.dev" \
      -a "$FLY_BOT" --stage
    flyctl apps list | grep -q "$FLY_BOT" || \
      flyctl apps create "$FLY_BOT" --machines
    flyctl deploy --config fly.bot.toml --strategy rolling -a "$FLY_BOT"
    success "Telegram bot deployed"
  else
    warn "TELEGRAM_BOT_TOKEN not set — skipping bot deployment"
  fi

  verify_deployment "https://${FLY_APP}.fly.dev"
}

# ── VPS deployment ────────────────────────────────────────────────────────
deploy_vps() {
  banner "DEPLOYING TO VPS: $VPS_HOST"

  command -v ssh &>/dev/null || error "ssh not found"

  # Pack and upload
  log "Building production archive..."
  tar --exclude=node_modules --exclude=.git --exclude=data \
      -czf /tmp/ofa-deploy.tar.gz .

  log "Uploading to VPS..."
  ssh "$VPS_HOST" "mkdir -p $VPS_DIR"
  scp /tmp/ofa-deploy.tar.gz "$VPS_HOST:/tmp/"

  log "Installing on VPS..."
  ssh "$VPS_HOST" << REMOTE
    set -e
    cd $VPS_DIR

    # Backup current version
    [ -d current ] && cp -r current backup_\$(date +%Y%m%d_%H%M%S)

    # Extract new version
    mkdir -p next
    tar -xzf /tmp/ofa-deploy.tar.gz -C next/
    cd next

    # Install dependencies
    npm ci --omit=dev

    # Copy .env (must exist on VPS already)
    [ -f $VPS_DIR/.env ] && cp $VPS_DIR/.env .env || echo "WARNING: .env not found on VPS"

    # Run migrations
    mkdir -p /data/ofa
    DB_PATH=/data/ofa node scripts/migrate.js

    # Swap to new version (atomic)
    cd $VPS_DIR
    rm -rf current
    mv next current

    # Restart services with PM2
    pm2 describe ofa-gateway &>/dev/null \
      && pm2 restart ofa-gateway \
      || pm2 start current/services/gateway/index.js --name ofa-gateway \
           --node-args="--experimental-specifier-resolution=node" \
           --env production

    pm2 describe ofa-bot &>/dev/null \
      && pm2 restart ofa-bot \
      || { [ -n "\$TELEGRAM_BOT_TOKEN" ] && \
           pm2 start current/telegram-bot.js --name ofa-bot --env production; }

    pm2 save
    echo "✓ Services restarted"
REMOTE

  success "VPS deployment complete"
  verify_deployment "https://$DOMAIN"
}

# ── Local production ──────────────────────────────────────────────────────
deploy_local() {
  banner "STARTING LOCAL PRODUCTION"

  source .env 2>/dev/null || true
  export NODE_ENV=production

  migrate

  log "Starting all services..."
  docker compose up -d

  sleep 5
  verify_deployment "http://localhost:3000"

  success "Platform running locally:"
  echo -e "  ${CYAN}API:${NC}     http://localhost:3000"
  echo -e "  ${CYAN}Feed:${NC}    http://localhost:3000/api/v1/feed"
  echo -e "  ${CYAN}Docs:${NC}    http://localhost:3000/api/docs"
  echo ""
  log "View logs: docker compose logs -f"
  log "Stop:      docker compose down"
}

# ── Rollback ──────────────────────────────────────────────────────────────
rollback() {
  banner "ROLLING BACK"
  command -v flyctl &>/dev/null && {
    log "Rolling back Fly.io deployment..."
    flyctl releases -a "$FLY_APP" | head -5
    read -p "Enter version to rollback to: " VERSION
    flyctl deploy --image "$(flyctl releases show "$VERSION" -a "$FLY_APP" | grep Image | awk '{print $2}')"
    success "Rolled back to version $VERSION"
  } || warn "flyctl not found — manual rollback required"
}

# ── Verify deployment ─────────────────────────────────────────────────────
verify_deployment() {
  local URL="$1"
  banner "VERIFYING DEPLOYMENT"
  log "Waiting for services to start..."
  sleep 8

  for i in 1 2 3 4 5; do
    STATUS=$(curl -sf "$URL/health" 2>/dev/null | \
             python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")
    if [ "$STATUS" = "ok" ]; then
      success "Health check passed"
      break
    fi
    [ $i -eq 5 ] && error "Health check failed after 5 attempts"
    log "Attempt $i/5 failed — retrying in 5s..."
    sleep 5
  done

  # Check individual services
  for ENDPOINT in "/api/v1/status" "/api/v1/truthshield/stats" "/api/v1/feed/weights"; do
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$URL$ENDPOINT" 2>/dev/null || echo "000")
    [ "$HTTP_CODE" = "200" ] \
      && success "$ENDPOINT → $HTTP_CODE" \
      || warn "$ENDPOINT → $HTTP_CODE (may need auth)"
  done

  echo ""
  success "Deployment verified!"
  echo -e "\n${WHITE}🛡 OPEN FEED PLATFORM IS LIVE${NC}"
  echo -e "   ${CYAN}URL:${NC}    $URL"
  echo -e "   ${CYAN}API:${NC}    $URL/api/v1/status"
  echo -e "   ${CYAN}Docs:${NC}   $URL/api/docs"
}

# ── Cost estimator ────────────────────────────────────────────────────────
show_costs() {
  banner "ESTIMATED MONTHLY COSTS"
  echo -e "  ${WHITE}Fly.io (recommended):${NC}"
  echo -e "  Gateway (shared-cpu-1x, 256MB)   ~\$3/mo"
  echo -e "  Truth Shield (shared-cpu-1x)      ~\$3/mo"
  echo -e "  Guardian Shield (shared-cpu-1x)   ~\$3/mo"
  echo -e "  Telegram Bot (shared-cpu-1x)      ~\$2/mo"
  echo -e "  Redis (Upstash free tier)         \$0"
  echo -e "  IPFS (disabled initially)         \$0"
  echo -e "  Persistent storage (3GB)          ~\$0.75/mo"
  echo -e "  ${GREEN}TOTAL: ~\$12-15/month${NC}\n"
  echo -e "  ${WHITE}Anthropic API (Truth Shield):${NC}"
  echo -e "  Claude Haiku 4.5 ~1000 analyses   ~\$0.25/mo"
  echo -e "  At 10K analyses/month              ~\$2.50/mo"
  echo -e "  At 100K analyses/month             ~\$25/mo\n"
  echo -e "  ${WHITE}Domain + SSL:${NC}"
  echo -e "  Domain (Namecheap/Cloudflare)     ~\$12/year"
  echo -e "  SSL (Let's Encrypt)               \$0\n"
  echo -e "  ${GREEN}Total to launch: ~\$15-20/month${NC}"
}

# ── Main ──────────────────────────────────────────────────────────────────
echo -e "${WHITE}"
cat << 'LOGO'
  ╔══════════════════════════════════════════════╗
  ║   OFA PLATFORM — DEPLOYMENT SYSTEM v1.0     ║
  ║   Open Feed Network, Inc.                   ║
  ╚══════════════════════════════════════════════╝
LOGO
echo -e "${NC}"

COMMAND="${1:-help}"

case "$COMMAND" in
  fly)      preflight && deploy_fly    ;;
  vps)      preflight && deploy_vps    ;;
  local)    preflight && deploy_local  ;;
  check)    preflight                  ;;
  rollback) rollback                   ;;
  migrate)  migrate                    ;;
  costs)    show_costs                 ;;
  verify)   verify_deployment "${2:-http://localhost:3000}" ;;
  help|*)
    echo -e "USAGE: ${CYAN}./deploy.sh <command>${NC}\n"
    echo -e "COMMANDS:"
    echo -e "  ${GREEN}fly${NC}       Deploy to Fly.io (~\$12-15/month, recommended)"
    echo -e "  ${GREEN}vps${NC}       Deploy to VPS via SSH"
    echo -e "  ${GREEN}local${NC}     Run production stack locally with Docker"
    echo -e "  ${GREEN}check${NC}     Pre-flight checks only"
    echo -e "  ${GREEN}rollback${NC}  Roll back last deployment"
    echo -e "  ${GREEN}migrate${NC}   Run database migrations"
    echo -e "  ${GREEN}costs${NC}     Show estimated monthly costs"
    echo -e "  ${GREEN}verify${NC}    Verify a running deployment\n"
    show_costs
    ;;
esac
