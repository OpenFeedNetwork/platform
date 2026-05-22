# FBI Reporting Protocol
## Open Feed Network, Inc. — Terrorism Content Response

**Document version:** 1.0  
**Effective date:** July 4, 2026  
**Legal basis:** 18 U.S.C. § 2339B — Material Support to Designated Foreign Terrorist Organizations  
**Contact:** legal@openfeed.network | security@openfeed.network

---

## Overview

This protocol governs how Open Feed Network, Inc. detects, quarantines, documents, and reports terrorism-related content to federal authorities. It applies to all content on the Open Feed Platform, Truth Shield API outputs, and any platform using OFA's detection infrastructure.

**Core principle:** Content that facilitates terrorism is removed immediately. Counter-extremism speech, journalism, academic research, and political speech are protected.

---

## Step 1 — Detection (Automated — Seconds)

The terrorism detection layer runs on every piece of content before it is stored:

- **GIFCT hash check** — content compared against GIFCT's database of known terrorism media
- **FTO entity detection** — content checked for designated Foreign Terrorist Organization names
- **AI content analysis** — Claude Haiku analyzes for recruitment, coordination, fundraising, glorification

**If result is CRITICAL or REMOVE:**
- Content is immediately quarantined — never published to the feed
- User sees: "Your content is under review"
- Internal alert fired to security@openfeed.network
- Scan logged in terrorism_detection.db with full metadata

---

## Step 2 — Human Review (Within 1 Hour)

A designated reviewer — initially the CEO (son) — reviews the quarantined content:

**Review checklist:**
- [ ] Is this actually terrorism support or is it counter-extremism/journalism/political speech?
- [ ] Does the account claim FTO membership explicitly?
- [ ] Is there operational content (attack planning, weapons instructions)?
- [ ] Is this recruitment toward a specific group?
- [ ] Could this be hyperbolic political speech?

**Decision options:**
1. **False positive** — release content, clear account
2. **Gray area** — keep quarantined, add content label, monitor account
3. **Confirmed violation** — proceed to Step 3

---

## Step 3 — Account Action (Immediately After Confirmation)

**For confirmed terrorism content:**
- Suspend account immediately
- Quarantine ALL content from that account pending review
- Log IP address and device fingerprint
- Do NOT notify the user of the specific reason (to prevent evidence destruction)
- Preserve all metadata for law enforcement

---

## Step 4 — FBI Reporting (Within 24 Hours)

**This step is legally required. Do not skip.**

### How to File an IC3 Report

1. Go to **ic3.gov**
2. Click **"File a Complaint"**
3. Select **"Terrorism"** as the crime type
4. Fill in the following information:

**Do include:**
- Your name and contact information as the reporting party
- Platform name: Open Feed Network
- Internal report ID from terrorism_detection.db
- Date and time content was detected
- Type of content (recruitment / coordination / fundraising / glorification)
- FTO mentioned or depicted
- Hashed user identifier (NOT the actual username or personal information)
- Hashed IP address
- Any known account creation date

**Do NOT include:**
- The actual content text or media
- Unmasked personal information of the user
- Your API keys or system credentials

5. Submit the complaint
6. **Record the IC3 complaint reference number immediately**
7. Update the fbi_reports table with the IC3 reference number:

```sql
UPDATE fbi_reports 
SET ic3_reference = '[IC3_NUMBER]' 
WHERE id = '[INTERNAL_REPORT_ID]';
```

---

## Step 5 — GIFCT Submission (Within 24 Hours)

If the content is media (image or video) and has been confirmed as terrorism content:

1. Log into the GIFCT member portal at gifct.org
2. Submit the content hash to the shared database
3. This prevents the same content from appearing on other GIFCT member platforms
4. Document the submission in the scan record

---

## Step 6 — Documentation (Ongoing)

Maintain records of:
- Every scan result and detection method
- Every quarantine decision and timestamp
- Every FBI IC3 report filed with reference number
- Every GIFCT hash submission
- Every human review decision with reviewer name and reasoning
- Every account suspension related to terrorism content

**Retention period:** Minimum 5 years for all terrorism-related records.

---

## What NOT to Do

- **Do NOT** notify the user that they have been reported to the FBI
- **Do NOT** delete the content before filing the FBI report — preserve it in quarantine
- **Do NOT** discuss active terrorism reports on public channels
- **Do NOT** make legal determinations yourself — report and let law enforcement investigate
- **Do NOT** remove counter-extremism content, journalism, or political speech

---

## Protected Speech — Do Not Remove

The following content is protected and must NOT be removed even if it mentions FTOs or violence:

| Content Type | Example | Action |
|---|---|---|
| Counter-extremism journalism | "Here's how ISIS recruits online" | Allow — add journalism label |
| Academic research | "Study of radicalization pathways" | Allow |
| News reporting | "FBI arrests ISIS suspect in Florida" | Allow |
| Victim stories | "ISIS killed my family in Syria" | Allow — protect |
| Former extremist accounts | "I was radicalized and here's why I left" | Allow — protect |
| Government officials | "State Dept designates new FTO" | Allow |
| Political speech | "I oppose US foreign policy in [country]" | Allow |
| Hyperbolic frustration | "I hate [group]" without specific threat | Monitor |

---

## Emergency Contact Protocol

**If content suggests an imminent attack:**

1. Call FBI tip line immediately: **1-800-CALL-FBI (1-800-225-5324)**
2. Or submit online tip at: **tips.fbi.gov**
3. Include: nature of threat, platform details, account information, timestamp
4. Then file the IC3 report as normal

**If you receive a law enforcement request or subpoena:**
1. Do not respond without attorney review
2. Contact legal@openfeed.network immediately
3. Forward to startup attorney
4. Document receipt date and deadline
5. Preserve all relevant records

---

## Monthly Compliance Report

On the first of every month, generate a terrorism compliance report:

```javascript
import { generateTerrorismComplianceReport } from "./terrorism-detection-layer.js";
const report = await generateTerrorismComplianceReport("2026-07");
```

This report documents all detection activity, FBI reports filed, GIFCT submissions, and counter-extremism content protected. Retain for 5 years.

---

## GIFCT Membership Application

Open Feed Network has not yet been accepted as a GIFCT member. Apply at:

**gifct.org/membership**

Membership requirements:
- Platform must have Terms of Service prohibiting terrorism content
- Platform must have active content moderation
- Platform must agree to GIFCT's hash-sharing obligations
- Platform must have a designated trust and safety contact

Contact for membership: membership@gifct.org

Until GIFCT membership is approved — the AI analysis layer (Layer 3) and FTO entity detection (Layer 2) provide the primary detection capability.

---

## Designated Contacts

| Role | Contact | Responsibility |
|---|---|---|
| Trust and Safety Lead | security@openfeed.network | Primary detection response |
| Legal Contact | legal@openfeed.network | Law enforcement requests |
| FBI Reports | IC3.gov + security@ | All confirmed terrorism content |
| GIFCT Contact | gifct.org member portal | Hash submissions |
| Emergency | 1-800-CALL-FBI | Imminent threat only |

---

*Open Feed Network, Inc. — openfeed.network — This document is reviewed annually and updated as regulations change.*
