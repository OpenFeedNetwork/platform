/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   TERRORISM SHIELD SDK  v1.0.0 — Node.js                         ║
 * ║   Official client library for Terrorism Shield API              ║
 * ║                                                                  ║
 * ║   QUICK START:                                                   ║
 * ║   const ts = new TerrorismShield("ts_your_api_key");            ║
 * ║   const r  = await ts.scanText({ content: post.body });         ║
 * ║   if (!r.allowed) await removeContent(post);                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const DEFAULT_BASE_URL = "https://terrorismshield.openfeed.network";

export class TerrorismShield {
  /**
   * @param {string} apiKey  - Your Terrorism Shield API key (ts_...)
   * @param {Object} options
   * @param {string} options.baseUrl  - API base URL
   * @param {number} options.timeout - Request timeout ms (default 30000)
   */
  constructor(apiKey, options = {}) {
    if (!apiKey) throw new Error("Terrorism Shield API key required");
    if (!apiKey.startsWith("ts_")) throw new Error("Invalid key format — must start with ts_");
    this.apiKey  = apiKey;
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.timeout = options.timeout || 30000;
  }

  async #request(method, path, body = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const r = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type":"application/json", "x-api-key":this.apiKey, "User-Agent":"terrorism-shield-sdk/1.0.0" },
        body:   body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await r.json();
      if (!r.ok) {
        const err = new Error(data.error || `HTTP ${r.status}`);
        err.status = r.status; err.details = data;
        throw err;
      }
      return data;
    } catch(err) {
      if (err.name==="AbortError") throw new Error(`Request timed out after ${this.timeout}ms`);
      throw err;
    } finally { clearTimeout(timer); }
  }

  /**
   * Scan text content for terrorism indicators
   * Runs Layers 2 (FTO detection) + 3 (AI analysis) + 4 (review queue)
   *
   * @param {Object} params
   * @param {string} params.content  - Text to analyze
   * @param {string} params.context  - Optional context about the content
   * @returns {Promise<ScanResult>}
   *
   * @example
   * const r = await ts.scanText({ content: post.body });
   *
   * // Simple routing:
   * if (r.result === "critical") {
   *   await removeContent(post);
   *   await notifyFBI(r.fbi_report); // File at ic3.gov within 24hrs
   * }
   * if (r.result === "review") await holdForHumanReview(post, r);
   * if (r.add_content_label) await addLabel(post, r.add_content_label);
   */
  async scanText({ content, context }) {
    return this.#request("POST", "/api/v1/scan/text", { content, context });
  }

  /**
   * GIFCT hash check for image or video content
   * Checks against GIFCT's database of known terrorism media
   *
   * @param {Object} params
   * @param {Buffer|string} params.media   - Media as Buffer or base64 string
   * @param {string} params.mimeType       - MIME type
   * @returns {Promise<ScanResult>}
   *
   * @example
   * const r = await ts.scanMedia({ media: req.file.buffer, mimeType: "image/jpeg" });
   * if (!r.allowed) {
   *   await removeMedia(upload);
   *   if (r.fbi_report) await fileIC3Report(r.fbi_report);
   * }
   */
  async scanMedia({ media, mimeType = "image/jpeg" }) {
    const base64 = Buffer.isBuffer(media) ? media.toString("base64") : media;
    return this.#request("POST", "/api/v1/scan/media", { media_base64:base64, mime_type:mimeType });
  }

  /**
   * Full scan — text + media — all 4 detection layers
   * Use this for posts that contain both text and an image attachment
   *
   * @param {Object} params
   * @param {string} params.content        - Text content (optional if media provided)
   * @param {Buffer|string} params.media   - Media content (optional)
   * @param {string} params.mimeType       - Media MIME type
   * @returns {Promise<ScanResult>}
   *
   * @example
   * // On post submission with optional image:
   * const r = await ts.scanFull({
   *   content:  req.body.text,
   *   media:    req.file?.buffer,
   *   mimeType: req.file?.mimetype,
   * });
   *
   * return handleResult(r);
   */
  async scanFull({ content, media, mimeType = "image/jpeg" }) {
    const base64 = media
      ? (Buffer.isBuffer(media) ? media.toString("base64") : media)
      : undefined;
    return this.#request("POST", "/api/v1/scan/full", {
      content, media_base64:base64, mime_type:mimeType
    });
  }

  /**
   * Get the complete list of 68 designated Foreign Terrorist Organizations
   * Updated from U.S. State Department list
   *
   * @returns {Promise<{count: number, ftos: string[]}>}
   */
  async getFTOList() {
    return this.#request("GET", "/api/v1/fto/list");
  }

  /**
   * Get monthly compliance report
   * Use for regulatory documentation, DSA compliance, insurance evidence
   *
   * @param {string} month - YYYY-MM format (e.g. "2026-07")
   * @returns {Promise<ComplianceReport>}
   *
   * @example
   * const report = await ts.getComplianceReport("2026-07");
   * // report.compliance_statement → use in regulatory filings
   * // report.fbi_reports → IC3 complaint numbers
   */
  async getComplianceReport(month) {
    return this.#request("GET", `/api/v1/report/${month}`);
  }

  /**
   * Check current API usage and limits
   * @returns {Promise<UsageInfo>}
   */
  async getUsage() {
    return this.#request("GET", "/api/v1/usage");
  }

  /**
   * Convenience method — handle scan result and return clean action
   * Use this if you want simple action-based routing without handling result types
   *
   * @param {ScanResult} result - Result from scanText(), scanMedia(), or scanFull()
   * @returns {{ action, message, requiresHumanReview, fbiRequired, label }}
   *
   * @example
   * const scan   = await ts.scanFull({ content, media });
   * const action = ts.handleResult(scan);
   *
   * switch (action.action) {
   *   case "allow":  return saveAndPublish(post);
   *   case "label":  return saveWithLabel(post, action.label);
   *   case "review": return holdForReview(post);
   *   case "remove": return removeAndNotify(post);
   *   case "report": return removeAndFileFBI(post, scan.fbi_report);
   * }
   */
  handleResult(result) {
    if (result.result === "critical") {
      return {
        action:              "report",
        message:             "Confirmed terrorism content — remove immediately and file FBI IC3 report within 24 hours",
        requiresHumanReview: false,
        fbiRequired:         true,
        fbiReport:           result.fbi_report,
        label:               null,
        userMessage:         "This content cannot be posted.",
        legalNote:           result.legal_note,
      };
    }
    if (result.result === "remove") {
      return {
        action:              "remove",
        message:             "High-risk terrorism content — remove from platform",
        requiresHumanReview: false,
        fbiRequired:         false,
        label:               null,
        userMessage:         "This content violates our community guidelines.",
      };
    }
    if (result.result === "review") {
      return {
        action:              "review",
        message:             "Ambiguous content — hold for human review before publishing",
        requiresHumanReview: true,
        fbiRequired:         false,
        label:               null,
        userMessage:         "Your content is being reviewed and will be published shortly.",
      };
    }
    if (result.add_content_label) {
      return {
        action:  "label",
        message: "Legitimate counter-extremism or journalism content — publish with context label",
        label:   result.add_content_label,
        requiresHumanReview: false,
        fbiRequired:         false,
      };
    }
    return {
      action:              "allow",
      message:             "Content is clear — publish normally",
      requiresHumanReview: false,
      fbiRequired:         false,
      label:               null,
    };
  }
}

/**
 * @typedef {Object} ScanResult
 * @property {string}   scan_id               - Unique scan ID
 * @property {string}   result                - clear|review|remove|critical
 * @property {string}   action                - allow|label|review|quarantine|report_fbi
 * @property {string}   risk_level            - none|low|medium|high|critical
 * @property {number}   risk_score            - 0-100
 * @property {string[]} indicators            - Specific signals detected
 * @property {boolean}  is_terrorism_support  - Confirmed terrorism support
 * @property {boolean}  is_counter_extremism  - Counter-extremism content — protect
 * @property {boolean}  is_journalism         - Journalism — protect
 * @property {boolean}  is_political_speech   - Political speech — protect
 * @property {string[]} ftos_mentioned        - FTOs mentioned in content
 * @property {boolean}  suppress_content      - true = remove from platform
 * @property {boolean}  requires_human_review - true = hold for human decision
 * @property {string}   add_content_label     - Label type to add if any
 * @property {Object}   fbi_report            - FBI report details if filed
 * @property {boolean}  gifct_submitted       - Whether submitted to GIFCT hash DB
 * @property {number}   processing_ms         - Processing time
 * @property {string}   reasoning             - Human-readable explanation
 * @property {string}   legal_note            - Legal requirement note if critical
 */

/**
 * @typedef {Object} ComplianceReport
 * @property {string} report_id
 * @property {string} company
 * @property {string} report_month
 * @property {Object} summary
 * @property {string} compliance_statement   - Use in regulatory filings
 * @property {boolean} gifct_compliant
 * @property {string[]} legal_basis
 * @property {Object[]} fbi_reports          - IC3 complaint numbers
 * @property {string} legal_note
 */

export default TerrorismShield;
