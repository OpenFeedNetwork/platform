import { useState } from "react";

const COLORS = {
  bg: "#07080b",
  surface: "#0d0f15",
  border: "#1a1d26",
  green: "#00e676",
  cyan: "#00bcd4",
  amber: "#ffab40",
  red: "#ff5252",
  purple: "#ce93d8",
  blue: "#64b5f6",
  muted: "#4a5060",
  text: "#c8ccd8",
  textDim: "#6b7280",
};

const ENDPOINTS = {
  posts: {
    label: "Posts",
    icon: "📝",
    color: COLORS.green,
    routes: [
      {
        method: "POST", path: "/api/v1/posts",
        summary: "Create a new post",
        desc: "Accepts any supported content type. Immediately queued for Truth Shield analysis before feed indexing.",
        body: {
          type: "text | article | image | video | audio | data | link | poll | thread | document",
          content: "string (text body or URL)",
          media_urls: "string[] (optional)",
          document_cid: "string (IPFS CID, optional)",
          tags: "string[]",
          anonymous: "boolean",
          whistleblower_mode: "boolean (triggers e2e encryption + anonymous routing)",
          thread_id: "string (if part of thread)",
          language: "string (ISO 639-1)"
        },
        response: {
          post_id: "uuid",
          status: "pending_review | published",
          truth_shield_job_id: "uuid",
          ipfs_cid: "string",
          timestamp: "ISO 8601",
          ofa_score: "null (computed after TS analysis)"
        },
        notes: "All posts are stored on IPFS before platform indexing. CID is the canonical ID — platform cannot delete it."
      },
      {
        method: "GET", path: "/api/v1/posts/{post_id}",
        summary: "Fetch a single post with full metadata",
        desc: "Returns post content, Truth Shield verdict, OFA score breakdown, suppression audit trail, and engagement metrics.",
        params: { post_id: "uuid" },
        response: {
          post_id: "uuid",
          content: "PostContent object",
          author: "AuthorProfile (or anonymous token)",
          ofa_score: "0–100",
          score_breakdown: "ScoringDetail object",
          truth_shield: "TruthShieldVerdict object",
          suppression_log: "SuppressionEvent[]",
          engagement: "EngagementMetrics object",
          ipfs_cid: "string",
          arweave_tx: "string (permanent archive)"
        }
      },
      {
        method: "DELETE", path: "/api/v1/posts/{post_id}",
        summary: "Author removes post from feed index",
        desc: "Removes from OFA feed index only. IPFS/Arweave record is permanent and cannot be deleted. A tombstone record is logged on-chain.",
        response: { status: "deindexed", ipfs_cid: "still_accessible", tombstone_tx: "string" },
        notes: "⚠ Censorship-resistant: deletion only affects feed visibility, not the permanent record."
      },
      {
        method: "GET", path: "/api/v1/posts/{post_id}/audit",
        summary: "Full suppression & scoring audit trail",
        desc: "Returns every scoring event, flag, Truth Shield review, and manual action taken on this post. All entries are on-chain verified.",
        response: {
          events: "AuditEvent[]",
          suppression_attempts: "number",
          ts_reviews: "TruthShieldReview[]",
          score_history: "ScoreSnapshot[]",
          chain_verification: "string (blockchain tx hash)"
        }
      }
    ]
  },
  feed: {
    label: "Feed",
    icon: "📡",
    color: COLORS.cyan,
    routes: [
      {
        method: "GET", path: "/api/v1/feed",
        summary: "Fetch OFA-ranked feed",
        desc: "Returns posts ranked by the Open Feed Algorithm. All scoring weights are transparent and included in response. No black-box decisions.",
        params: {
          page: "integer",
          limit: "integer (max 50)",
          content_types: "comma-separated type filter",
          tags: "comma-separated tag filter",
          language: "ISO 639-1",
          include_score_breakdown: "boolean (default true)",
          algo_weights: "JSON override (community governance required)"
        },
        response: {
          posts: "RankedPost[]",
          algo_version: "string",
          weights_used: "AlgoWeights object",
          suppressed_count: "number (how many were reviewed, not hidden)",
          next_cursor: "string"
        }
      },
      {
        method: "GET", path: "/api/v1/feed/weights",
        summary: "Get current algorithm weights",
        desc: "Returns the live scoring weights governing feed ranking. Publicly readable. Changes require community governance vote.",
        response: {
          engagement_weight: "float (0–1)",
          source_credibility_weight: "float (0–1)",
          ad_penalty: "float",
          suppression_review_weight: "float",
          community_verification_bonus: "float",
          governance_tx: "string (last vote transaction)",
          effective_since: "ISO 8601"
        }
      },
      {
        method: "POST", path: "/api/v1/feed/weights/propose",
        summary: "Propose algorithm weight change",
        desc: "Submit a governance proposal to change OFA scoring weights. Requires verified community member status. Enters 7-day voting period.",
        body: {
          proposed_weights: "AlgoWeights object",
          rationale: "string",
          proposer_did: "string (decentralized identity)"
        },
        response: { proposal_id: "uuid", voting_ends: "ISO 8601", status: "open" }
      }
    ]
  },
  truthshield: {
    label: "Truth Shield",
    icon: "🛡",
    color: COLORS.amber,
    routes: [
      {
        method: "POST", path: "/api/v1/truthshield/analyze",
        summary: "Submit content for Truth Shield analysis",
        desc: "Runs Claude Haiku 4.5 analysis on content. Returns verdict, confidence score, public interest rating, and suppression recommendation. Result stored on IPFS.",
        body: {
          post_id: "uuid",
          content: "string",
          content_type: "text | image_caption | link | document",
          platform_flags: "string[] (flags from external platforms)",
          source_url: "string (optional)",
          language: "ISO 639-1"
        },
        response: {
          job_id: "uuid",
          verdict: "legitimate | disinformation | unverified | satire | opinion",
          confidence: "0–100",
          public_interest_score: "0–100",
          suppression_justified: "boolean",
          reasoning: "string",
          context_label: "string (shown to users instead of suppression)",
          ipfs_cid: "string (immutable result record)",
          model_version: "string"
        },
        notes: "Results are NEVER used to auto-delete. Only context labels are applied. Full verdict stored permanently on IPFS."
      },
      {
        method: "GET", path: "/api/v1/truthshield/jobs/{job_id}",
        summary: "Poll Truth Shield analysis status",
        response: { status: "queued | processing | complete | failed", result: "TruthShieldVerdict (if complete)" }
      },
      {
        method: "POST", path: "/api/v1/truthshield/appeal",
        summary: "Appeal a Truth Shield verdict",
        desc: "Any author or community member can appeal a verdict. Triggers secondary review by community panel + re-analysis.",
        body: {
          post_id: "uuid",
          job_id: "uuid",
          appeal_reason: "string",
          evidence_urls: "string[]",
          appellant_did: "string"
        },
        response: { appeal_id: "uuid", review_panel_assigned: "boolean", estimated_resolution: "ISO 8601" }
      },
      {
        method: "GET", path: "/api/v1/truthshield/stats",
        summary: "Platform-wide Truth Shield transparency report",
        desc: "Public endpoint. Returns aggregate stats on suppression attempts reviewed, verdicts, appeals, and accuracy rates.",
        response: {
          total_analyzed: "number",
          suppression_attempts_blocked: "number",
          legitimate_content_restored: "number",
          disinformation_labeled: "number",
          appeal_overturn_rate: "float",
          avg_analysis_time_ms: "number"
        }
      }
    ]
  },
  users: {
    label: "Users",
    icon: "👤",
    color: COLORS.purple,
    routes: [
      {
        method: "POST", path: "/api/v1/users/register",
        summary: "Register a new account",
        desc: "Supports standard, anonymous, and whistleblower tiers. Anonymous accounts get a deterministic DID with no PII stored.",
        body: {
          tier: "standard | anonymous | whistleblower",
          username: "string (optional for anon)",
          email: "string (optional, hashed if provided)",
          did_method: "key | web | ion (decentralized identity)"
        },
        response: { user_id: "uuid", did: "string", tier: "string", verification_status: "unverified" }
      },
      {
        method: "GET", path: "/api/v1/users/{user_id}/credibility",
        summary: "Get source credibility score",
        desc: "Returns a user's source credibility score used in OFA ranking. Score is computed from post accuracy history, community verifications, and Truth Shield verdicts.",
        response: {
          credibility_score: "0–100",
          verified_posts: "number",
          accuracy_rate: "float",
          community_endorsements: "number",
          truth_shield_clean_rate: "float",
          last_updated: "ISO 8601"
        }
      },
      {
        method: "POST", path: "/api/v1/users/{user_id}/verify",
        summary: "Submit identity or journalist verification",
        desc: "Optional. Verified status boosts source credibility score. Supports press credentials, community vouching, and on-chain attestations.",
        body: {
          verification_type: "press | community | onchain",
          credential_url: "string (optional)",
          vouchers: "string[] (DIDs of community vouchers)"
        }
      }
    ]
  },
  media: {
    label: "Media",
    icon: "🎥",
    color: COLORS.blue,
    routes: [
      {
        method: "POST", path: "/api/v1/media/upload",
        summary: "Upload media (image, video, audio, document)",
        desc: "Uploads to IPFS first, then platform CDN as mirror. Returns CID as canonical reference. Truth Shield analysis queued for image/video content.",
        body: {
          file: "multipart/form-data",
          content_type: "image | video | audio | document | dataset",
          auto_analyze: "boolean (queue Truth Shield scan)"
        },
        response: {
          media_id: "uuid",
          ipfs_cid: "string",
          cdn_url: "string (mirror)",
          truth_shield_job_id: "uuid (if auto_analyze)",
          mime_type: "string",
          size_bytes: "number"
        }
      },
      {
        method: "GET", path: "/api/v1/media/{media_id}",
        summary: "Fetch media metadata + Truth Shield result",
        response: { media_id: "uuid", ipfs_cid: "string", truth_shield: "TruthShieldVerdict | null", cdn_url: "string" }
      }
    ]
  },
  governance: {
    label: "Governance",
    icon: "🗳",
    color: COLORS.red,
    routes: [
      {
        method: "GET", path: "/api/v1/governance/proposals",
        summary: "List open governance proposals",
        desc: "Returns all active proposals for algorithm weight changes, policy updates, and platform rule modifications.",
        response: { proposals: "Proposal[]", active_voters: "number", quorum_required: "number" }
      },
      {
        method: "POST", path: "/api/v1/governance/proposals/{proposal_id}/vote",
        summary: "Cast a governance vote",
        body: { vote: "yes | no | abstain", voter_did: "string", weight: "float (based on credibility score)" },
        response: { vote_recorded: "boolean", chain_tx: "string", current_tally: "VoteTally object" }
      },
      {
        method: "GET", path: "/api/v1/governance/audit",
        summary: "Platform governance audit log",
        desc: "Complete on-chain history of every algorithm change, policy vote, and moderation decision. Public and immutable.",
        response: { events: "GovernanceEvent[]", total: "number" }
      }
    ]
  }
};

const METHOD_COLORS = {
  GET: COLORS.green,
  POST: COLORS.cyan,
  DELETE: COLORS.red,
  PUT: COLORS.amber,
  PATCH: COLORS.purple
};

function CodeBlock({ data, title }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ background: "#050608", border: `1px solid ${COLORS.border}`, borderRadius: "6px", overflow: "hidden", marginTop: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderBottom: `1px solid ${COLORS.border}`, background: "#0a0b10" }}>
        <span style={{ fontSize: "10px", color: COLORS.muted, fontFamily: "monospace", letterSpacing: "1px" }}>{title}</span>
        <button onClick={copy} style={{ background: "none", border: "none", color: copied ? COLORS.green : COLORS.muted, fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>
          {copied ? "✓ COPIED" : "COPY"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "12px", fontSize: "11px", color: COLORS.text, overflowX: "auto", lineHeight: 1.6, fontFamily: "'Fira Code', 'Courier New', monospace" }}>
        {text.split("\n").map((line, i) => {
          const keyMatch = line.match(/^(\s*)"([^"]+)":/);
          const strMatch = line.match(/: "([^"]+)"/);
          if (keyMatch) {
            return (
              <div key={i}>
                <span style={{ color: COLORS.muted }}>{line.substring(0, keyMatch[1].length)}</span>
                <span style={{ color: COLORS.cyan }}>"{keyMatch[2]}"</span>
                <span style={{ color: COLORS.muted }}>: </span>
                <span style={{ color: strMatch ? COLORS.amber : COLORS.text }}>{line.substring(keyMatch[0].length)}</span>
              </div>
            );
          }
          return <div key={i} style={{ color: COLORS.text }}>{line}</div>;
        })}
      </pre>
    </div>
  );
}

function RouteCard({ route, sectionColor }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: "8px", marginBottom: "8px", overflow: "hidden", transition: "border-color 0.2s" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", background: open ? "#0d0f17" : COLORS.surface,
        border: "none", padding: "12px 16px", display: "flex", alignItems: "center",
        gap: "12px", cursor: "pointer", textAlign: "left"
      }}>
        <span style={{
          fontSize: "10px", fontWeight: 700, fontFamily: "monospace",
          color: METHOD_COLORS[route.method] || COLORS.text,
          background: `${METHOD_COLORS[route.method]}18`,
          border: `1px solid ${METHOD_COLORS[route.method]}44`,
          padding: "3px 8px", borderRadius: "4px", minWidth: "52px", textAlign: "center"
        }}>{route.method}</span>
        <span style={{ fontSize: "12px", color: COLORS.text, fontFamily: "monospace", flex: 1 }}>{route.path}</span>
        <span style={{ fontSize: "11px", color: COLORS.textDim, flex: 2, textAlign: "left" }}>{route.summary}</span>
        <span style={{ fontSize: "10px", color: COLORS.muted }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px", borderTop: `1px solid ${COLORS.border}`, background: "#0a0c12" }}>
          <p style={{ fontSize: "12px", color: COLORS.textDim, lineHeight: 1.6, margin: "0 0 12px" }}>{route.desc}</p>

          {route.notes && (
            <div style={{ background: `${COLORS.amber}10`, border: `1px solid ${COLORS.amber}33`, borderRadius: "6px", padding: "10px 12px", marginBottom: "12px" }}>
              <span style={{ fontSize: "10px", color: COLORS.amber, fontWeight: 700 }}>⚠ NOTE  </span>
              <span style={{ fontSize: "11px", color: COLORS.text }}>{route.notes}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {route.params && <CodeBlock data={route.params} title="QUERY PARAMS" />}
            {route.body && <CodeBlock data={route.body} title="REQUEST BODY" />}
            {route.response && <CodeBlock data={route.response} title="RESPONSE" />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState("posts");
  const [search, setSearch] = useState("");

  const section = ENDPOINTS[activeSection];

  const filtered = search
    ? Object.entries(ENDPOINTS).flatMap(([, sec]) =>
        sec.routes.filter(r =>
          r.path.toLowerCase().includes(search.toLowerCase()) ||
          r.summary.toLowerCase().includes(search.toLowerCase())
        ).map(r => ({ ...r, sectionColor: sec.color, sectionLabel: sec.label }))
      )
    : null;

  const totalRoutes = Object.values(ENDPOINTS).reduce((a, s) => a + s.routes.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Fira Code', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #090a0e; }
        ::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }
        input::placeholder { color: #3a3d4a; }
      `}</style>

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "14px 24px", display: "flex", alignItems: "center", gap: "16px", background: COLORS.surface, position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", letterSpacing: "2px" }}>
            OFA <span style={{ color: COLORS.green }}>◆</span> API REFERENCE
          </div>
          <div style={{ fontSize: "9px", color: COLORS.muted, letterSpacing: "1px", marginTop: "1px" }}>
            v1.0 · {totalRoutes} ENDPOINTS · TRUTH SHIELD INTEGRATED
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ fontSize: "10px", background: `${COLORS.green}18`, border: `1px solid ${COLORS.green}44`, color: COLORS.green, padding: "4px 10px", borderRadius: "4px" }}>
            BASE: api.openfeed.network
          </div>
          <div style={{ fontSize: "10px", background: `${COLORS.cyan}18`, border: `1px solid ${COLORS.cyan}44`, color: COLORS.cyan, padding: "4px 10px", borderRadius: "4px" }}>
            DECENTRALIZED
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
        {/* Sidebar */}
        <div style={{ width: "200px", flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, padding: "16px 0", overflowY: "auto", background: COLORS.surface }}>
          <div style={{ padding: "0 14px 12px", fontSize: "9px", color: COLORS.muted, letterSpacing: "2px" }}>RESOURCES</div>
          {Object.entries(ENDPOINTS).map(([key, sec]) => (
            <button key={key} onClick={() => { setActiveSection(key); setSearch(""); }} style={{
              width: "100%", background: activeSection === key && !search ? `${sec.color}12` : "none",
              border: "none", borderLeft: activeSection === key && !search ? `2px solid ${sec.color}` : "2px solid transparent",
              padding: "9px 14px", display: "flex", alignItems: "center", gap: "8px",
              cursor: "pointer", textAlign: "left", transition: "all 0.15s"
            }}>
              <span style={{ fontSize: "14px" }}>{sec.icon}</span>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: activeSection === key && !search ? sec.color : COLORS.text }}>{sec.label}</div>
                <div style={{ fontSize: "9px", color: COLORS.muted }}>{sec.routes.length} routes</div>
              </div>
            </button>
          ))}

          <div style={{ margin: "16px 14px 8px", height: "1px", background: COLORS.border }} />
          <div style={{ padding: "0 14px", fontSize: "9px", color: COLORS.muted, letterSpacing: "1px", marginBottom: "8px" }}>AUTH</div>
          <div style={{ padding: "0 14px" }}>
            {["Bearer JWT", "DID Auth", "API Key"].map(a => (
              <div key={a} style={{ fontSize: "10px", color: COLORS.textDim, padding: "3px 0" }}>
                <span style={{ color: COLORS.green }}>✓</span> {a}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Search */}
          <div style={{ marginBottom: "20px", position: "relative" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search endpoints…"
              style={{
                width: "100%", background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderRadius: "6px", padding: "10px 14px 10px 36px",
                color: COLORS.text, fontSize: "12px", fontFamily: "inherit", outline: "none"
              }}
            />
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: COLORS.muted }}>🔍</span>
          </div>

          {search ? (
            <>
              <div style={{ fontSize: "11px", color: COLORS.muted, marginBottom: "14px", letterSpacing: "1px" }}>
                SEARCH RESULTS — {filtered.length} MATCH{filtered.length !== 1 ? "ES" : ""}
              </div>
              {filtered.map((r, i) => <RouteCard key={i} route={r} sectionColor={r.sectionColor} />)}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span style={{ fontSize: "20px" }}>{section.icon}</span>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: section.color }}>{section.label}</div>
                  <div style={{ fontSize: "10px", color: COLORS.muted, marginTop: "2px" }}>
                    {section.routes.length} ENDPOINTS
                  </div>
                </div>
              </div>

              {section.routes.map((route, i) => (
                <RouteCard key={i} route={route} sectionColor={section.color} />
              ))}

              {/* Data models reference */}
              {activeSection === "posts" && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "2px", marginBottom: "12px" }}>DATA MODELS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                    {[
                      {
                        name: "ContentType", color: COLORS.green,
                        fields: ["text", "article", "image", "video", "audio", "data", "link", "poll", "thread", "document"]
                      },
                      {
                        name: "TruthShieldVerdict", color: COLORS.amber,
                        fields: ["verdict: legitimate|disinformation|unverified|satire|opinion", "confidence: 0-100", "public_interest_score: 0-100", "suppression_justified: boolean", "context_label: string", "ipfs_cid: string"]
                      },
                      {
                        name: "ScoringDetail", color: COLORS.cyan,
                        fields: ["engagement_score: float", "credibility_score: float", "suppression_penalty: float", "ad_penalty: float", "verification_bonus: float", "final_score: 0-100"]
                      },
                      {
                        name: "SuppressionEvent", color: COLORS.red,
                        fields: ["event_id: uuid", "flagging_entity: string", "flag_type: string", "ts_review_triggered: boolean", "verdict: string", "chain_tx: string", "timestamp: ISO 8601"]
                      }
                    ].map(model => (
                      <div key={model.name} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: "8px", padding: "14px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: model.color, marginBottom: "10px" }}>{model.name}</div>
                        {model.fields.map(f => (
                          <div key={f} style={{ fontSize: "10px", color: COLORS.textDim, padding: "3px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                            <span style={{ color: COLORS.cyan }}>▸</span> {f}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSection === "truthshield" && (
                <div style={{ marginTop: "20px", background: `${COLORS.amber}08`, border: `1px solid ${COLORS.amber}22`, borderRadius: "8px", padding: "16px" }}>
                  <div style={{ fontSize: "10px", color: COLORS.amber, letterSpacing: "2px", marginBottom: "10px" }}>TRUTH SHIELD PIPELINE</div>
                  {[
                    ["1. Ingest", "Post submitted → content + platform flags extracted"],
                    ["2. Queue", "Job created → priority based on suppression flag severity"],
                    ["3. Analyze", "Claude Haiku 4.5 runs structured verdict analysis"],
                    ["4. Store", "Verdict stored on IPFS → CID returned, immutable"],
                    ["5. Apply", "Context label applied to post — NO auto-deletion ever"],
                    ["6. Log", "Suppression attempt + verdict logged on-chain permanently"],
                    ["7. Appeal", "Any user can trigger secondary review within 30 days"]
                  ].map(([step, desc]) => (
                    <div key={step} style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "10px", color: COLORS.amber, minWidth: "70px", fontWeight: 700 }}>{step}</span>
                      <span style={{ fontSize: "11px", color: COLORS.textDim }}>{desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
