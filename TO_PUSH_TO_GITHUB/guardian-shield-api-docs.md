# Guardian Shield API — Documentation

> Child protection and age verification API for COPPA, KOSA, and GDPR-K compliance.
> Built by Open Feed Network, Inc. — guardian.openfeed.network

---

## Overview

Guardian Shield API gives any platform **7-layer child protection** as a simple REST API. Instead of building compliance infrastructure from scratch, integrate Guardian Shield in under an hour and get:

- **Age estimation** from behavioral and profile signals
- **Grooming pattern detection** in conversations
- **CSAM pre-screening** via Microsoft PhotoDNA
- **Zero-Knowledge age verification** — proves 18+ with zero PII collected
- **Downloadable compliance reports** for COPPA/KOSA regulatory evidence

---

## Pricing

| Tier | Price | Monthly Scans | Best For |
|---|---|---|---|
| Free | $0/month | 1,000 | Testing and development |
| Starter | $79.99/month | 10,000 | Small forums, indie apps |
| Growth | $299/month | 100,000 | Mid-size platforms |
| Platform | $999/month | 1,000,000 | Large social networks |
| Enterprise | Custom | Unlimited + SLA | Major platforms, government |

**Why Guardian Shield is worth every dollar:**
A COPPA violation costs **$51,744 per violation per day**.
Guardian Shield Starter costs **$79.99/month**.
You pay less in a year than one hour of FTC fines.

---

## Authentication

Every request requires your API key in the header:

```
x-api-key: gs_your_api_key_here
```

API keys begin with `gs_`. Get yours at guardian.openfeed.network.

---

## Base URL

```
https://guardian.openfeed.network
```

---

## Endpoints

### POST /api/v1/scan/user
Scan a user account for minor indicators across 3 layers.

**Request:**
```json
{
  "username": "john_doe",
  "bio": "love minecraft and fortnite, in 8th grade",
  "posts": ["had fun at school today", "mom said dinner at 6"],
  "posting_hours": [15, 16, 17, 20, 21],
  "topics": ["minecraft", "school", "friends"],
  "account_age_days": 14,
  "follower_count": 23,
  "following_count": 45
}
```

**Response:**
```json
{
  "minor_probability": 85,
  "age_estimate_range": "13_to_15",
  "risk_level": "high",
  "layers_triggered": ["age_estimation", "profile_analysis", "behavioral_pattern"],
  "indicators_found": ["school_reference", "parent_reference", "gaming_minor_pattern"],
  "confidence": 78,
  "recommended_action": "verify",
  "reasoning": "Multiple indicators suggest account belongs to a 13-15 year old",
  "scan_id": "uuid",
  "processing_ms": 847,
  "compliance": ["COPPA", "KOSA", "GDPR-K"]
}
```

**Recommended actions:**
- `allow` — No indicators found, proceed normally
- `monitor` — Low probability, flag for periodic review
- `verify` — Medium-high probability, require age verification
- `restrict` — High probability, limit features available to minors
- `block` — Critical indicators, prevent account creation

---

### POST /api/v1/scan/conversation
Detect grooming patterns in conversation text (Layer 5).

**Request:**
```json
{
  "conversation": "hey how old are you? you seem really mature...",
  "participants": ["adult_user_123", "teen_user_456"]
}
```

**Response:**
```json
{
  "grooming_detected": true,
  "risk_level": "high",
  "confidence": 82,
  "patterns_found": ["age_solicitation", "flattery_pattern"],
  "recommended_action": "escalate",
  "reasoning": "Conversation contains age solicitation and excessive flattery"
}
```

---

### POST /api/v1/scan/media
CSAM pre-screen via PhotoDNA hash matching (Layer 6).

**Request:**
```json
{
  "image_base64": "base64_encoded_image_data",
  "mime_type": "image/jpeg"
}
```

**Response:**
```json
{
  "isMatch": false,
  "confidence": 0,
  "risk_level": "none",
  "status": "checked",
  "scan_id": "uuid",
  "processing_ms": 312
}
```

**⚠ Legal note:** If `isMatch: true`, you are legally required to report to NCMEC CyberTipline within 24 hours (18 U.S.C. § 2258A). Guardian Shield sends an automatic webhook alert.

---

### POST /api/v1/verify/start
Start a Zero-Knowledge age verification session (Layer 4).

**Request:**
```json
{
  "age_threshold": 18,
  "callback_url": "https://yoursite.com/verify/complete"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "token": "64_char_hex_token",
  "verification_url": "https://guardian.openfeed.network/verify/64_char_hex_token",
  "callback_url": "https://yoursite.com/verify/complete",
  "age_threshold": 18,
  "expires_at": "2026-07-04T12:30:00Z",
  "instructions": "Redirect the user to verification_url...",
  "privacy_note": "Zero personal information is collected or stored. GDPR-compliant by design."
}
```

**Flow:**
1. Call this endpoint to get a `verification_url`
2. Redirect your user to `verification_url`
3. User proves their age cryptographically (no PII collected)
4. Guardian Shield redirects to your `callback_url` with a signed verification token
5. Call `/api/v1/verify/:token` to confirm the verification

---

### GET /api/v1/verify/:token
Complete and confirm a ZK verification.

**Response:**
```json
{
  "verified": true,
  "age_threshold_met": true,
  "age_threshold": 18,
  "verification_proof": "sha256_proof_hash",
  "pii_collected": false,
  "pii_stored": false,
  "gdpr_compliant": true,
  "coppa_compliant": true,
  "expires_at": "2026-10-02T12:30:00Z"
}
```

---

### GET /api/v1/report/:month
Generate a monthly compliance report for regulatory evidence.

**Example:** `GET /api/v1/report/2026-07`

**Response:**
```json
{
  "report_id": "uuid",
  "company": "YourPlatform Inc.",
  "report_month": "2026-07",
  "generated_at": "2026-08-01T09:00:00Z",
  "summary": {
    "total_scans": 45231,
    "minors_detected": 23,
    "csam_detected": 0,
    "grooming_detected": 4,
    "actions_taken": 27,
    "detection_rate": "0.06%"
  },
  "compliance_statement": "YourPlatform Inc. processed 45,231 content safety scans in 2026-07 using Guardian Shield API. 23 potential minor accounts were detected and acted upon...",
  "certifications": ["COPPA", "KOSA", "GDPR-K", "GDPR"],
  "legal_note": "This report may be used as evidence of active child safety compliance measures in regulatory proceedings."
}
```

---

### GET /api/v1/usage
Check current usage and limits.

---

## Webhooks

Configure a webhook URL when creating your account to receive real-time alerts.

**Events:**
- `minor_detected` — Fired when `risk_level` is `high` or `critical`
- `grooming_detected` — Fired when grooming patterns are found
- `csam_detected` — Fired immediately on any CSAM match

**Payload:**
```json
{
  "event": "minor_detected",
  "risk_level": "high",
  "username": "john_doe",
  "action": "verify",
  "timestamp": "2026-07-04T12:00:00Z"
}
```

---

## SDK

Copy `guardian-shield-sdk.js` into your project or install from npm:

```bash
npm install guardian-shield-sdk
```

**Quick example:**
```javascript
import { GuardianShield } from "./guardian-shield-sdk.js";

const gs = new GuardianShield("gs_your_api_key");

// Scan a new user
const result = await gs.scanUser({ username: "john_doe", bio: "...", ... });

// Start ZK age verification
const session = await gs.startVerification({ ageThreshold: 18, callbackUrl: "..." });
res.redirect(session.verification_url);

// Get monthly compliance report
const report = await gs.getComplianceReport("2026-07");
```

---

## Error Codes

| Code | Meaning | Solution |
|---|---|---|
| 401 | Invalid API key | Check your key starts with gs_ |
| 429 | Rate limit exceeded | Upgrade tier or wait for monthly reset |
| 400 | Missing required field | Check request body |
| 500 | Scan failed | Retry — contact support if persistent |

---

## Compliance Reference

| Regulation | Requirement | Guardian Shield Solution |
|---|---|---|
| COPPA | Verify age for under-13 users | Age estimation + ZK verification |
| KOSA | Protect minors from harmful content | 7-layer detection + grooming alerts |
| GDPR-K | No PII from minors without consent | ZK verification collects zero PII |
| GDPR | Data minimization | No user data stored beyond scan results |

---

## Support

- Documentation: guardian.openfeed.network/docs
- Email: safety@openfeed.network
- GitHub: github.com/OpenFeedNetwork/platform
- Status: status.openfeed.network

---

*Guardian Shield API — Open Feed Network, Inc. — guardian.openfeed.network*
*Protecting children. Protecting platforms. Protecting compliance.*
