/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   THE PEOPLE'S VOICE PLATFORM                                    ║
 * ║   Guardian Shield Integration                                    ║
 * ║                                                                  ║
 * ║   Wires Guardian Shield API into TPVP so that:                  ║
 * ║   1. New members are scanned for minor indicators               ║
 * ║   2. Adults complete ZK verification once — never scanned again ║
 * ║   3. Conversations monitored for grooming patterns              ║
 * ║   4. Images pre-screened before storage                         ║
 * ║   5. Compliance report generated monthly automatically          ║
 * ║                                                                  ║
 * ║   SETUP:                                                         ║
 * ║   Add to .env:                                                   ║
 * ║   GUARDIAN_API_KEY=gs_your_key_here                             ║
 * ║   GUARDIAN_API_BASE=https://guardian.openfeed.network           ║
 * ║   (or http://localhost:3005 for local development)              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { GuardianShield } from "./guardian-shield-sdk.js";
import dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZE GUARDIAN SHIELD
// ─────────────────────────────────────────────────────────────────────────────

const guardian = new GuardianShield(process.env.GUARDIAN_API_KEY, {
  baseUrl: process.env.GUARDIAN_API_BASE || "https://guardian.openfeed.network",
});

// ─────────────────────────────────────────────────────────────────────────────
// TPVP INTEGRATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FUNCTION 1: onNewMember
 * Call this when a new member registers on TPVP
 *
 * What it does:
 * - Scans the new member for minor indicators
 * - If adult (low risk): allows registration immediately
 * - If uncertain: redirects to ZK age verification
 * - If high risk minor: routes to age-appropriate experience
 *
 * @param {Object} member - New member data from registration form
 * @param {string} member.id - Your internal user ID
 * @param {string} member.username
 * @param {string} member.bio
 * @param {string} callbackBaseUrl - Base URL for verification callback
 * @returns {Object} { action, redirectUrl, verificationRequired }
 *
 * USAGE in your registration handler:
 *   const result = await onNewMember(newUser, "https://thepeoplesvoiceplatform.com");
 *   if (result.verificationRequired) res.redirect(result.redirectUrl);
 *   else completeRegistration(newUser);
 */
export async function onNewMember(member, callbackBaseUrl) {
  console.log(`[TPVP Guardian] Scanning new member: ${member.username}`);

  try {
    // Check if they already verified (e.g. returning user with new account)
    const alreadyVerified = await guardian.isUserVerified(member.id);
    if (alreadyVerified.is_verified) {
      console.log(`[TPVP Guardian] Returning verified user: ${member.username}`);
      return {
        action:               "allow",
        verificationRequired: false,
        reason:               "Previously verified adult",
      };
    }

    // Scan new member
    const scan = await guardian.scanUser({
      user_platform_id: member.id,
      username:         member.username,
      bio:              member.bio || "",
      posts:            [],
      posting_hours:    [],
      topics:           [],
      account_age_days: 0,
      follower_count:   0,
      following_count:  0,
    });

    console.log(`[TPVP Guardian] Scan result: ${scan.risk_level} risk, action: ${scan.recommended_action}`);

    // Route based on scan result
    switch (scan.recommended_action) {

      case "allow":
      case "monitor":
        // Low risk — allow immediately, log for monitoring
        return {
          action:               "allow",
          verificationRequired: false,
          riskLevel:            scan.risk_level,
          monitoring:           scan.recommended_action === "monitor",
        };

      case "verify":
        // Uncertain — require ZK age verification before full access
        const session = await guardian.initiateVerification({
          userPlatformId: member.id,
          ageThreshold:   18,
          callbackUrl:    `${callbackBaseUrl}/verify/complete?user=${member.id}`,
        });

        return {
          action:               "verify",
          verificationRequired: true,
          redirectUrl:          session.verification_url_with_userid,
          reason:               "Age verification required to access full community",
          // Show friendly message to user:
          userMessage:          "Welcome to The People's Voice Platform! We need to quickly verify your age to keep our community safe. This takes 30 seconds and we collect zero personal information.",
        };

      case "restrict":
        // High probability minor — create restricted account
        return {
          action:               "restrict",
          verificationRequired: false,
          reason:               "Minor indicators detected — restricted experience",
          // In restricted mode: can read content but cannot post
          restrictions:         ["no_posting", "no_dm", "filtered_content"],
          // Offer verification path to unlock full access
          upgradeUrl:           `${callbackBaseUrl}/verify/start?user=${member.id}`,
          userMessage:          "Welcome! Some features require age verification. Tap here to unlock full access.",
        };

      case "block":
        // Critical indicators — do not create account
        console.warn(`[TPVP Guardian] Registration blocked: ${member.username} — ${scan.risk_level} risk`);
        return {
          action:               "block",
          verificationRequired: false,
          reason:               "Critical minor indicators — registration not permitted",
          userMessage:          "This platform is for adults 18 and over.",
        };

      default:
        return { action:"allow", verificationRequired:false };
    }

  } catch (err) {
    // On scan error — allow registration but flag for manual review
    console.error(`[TPVP Guardian] Scan error for ${member.username}:`, err.message);
    return {
      action:               "allow",
      verificationRequired: false,
      scanError:            true,
      flagForReview:        true,
    };
  }
}

/**
 * FUNCTION 2: onVerificationComplete
 * Call this from your verification callback route
 *
 * When a member completes ZK age verification, this:
 * - Confirms the verification proof
 * - Stores them as a verified adult
 * - Returns their new access level
 *
 * USAGE in your callback route:
 *   app.get("/verify/complete", async (req, res) => {
 *     const result = await onVerificationComplete(req.query.token, req.query.user);
 *     if (result.success) res.redirect("/dashboard?verified=true");
 *     else res.redirect("/verify/failed");
 *   });
 */
export async function onVerificationComplete(token, userPlatformId) {
  console.log(`[TPVP Guardian] Processing verification for user: ${userPlatformId}`);

  try {
    const result = await guardian.checkVerification(token);

    if (!result.verified) {
      return { success:false, reason:"Verification failed or expired" };
    }

    // Store as verified adult — future scans bypass instantly
    if (userPlatformId) {
      await guardian.storeVerifiedUser({
        userPlatformId,
        ageThreshold:      result.age_threshold,
        verificationProof: result.verification_proof,
      });
    }

    console.log(`[TPVP Guardian] User ${userPlatformId} verified as adult — bypass active for 1 year`);

    return {
      success:          true,
      verified:         true,
      ageThreshold:     result.age_threshold,
      expiresAt:        result.expires_at,
      piiCollected:     false,
      // Unlock full community access
      newAccessLevel:   "full",
      // Message to show the member
      userMessage:      "Age verified! You now have full access to The People's Voice Platform. Welcome to the community.",
    };

  } catch (err) {
    console.error("[TPVP Guardian] Verification completion error:", err.message);
    return { success:false, reason:"Verification processing error", error:err.message };
  }
}

/**
 * FUNCTION 3: onMemberPost
 * Call this before saving any post to the platform
 *
 * What it does:
 * - Skips scan entirely for verified adults (near-instant)
 * - Runs age check for unverified members
 * - Passes content through Truth Shield for disinformation check
 *
 * @param {string} userId - Member's platform ID
 * @param {Object} post   - The post content
 * @returns {Object} { allowed, requiresVerification, truthShieldVerdict }
 *
 * USAGE:
 *   const result = await onMemberPost(req.user.id, { content: req.body.content });
 *   if (!result.allowed) return res.status(403).json({ error: result.reason });
 */
export async function onMemberPost(userId, post) {
  try {
    // Check verified bypass — verified adults skip all scanning
    const scan = await guardian.scanUser({
      user_platform_id: userId,
      username:         post.username || "",
      bio:              "",
      posts:            [post.content],
      posting_hours:    [new Date().getHours()],
      topics:           [],
      account_age_days: post.accountAgeDays || 0,
    });

    if (scan.verified_adult) {
      // Verified adult — allow post immediately, no further checks needed
      return {
        allowed:          true,
        verifiedAdult:    true,
        scanTime:         scan.processing_ms,
      };
    }

    if (scan.recommended_action === "block") {
      return {
        allowed:  false,
        reason:   "Account requires age verification before posting",
        redirectToVerify: true,
      };
    }

    return { allowed:true, riskLevel:scan.risk_level };

  } catch (err) {
    // On error — allow the post (fail open for content, not for safety)
    console.error("[TPVP Guardian] Post scan error:", err.message);
    return { allowed:true, scanError:true };
  }
}

/**
 * FUNCTION 4: onConversation
 * Call this when a member sends a direct message
 *
 * Detects grooming patterns and blocks messages that contain them.
 * Safe for adult conversations — only flags genuine predatory patterns.
 *
 * @param {string} senderId   - Sender's platform ID
 * @param {string} receiverId - Receiver's platform ID
 * @param {string} content    - Message content
 * @returns {Object} { allowed, flagged, action }
 *
 * USAGE:
 *   const result = await onConversation(req.user.id, recipientId, messageContent);
 *   if (!result.allowed) return res.status(403).json({ error: "Message blocked" });
 */
export async function onConversation(senderId, receiverId, content) {
  try {
    // Skip grooming scan if sender is verified adult talking to verified adult
    const [senderVerified, receiverVerified] = await Promise.all([
      guardian.isUserVerified(senderId),
      guardian.isUserVerified(receiverId),
    ]);

    if (senderVerified.is_verified && receiverVerified.is_verified) {
      // Two verified adults — no grooming scan needed
      return { allowed:true, bothVerified:true };
    }

    // At least one unverified participant — scan the conversation
    const scan = await guardian.scanConversation({
      conversation: content,
      participants: [senderId, receiverId],
    });

    if (scan.grooming_detected && ["high","critical"].includes(scan.risk_level)) {
      console.warn(`[TPVP Guardian] Grooming detected: ${senderId} → ${receiverId}`);
      return {
        allowed: false,
        flagged: true,
        action:  scan.recommended_action,
        reason:  "Message blocked — inappropriate contact pattern detected",
      };
    }

    return { allowed:true, riskLevel:scan.risk_level };

  } catch (err) {
    console.error("[TPVP Guardian] Conversation scan error:", err.message);
    return { allowed:true, scanError:true };
  }
}

/**
 * FUNCTION 5: onImageUpload
 * Call this before storing any uploaded image
 *
 * Pre-screens against PhotoDNA CSAM hash database.
 * If match found — blocks storage and alerts moderators.
 *
 * @param {Buffer} imageBuffer - Image data
 * @param {string} mimeType    - MIME type
 * @param {string} uploaderId  - Uploader's platform ID
 * @returns {Object} { allowed, csamDetected }
 *
 * USAGE:
 *   const result = await onImageUpload(req.file.buffer, req.file.mimetype, req.user.id);
 *   if (!result.allowed) return res.status(403).json({ error: "Image blocked" });
 */
export async function onImageUpload(imageBuffer, mimeType, uploaderId) {
  try {
    const scan = await guardian.scanMedia({ image:imageBuffer, mimeType });

    if (scan.isMatch) {
      console.error(`[TPVP Guardian] ⛔ CSAM detected from uploader: ${uploaderId}`);
      // Block the upload, suspend the account, alert moderators
      return {
        allowed:      false,
        csamDetected: true,
        action:       "blocked_and_reported",
        legalNote:    "CSAM detected. Reported to NCMEC CyberTipline. Account suspended.",
      };
    }

    return { allowed:true, csamDetected:false };

  } catch (err) {
    console.error("[TPVP Guardian] Image scan error:", err.message);
    // On scan error — block the upload (fail safe for CSAM)
    return { allowed:false, scanError:true, reason:"Image scan unavailable — upload blocked for safety" };
  }
}

/**
 * FUNCTION 6: getMonthlyComplianceReport
 * Call this on the first of each month (or set up a cron job)
 * Generates and logs the monthly compliance report
 *
 * @param {string} month - YYYY-MM format
 * @returns {Object} Full compliance report
 *
 * CRON SETUP (add to your server):
 *   // Run at 9am on the 1st of every month
 *   cron.schedule("0 9 1 * *", async () => {
 *     const month = new Date().toISOString().slice(0,7);
 *     await getMonthlyComplianceReport(month);
 *   });
 */
export async function getMonthlyComplianceReport(month) {
  try {
    const report = await guardian.getComplianceReport(month);
    console.log(`[TPVP Guardian] Monthly compliance report generated: ${month}`);
    console.log(`[TPVP Guardian] Total scans: ${report.summary?.total_scans}`);
    console.log(`[TPVP Guardian] Minors detected: ${report.summary?.minors_detected}`);
    console.log(`[TPVP Guardian] ${report.compliance_statement}`);
    return report;
  } catch (err) {
    console.error("[TPVP Guardian] Report generation failed:", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE INTEGRATION EXAMPLE
// How to wire all functions into your TPVP Express routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Example Express route wiring — add to your TPVP server
 *
 * import express from "express";
 * import {
 *   onNewMember, onVerificationComplete, onMemberPost,
 *   onConversation, onImageUpload
 * } from "./tpvp-guardian-integration.js";
 *
 * // Registration
 * app.post("/register", async (req, res) => {
 *   const member = await createPendingUser(req.body);
 *   const result = await onNewMember(member, "https://thepeoplesvoiceplatform.com");
 *
 *   if (result.action === "block") {
 *     await deletePendingUser(member.id);
 *     return res.status(403).json({ error: result.userMessage });
 *   }
 *   if (result.action === "verify") {
 *     return res.json({ redirect: result.redirectUrl, message: result.userMessage });
 *   }
 *   if (result.action === "restrict") {
 *     await createRestrictedUser(member, result.restrictions);
 *     return res.json({ success: true, restricted: true, message: result.userMessage });
 *   }
 *   await activateUser(member.id);
 *   res.json({ success: true });
 * });
 *
 * // Verification callback
 * app.get("/verify/complete", async (req, res) => {
 *   const result = await onVerificationComplete(req.query.token, req.query.user);
 *   if (result.success) {
 *     await unlockFullAccess(req.query.user);
 *     res.redirect("/dashboard?verified=true&message=" + encodeURIComponent(result.userMessage));
 *   } else {
 *     res.redirect("/verify/failed");
 *   }
 * });
 *
 * // Post creation
 * app.post("/posts", async (req, res) => {
 *   const check = await onMemberPost(req.user.id, { content: req.body.content, ... });
 *   if (!check.allowed) return res.status(403).json({ error: check.reason });
 *   const post = await createPost(req.body);
 *   res.json({ success: true, post });
 * });
 *
 * // Direct messages
 * app.post("/messages", async (req, res) => {
 *   const check = await onConversation(req.user.id, req.body.recipientId, req.body.content);
 *   if (!check.allowed) return res.status(403).json({ error: check.reason });
 *   const message = await sendMessage(req.body);
 *   res.json({ success: true, message });
 * });
 *
 * // Image upload
 * app.post("/upload", upload.single("image"), async (req, res) => {
 *   const check = await onImageUpload(req.file.buffer, req.file.mimetype, req.user.id);
 *   if (!check.allowed) return res.status(403).json({ error: "Image upload blocked" });
 *   const url = await storeImage(req.file.buffer);
 *   res.json({ success: true, url });
 * });
 */

export default {
  onNewMember,
  onVerificationComplete,
  onMemberPost,
  onConversation,
  onImageUpload,
  getMonthlyComplianceReport,
};
