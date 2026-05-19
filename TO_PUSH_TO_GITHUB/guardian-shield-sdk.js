/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   GUARDIAN SHIELD SDK  v1.0.0 — Node.js                         ║
 * ║   Official client library for Guardian Shield API               ║
 * ║                                                                  ║
 * ║   INSTALL:                                                       ║
 * ║   npm install guardian-shield-sdk                                ║
 * ║   OR copy this file into your project                           ║
 * ║                                                                  ║
 * ║   QUICK START:                                                   ║
 * ║   const gs = new GuardianShield("gs_your_api_key");             ║
 * ║   const result = await gs.scanUser({ username:"john_doe" });    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const DEFAULT_BASE_URL = "https://guardian.openfeed.network";

export class GuardianShield {
  /**
   * @param {string} apiKey    - Your Guardian Shield API key (gs_...)
   * @param {Object} options   - Optional configuration
   * @param {string} options.baseUrl   - API base URL (default: production)
   * @param {number} options.timeout  - Request timeout in ms (default: 30000)
   */
  constructor(apiKey, options = {}) {
    if (!apiKey) throw new Error("Guardian Shield API key is required");
    if (!apiKey.startsWith("gs_")) throw new Error("Invalid API key format — must start with gs_");

    this.apiKey  = apiKey;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.timeout = options.timeout || 30000;
  }

  // ─── INTERNAL HTTP CLIENT ─────────────────────────────────────────────────

  async #request(method, path, body = null) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key":    this.apiKey,
          "User-Agent":   "guardian-shield-sdk/1.0.0 node",
        },
        body:   body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const err     = new Error(data.error || `HTTP ${response.status}`);
        err.status    = response.status;
        err.code      = data.code;
        err.details   = data;
        throw err;
      }

      return data;

    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Guardian Shield request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── SCAN: USER ACCOUNT ───────────────────────────────────────────────────

  /**
   * Scan a user account for minor indicators
   * Runs Layers 1 (age estimation), 2 (behavioral), 3 (profile), 7 (coordination)
   *
   * @param {Object} user
   * @param {string} user.username
   * @param {string} user.bio
   * @param {string[]} user.posts          - Recent post content
   * @param {number[]} user.posting_hours  - Hours active (0-23)
   * @param {string[]} user.topics         - Topic interests
   * @param {number} user.account_age_days
   * @param {number} user.follower_count
   * @param {number} user.following_count
   *
   * @returns {Promise<ScanResult>}
   *
   * @example
   * const result = await gs.scanUser({
   *   username: "john_doe_99",
   *   bio: "just a regular person",
   *   posts: ["had fun at school today", "mom said dinner at 6"],
   *   posting_hours: [15, 16, 17, 20, 21],
   *   topics: ["minecraft", "fortnite", "school"],
   *   account_age_days: 14,
   *   follower_count: 23,
   *   following_count: 45,
   * });
   *
   * if (result.recommended_action === "verify") {
   *   // Redirect user to age verification
   *   const session = await gs.startVerification({ callback_url: "..." });
   *   redirect(session.verification_url);
   * }
   */
  async scanUser(user) {
    return this.#request("POST", "/api/v1/scan/user", user);
  }

  // ─── SCAN: CONVERSATION ───────────────────────────────────────────────────

  /**
   * Detect grooming patterns in conversation text (Layer 5)
   *
   * @param {Object} params
   * @param {string} params.conversation  - Full conversation text
   * @param {string[]} params.participants - Participant usernames
   *
   * @returns {Promise<GroomingResult>}
   *
   * @example
   * const result = await gs.scanConversation({
   *   conversation: "hey how old are you? you seem really mature for your age...",
   *   participants: ["adult_user", "teen_user"],
   * });
   *
   * if (result.grooming_detected) {
   *   await moderationSystem.flagConversation(result);
   * }
   */
  async scanConversation({ conversation, participants = [] }) {
    return this.#request("POST", "/api/v1/scan/conversation", { conversation, participants });
  }

  // ─── SCAN: MEDIA ──────────────────────────────────────────────────────────

  /**
   * CSAM pre-screen via PhotoDNA hash matching (Layer 6)
   * Checks image against known CSAM hash database
   * NEVER stores the image — hash comparison only
   *
   * @param {Object} params
   * @param {Buffer|string} params.image  - Image as Buffer or base64 string
   * @param {string} params.mimeType      - MIME type (image/jpeg, image/png, etc.)
   *
   * @returns {Promise<MediaScanResult>}
   *
   * @example
   * const imageBuffer = fs.readFileSync("./upload.jpg");
   * const result = await gs.scanMedia({
   *   image: imageBuffer,
   *   mimeType: "image/jpeg",
   * });
   *
   * if (result.isMatch) {
   *   // Remove immediately and report to NCMEC
   *   await removeContent();
   *   await reportToNCMEC();
   * }
   */
  async scanMedia({ image, mimeType = "image/jpeg" }) {
    const base64 = Buffer.isBuffer(image)
      ? image.toString("base64")
      : image; // Already base64
    return this.#request("POST", "/api/v1/scan/media", {
      image_base64: base64,
      mime_type:    mimeType,
    });
  }

  // ─── ZK AGE VERIFICATION ─────────────────────────────────────────────────

  /**
   * Start a Zero-Knowledge age verification session (Layer 4)
   * Redirect your user to the returned verification_url
   * Zero personal information is collected or stored
   *
   * @param {Object} params
   * @param {number} params.ageThreshold  - Minimum age (default: 18)
   * @param {string} params.callbackUrl   - Where to redirect after verification
   *
   * @returns {Promise<ZKSession>}
   *
   * @example
   * const session = await gs.startVerification({
   *   ageThreshold: 18,
   *   callbackUrl: "https://yoursite.com/auth/verify/complete",
   * });
   *
   * // Redirect user:
   * res.redirect(session.verification_url);
   *
   * // On callback, verify the token:
   * const verified = await gs.checkVerification(token);
   */
  async startVerification({ ageThreshold = 18, callbackUrl }) {
    return this.#request("POST", "/api/v1/verify/start", {
      age_threshold: ageThreshold,
      callback_url:  callbackUrl,
    });
  }

  /**
   * Check if a ZK verification token is valid
   *
   * @param {string} token - Token from verification callback
   * @returns {Promise<ZKVerificationResult>}
   */
  async checkVerification(token) {
    return this.#request("GET", `/api/v1/verify/${token}`);
  }

  // ─── COMPLIANCE REPORT ────────────────────────────────────────────────────

  /**
   * Generate a monthly compliance report
   * Use as evidence of COPPA/KOSA compliance in regulatory proceedings
   *
   * @param {string} month - Month in YYYY-MM format (e.g. "2026-07")
   * @returns {Promise<ComplianceReport>}
   *
   * @example
   * const report = await gs.getComplianceReport("2026-07");
   * console.log(report.compliance_statement);
   * // "YourPlatform processed 45,231 content safety scans in 2026-07..."
   *
   * // Save as PDF for regulatory filing
   * await savePDF(report);
   */
  async getComplianceReport(month) {
    return this.#request("GET", `/api/v1/report/${month}`);
  }

  // ─── USAGE ────────────────────────────────────────────────────────────────

  /**
   * Check current API usage and limits
   * @returns {Promise<UsageInfo>}
   */
  async getUsage() {
    return this.#request("GET", "/api/v1/usage");
  }

  // ─── VERIFIED ADULT BYPASS ───────────────────────────────────────────────

  /**
   * Store a user as a verified adult after ZK verification completes
   * Future scanUser() calls with this user_platform_id will return
   * risk_level: "none" immediately — no AI analysis needed
   *
   * @param {Object} params
   * @param {string} params.userPlatformId    - Your platform's user ID
   * @param {number} params.ageThreshold      - Age they verified against (default 18)
   * @param {string} params.verificationProof - Proof from checkVerification()
   *
   * @example
   * // After ZK verification completes on your callback:
   * const verified = await gs.checkVerification(token);
   * if (verified.verified) {
   *   await gs.storeVerifiedUser({
   *     userPlatformId:    req.user.id,
   *     ageThreshold:      18,
   *     verificationProof: verified.verification_proof,
   *   });
   * }
   *
   * // Now future scans bypass minor detection instantly:
   * const scan = await gs.scanUser({
   *   user_platform_id: req.user.id,  // <-- add this field
   *   username: "john_doe",
   *   ...
   * });
   * // scan.verified_adult === true
   * // scan.recommended_action === "allow"
   * // scan.processing_ms ~5ms (no AI call needed)
   */
  async storeVerifiedUser({ userPlatformId, ageThreshold = 18, verificationProof }) {
    return this.#request("POST", "/api/v1/verify/store", {
      user_platform_id:   userPlatformId,
      age_threshold:      ageThreshold,
      verification_proof: verificationProof,
    });
  }

  /**
   * Check if a specific user is currently verified as an adult
   *
   * @param {string} userPlatformId - Your platform's user ID
   * @returns {Promise<{is_verified: boolean, age_threshold: number, expires_at: string}>}
   *
   * @example
   * const status = await gs.isUserVerified(req.user.id);
   * if (!status.is_verified) {
   *   // Start verification flow
   *   const session = await gs.startVerification({ ... });
   *   res.redirect(session.verification_url);
   * }
   */
  async isUserVerified(userPlatformId) {
    return this.#request("POST", "/api/v1/verify/check", {
      user_platform_id: userPlatformId,
    });
  }

  /**
   * Revoke a user's verified status
   * Use when an account is transferred, flagged, or suspected of misrepresentation
   *
   * @param {string} userPlatformId - Your platform's user ID
   */
  async revokeUserVerification(userPlatformId) {
    return this.#request("POST", "/api/v1/verify/revoke", {
      user_platform_id: userPlatformId,
    });
  }

  /**
   * Complete verification flow — combines startVerification + storeVerifiedUser
   * The recommended pattern for most platforms
   *
   * Step 1: Call this to get the verification URL
   * Step 2: Redirect user to session.verification_url
   * Step 3: User proves age — Guardian Shield calls your callbackUrl
   * Step 4: On callback, call completeAndStore() to finish
   *
   * @param {Object} params
   * @param {string} params.userPlatformId  - Your platform's user ID
   * @param {number} params.ageThreshold    - Minimum age (default 18)
   * @param {string} params.callbackUrl     - Where to redirect after verification
   *
   * @example
   * // Step 1 — Start verification
   * const session = await gs.initiateVerification({
   *   userPlatformId: req.user.id,
   *   ageThreshold: 18,
   *   callbackUrl: "https://yoursite.com/verify/complete",
   * });
   * res.redirect(session.verification_url);
   *
   * // Step 2 — On callback (GET /verify/complete?token=xxx)
   * const result = await gs.checkVerification(req.query.token);
   * if (result.verified) {
   *   await gs.storeVerifiedUser({
   *     userPlatformId: req.user.id,
   *     ageThreshold: 18,
   *     verificationProof: result.verification_proof,
   *   });
   *   res.redirect("/dashboard"); // User is verified — proceed
   * }
   */
  async initiateVerification({ userPlatformId, ageThreshold = 18, callbackUrl }) {
    const session = await this.startVerification({ ageThreshold, callbackUrl });
    // Append user_id to callback so Guardian Shield can auto-store on completion
    session.verification_url_with_userid =
      `${session.verification_url}?user_id=${encodeURIComponent(userPlatformId)}&api_key=${this.apiKey}`;
    return session;
  }

  // ─── CONVENIENCE: FULL SCAN ───────────────────────────────────────────────

  /**
   * Run all applicable scans for a new user registration
   * Combines user scan + optional media scan in one call
   *
   * @param {Object} params
   * @param {Object} params.user           - User data for scanUser()
   * @param {Buffer} params.profileImage   - Optional profile image for CSAM check
   * @param {string} params.profileMime    - Profile image MIME type
   *
   * @returns {Promise<FullScanResult>}
   *
   * @example
   * // On new user registration:
   * const result = await gs.fullRegistrationScan({
   *   user: { username: req.body.username, bio: req.body.bio, ... },
   *   profileImage: req.file?.buffer,
   *   profileMime: req.file?.mimetype,
   * });
   *
   * switch (result.overall_action) {
   *   case "allow":    return completeRegistration();
   *   case "verify":   return redirectToAgeVerification();
   *   case "restrict": return showRestrictedMode();
   *   case "block":    return blockRegistration();
   * }
   */
  async fullRegistrationScan({ user, profileImage, profileMime }) {
    const results = await Promise.allSettled([
      this.scanUser(user),
      profileImage
        ? this.scanMedia({ image: profileImage, mimeType: profileMime })
        : Promise.resolve(null),
    ]);

    const userResult  = results[0].status === "fulfilled" ? results[0].value : null;
    const mediaResult = results[1].status === "fulfilled" ? results[1].value : null;

    // Determine overall action
    const actions = ["allow", "monitor", "verify", "restrict", "block"];
    const userAction  = userResult?.recommended_action  || "allow";
    const mediaAction = mediaResult?.isMatch ? "block" : "allow";
    const overallIdx  = Math.max(actions.indexOf(userAction), actions.indexOf(mediaAction));

    return {
      overall_action: actions[Math.max(0, overallIdx)],
      overall_risk:   userResult?.risk_level || "none",
      user_scan:      userResult,
      media_scan:     mediaResult,
      compliance:     ["COPPA", "KOSA", "GDPR-K"],
      powered_by:     "Guardian Shield API v1.0",
    };
  }
}

// ─── TYPE DEFINITIONS (JSDoc) ─────────────────────────────────────────────────

/**
 * @typedef {Object} ScanResult
 * @property {number} minor_probability    - 0-100 probability of being a minor
 * @property {string} age_estimate_range   - under_13|13_to_15|16_to_17|18_plus|unknown
 * @property {string} risk_level           - none|low|medium|high|critical
 * @property {string[]} layers_triggered   - Which detection layers fired
 * @property {string[]} indicators_found   - Specific indicators detected
 * @property {number} confidence           - 0-100 confidence in assessment
 * @property {string} recommended_action   - allow|monitor|verify|restrict|block
 * @property {string} reasoning            - Human-readable explanation
 * @property {string} scan_id             - Unique scan identifier
 * @property {number} processing_ms       - Processing time
 */

/**
 * @typedef {Object} GroomingResult
 * @property {boolean} grooming_detected
 * @property {string} risk_level
 * @property {number} confidence
 * @property {string[]} patterns_found
 * @property {string} recommended_action
 * @property {string} reasoning
 */

/**
 * @typedef {Object} ZKSession
 * @property {string} session_id
 * @property {string} token
 * @property {string} verification_url    - Redirect user here
 * @property {string} callback_url
 * @property {number} age_threshold
 * @property {string} expires_at
 */

/**
 * @typedef {Object} ComplianceReport
 * @property {string} report_id
 * @property {string} company
 * @property {string} report_month
 * @property {Object} summary
 * @property {string} compliance_statement - Use in regulatory filings
 * @property {string[]} certifications     - COPPA|KOSA|GDPR-K|GDPR
 * @property {string} legal_note
 */

export default GuardianShield;
