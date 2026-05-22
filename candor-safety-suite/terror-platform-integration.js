/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OPEN FEED PLATFORM — Terrorism Detection Integration           ║
 * ║                                                                  ║
 * ║   Wires the terrorism detection layer into the OFA platform      ║
 * ║   so every post is scanned before storage.                       ║
 * ║                                                                  ║
 * ║   ADD TO .env:                                                   ║
 * ║   GIFCT_API_KEY=from_gifct_membership                           ║
 * ║   GIFCT_API_URL=https://api.gifct.org/v1                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { scanForTerrorism } from "./terrorism-detection-layer.js";

/**
 * onPost — call before saving every post to OFA
 * Runs terrorism detection alongside Truth Shield and Care Shield
 *
 * @param {Object} params
 * @param {string} params.content     - Post text content
 * @param {string} params.userId      - Platform user ID
 * @param {Buffer} params.mediaBuffer - Optional media attachment
 * @param {string} params.platform    - Platform identifier
 * @returns {Object} { allowed, requiresReview, action, label }
 *
 * USAGE in your post creation handler:
 *   const result = await onPost({ content, userId, mediaBuffer });
 *   if (!result.allowed) return res.status(403).json({ error: result.reason });
 *   if (result.requiresReview) await holdForReview(post, result);
 *   if (result.label) post.labels.push(result.label);
 */
export async function onPost({ content, userId, mediaBuffer, platform = "openfeed" }) {
  const scan = await scanForTerrorism({ content, userId, mediaBuffer, platform });

  // CRITICAL — remove immediately and report
  if (scan.result === "critical") {
    return {
      allowed:         false,
      requiresReview:  false,
      action:          "removed_and_reported",
      reason:          "Content violates our policies on terrorist organization support",
      fbi_reported:    true,
      scan_id:         scan.scan_id,
      // NEVER tell user they were reported to FBI
      user_message:    "This content cannot be posted on Open Feed Network.",
    };
  }

  // REMOVE — quarantine without FBI report
  if (scan.result === "remove") {
    return {
      allowed:        false,
      requiresReview: false,
      action:         "removed",
      reason:         "Content violates our community guidelines",
      scan_id:        scan.scan_id,
      user_message:   "This content cannot be posted on Open Feed Network.",
    };
  }

  // REVIEW — hold for human decision
  if (scan.result === "review") {
    return {
      allowed:        false,
      requiresReview: true,
      action:         "held_for_review",
      reason:         "Content is under review",
      scan_id:        scan.scan_id,
      user_message:   "Your post is being reviewed and will be published shortly if it meets our guidelines.",
    };
  }

  // COUNTER-EXTREMISM — allow with label
  if (scan.is_counter_extremism) {
    return {
      allowed:        true,
      requiresReview: false,
      action:         "allowed_with_label",
      label: {
        type:    "counter_extremism",
        text:    "This post contains references to extremist organizations in an educational or counter-extremism context.",
        color:   "blue",
      },
      scan_id:        scan.scan_id,
    };
  }

  // JOURNALISM — allow with label
  if (scan.is_journalism) {
    return {
      allowed:        true,
      requiresReview: false,
      action:         "allowed_with_label",
      label: {
        type:    "journalism",
        text:    "News content — contains references to extremist organizations.",
        color:   "blue",
      },
      scan_id:        scan.scan_id,
    };
  }

  // CLEAR — allow without restriction
  return {
    allowed:        true,
    requiresReview: false,
    action:         "allowed",
    scan_id:        scan.scan_id,
  };
}

/**
 * onMedia — call before storing any uploaded image or video
 * Runs GIFCT hash check before content reaches IPFS storage
 */
export async function onMedia({ mediaBuffer, userId, mimeType, platform = "openfeed" }) {
  const scan = await scanForTerrorism({
    content:     `[Media upload — ${mimeType}]`,
    userId,
    mediaBuffer,
    platform,
  });

  if (scan.result === "critical" || scan.result === "remove") {
    return {
      allowed:      false,
      action:       "blocked",
      fbi_reported: scan.result === "critical",
      user_message: "This media cannot be uploaded to Open Feed Network.",
    };
  }

  return { allowed:true, action:"allowed", scan_id:scan.scan_id };
}

export default { onPost, onMedia };
