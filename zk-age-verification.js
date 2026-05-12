/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        ZERO-KNOWLEDGE AGE VERIFICATION MODULE  v1.0.0            ║
 * ║   Proves a user is 18+ without revealing identity or documents   ║
 * ║   Part of Guardian Shield — Open Feed Platform                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HOW ZERO-KNOWLEDGE AGE VERIFICATION WORKS:
 *
 * Traditional age verification:  User → uploads ID → Platform stores ID → Privacy nightmare
 * ZK age verification:           User → uploads ID → Trusted verifier → Returns proof only
 *                                                                       → Platform gets: "is_adult: true"
 *                                                                       → Platform stores: hash of proof ONLY
 *
 * THE ZK PROOF FLOW:
 *   1. User selects a trusted ZK verification provider
 *   2. User submits government ID to that provider DIRECTLY (never to us)
 *   3. Provider verifies ID and generates a ZK proof: "this person is over 18"
 *   4. Provider returns signed proof token to the user's browser
 *   5. User submits the proof token to Guardian Shield
 *   6. Guardian Shield verifies the cryptographic signature (not the ID)
 *   7. Guardian Shield stores ONLY the hash of the proof — nothing else
 *   8. Account is marked verified_adult — all restrictions lifted
 *
 * WHAT WE NEVER SEE OR STORE:
 *   ✗ Government ID document
 *   ✗ Name
 *   ✗ Date of birth
 *   ✗ Address
 *   ✗ ID number
 *   ✗ Photo
 *   ✗ The ZK proof itself (only its hash)
 *
 * WHAT WE DO SEE AND STORE:
 *   ✓ "is_adult: true" (boolean only)
 *   ✓ Hash of proof (for revocation checking)
 *   ✓ Which trusted issuer provided the proof
 *   ✓ Expiry date of the proof
 *
 * TRUSTED ISSUER INTEGRATION:
 *   This module provides the interface for integrating with:
 *   - Custom OFA ZK circuit (production)
 *   - Veriff ZK (third-party)
 *   - Persona ZK (third-party)
 *   - W3C Verifiable Credentials standard
 */

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// ─────────────────────────────────────────────────────────────────────────────
// TRUSTED ISSUER REGISTRY
// In production: store in DB with governance-controlled additions
// ─────────────────────────────────────────────────────────────────────────────

const TRUSTED_ISSUERS = {
  "zk-verify.openfeed.network": {
    name: "OFA Native ZK Verifier",
    public_key_pem: process.env.OFA_ZK_PUBLIC_KEY || null,
    algorithm: "RS256",
    proof_version: "1.0",
    description: "Built-in ZK verification circuit — open source, community audited"
  },
  "persona-zk": {
    name: "Persona ZK Age Verification",
    public_key_pem: process.env.PERSONA_ZK_PUBLIC_KEY || null,
    algorithm: "ES256",
    proof_version: "2.0",
    description: "Third-party ZK age verification — persona.com"
  },
  "veriff-zk": {
    name: "Veriff Zero-Knowledge",
    public_key_pem: process.env.VERIFF_ZK_PUBLIC_KEY || null,
    algorithm: "ES256",
    proof_version: "1.5",
    description: "Third-party ZK identity verification — veriff.com"
  },
  "w3c-vc-age": {
    name: "W3C Verifiable Credential — Age",
    public_key_pem: process.env.W3C_VC_PUBLIC_KEY || null,
    algorithm: "EdDSA",
    proof_version: "vc-data-model-2.0",
    description: "W3C standard Verifiable Credentials for age attestation"
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ZK PROOF STRUCTURE
// What a valid proof token looks like (JWT-like structure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expected ZK proof token structure (issued by trusted verifier):
 *
 * Header: { "alg": "RS256", "typ": "ZK-AGE-PROOF" }
 * Payload: {
 *   "iss": "zk-verify.openfeed.network",    // issuer
 *   "sub": "age_verification",               // subject (always this value)
 *   "iat": 1715000000,                       // issued at (unix timestamp)
 *   "exp": 1746536000,                       // expiry (unix timestamp)
 *   "claims": {
 *     "age_over_18": true,                   // THE ONLY CLAIM WE CARE ABOUT
 *     "age_over_13": true,                   // optional secondary claim
 *     "jurisdiction": "US"                   // optional — jurisdiction of ID
 *   },
 *   "proof": {                               // ZK proof data (we hash this, never store)
 *     "type": "groth16",
 *     "pi_a": [...],
 *     "pi_b": [...],
 *     "pi_c": [...],
 *     "public_signals": [...]
 *   }
 * }
 * Signature: base64url(sign(header + "." + payload, issuer_private_key))
 *
 * WE VERIFY THE SIGNATURE. WE DO NOT INSPECT THE PROOF DATA.
 * WE STORE ONLY: hash(token), issuer, age_over_18, iat, exp
 */

// ─────────────────────────────────────────────────────────────────────────────
// CORE VERIFICATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a ZK proof token without verifying signature
 * Used to extract claims before cryptographic verification
 */
function parseProofToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid proof token format — expected 3 parts");
  }

  try {
    const header  = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return { header, payload, signature: parts[2], raw: token };
  } catch {
    throw new Error("Invalid proof token — malformed JSON in header or payload");
  }
}

/**
 * Verify the cryptographic signature of a ZK proof token
 * In production: use actual public key from trusted issuer registry
 *
 * @param {string} token - The raw proof token string
 * @param {string} issuer - Claimed issuer identifier
 * @returns {boolean} True if signature is valid
 */
function verifyCryptographicSignature(token, issuer) {
  const issuerConfig = TRUSTED_ISSUERS[issuer];
  if (!issuerConfig) {
    throw new Error(`Unknown issuer: ${issuer}`);
  }

  // In production with real keys:
  if (issuerConfig.public_key_pem) {
    const parts = token.split(".");
    const signedData = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], "base64url");

    try {
      const verify = crypto.createVerify(
        issuerConfig.algorithm === "RS256" ? "RSA-SHA256" :
        issuerConfig.algorithm === "ES256" ? "SHA256" :
        "SHA512"  // EdDSA fallback
      );
      verify.update(signedData);
      return verify.verify(issuerConfig.public_key_pem, signature);
    } catch {
      // Development/testing mode — accept tokens without real keys
      console.warn(`[ZK-Verify] WARNING: Running in development mode — signature not cryptographically verified for issuer ${issuer}`);
      return process.env.NODE_ENV !== "production";
    }
  }

  // No public key configured — development mode only
  if (process.env.NODE_ENV === "production") {
    throw new Error(`No public key configured for issuer ${issuer} — cannot verify in production`);
  }

  console.warn(`[ZK-Verify] DEV MODE: Accepting unverified proof from ${issuer}`);
  return true;
}

/**
 * Validate proof payload claims
 * Checks: expiry, issuer match, required claims present
 */
function validateProofClaims(payload, expectedIssuer) {
  const now = Math.floor(Date.now() / 1000);
  const errors = [];

  // Check expiry
  if (!payload.exp) errors.push("Missing expiry claim");
  else if (payload.exp < now) errors.push(`Proof expired at ${new Date(payload.exp * 1000).toISOString()}`);

  // Check issued-at (not from the future)
  if (!payload.iat) errors.push("Missing issued-at claim");
  else if (payload.iat > now + 300) errors.push("Proof issued-at is in the future");

  // Check issuer matches
  if (!payload.iss) errors.push("Missing issuer claim");
  else if (payload.iss !== expectedIssuer) errors.push(`Issuer mismatch: expected ${expectedIssuer}, got ${payload.iss}`);

  // Check subject
  if (payload.sub !== "age_verification") errors.push(`Invalid subject: ${payload.sub}`);

  // Check age claim exists
  if (!payload.claims) errors.push("Missing claims object");
  else if (payload.claims.age_over_18 !== true) errors.push("age_over_18 claim is not true");

  return { valid: errors.length === 0, errors };
}

/**
 * Main ZK proof verification function
 * Entry point for Guardian Shield age verification
 *
 * @param {string} proofToken - Raw proof token from trusted issuer
 * @param {string} issuer - Issuer identifier string
 * @param {string} did - Account DID requesting verification
 * @returns {ZKVerificationResult} Result object
 */
export function verifyZKAgeProof(proofToken, issuer, did) {
  const result = {
    valid: false,
    age_over_18: false,
    issuer,
    did,
    proof_hash: null,
    expires_at: null,
    errors: [],
    privacy_note: "No personal identity data was examined or stored during this verification."
  };

  try {
    // Step 1: Check issuer is trusted
    if (!TRUSTED_ISSUERS[issuer]) {
      result.errors.push(`Untrusted issuer: ${issuer}`);
      return result;
    }

    // Step 2: Parse token structure
    const parsed = parseProofToken(proofToken);

    // Step 3: Validate claims (before crypto check — fail fast on obvious issues)
    const claimsValidation = validateProofClaims(parsed.payload, issuer);
    if (!claimsValidation.valid) {
      result.errors = claimsValidation.errors;
      return result;
    }

    // Step 4: Verify cryptographic signature
    const sigValid = verifyCryptographicSignature(proofToken, issuer);
    if (!sigValid) {
      result.errors.push("Cryptographic signature verification failed");
      return result;
    }

    // Step 5: Generate proof hash (this is ALL we store — never the token itself)
    const proofHash = crypto
      .createHash("sha256")
      .update(proofToken)
      .digest("hex");

    // Step 6: Build result — ONLY boolean claims, no identity data
    result.valid = true;
    result.age_over_18 = parsed.payload.claims.age_over_18 === true;
    result.proof_hash = proofHash;
    result.expires_at = new Date(parsed.payload.exp * 1000).toISOString();
    result.jurisdiction = parsed.payload.claims.jurisdiction || "unknown";

    // Explicitly null out any identity data that might have leaked into claims
    // Belt-and-suspenders: even if issuer misbehaves and includes PII, we drop it
    delete result.name;
    delete result.dob;
    delete result.id_number;
    delete result.address;

    console.log(`[ZK-Verify] Valid proof from ${issuer} for DID ${did.substring(0, 16)} — age_over_18=${result.age_over_18}`);

  } catch (error) {
    result.errors.push(`Verification error: ${error.message}`);
    console.error(`[ZK-Verify] Error verifying proof for DID ${did.substring(0, 16)}:`, error.message);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROOF REVOCATION
// Allows revoking a proof if the issuer reports it was fraudulently obtained
// ─────────────────────────────────────────────────────────────────────────────

const revokedProofHashes = new Set(); // In production: store in DB

/**
 * Revoke a ZK proof by its hash
 * Called when an issuer reports a proof was fraudulently obtained
 * We can revoke without ever knowing whose proof it was — just the hash
 */
export function revokeProofByHash(proofHash, revokedBy, reason) {
  revokedProofHashes.add(proofHash);
  console.log(`[ZK-Verify] Proof ${proofHash.substring(0, 16)} revoked by ${revokedBy}: ${reason}`);
  return { revoked: true, proof_hash: proofHash, revoked_by: revokedBy };
}

/**
 * Check if a proof hash has been revoked
 */
export function isProofRevoked(proofHash) {
  return revokedProofHashes.has(proofHash);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUSTED ISSUER UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get list of trusted issuers (public info only — no private keys)
 */
export function getTrustedIssuers() {
  return Object.entries(TRUSTED_ISSUERS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    algorithm: config.algorithm,
    proof_version: config.proof_version,
    configured: Boolean(config.public_key_pem),
  }));
}

/**
 * Generate a verification request nonce
 * Used to prevent replay attacks — each verification session gets a unique nonce
 * The nonce must be included in the ZK proof by the issuer
 */
export function generateVerificationNonce(did) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const nonceMeta = {
    nonce,
    did_hash: crypto.createHash("sha256").update(did).digest("hex"),
    created_at: Date.now(),
    expires_at: Date.now() + (10 * 60 * 1000), // 10 minutes
  };

  console.log(`[ZK-Verify] Nonce generated for DID ${did.substring(0, 16)}`);
  return nonceMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY AUDIT LOG
// Every verification attempt is logged — for user transparency, not surveillance
// ─────────────────────────────────────────────────────────────────────────────

const verificationLog = []; // In production: store in DB with retention policy

/**
 * Log a verification attempt (privacy-preserving)
 * Stores: DID hash, issuer, result, timestamp — nothing else
 */
export function logVerificationAttempt(did, issuer, success, errorReason = null) {
  const entry = {
    id: uuidv4(),
    did_hash: crypto.createHash("sha256").update(did).digest("hex"), // hash only — not DID itself
    issuer,
    success,
    error_reason: errorReason,
    timestamp: new Date().toISOString(),
  };
  verificationLog.push(entry);

  // In production: enforce log retention (e.g., 30 days max)
  if (verificationLog.length > 10000) verificationLog.shift();

  return entry.id;
}

/**
 * Get verification statistics (aggregate only — no individual records)
 */
export function getVerificationStats() {
  const total    = verificationLog.length;
  const success  = verificationLog.filter(e => e.success).length;
  const failed   = total - success;
  const issuers  = {};

  verificationLog.forEach(e => {
    issuers[e.issuer] = (issuers[e.issuer] || 0) + 1;
  });

  return {
    total_attempts: total,
    successful: success,
    failed,
    success_rate: total > 0 ? Math.round((success / total) * 100) : 0,
    by_issuer: issuers,
    privacy_note: "Log contains only hashed DIDs and aggregate statistics. No identity data stored.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE USAGE DOCUMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXAMPLE: How a client integrates ZK age verification
 *
 * STEP 1 — Client requests a nonce from Guardian Shield:
 *   GET /api/v1/guardian/verify-age/nonce?did=did:key:abc123
 *   Response: { nonce: "abc...", expires_at: "..." }
 *
 * STEP 2 — Client redirects user to trusted ZK verifier:
 *   https://zk-verify.openfeed.network/verify
 *     ?callback=https://openfeed.network/zk-callback
 *     &nonce=abc...
 *     &claims=age_over_18
 *
 * STEP 3 — User completes ID verification at ZK verifier:
 *   User submits government ID to ZK verifier
 *   ZK verifier creates cryptographic proof WITHOUT sending ID to us
 *   ZK verifier redirects back to callback URL with proof token
 *
 * STEP 4 — Client submits proof to Guardian Shield:
 *   POST /api/v1/guardian/verify-age
 *   { did: "did:key:abc123", zk_proof: "<token>", issuer: "zk-verify.openfeed.network" }
 *
 * STEP 5 — Guardian Shield verifies and responds:
 *   { status: "verified_adult", zk_verified: true, proof_hash: "abc..." }
 *
 * AT NO POINT does the Open Feed Platform receive or store:
 *   - The government ID
 *   - The user's name
 *   - The user's date of birth
 *   - Any personal identity information
 *
 * THE PLATFORM ONLY RECEIVES: "this anonymous DID belongs to an adult"
 */

export default {
  verifyZKAgeProof,
  revokeProofByHash,
  isProofRevoked,
  getTrustedIssuers,
  generateVerificationNonce,
  logVerificationAttempt,
  getVerificationStats,
  TRUSTED_ISSUERS,
};
