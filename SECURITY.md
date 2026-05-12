# Security Policy 🛡

## Our Commitment

Open Feed Platform handles sensitive data for journalists, whistleblowers,
and vulnerable communities. We take security extremely seriously and respond
to all vulnerability reports within 24 hours.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Publicly disclosing a vulnerability before it is fixed puts our users —
including whistleblowers and journalists — at risk.

### How to Report

Email us directly at:
**security@openfeed.network**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (if any)

### What to Expect

- **Acknowledgment:** Within 24 hours
- **Initial assessment:** Within 48 hours
- **Fix timeline:** Within 7 days for critical, 30 days for others
- **Credit:** We publicly credit researchers who report valid vulnerabilities
- **No legal action:** We will never pursue legal action against good-faith
  security researchers

## Scope

### In Scope
- Truth Shield API endpoints
- Guardian Shield detection system
- User authentication and session management
- Data storage and encryption
- Smart contract vulnerabilities
- ZK circuit implementation
- IPFS storage integration
- Whistleblower account tier security

### Out of Scope
- Denial of service attacks
- Social engineering
- Physical security
- Third-party services (Anthropic, IPFS, Arweave)

## Security Architecture

Key security features built into OFA:

- **Zero PII storage** for anonymous and whistleblower accounts
- **AES-256-GCM** end-to-end encryption for whistleblower content
- **Argon2id** password hashing
- **TLS 1.3** minimum for all data in transit
- **Zero-knowledge proofs** for age verification
- **IP addresses** retained maximum 24 hours then purged
- **JWT authentication** with secure secret rotation
- **Rate limiting** on all API endpoints
- **Content Security Policy** headers on all responses

## Known Limitations

In the interest of transparency we disclose these known limitations:

- IPFS content cannot be deleted once published — this is by design
  but means mistakes are permanent
- Guardian Shield behavioral analysis is probabilistic — false positives
  are possible and can be appealed
- Smart contracts once deployed are immutable — governance changes
  require new contract deployment

## Bug Bounty

We do not currently have a formal bug bounty program. However we
gratefully acknowledge all valid security reports and will work with
researchers on appropriate recognition.

## Contact

- Security reports: security@openfeed.network
- General: hello@openfeed.network
- Press: hello@openfeed.network

---
*Open Feed Network, Inc. — Security through transparency.*
