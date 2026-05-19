import { useState, useEffect, useCallback, useRef } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   LCQ ADMIN DASHBOARD — Legal Compliance Quarantine              ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Secure review interface for quarantined content                ║
 * ║   CSAM · Classified · Trade Secret · FOSTA                      ║
 * ║                                                                  ║
 * ║   SETUP:                                                         ║
 * ║   Set LCQ_API_BASE to your LCQ microservice URL                  ║
 * ║   Set your LCQ_ADMIN_TOKEN in the login screen                   ║
 * ║   This dashboard connects to lcq-microservice.js                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — update this to your LCQ microservice URL
// ─────────────────────────────────────────────────────────────────────────────
const LCQ_API = "http://localhost:3004"; // Change to https://api.openfeed.network:3004 in production

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM — Command-center aesthetic
// High-stakes, military-grade, minimal color pollution
// Red only for critical, amber for warning, green for safe
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  // Backgrounds — near-black system
  bg0: "#080A0E", bg1: "#0D1117", bg2: "#111820",
  bg3: "#161E2A", bg4: "#1A2333", bg5: "#1E2940",

  // Borders
  border:  "#1E2840",
  border2: "#253050",
  border3: "#2A3860",

  // Threat levels
  critical: "#FF2D2D", criticalBg: "#1A0505", criticalBorder: "#4A0A0A",
  high:     "#FF8C00", highBg:     "#1A0E00", highBorder:     "#4A2800",
  medium:   "#FFD700", mediumBg:   "#1A1500", mediumBorder:   "#4A3A00",
  safe:     "#00E676", safeBg:     "#001A0D", safeBorder:     "#004D1F",
  info:     "#4A9EFF", infoBg:     "#000F1A", infoBorder:     "#003080",

  // Text
  white:   "#F0F4FF",
  text:    "#B8C4D8",
  dim:     "#5A6B88",
  muted:   "#2E3D58",
  ghost:   "#1A2438",

  // Pipeline colors
  csam:        "#FF2D2D",
  classified:  "#FF8C00",
  trade_secret:"#FFD700",
  fosta:       "#FF6B9D",
  manual:      "#4A9EFF",
};

const pipelineColor = (p) => ({
  csam:         C.critical,
  classified:   C.high,
  trade_secret: C.medium,
  fosta:        C.fosta,
  manual:       C.info,
}[p] || C.dim);

const pipelineIcon = (p) => ({
  csam:         "⛔",
  classified:   "🔒",
  trade_secret: "⚠️",
  fosta:        "🚫",
  manual:       "📋",
}[p] || "❓");

const pipelineLabel = (p) => ({
  csam:         "CSAM",
  classified:   "Classified Material",
  trade_secret: "Trade Secret",
  fosta:        "FOSTA-SESTA",
  manual:       "Manual Review",
}[p] || p?.toUpperCase());

// ─────────────────────────────────────────────────────────────────────────────
// API CLIENT
// ─────────────────────────────────────────────────────────────────────────────
function useAPI(adminToken) {
  const headers = useCallback(() => ({
    "Content-Type":   "application/json",
    "x-admin-token":  adminToken,
  }), [adminToken]);

  const get  = useCallback((path) =>
    fetch(`${LCQ_API}${path}`, { headers: headers() }).then(r => r.json()),
    [headers]);

  const post = useCallback((path, body = {}) =>
    fetch(`${LCQ_API}${path}`, {
      method: "POST", headers: headers(),
      body: JSON.stringify(body),
    }).then(r => r.json()),
    [headers]);

  return { get, post };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Blinking threat indicator
const ThreatDot = ({ level, size = 8 }) => {
  const color = {
    critical: C.critical, high: C.high,
    medium: C.medium,     safe: C.safe,
  }[level] || C.dim;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      boxShadow: `0 0 ${size * 1.5}px ${color}`,
      animation: level === "critical" ? "blink 0.8s ease infinite" : "pulse 2s ease infinite",
      flexShrink: 0,
    }} />
  );
};

// Stat card
const StatCard = ({ label, value, color, sublabel }) => (
  <div style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    borderTop: `3px solid ${color}`,
    borderRadius: 8, padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{
      fontSize: 28, fontWeight: 900, color,
      fontFamily: "'JetBrains Mono', monospace",
      textShadow: `0 0 20px ${color}44`,
      lineHeight: 1,
    }}>{value}</div>
    <div style={{ fontSize: 10, color: C.text, fontFamily: "monospace", letterSpacing: 0.5 }}>{label}</div>
    {sublabel && <div style={{ fontSize: 9, color: C.dim }}>{sublabel}</div>}
  </div>
);

// Badge
const Badge = ({ children, color, bg }) => (
  <span style={{
    fontSize: 9, padding: "2px 8px", borderRadius: 4,
    fontFamily: "monospace", fontWeight: 700, letterSpacing: 0.8,
    background: bg || `${color}18`, color,
    border: `1px solid ${color}44`,
  }}>{children}</span>
);

// Btn
const Btn = ({ children, onClick, color = C.safe, disabled, small, danger, outline }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "5px 10px" : "8px 16px",
    background: disabled ? C.bg4 : outline ? "transparent" : `${color}18`,
    border: `1px solid ${disabled ? C.border : color}`,
    borderRadius: 6, color: disabled ? C.dim : color,
    fontFamily: "monospace", fontWeight: 700, fontSize: small ? 9 : 11,
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: 0.5, transition: "all 0.15s",
    boxShadow: disabled ? "none" : `0 0 12px ${color}18`,
  }}>{children}</button>
);

// Modal
const Modal = ({ title, children, onClose, width = 520 }) => (
  <div style={{
    position: "fixed", inset: 0, background: "#000000DD",
    backdropFilter: "blur(4px)", zIndex: 200,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  }}>
    <div style={{
      background: C.bg1, border: `1px solid ${C.border2}`,
      borderRadius: 12, width: "100%", maxWidth: width,
      maxHeight: "85vh", overflowY: "auto",
      boxShadow: `0 0 60px ${C.critical}22`,
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.white, fontFamily: "monospace" }}>
          {title}
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: C.dim,
          cursor: "pointer", fontSize: 18, lineHeight: 1,
        }}>✕</button>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [token, setToken]   = useState("");
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!token.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${LCQ_API}/api/v1/lcq/admin/stats`, {
        headers: { "x-admin-token": token },
      });
      if (res.ok) {
        onLogin(token);
      } else {
        setError("Invalid admin token. Check LCQ_ADMIN_TOKEN in your .env file.");
      }
    } catch {
      setError(`Cannot connect to LCQ microservice at ${LCQ_API}. Is it running?`);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', monospace", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button { font-family: inherit; outline: none; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420, animation: "fadeIn 0.4s ease" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 11, letterSpacing: 4, color: C.critical,
            fontWeight: 800, marginBottom: 12,
            animation: "blink 1.5s ease infinite",
          }}>
            ⛔ RESTRICTED ACCESS ⛔
          </div>
          <div style={{
            fontSize: 26, fontWeight: 900, color: C.white, letterSpacing: 3,
            textShadow: `0 0 30px ${C.critical}44`,
          }}>LCQ ADMIN</div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: 2, marginTop: 4 }}>
            Legal Compliance Quarantine
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
            Open Feed Network, Inc.
          </div>
        </div>

        <div style={{
          background: C.bg1, border: `1px solid ${C.border2}`,
          borderRadius: 12, padding: 24,
          boxShadow: `0 0 40px ${C.criticalBg}`,
        }}>
          <div style={{
            padding: "10px 12px", background: C.criticalBg,
            border: `1px solid ${C.criticalBorder}`, borderRadius: 6,
            fontSize: 10, color: C.critical, lineHeight: 1.6, marginBottom: 20,
          }}>
            ⚠ This system contains legally sensitive information.<br />
            Unauthorized access is a federal crime.<br />
            All actions are logged and audited.
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>
              ADMIN TOKEN
            </div>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Enter LCQ_ADMIN_TOKEN"
              style={{
                width: "100%", background: C.bg3,
                border: `1px solid ${error ? C.critical : C.border}`,
                borderRadius: 6, padding: "10px 12px",
                color: C.white, fontSize: 12, letterSpacing: 1,
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 12px", background: C.criticalBg,
              border: `1px solid ${C.criticalBorder}`, borderRadius: 6,
              fontSize: 10, color: C.critical, marginBottom: 14, lineHeight: 1.5,
            }}>{error}</div>
          )}

          <Btn onClick={handleLogin} disabled={loading || !token.trim()} color={C.critical} full>
            {loading ? "⏳ AUTHENTICATING..." : "⛔ ACCESS SYSTEM"}
          </Btn>

          <div style={{
            marginTop: 16, fontSize: 9, color: C.muted, textAlign: "center", lineHeight: 1.6,
          }}>
            Connected to: {LCQ_API}<br />
            Token is set as LCQ_ADMIN_TOKEN in your .env file
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUARANTINE ITEM CARD
// ─────────────────────────────────────────────────────────────────────────────
function QueueItem({ item, onAction, selected, onSelect }) {
  const color = pipelineColor(item.pipeline);
  const icon  = pipelineIcon(item.pipeline);
  const isOverdue = item.hours_remaining === 0;
  const isUrgent  = item.hours_remaining < 12;

  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        background: selected ? `${color}12` : C.bg2,
        border: `1px solid ${selected ? color : isOverdue ? C.critical : C.border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8, padding: "12px 14px",
        cursor: "pointer", marginBottom: 8,
        transition: "all 0.15s",
        boxShadow: selected ? `0 0 20px ${color}18` : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThreatDot level={item.pipeline === "csam" ? "critical" : item.pipeline === "classified" ? "high" : "medium"} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.white, fontFamily: "monospace" }}>
                {pipelineLabel(item.pipeline)}
              </span>
              {item.ncmec_reported === 1 && (
                <Badge color={C.safe}>✓ NCMEC REPORTED</Badge>
              )}
              {item.legal_hold === 1 && (
                <Badge color={C.info}>⚖ LEGAL HOLD</Badge>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: "monospace" }}>
              ID: {item.id.substring(0, 16)}… · {item.content_type} ·{" "}
              {item.detection_method} · {item.detection_confidence}% confidence
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 16, fontWeight: 900, fontFamily: "monospace",
            color: isOverdue ? C.critical : isUrgent ? C.high : C.medium,
            textShadow: `0 0 12px ${isOverdue ? C.critical : C.medium}44`,
          }}>
            {isOverdue ? "OVERDUE" : `${item.hours_remaining}h`}
          </div>
          <div style={{ fontSize: 8, color: C.dim, marginTop: 1 }}>
            {isOverdue ? "AUTO-DESTROY" : "remaining"}
          </div>
        </div>
      </div>

      {item.detection_signals?.length > 0 && (
        <div style={{
          marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4,
        }}>
          {item.detection_signals.slice(0, 4).map((s, i) => (
            <span key={i} style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 3,
              background: `${color}15`, color, border: `1px solid ${color}33`,
              fontFamily: "monospace",
            }}>
              {typeof s === "string" ? s : s.pattern || s.type || JSON.stringify(s)}
            </span>
          ))}
          {item.detection_signals.length > 4 && (
            <span style={{ fontSize: 9, color: C.dim }}>
              +{item.detection_signals.length - 4} more
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Btn small color={C.critical} onClick={e => { e.stopPropagation(); onAction("destroy", item); }}>
          💥 Destroy
        </Btn>
        {item.pipeline !== "csam" && (
          <Btn small color={C.safe} outline onClick={e => { e.stopPropagation(); onAction("release", item); }}>
            ✓ Release
          </Btn>
        )}
        {!item.ncmec_reported && item.pipeline === "csam" && (
          <Btn small color={C.high} onClick={e => { e.stopPropagation(); onAction("ncmec", item); }}>
            📋 Report NCMEC
          </Btn>
        )}
        <Btn small color={C.info} outline onClick={e => { e.stopPropagation(); onAction("hold", item); }}>
          ⚖ Legal Hold
        </Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM DESTROY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DestroyModal({ item, onConfirm, onClose }) {
  const [notes, setNotes]             = useState("");
  const [legalAuth, setLegalAuth]     = useState("");
  const [confirmed, setConfirmed]     = useState(false);
  const [typedConfirm, setTyped]      = useState("");
  const CONFIRM_WORD                  = "DESTROY";

  return (
    <Modal title="⛔ CONFIRM PERMANENT DESTRUCTION" onClose={onClose} width={480}>
      <div style={{
        padding: "10px 12px", background: C.criticalBg,
        border: `1px solid ${C.criticalBorder}`, borderRadius: 6,
        fontSize: 11, color: C.critical, lineHeight: 1.6, marginBottom: 16,
      }}>
        ⚠ This action is IRREVERSIBLE. The content and its encryption key will be<br />
        permanently destroyed using cryptographic shredding (3-pass). A destruction<br />
        record will be logged permanently for legal compliance.
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 6, letterSpacing: 1 }}>ITEM</div>
        <div style={{ padding: "8px 10px", background: C.bg3, borderRadius: 6, fontSize: 10, color: C.text, fontFamily: "monospace" }}>
          Pipeline: {pipelineLabel(item.pipeline)}<br />
          Content type: {item.content_type}<br />
          Quarantined: {new Date(item.quarantined_at).toLocaleString()}<br />
          ID: {item.id}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 6, letterSpacing: 1 }}>DESTRUCTION NOTES (optional)</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Reason for destruction, review findings, etc."
          rows={3}
          style={{
            width: "100%", background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 10px", color: C.text, fontSize: 11,
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 6, letterSpacing: 1 }}>
          LEGAL AUTHORITY (if court-ordered)
        </div>
        <input
          value={legalAuth}
          onChange={e => setLegalAuth(e.target.value)}
          placeholder="Court order #, attorney instruction, etc. (leave blank if none)"
          style={{
            width: "100%", background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 10px", color: C.text, fontSize: 11,
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.critical, marginBottom: 6 }}>
          Type <strong>DESTROY</strong> to confirm:
        </div>
        <input
          value={typedConfirm}
          onChange={e => setTyped(e.target.value.toUpperCase())}
          placeholder="Type DESTROY to confirm"
          style={{
            width: "100%", background: C.criticalBg,
            border: `1px solid ${typedConfirm === CONFIRM_WORD ? C.critical : C.criticalBorder}`,
            borderRadius: 6, padding: "8px 10px", color: C.critical,
            fontSize: 12, fontWeight: 700, letterSpacing: 2, fontFamily: "monospace",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={onClose} color={C.dim} outline>Cancel</Btn>
        <Btn
          onClick={() => onConfirm({ notes, legalAuthority: legalAuth })}
          disabled={typedConfirm !== CONFIRM_WORD}
          color={C.critical}
          full
        >
          ⛔ PERMANENTLY DESTROY
        </Btn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ adminToken, onLogout }) {
  const { get, post }           = useAPI(adminToken);
  const [stats, setStats]       = useState(null);
  const [queue, setQueue]       = useState([]);
  const [destructionLog, setDestructionLog] = useState([]);
  const [tab, setTab]           = useState("queue");
  const [pipeline, setPipeline] = useState("all");
  const [selected, setSelected] = useState(null);
  const [modal, setModal]       = useState(null); // { type: 'destroy'|'release'|'ncmec'|'hold', item }
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [health, setHealth]     = useState(null);
  const intervalRef             = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [statsData, queueData, healthData] = await Promise.all([
        get("/api/v1/lcq/admin/stats"),
        get(`/api/v1/lcq/admin/queue${pipeline !== "all" ? `?pipeline=${pipeline}` : ""}`),
        get("/health"),
      ]);
      setStats(statsData);
      setQueue(queueData.items || []);
      setHealth(healthData);
    } catch (err) {
      console.error("[Dashboard] Load error:", err);
    }
  }, [get, pipeline]);

  const loadDestructionLog = useCallback(async () => {
    const data = await get("/api/v1/lcq/admin/destruction-log");
    setDestructionLog(data.log || []);
  }, [get]);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(intervalRef.current);
  }, [loadData]);

  useEffect(() => {
    if (tab === "log") loadDestructionLog();
  }, [tab, loadDestructionLog]);

  const handleAction = (type, item) => setModal({ type, item });

  const handleDestroy = async ({ notes, legalAuthority }) => {
    setLoading(true);
    try {
      const res = await post(`/api/v1/lcq/admin/destroy/${modal.item.id}`, { notes, legal_authority: legalAuthority });
      if (res.success) {
        showToast(`✓ Content destroyed — proof: ${res.destructionProof?.substring(0, 16)}…`);
        setModal(null);
        loadData();
      } else {
        showToast(`Error: ${res.error}`, "error");
      }
    } catch (err) {
      showToast(`Destruction failed: ${err.message}`, "error");
    }
    setLoading(false);
  };

  const handleRelease = async () => {
    if (!modal?.item) return;
    setLoading(true);
    try {
      const res = await post(`/api/v1/lcq/admin/release/${modal.item.id}`, {
        notes: "Admin review: content determined to be safe"
      });
      if (res.success) {
        showToast("✓ Content released — cleared for IPFS storage");
        setModal(null);
        loadData();
      } else {
        showToast(`Error: ${res.error}`, "error");
      }
    } catch (err) {
      showToast(`Release failed: ${err.message}`, "error");
    }
    setLoading(false);
  };

  const handleNCMEC = async () => {
    if (!modal?.item) return;
    setLoading(true);
    try {
      const res = await post(`/api/v1/lcq/admin/report-ncmec/${modal.item.id}`);
      showToast(res.status === "submitted"
        ? `✓ NCMEC report submitted: ${res.reportId}`
        : `⚠ Manual submission required — ${res.action_required || res.error}`
      , res.status === "submitted" ? "success" : "warning");
      setModal(null);
      loadData();
    } catch (err) {
      showToast(`NCMEC report failed: ${err.message}`, "error");
    }
    setLoading(false);
  };

  const handleLegalHold = async (hold) => {
    if (!modal?.item) return;
    try {
      await post(`/api/v1/lcq/admin/legal-hold/${modal.item.id}`, {
        hold, reason: "Placed by admin for attorney review"
      });
      showToast(hold ? "⚖ Legal hold placed — auto-destruction disabled" : "⚖ Legal hold removed");
      setModal(null);
      loadData();
    } catch (err) {
      showToast(`Legal hold failed: ${err.message}`, "error");
    }
  };

  const TABS = [
    { id: "queue", label: "⚠ Review Queue", count: queue.length },
    { id: "log",   label: "📋 Destruction Log" },
    { id: "setup", label: "⚙ Setup Guide" },
  ];

  const PIPELINES = ["all", "csam", "classified", "trade_secret", "fosta", "manual"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg0, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button { font-family: inherit; outline: none; }
      `}</style>

      {/* TOP BAR */}
      <div style={{
        background: C.bg1, borderBottom: `1px solid ${C.criticalBorder}`,
        padding: "10px 20px", display: "flex", justifyContent: "space-between",
        alignItems: "center", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.critical, letterSpacing: 2 }}>
              ⛔ LCQ ADMIN
            </div>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>
              LEGAL COMPLIANCE QUARANTINE
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ThreatDot level={health?.status === "ok" ? "safe" : "critical"} />
            <span style={{ fontSize: 9, color: health?.status === "ok" ? C.safe : C.critical }}>
              {health?.status === "ok" ? "SYSTEM ONLINE" : "SYSTEM ERROR"}
            </span>
          </div>
          {stats?.pending_review > 0 && (
            <div style={{
              padding: "3px 10px", background: C.criticalBg,
              border: `1px solid ${C.criticalBorder}`, borderRadius: 4,
              fontSize: 10, color: C.critical, fontWeight: 700,
              animation: "blink 1.5s ease infinite",
            }}>
              {stats.pending_review} AWAITING REVIEW
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={loadData} style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.dim, cursor: "pointer", fontSize: 10, padding: "5px 10px",
          }}>↻ Refresh</button>
          <button onClick={onLogout} style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.dim, cursor: "pointer", fontSize: 10, padding: "5px 10px",
          }}>← Logout</button>
        </div>
      </div>

      {/* STATS BAR */}
      {stats && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
          gap: 10, padding: "16px 20px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <StatCard label="Pending Review"    value={stats.pending_review}   color={stats.pending_review > 0 ? C.critical : C.safe} />
          <StatCard label="CSAM Detected"     value={stats.csam_detected}    color={C.critical} />
          <StatCard label="Classified"        value={stats.classified_detected} color={C.high} />
          <StatCard label="Trade Secrets"     value={stats.trade_secret_detected} color={C.medium} />
          <StatCard label="NCMEC Reports"     value={stats.ncmec_reports_filed} color={C.safe} />
          <StatCard label="Total Destroyed"   value={stats.total_destroyed}  color={C.dim} />
          <StatCard label="Released"          value={stats.total_released}   color={C.safe} />
          <StatCard label="Legal Holds"       value={stats.legal_holds_active} color={C.info} />
          {stats.overdue_for_destruction > 0 && (
            <StatCard label="OVERDUE DESTROY" value={stats.overdue_for_destruction} color={C.critical}
              sublabel="Auto-destroy in progress" />
          )}
        </div>
      )}

      {/* SYSTEM STATUS */}
      {health && (
        <div style={{
          margin: "0 20px 0",
          padding: "8px 14px",
          background: (!health.photodna_active || !health.ncmec_active) ? C.highBg : C.safeBg,
          border: `1px solid ${(!health.photodna_active || !health.ncmec_active) ? C.highBorder : C.safeBorder}`,
          borderRadius: 6, display: "flex", gap: 20, flexWrap: "wrap",
          marginTop: 12, fontSize: 10,
        }}>
          <span style={{ color: health.photodna_active ? C.safe : C.high }}>
            {health.photodna_active ? "✓" : "⚠"} PhotoDNA: {health.photodna_active ? "ACTIVE" : "NOT CONFIGURED — Get key at microsoft.com/research/photodna"}
          </span>
          <span style={{ color: health.ncmec_active ? C.safe : C.high }}>
            {health.ncmec_active ? "✓" : "⚠"} NCMEC: {health.ncmec_active ? "ACTIVE" : "NOT CONFIGURED — Register at missingkids.org/cybertipline"}
          </span>
          <span style={{ color: C.dim }}>
            Auto-destroy: every 15 min · Review window: 72h
          </span>
        </div>
      )}

      {/* TABS */}
      <div style={{
        display: "flex", gap: 0, padding: "12px 20px 0",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${C.critical}` : "2px solid transparent",
            color: tab === t.id ? C.critical : C.dim,
            cursor: "pointer", fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
            fontFamily: "monospace", letterSpacing: 0.5,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 9, padding: "1px 5px", background: C.criticalBg,
                border: `1px solid ${C.criticalBorder}`, borderRadius: 3,
                color: C.critical, fontWeight: 700,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: "16px 20px", maxWidth: 1200, margin: "0 auto" }}>

        {/* QUEUE TAB */}
        {tab === "queue" && (
          <div>
            {/* Pipeline filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {PIPELINES.map(p => (
                <button key={p} onClick={() => setPipeline(p)} style={{
                  padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                  fontFamily: "monospace", fontWeight: pipeline === p ? 700 : 400,
                  border: `1px solid ${pipeline === p ? pipelineColor(p) : C.border}`,
                  background: pipeline === p ? `${pipelineColor(p)}15` : "transparent",
                  color: pipeline === p ? pipelineColor(p) : C.dim,
                }}>
                  {p === "all" ? "ALL" : pipelineLabel(p)}
                </button>
              ))}
            </div>

            {queue.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 60, color: C.dim,
                border: `1px solid ${C.border}`, borderRadius: 8,
                background: C.bg2,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14, color: C.safe, fontWeight: 700 }}>
                  QUEUE CLEAR
                </div>
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  No content awaiting review
                </div>
              </div>
            ) : (
              queue.map(item => (
                <QueueItem
                  key={item.id}
                  item={item}
                  onAction={handleAction}
                  selected={selected?.id === item.id}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>
        )}

        {/* DESTRUCTION LOG TAB */}
        {tab === "log" && (
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
              Permanent legal compliance record. This log is append-only and cannot be deleted.
              All destruction events are permanently logged for federal compliance purposes.
            </div>
            {destructionLog.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
                No destruction events logged yet
              </div>
            ) : (
              destructionLog.map(entry => (
                <div key={entry.id} style={{
                  background: C.bg2, border: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${pipelineColor(entry.pipeline)}`,
                  borderRadius: 8, padding: "10px 14px", marginBottom: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>{pipelineIcon(entry.pipeline)}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "monospace" }}>
                        {pipelineLabel(entry.pipeline)}
                      </span>
                      <Badge color={pipelineColor(entry.pipeline)}>DESTROYED</Badge>
                      {entry.ncmec_reported === 1 && <Badge color={C.safe}>NCMEC REPORTED</Badge>}
                    </div>
                    <span style={{ fontSize: 10, color: C.dim }}>
                      {new Date(entry.destroyed_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: C.dim, fontFamily: "monospace", lineHeight: 1.6 }}>
                    Content: {entry.content_hash?.substring(0, 32)}…<br />
                    Proof: {entry.destruction_hash?.substring(0, 32)}…<br />
                    Method: {entry.destruction_method} · By: {entry.destroyed_by}
                    {entry.legal_authority ? ` · Authority: ${entry.legal_authority}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SETUP GUIDE TAB */}
        {tab === "setup" && (
          <div style={{ maxWidth: 700 }}>
            {[
              {
                step: "1",
                title: "Register with Microsoft PhotoDNA",
                color: C.critical,
                status: health?.photodna_active ? "ACTIVE" : "REQUIRED",
                content: [
                  "PhotoDNA scans every image/video against the NCMEC CSAM hash database.",
                  "URL: microsoft.com/en-us/research/project/photodna",
                  "Apply through Microsoft CTSOI (Child Trafficking and Exploitation Intelligence)",
                  "It's FREE for qualifying platforms — OFA qualifies",
                  "Processing time: 1-2 weeks for approval",
                  "Once approved, add PHOTODNA_API_KEY to your .env file",
                ],
              },
              {
                step: "2",
                title: "Register with NCMEC CyberTipline",
                color: C.high,
                status: health?.ncmec_active ? "ACTIVE" : "REQUIRED",
                content: [
                  "NCMEC reporting is required by federal law (18 U.S.C. § 2258A).",
                  "URL: www.missingkids.org/gethelpnow/cybertipline",
                  "Click 'Electronic Service Provider' registration",
                  "Processing time: 1-2 weeks",
                  "Once registered, add NCMEC_USERNAME and NCMEC_PASSWORD to .env",
                  "Without registration, you must manually submit reports — the system will alert you",
                ],
              },
              {
                step: "3",
                title: "Set Admin Token",
                color: C.medium,
                status: "REQUIRED",
                content: [
                  "Add LCQ_ADMIN_TOKEN to your .env file:",
                  "LCQ_ADMIN_TOKEN=your_very_long_random_secure_token",
                  "Generate one at: randomkeygen.com (Fort Knox password)",
                  "This is the only token that can access this dashboard",
                  "Never share it. Store it in your env.txt file on your computer only.",
                ],
              },
              {
                step: "4",
                title: "Add LCQ to your deployment",
                color: C.info,
                status: "REQUIRED",
                content: [
                  "Upload lcq-microservice.js to your GitHub repository",
                  "Add LCQ_PORT=3004 to your fly.toml services",
                  "Add to docker-compose.yml as a new service",
                  "Update gateway-service.js to call LCQ before IPFS storage",
                  "Test with: curl localhost:3004/health",
                ],
              },
            ].map(section => (
              <div key={section.step} style={{
                background: C.bg2, border: `1px solid ${C.border}`,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: 8, padding: 16, marginBottom: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.white, fontFamily: "monospace" }}>
                    Step {section.step}: {section.title}
                  </div>
                  <Badge color={section.status === "ACTIVE" ? C.safe : C.critical}>
                    {section.status}
                  </Badge>
                </div>
                {section.content.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, color: i === 0 ? C.text : C.dim, marginBottom: 4, lineHeight: 1.5 }}>
                    {i > 0 ? `› ${line}` : line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal?.type === "destroy" && (
        <DestroyModal
          item={modal.item}
          onConfirm={handleDestroy}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "release" && (
        <Modal title="✓ CONFIRM RELEASE" onClose={() => setModal(null)} width={440}>
          <div style={{
            padding: "10px 12px", background: C.safeBg,
            border: `1px solid ${C.safeBorder}`, borderRadius: 6,
            fontSize: 11, color: C.safe, lineHeight: 1.6, marginBottom: 16,
          }}>
            You are confirming that this content is NOT classified, not a trade secret,
            and not a FOSTA violation. It will be released for IPFS storage.
          </div>
          <div style={{ padding: "8px 10px", background: C.bg3, borderRadius: 6, fontSize: 10, color: C.text, fontFamily: "monospace", marginBottom: 16 }}>
            Pipeline: {pipelineLabel(modal.item.pipeline)}<br />
            Type: {modal.item.content_type}<br />
            ID: {modal.item.id.substring(0, 24)}…
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setModal(null)} color={C.dim} outline>Cancel</Btn>
            <Btn onClick={handleRelease} color={C.safe} disabled={loading} full>
              {loading ? "⏳ Releasing…" : "✓ CONFIRM RELEASE"}
            </Btn>
          </div>
        </Modal>
      )}

      {modal?.type === "ncmec" && (
        <Modal title="📋 SUBMIT NCMEC REPORT" onClose={() => setModal(null)} width={440}>
          <div style={{
            padding: "10px 12px", background: C.highBg,
            border: `1px solid ${C.highBorder}`, borderRadius: 6,
            fontSize: 11, color: C.high, lineHeight: 1.6, marginBottom: 16,
          }}>
            This will submit a CyberTipline report to NCMEC. Required by federal law
            within 24 hours of detecting CSAM. The report contains only metadata —
            no actual content is transmitted to NCMEC.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setModal(null)} color={C.dim} outline>Cancel</Btn>
            <Btn onClick={handleNCMEC} color={C.high} disabled={loading} full>
              {loading ? "⏳ Submitting…" : "📋 SUBMIT TO NCMEC"}
            </Btn>
          </div>
        </Modal>
      )}

      {modal?.type === "hold" && (
        <Modal title="⚖ LEGAL HOLD" onClose={() => setModal(null)} width={440}>
          <p style={{ fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 16 }}>
            A legal hold prevents automatic destruction of this content.
            Use this when your attorney needs to review the content before any action is taken.
            The content remains encrypted and inaccessible until you remove the hold.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setModal(null)} color={C.dim} outline>Cancel</Btn>
            <Btn onClick={() => handleLegalHold(true)} color={C.info} full>
              ⚖ PLACE LEGAL HOLD
            </Btn>
          </div>
        </Modal>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          padding: "12px 18px", borderRadius: 8,
          background: toast.type === "error" ? C.criticalBg : C.safeBg,
          border: `1px solid ${toast.type === "error" ? C.criticalBorder : C.safeBorder}`,
          color: toast.type === "error" ? C.critical : C.safe,
          fontSize: 11, fontFamily: "monospace", maxWidth: 400,
          boxShadow: `0 4px 24px ${toast.type === "error" ? C.critical : C.safe}22`,
          animation: "fadeIn 0.2s ease",
          zIndex: 300,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function LCQAdminDashboard() {
  const [adminToken, setAdminToken] = useState(
    typeof window !== "undefined" ? sessionStorage.getItem("lcq_admin_token") : null
  );

  const handleLogin = (token) => {
    sessionStorage.setItem("lcq_admin_token", token);
    setAdminToken(token);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("lcq_admin_token");
    setAdminToken(null);
  };

  if (!adminToken) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard adminToken={adminToken} onLogout={handleLogout} />;
}
