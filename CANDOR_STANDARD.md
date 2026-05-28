# The CANDOR Score Standard
## An Open Specification for Content Truth Verification

**Version:** 1.0  
**Published by:** Open Feed Network, Inc.  
**Author:** Ronny Cruz, Founder  
**License:** Creative Commons Attribution 4.0 International (CC BY 4.0)  
**Status:** Public Draft — Open for Community Review  
**Contact:** hello@openfeed.network  

---

## Abstract

The CANDOR Score Standard defines a universal, open framework for measuring and communicating the trustworthiness of content on digital platforms. It establishes a 0–100 numeric score, a three-tier color system, and a set of implementation guidelines that any platform can adopt to give users transparent, consistent signals about content veracity.

The standard is designed to replace binary suppression (hide or show) with contextual transparency — content is never hidden, only labeled.

---

## 1. The Problem

Digital platforms today suppress content based on proprietary, opaque algorithms. Users have no way to know:

- Why a post was demoted or hidden
- What criteria were used to flag it
- Whether the flagging was accurate
- What the platform's conflict of interest was

This creates an environment where legitimate journalism, whistleblower disclosures, and community accountability content gets silenced alongside actual disinformation — with no transparency and no recourse.

The CANDOR Score Standard addresses this by replacing suppression with scored transparency.

---

## 2. Core Principle

> **Label, never suppress.**

Content that scores low on the CANDOR scale receives a context label and a visible score. It is never hidden, shadow-banned, or algorithmically demoted without disclosure. Users see the score and decide for themselves.

---

## 3. The CANDOR Score

The CANDOR Score is a single integer from **0 to 100** representing the assessed trustworthiness of a piece of content.

### 3.1 Score Ranges

| Range | Tier | Color | Meaning |
|-------|------|-------|---------|
| 75 – 100 | Verified | 🟢 Green `#1D9E75` | Legitimate, high public interest, well-sourced |
| 45 – 74 | Unverified | 🟡 Yellow `#EF9F27` | Proceed with caution — claims need more evidence |
| 0 – 44 | Low Trust | 🔴 Red `#E24B4A` | Disinformation risk, promotional, or unverifiable |

### 3.2 Color Specification

Platforms implementing the CANDOR Score must use the following colors exactly, or colors that are visually equivalent for accessibility purposes:

```
Green  — Hex: #1D9E75  |  RGB: 29, 158, 117   |  HSL: 161°, 69%, 37%
Yellow — Hex: #EF9F27  |  RGB: 239, 159, 39   |  HSL: 37°, 86%, 54%
Red    — Hex: #E24B4A  |  RGB: 226, 75, 74    |  HSL: 0°, 72%, 59%
```

### 3.3 Color Rationale

The three-color system maps directly to universal human intuition:

- **Green** — Go. Trust this. Safe to share.
- **Yellow** — Slow down. Verify before sharing.
- **Red** — Stop. High risk of harm if shared uncritically.

This is intentional. The CANDOR Score should require zero explanation for any user in any language or culture.

---

## 4. Score Components

A CANDOR Score is computed from the following weighted components. Platforms may adjust weights within defined ranges.

### 4.1 Component Table

| Component | Description | Default Weight | Min | Max |
|-----------|-------------|---------------|-----|-----|
| Source Credibility | Track record of the author/outlet | 0.30 | 0.20 | 0.50 |
| Claim Verifiability | Can claims be checked against primary sources? | 0.25 | 0.15 | 0.40 |
| Public Interest | Does this serve the public good? | 0.20 | 0.10 | 0.30 |
| Community Verification | Has the community confirmed or disputed this? | 0.15 | 0.05 | 0.25 |
| Engagement Authenticity | Are engagements organic or manipulated? | 0.10 | 0.05 | 0.20 |

### 4.2 Mandatory Penalties

The following automatically reduce a score, regardless of other component values:

| Condition | Score Reduction |
|-----------|----------------|
| Paid/sponsored content (undisclosed) | −40 points |
| Known disinformation source | −50 points |
| Manipulated media detected | −35 points |
| Coordinated inauthentic behavior detected | −30 points |
| Missing author attribution | −10 points |

### 4.3 Mandatory Bonuses

The following automatically increase a score:

| Condition | Score Increase |
|-----------|---------------|
| Verified FOIA document attached | +15 points |
| Peer-reviewed source cited | +10 points |
| Eyewitness account with corroboration | +10 points |
| Previously suppressed by platform, legitimacy confirmed | +20 points |
| Community verification quorum reached | +10 points |

---

## 5. Display Requirements

### 5.1 Required Display Elements

Any platform implementing the CANDOR Score must display all of the following:

1. **The numeric score** (0–100) in a legible font, minimum 11px
2. **The color indicator** corresponding to the score range
3. **The word "CANDOR"** adjacent to the score
4. **The verdict label**: one of `Legitimate`, `Unverified`, or `Low CANDOR`

### 5.2 Recommended Display: The CANDOR Ring

The reference implementation uses a circular progress ring surrounding the score. The ring fills proportionally to the score value (100 = full circle) and renders in the appropriate color.

**SVG Reference Implementation:**

```svg
<svg width="52" height="52" viewBox="0 0 52 52">
  <!-- Background track -->
  <circle cx="26" cy="26" r="22" fill="none" stroke="#1E2535" stroke-width="3"/>
  <!-- Score ring — example: score=97, green -->
  <circle cx="26" cy="26" r="22" fill="none" stroke="#1D9E75" stroke-width="3"
    stroke-dasharray="138.2" stroke-dashoffset="4.1"
    stroke-linecap="round" transform="rotate(-90 26 26)"/>
  <!-- Score number -->
  <text x="26" y="22" text-anchor="middle" fill="#1D9E75"
    font-size="13" font-weight="500" font-family="monospace">97</text>
  <!-- Label -->
  <text x="26" y="33" text-anchor="middle" fill="#1D9E75"
    font-size="6.5" font-weight="500" font-family="monospace"
    letter-spacing="0.5">CANDOR</text>
</svg>
```

**Calculating stroke-dashoffset:**

```javascript
const radius = 22;
const circumference = 2 * Math.PI * radius; // 138.23
const offset = circumference - (score / 100) * circumference;
// score=97 → offset = 138.23 - (0.97 * 138.23) = 4.15
// score=60 → offset = 138.23 - (0.60 * 138.23) = 55.29
// score=20 → offset = 138.23 - (0.20 * 138.23) = 110.58
```

### 5.3 Prohibited Display Behaviors

Platforms adopting the CANDOR Score Standard **must not**:

- Hide or obscure a post's CANDOR score from the user
- Display a CANDOR score without the numeric value
- Use CANDOR score as the sole basis for content removal
- Modify a CANDOR score without disclosing the change and reason
- Display a fabricated or estimated CANDOR score as a confirmed one

---

## 6. Context Labels

When a post scores below 75, a context label must accompany the score. Labels are informational only — they do not restrict visibility.

### 6.1 Standard Labels by Verdict

| Verdict | Trigger Condition | Example Label |
|---------|------------------|---------------|
| `Legitimate` | Score 75–100 | *Truth Shield verified — high public interest* |
| `Unverified` | Score 45–74 | *Claims not yet independently verified — review sources* |
| `Low CANDOR` | Score 0–44 | *Promotional content — limited public interest value* |
| `Disinformation` | Known false claims | *Contains claims contradicted by primary sources* |
| `Satire` | Satirical content | *Satire — not intended as factual reporting* |
| `Opinion` | Editorial/opinion | *Opinion — represents the author's perspective* |

### 6.2 Label Rules

- Labels must be factual and neutral in tone
- Labels must link to the full audit trail
- Labels must be dismissible by the user (with the dismissal logged)
- Labels must never use language that implies the author is malicious

---

## 7. Suppression Disclosure

A core requirement of the CANDOR Score Standard is **suppression transparency**.

### 7.1 The Restoration Badge

When content was suppressed by an algorithm and subsequently reviewed and restored, it must display a **Restoration Badge** containing:

- The word "Restored"
- The platform or system that originally suppressed it (if known)
- The CANDOR score at time of restoration
- A link to the full suppression audit

**Reference implementation (HTML):**

```html
<div class="restoration-badge">
  ⚠️ Platform suppressed this post — 
  Truth Shield reviewed and restored it.
  <a href="/audit/{post_id}">View audit trail →</a>
</div>
```

### 7.2 Suppression Log Requirements

Platforms must maintain a publicly accessible suppression log containing:

- Post identifier (anonymized if requested by author)
- Timestamp of suppression
- Algorithm or rule that triggered suppression
- CANDOR score at time of suppression
- Resolution outcome (restored, removed, labeled)
- Timestamp of resolution

---

## 8. IPFS Integration (Recommended)

The CANDOR Score Standard recommends storing score verdicts immutably on IPFS to prevent retroactive manipulation.

### 8.1 Verdict Record Schema

```json
{
  "candor_version": "1.0",
  "post_id": "unique-post-identifier",
  "score": 97,
  "verdict": "legitimate",
  "confidence": 97,
  "components": {
    "source_credibility": 0.95,
    "claim_verifiability": 0.98,
    "public_interest": 0.99,
    "community_verification": 0.94,
    "engagement_authenticity": 0.96
  },
  "penalties": [],
  "bonuses": ["foia_document_attached"],
  "analyzed_at": "2026-05-28T12:00:00Z",
  "analyzer": "truth-shield-v1",
  "ipfs_cid": "QmXyz..."
}
```

### 8.2 Displaying IPFS Verification

```html
<!-- Minimal IPFS attribution -->
<span class="ipfs-badge">
  ◆ IPFS: QmTs4Jkl…
</span>
```

---

## 9. API Reference

Platforms implementing the CANDOR Score Standard should expose the following endpoints:

### 9.1 Score Endpoint

```
GET /api/v1/candor/score/{post_id}

Response:
{
  "post_id": "string",
  "score": 0-100,
  "verdict": "legitimate|unverified|low_candor|disinformation|satire|opinion",
  "confidence": 0-100,
  "color": "#1D9E75|#EF9F27|#E24B4A",
  "label": "string",
  "suppressed": boolean,
  "restored": boolean,
  "ipfs_cid": "string|null",
  "analyzed_at": "ISO8601"
}
```

### 9.2 Audit Endpoint

```
GET /api/v1/candor/audit/{post_id}

Response:
{
  "post_id": "string",
  "score_history": [...],
  "suppression_events": [...],
  "restoration_events": [...],
  "community_flags": [...],
  "ipfs_verdicts": [...]
}
```

### 9.3 Weights Endpoint

```
GET /api/v1/candor/weights

Response:
{
  "source_credibility_weight": 0.30,
  "claim_verifiability_weight": 0.25,
  "public_interest_weight": 0.20,
  "community_verification_weight": 0.15,
  "engagement_authenticity_weight": 0.10,
  "governance_version": "string",
  "last_updated": "ISO8601"
}
```

---

## 10. Governance

The weights and thresholds in this standard are governed by community vote on the Open Feed Network governance platform. Any platform implementing the standard may participate in governance.

### 10.1 Weight Change Process

1. Any verified community member may propose a weight change
2. Proposals are open for 7 days of community voting
3. A 60% supermajority is required for passage
4. Changes take effect 14 days after passage
5. All votes and outcomes are recorded on-chain

### 10.2 Version History

| Version | Date | Key Changes |
|---------|------|------------|
| 1.0 | May 28, 2026 | Initial public release |

---

## 11. Implementation Checklist

Use this checklist to verify your implementation is compliant:

- [ ] Scores display as integers 0–100
- [ ] Green color used for scores 75–100
- [ ] Yellow color used for scores 45–74
- [ ] Red color used for scores 0–44
- [ ] The word "CANDOR" appears adjacent to every score
- [ ] Verdict label displayed with every score
- [ ] Context labels are informational only — no content hidden
- [ ] Suppression events logged and publicly accessible
- [ ] Restoration badge displayed on restored content
- [ ] Score audit trail accessible via public link
- [ ] IPFS verdict storage implemented (or planned)
- [ ] Weights publicly documented
- [ ] Governance participation enabled (or planned)

---

## 12. Attribution

Platforms implementing this standard must include the following attribution:

> *Content trust scores powered by the CANDOR Score Standard, an open specification by Open Feed Network, Inc. Learn more at candortheopenfeednetwork.com*

---

## 13. License

This specification is released under the **Creative Commons Attribution 4.0 International License (CC BY 4.0)**.

You are free to:
- **Share** — copy and redistribute in any medium or format
- **Adapt** — remix, transform, and build upon this standard

Under the following terms:
- **Attribution** — You must give appropriate credit to Open Feed Network, Inc.
- **No additional restrictions** — You may not apply legal terms that restrict others

Full license: https://creativecommons.org/licenses/by/4.0/

---

## 14. Contact & Contribution

**Open Feed Network, Inc.**  
Website: candortheopenfeednetwork.com  
Email: hello@openfeed.network  
GitHub: github.com/OpenFeedNetwork  

To propose changes to this standard, open an issue or pull request on the Open Feed Network GitHub repository.

---

*The CANDOR Score Standard — because truth deserves a score, not a shadow ban.*
