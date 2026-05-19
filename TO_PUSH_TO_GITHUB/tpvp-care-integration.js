/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   THE PEOPLE'S VOICE PLATFORM                                    ║
 * ║   Care Shield Integration                                        ║
 * ║                                                                  ║
 * ║   Wires Care Shield into TPVP so that every post,               ║
 * ║   every conversation, and every moment of silence               ║
 * ║   is gently watched over by a community that cares.             ║
 * ║                                                                  ║
 * ║   SETUP:                                                         ║
 * ║   Add to .env:                                                   ║
 * ║   CARE_SHIELD_API=http://localhost:3006                         ║
 * ║   INTERNAL_API_TOKEN=shared_token                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import dotenv from "dotenv";
dotenv.config();

const CARE_API    = process.env.CARE_SHIELD_API    || "http://localhost:3006";
const INT_TOKEN   = process.env.INTERNAL_API_TOKEN || "";

async function careRequest(path, body) {
  try {
    const r = await fetch(`${CARE_API}${path}`, {
      method:  "POST",
      headers: { "Content-Type":"application/json", "x-internal-token":INT_TOKEN },
      body:    JSON.stringify(body),
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

/**
 * onPost — call before saving every TPVP post
 * Returns: { showResourceCard, resourceCard, privateMessage, suppressPost }
 * suppressPost is ALWAYS false — we never hide someone's voice
 */
export async function onPost({ content, userId, username, postId }) {
  const result = await careRequest("/api/v1/care/scan", {
    content, user_id:userId, username,
    platform:"tpvp", post_id:postId,
  });

  if (!result) return { showResourceCard:false, suppressPost:false };

  return {
    showResourceCard: result.show_resource_card || false,
    resourceCard:     result.resource_card      || null,
    privateMessage:   result.private_message    || null,
    suppressPost:     false, // NEVER suppress
    signalLevel:      result.signal_level       || 0,
    immediateDanger:  result.immediate_danger   || false,
  };
}

/**
 * onCareFlag — call when a member taps "Are you okay?" on a post
 */
export async function onCareFlag({ flaggedUserId, flaggerUserId, postId, message }) {
  return careRequest("/api/v1/care/flag", {
    flagged_user_id: flaggedUserId,
    flagger_user_id: flaggerUserId,
    post_id: postId, platform:"tpvp", message,
  });
}

/**
 * onResourceAccessed — call when a member taps a crisis resource link
 * Important for understanding what resources are actually being used
 */
export async function onResourceAccessed(userId, resource) {
  return careRequest("/api/v1/care/resource-accessed", {
    user_id:userId, resource, platform:"tpvp",
  });
}

export default { onPost, onCareFlag, onResourceAccessed };
