# Open Feed Platform (OFA) 🛡

> Anti-suppression social media platform with Truth Shield disinformation detection and Guardian Shield child protection.

## Architecture

```
                        ┌─────────────────────────────┐
                        │       API GATEWAY :3000      │
                        │  Auth · Rate Limit · Proxy   │
                        └──────────────┬──────────────┘
                ┌─────────────┬────────┴────────┬─────────────┐
                ▼             ▼                  ▼             ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────┐
        │ TRUTH SHIELD │ │  GUARDIAN    │ │   OFA FEED   │  │  REDIS   │
        │    :3001     │ │  SHIELD :3002│ │    :3003     │  │  :6379   │
        │ Disinformation│ │ Child Safety │ │ Feed Ranking │  │Job Queue │
        │  Claude Haiku│ │ 7-Layer Det. │ │ Transparent  │  └──────────┘
        └──────┬───────┘ └──────────────┘ └──────────────┘
               │
        ┌──────▼───────┐
        │     IPFS     │  (optional — enable with docker compose --profile ipfs up)
        │    :5001     │
        │ Perm Storage │
        └──────────────┘
```

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local dev)
- An Anthropic API key

### 1. Clone and configure
```bash
git clone https://github.com/openfeed/platform.git
cd platform
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Start all services
```bash
docker compose up -d
```

### 3. Check status
```bash
curl http://localhost:3000/api/v1/status
```

### 4. Run locally (without Docker)
```bash
npm install
npm run db:migrate
npm run dev
```

## Services

| Service          | Port | Description |
|-----------------|------|-------------|
| API Gateway     | 3000 | Single entry point, auth, rate limiting |
| Truth Shield    | 3001 | Disinformation detection via Claude Haiku |
| Guardian Shield | 3002 | Child protection, 7-layer minor detection |
| OFA Feed Engine | 3003 | Transparent feed ranking |
| Redis           | 6379 | Async job queue |
| IPFS (optional) | 5001 | Decentralized permanent storage |

## API Reference

Full interactive API explorer: `http://localhost:3000/api/docs`

### Core Endpoints

```
POST   /api/v1/posts                    Create a post (all content types)
GET    /api/v1/feed                     Get OFA-ranked feed
POST   /api/v1/truthshield/analyze      Submit content for Truth Shield
GET    /api/v1/truthshield/stats        Platform transparency report
POST   /api/v1/guardian/analyze         Analyze account for minor signals
POST   /api/v1/guardian/verify-age      Submit ZK age proof
GET    /api/v1/governance/proposals     Active governance proposals
POST   /api/v1/governance/proposals/:id/vote  Cast governance vote
GET    /api/v1/status                   Platform health check
```

## Configuration

All configuration via `.env`. See `.env.example` for full reference.

Key settings:
- `ANTHROPIC_API_KEY` — Required for Truth Shield and Guardian Shield
- `IPFS_ENABLED=true` — Enable decentralized storage (requires IPFS profile)
- `NODE_ENV=production` — Enables strict ZK proof verification

## Docker Commands

```bash
# Start all services
docker compose up -d

# Start with IPFS
docker compose --profile ipfs up -d

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f truth-shield

# Stop services
docker compose down

# Stop and delete all data (CAREFUL)
docker compose down -v

# Rebuild after code changes
docker compose build && docker compose up -d
```

## Content Types Supported

| Type       | Description |
|-----------|-------------|
| text      | Short-form posts and updates |
| article   | Long-form investigative content |
| image     | Photos and infographics |
| video     | Short clips and documentaries |
| audio     | Podcasts and voice notes |
| data      | Raw datasets and public records |
| link      | Shared articles with commentary |
| poll      | Community questions (anti-manipulation safeguards) |
| thread    | Multi-post connected narratives |
| document  | PDFs, FOIA records, legal filings |

## Account Tiers

| Tier           | Privacy Level | Use Case |
|---------------|---------------|---------|
| Standard       | Username only | General community members |
| Anonymous      | Zero PII      | Privacy-conscious users |
| Whistleblower  | E2E encrypted | Source protection, document leaks |

## Compliance

- **COPPA** — Child data deleted within 24h of confirmation
- **GDPR-K** — Children's privacy rights fully implemented
- **KOSA** — Kids Online Safety Act compliant
- **FDBR** — Florida Digital Bill of Rights compliant
- **CCPA/CPRA** — California privacy rights compliant
- **Section 230** — Good-faith moderation documented

## Grant Applications

This platform is eligible for:
- Knight Foundation — Informed & Engaged Communities
- Mozilla Technology Fund — Trustworthy AI
- Democracy Fund — Strengthen Democratic Discourse
- Craig Newmark Philanthropies — Trustworthy Information

## License

Open Source — MIT License. See LICENSE for details.

## Contributing

All contributions welcome. Algorithm weight changes require community governance vote.
See CONTRIBUTING.md for guidelines.

---
*Open Feed Platform — Truth through transparency, not suppression.*

## 🛡 Child Safety

Open Feed Network, Inc. maintains a zero-tolerance policy for Child Sexual 
Abuse Material (CSAM) across all platforms we operate.

We are actively pursuing:
- Microsoft PhotoDNA integration for hash-based CSAM detection
- NCMEC CyberTipline Electronic Service Provider registration
- Legal Compliance Quarantine (LCQ) system — built and deployed

All content submitted to our platforms is scanned before permanent 
storage. Any detected CSAM is immediately quarantined, never reaches 
our IPFS storage layer, and is reported to NCMEC within 24 hours 
in compliance with 18 U.S.C. § 2258A.

**Contact:** safety@openfeed.network  
**NCMEC CyberTipline:** missingkids.org/cybertipline  
**Platform:** openfeed.network
