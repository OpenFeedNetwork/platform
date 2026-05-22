import { useState, useEffect, useCallback } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   GUARDIAN SHIELD COMPLIANCE DASHBOARD                           ║
 * ║   For Guardian Shield API customers                              ║
 * ║                                                                  ║
 * ║   Shows: scan statistics, risk breakdowns, compliance reports   ║
 * ║   usage tracking, and downloadable regulatory evidence          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const API_BASE = "https://guardian.openfeed.network";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C = {
  bg0:"#060B14", bg1:"#0A1220", bg2:"#0F1A2E", bg3:"#152038",
  green:"#00E676", greenDk:"#00C853", greenBg:"#001A0D",
  teal:"#00BCD4",  tealBg:"#001A1F",
  gold:"#FFD700",  goldBg:"#1A1400",
  red:"#FF5252",   redBg:"#1A0505",
  amber:"#FF8C00", amberBg:"#1A0E00",
  blue:"#4A9EFF",  blueBg:"#000F1A",
  white:"#F0F4FF", text:"#B8C4D8", dim:"#5A6B88",
  border:"#1A2840", border2:"#243058",
};

const riskColor = r => ({ none:C.green, low:C.teal, medium:C.gold, high:C.amber, critical:C.red, unknown:C.dim }[r] || C.dim);
const riskBg    = r => ({ none:C.greenBg, low:C.tealBg, medium:C.goldBg, high:C.amberBg, critical:C.redBg, unknown:C.bg2 }[r] || C.bg2);

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const Card = ({ children, style = {} }) => (
  <div style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "1rem", ...style,
  }}>{children}</div>
);

const StatCard = ({ label, value, sub, color = C.white, icon }) => (
  <div style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    borderTop: `3px solid ${color}`,
    borderRadius: 10, padding: "1rem",
    display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ fontSize: 11, color: C.dim, letterSpacing: 0.5 }}>{icon} {label}</div>
    <div style={{
      fontSize: 28, fontWeight: 700, color,
      fontFamily: "monospace", lineHeight: 1,
      textShadow: `0 0 20px ${color}44`,
    }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>}
  </div>
);

const Badge = ({ children, color }) => (
  <span style={{
    fontSize: 10, padding: "2px 8px", borderRadius: 4,
    fontFamily: "monospace", fontWeight: 700, letterSpacing: 0.5,
    background: `${color}18`, color, border: `1px solid ${color}44`,
  }}>{children}</span>
);

const Btn = ({ children, onClick, color = C.green, disabled, small, outline }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "5px 10px" : "8px 16px",
    background: disabled ? C.bg3 : outline ? "transparent" : `${color}18`,
    border: `1px solid ${disabled ? C.border : color}`,
    borderRadius: 6, color: disabled ? C.dim : color,
    fontFamily: "monospace", fontWeight: 700,
    fontSize: small ? 10 : 11, cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: 0.5, transition: "all 0.15s",
  }}>{children}</button>
);

const RiskBar = ({ label, value, total, color }) => {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.text }}>{label}</span>
        <span style={{ fontSize: 12, color, fontFamily:"monospace" }}>{value.toLocaleString()} ({pct}%)</span>
      </div>
      <div style={{ height: 6, background: C.bg3, borderRadius: 3, overflow:"hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition:"width 0.5s ease" }} />
      </div>
    </div>
  );
};

// ─── API CLIENT ───────────────────────────────────────────────────────────────

function useGuardianAPI(apiKey) {
  const call = useCallback(async (path) => {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    });
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  }, [apiKey]);
  return { call };
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function Login({ onLogin }) {
  const [key, setKey]     = useState("");
  const [err, setErr]     = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!key.trim()) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/usage`, {
        headers: { "x-api-key": key },
      });
      if (r.ok) { onLogin(key); }
      else { setErr("Invalid API key. Check your Guardian Shield dashboard."); }
    } catch {
      setErr(`Cannot connect to Guardian Shield API at ${API_BASE}`);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight:"100vh", background:C.bg0, display:"flex",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'JetBrains Mono',monospace", padding:20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,button{font-family:inherit;outline:none}
      `}</style>

      <div style={{ width:"100%", maxWidth:420, animation:"fadeIn 0.4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🛡</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.white, letterSpacing:2 }}>
            GUARDIAN SHIELD
          </div>
          <div style={{ fontSize:11, color:C.dim, letterSpacing:1, marginTop:4 }}>
            Compliance Dashboard
          </div>
          <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>
            Open Feed Network, Inc.
          </div>
        </div>

        <div style={{
          background:C.bg1, border:`1px solid ${C.border2}`,
          borderRadius:12, padding:24,
        }}>
          <div style={{ fontSize:9, color:C.dim, letterSpacing:1, marginBottom:6 }}>
            API KEY
          </div>
          <input
            type="password"
            value={key}
            onChange={e=>setKey(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            placeholder="gs_your_api_key_here"
            style={{
              width:"100%", background:C.bg3,
              border:`1px solid ${err?C.red:C.border}`,
              borderRadius:6, padding:"10px 12px",
              color:C.white, fontSize:12, marginBottom:12,
            }}
          />
          {err && (
            <div style={{
              padding:"8px 10px", background:C.redBg,
              border:`1px solid ${C.red}44`, borderRadius:6,
              fontSize:10, color:C.red, marginBottom:12, lineHeight:1.5,
            }}>{err}</div>
          )}
          <Btn onClick={handleLogin} disabled={loading||!key.trim()} color={C.green} full>
            {loading ? "⏳ Connecting..." : "🛡 Enter Dashboard"}
          </Btn>
          <div style={{ marginTop:14, fontSize:9, color:C.dim, textAlign:"center", lineHeight:1.6 }}>
            Don't have an API key?<br/>
            Sign up at guardian.openfeed.network
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

function Dashboard({ apiKey, onLogout }) {
  const { call }      = useGuardianAPI(apiKey);
  const [usage, setUsage]       = useState(null);
  const [report, setReport]     = useState(null);
  const [tab, setTab]           = useState("overview");
  const [month, setMonth]       = useState(new Date().toISOString().slice(0,7));
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [testResult, setTest]   = useState(null);
  const [testInput, setTestInput] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  const showToast = (msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsage = useCallback(async () => {
    try {
      const data = await call("/api/v1/usage");
      setUsage(data);
    } catch (err) {
      console.error(err);
    }
  }, [call]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call(`/api/v1/report/${month}`);
      setReport(data);
    } catch (err) {
      showToast("Failed to load report: " + err.message, "error");
    }
    setLoading(false);
  }, [call, month]);

  useEffect(() => { loadUsage(); }, [loadUsage]);
  useEffect(() => { if (tab === "report") loadReport(); }, [tab, loadReport]);

  const runTestScan = async () => {
    if (!testInput.trim()) return;
    setTestLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/scan/user`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test_user", bio: testInput, posts: [testInput] }),
      });
      const data = await r.json();
      setTest(data);
    } catch (err) {
      showToast("Test scan failed: " + err.message, "error");
    }
    setTestLoading(false);
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `guardian-shield-compliance-${month}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ Compliance report downloaded");
  };

  const usagePct = usage
    ? (usage.scans_limit === "unlimited" ? 0 : Math.round(usage.scans_used / (usage.scans_limit||1) * 100))
    : 0;

  const TABS = [
    { id:"overview", label:"📊 Overview"    },
    { id:"scan",     label:"🔍 Test Scanner" },
    { id:"report",   label:"📋 Compliance"  },
    { id:"docs",     label:"📖 Quick Start" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg0, color:C.text, fontFamily:"'JetBrains Mono',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button{font-family:inherit;outline:none}
        select{font-family:inherit;outline:none}
      `}</style>

      {/* TOP BAR */}
      <div style={{
        background:C.bg1, borderBottom:`1px solid ${C.border}`,
        padding:"10px 20px", display:"flex", justifyContent:"space-between",
        alignItems:"center", position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:18 }}>🛡</span>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:C.green, letterSpacing:1 }}>
              GUARDIAN SHIELD
            </div>
            <div style={{ fontSize:9, color:C.dim, letterSpacing:0.5 }}>
              Compliance Dashboard · {usage?.company || "Loading..."}
            </div>
          </div>
          {usage && (
            <div style={{
              padding:"3px 10px", background:`${C.green}18`,
              border:`1px solid ${C.green}44`, borderRadius:4,
              fontSize:10, color:C.green,
            }}>
              {usage.tier?.toUpperCase()} · {usage.price}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={loadUsage} style={{
            background:"none", border:`1px solid ${C.border}`, borderRadius:6,
            color:C.dim, cursor:"pointer", fontSize:10, padding:"5px 10px",
          }}>↻ Refresh</button>
          <button onClick={onLogout} style={{
            background:"none", border:`1px solid ${C.border}`, borderRadius:6,
            color:C.dim, cursor:"pointer", fontSize:10, padding:"5px 10px",
          }}>← Logout</button>
        </div>
      </div>

      {/* USAGE BAR */}
      {usage && (
        <div style={{
          background:C.bg1, borderBottom:`1px solid ${C.border}`,
          padding:"8px 20px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap",
        }}>
          <span style={{ fontSize:11, color:C.dim }}>
            Scans: <span style={{ color:C.white, fontWeight:700 }}>
              {usage.scans_used?.toLocaleString()}
            </span> / {usage.scans_limit === "unlimited" ? "∞" : usage.scans_limit?.toLocaleString()}
          </span>
          <div style={{ flex:1, maxWidth:200, height:6, background:C.bg3, borderRadius:3, overflow:"hidden" }}>
            <div style={{
              height:"100%", borderRadius:3,
              width:`${Math.min(usagePct,100)}%`,
              background: usagePct > 80 ? C.amber : C.green,
              transition:"width 0.5s",
            }} />
          </div>
          <span style={{ fontSize:11, color: usagePct > 80 ? C.amber : C.dim }}>
            {usagePct}% used this month
          </span>
          {usagePct > 80 && (
            <a href="https://guardian.openfeed.network/upgrade" style={{
              fontSize:10, color:C.gold, textDecoration:"none",
              border:`1px solid ${C.gold}44`, borderRadius:4, padding:"2px 8px",
            }}>↑ Upgrade</a>
          )}
        </div>
      )}

      {/* TABS */}
      <div style={{
        display:"flex", gap:0, padding:"0 20px",
        borderBottom:`1px solid ${C.border}`, background:C.bg1,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"10px 16px", background:"none", border:"none",
            borderBottom: tab===t.id ? `2px solid ${C.green}` : "2px solid transparent",
            color: tab===t.id ? C.green : C.dim,
            cursor:"pointer", fontSize:11, fontWeight:tab===t.id?700:400,
            fontFamily:"monospace", letterSpacing:0.3,
          }}>{t.label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding:"16px 20px", maxWidth:1100, margin:"0 auto" }}>

        {/* OVERVIEW TAB */}
        {tab === "overview" && usage && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{
              display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",
              gap:12, marginBottom:20,
            }}>
              <StatCard label="Scans This Month" value={usage.scans_used?.toLocaleString()} color={C.green} icon="📊"
                sub={`of ${usage.scans_limit === "unlimited" ? "unlimited" : usage.scans_limit?.toLocaleString()}`} />
              <StatCard label="Total Scans Ever" value={usage.scans_total_ever?.toLocaleString()||"0"} color={C.teal} icon="🔍" />
              <StatCard label="Current Tier" value={usage.tier?.toUpperCase()} color={C.gold} icon="⭐"
                sub={usage.price} />
              <StatCard label="Remaining" value={usage.scans_remaining === "unlimited" ? "∞" : usage.scans_remaining?.toLocaleString()} color={usagePct>80?C.amber:C.green} icon="📈" />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
              <Card>
                <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:14 }}>
                  Detection Layers
                </div>
                {[
                  { label:"Layer 1-3: Age + Profile + Behavior", color:C.green },
                  { label:"Layer 4: ZK Age Verification", color:C.teal },
                  { label:"Layer 5: Grooming Detection", color:C.amber },
                  { label:"Layer 6: CSAM PhotoDNA Screen", color:C.red },
                  { label:"Layer 7: Coordination Detection", color:C.blue },
                ].map((l,i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:10, marginBottom:10,
                  }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:l.color, boxShadow:`0 0 8px ${l.color}` }} />
                    <span style={{ fontSize:11, color:C.text }}>{l.label}</span>
                    <Badge color={C.green}>ACTIVE</Badge>
                  </div>
                ))}
              </Card>

              <Card>
                <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:14 }}>
                  Compliance Certifications
                </div>
                {[
                  { cert:"COPPA", desc:"Children's Online Privacy Protection Act", color:C.green },
                  { cert:"KOSA", desc:"Kids Online Safety Act", color:C.teal },
                  { cert:"GDPR-K", desc:"GDPR — Children's provisions", color:C.gold },
                  { cert:"GDPR", desc:"General Data Protection Regulation", color:C.blue },
                ].map((c,i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:10, marginBottom:10,
                    padding:"6px 10px", background:C.bg3, borderRadius:6,
                  }}>
                    <span style={{ fontSize:11, color:C.green, fontWeight:700, minWidth:60 }}>✓ {c.cert}</span>
                    <span style={{ fontSize:10, color:C.dim }}>{c.desc}</span>
                  </div>
                ))}
                <div style={{ marginTop:12, fontSize:10, color:C.dim, lineHeight:1.6 }}>
                  Zero PII collected during ZK verification.<br/>
                  All compliance reports legally admissible.
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TEST SCANNER TAB */}
        {tab === "scan" && (
          <div style={{ animation:"fadeIn 0.3s ease", maxWidth:700 }}>
            <div style={{ fontSize:13, color:C.dim, marginBottom:16, lineHeight:1.6 }}>
              Test the Guardian Shield API live. Enter a user bio or content sample to see how the detection layers respond.
            </div>

            <Card style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:C.dim, marginBottom:8 }}>
                TEST INPUT — User bio or content sample
              </div>
              <textarea
                value={testInput}
                onChange={e=>setTestInput(e.target.value)}
                placeholder="Enter a bio or content sample to analyze...&#10;Example: 'hi im in 8th grade, love minecraft, my parents said i can have social media now'"
                rows={4}
                style={{
                  width:"100%", background:C.bg3, border:`1px solid ${C.border}`,
                  borderRadius:6, padding:"10px 12px", color:C.white,
                  fontSize:12, resize:"vertical", marginBottom:12,
                }}
              />
              <Btn onClick={runTestScan} disabled={testLoading||!testInput.trim()} color={C.teal}>
                {testLoading ? "⏳ Scanning..." : "🔍 Run Test Scan"}
              </Btn>
            </Card>

            {testResult && (
              <Card style={{ animation:"fadeIn 0.3s ease" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.white }}>Scan Result</div>
                  <Badge color={riskColor(testResult.risk_level)}>
                    {testResult.risk_level?.toUpperCase()} RISK
                  </Badge>
                </div>

                <div style={{
                  display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16,
                }}>
                  {[
                    { label:"Minor Probability", value:`${testResult.minor_probability||0}%`, color:riskColor(testResult.risk_level) },
                    { label:"Age Estimate", value:testResult.age_estimate_range?.replace(/_/g," ")||"unknown", color:C.text },
                    { label:"Confidence", value:`${testResult.confidence||0}%`, color:C.teal },
                  ].map((s,i) => (
                    <div key={i} style={{ background:C.bg3, borderRadius:6, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, color:C.dim, marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontSize:18, fontWeight:700, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}>RECOMMENDED ACTION</div>
                  <div style={{
                    padding:"8px 12px", borderRadius:6,
                    background: riskBg(testResult.risk_level),
                    border: `1px solid ${riskColor(testResult.risk_level)}44`,
                    fontSize:13, fontWeight:700, color:riskColor(testResult.risk_level),
                  }}>
                    {testResult.recommended_action?.toUpperCase()}
                  </div>
                </div>

                {testResult.indicators_found?.length > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}>INDICATORS FOUND</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {testResult.indicators_found.map((ind,i) => (
                        <Badge key={i} color={C.amber}>{ind}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {testResult.reasoning && (
                  <div style={{
                    padding:"8px 12px", background:C.bg3, borderRadius:6,
                    fontSize:11, color:C.text, lineHeight:1.6,
                  }}>
                    <span style={{ color:C.dim }}>Reasoning: </span>{testResult.reasoning}
                  </div>
                )}

                <div style={{ marginTop:12, fontSize:9, color:C.dim }}>
                  Scan ID: {testResult.scan_id} · {testResult.processing_ms}ms · Guardian Shield API v1.0
                </div>
              </Card>
            )}
          </div>
        )}

        {/* COMPLIANCE REPORT TAB */}
        {tab === "report" && (
          <div style={{ animation:"fadeIn 0.3s ease", maxWidth:800 }}>
            <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
              <div style={{ fontSize:13, color:C.dim }}>Report month:</div>
              <input
                type="month"
                value={month}
                onChange={e=>setMonth(e.target.value)}
                style={{
                  background:C.bg3, border:`1px solid ${C.border}`,
                  borderRadius:6, padding:"6px 10px", color:C.white,
                  fontSize:12, fontFamily:"monospace",
                }}
              />
              <Btn onClick={loadReport} disabled={loading} color={C.teal} small>
                {loading ? "Loading..." : "Generate Report"}
              </Btn>
              {report && (
                <Btn onClick={downloadReport} color={C.green} small>
                  ↓ Download JSON
                </Btn>
              )}
            </div>

            {report && (
              <div style={{ animation:"fadeIn 0.3s ease" }}>
                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:4 }}>
                    {report.company} — {report.report_month}
                  </div>
                  <div style={{ fontSize:10, color:C.dim, marginBottom:16 }}>
                    Generated: {new Date(report.generated_at).toLocaleString()} · Report ID: {report.report_id}
                  </div>

                  <div style={{
                    display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:10, marginBottom:16,
                  }}>
                    {[
                      { label:"Total Scans", value:report.summary?.total_scans?.toLocaleString(), color:C.teal },
                      { label:"Minors Detected", value:report.summary?.minors_detected?.toLocaleString(), color:C.amber },
                      { label:"CSAM Detected", value:report.summary?.csam_detected?.toLocaleString(), color:C.red },
                      { label:"Grooming Flagged", value:report.summary?.grooming_detected?.toLocaleString(), color:C.gold },
                      { label:"Actions Taken", value:report.summary?.actions_taken?.toLocaleString(), color:C.green },
                      { label:"Detection Rate", value:report.summary?.detection_rate, color:C.blue },
                    ].map((s,i) => (
                      <div key={i} style={{ background:C.bg3, borderRadius:6, padding:"10px 12px" }}>
                        <div style={{ fontSize:9, color:C.dim, marginBottom:4 }}>{s.label}</div>
                        <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  <RiskBar label="Minors Detected" value={report.summary?.minors_detected||0}
                    total={report.summary?.total_scans||1} color={C.amber} />
                  <RiskBar label="CSAM Detected" value={report.summary?.csam_detected||0}
                    total={report.summary?.total_scans||1} color={C.red} />
                  <RiskBar label="Grooming Flagged" value={report.summary?.grooming_detected||0}
                    total={report.summary?.total_scans||1} color={C.gold} />
                </Card>

                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.white, marginBottom:10 }}>
                    Compliance Statement — For Regulatory Use
                  </div>
                  <div style={{
                    padding:"12px 14px", background:C.bg3, borderRadius:6,
                    fontSize:12, color:C.text, lineHeight:1.8,
                    border:`1px solid ${C.green}33`,
                  }}>
                    {report.compliance_statement}
                  </div>
                  <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
                    {report.certifications?.map(c => <Badge key={c} color={C.green}>{c}</Badge>)}
                  </div>
                  <div style={{ marginTop:10, fontSize:10, color:C.dim, lineHeight:1.6 }}>
                    {report.legal_note}
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* QUICK START TAB */}
        {tab === "docs" && (
          <div style={{ animation:"fadeIn 0.3s ease", maxWidth:750 }}>
            <div style={{ fontSize:13, color:C.dim, marginBottom:16 }}>
              Get Guardian Shield running in your platform in under 10 minutes.
            </div>

            {[
              {
                title:"1. Install the SDK",
                code:`# Copy guardian-shield-sdk.js into your project
# OR install when published to npm:
npm install guardian-shield-sdk`,
              },
              {
                title:"2. Scan a new user on registration",
                code:`import { GuardianShield } from "./guardian-shield-sdk.js";

const gs = new GuardianShield("gs_your_api_key_here");

// On user registration:
app.post("/register", async (req, res) => {
  const scan = await gs.fullRegistrationScan({
    user: {
      username:         req.body.username,
      bio:              req.body.bio,
      posts:            [],
      posting_hours:    [],
      account_age_days: 0,
    },
    profileImage: req.file?.buffer,
    profileMime:  req.file?.mimetype,
  });

  switch (scan.overall_action) {
    case "allow":
      return completeRegistration(req, res);
    case "verify":
      const session = await gs.startVerification({
        ageThreshold: 18,
        callbackUrl:  "https://yoursite.com/verify/complete",
      });
      return res.redirect(session.verification_url);
    case "restrict":
      return createRestrictedAccount(req, res);
    case "block":
      return res.status(403).json({ error: "Registration not permitted" });
  }
});`,
              },
              {
                title:"3. Scan conversations for grooming",
                code:`// Run on every message sent:
app.post("/messages", async (req, res) => {
  const { senderId, receiverId, content } = req.body;

  const scan = await gs.scanConversation({
    conversation: content,
    participants: [senderId, receiverId],
  });

  if (scan.grooming_detected && scan.risk_level === "critical") {
    await blockUser(senderId);
    await notifyModerators(scan);
    return res.status(403).json({ error: "Message blocked" });
  }

  await saveMessage(req.body);
  res.json({ sent: true });
});`,
              },
              {
                title:"4. Get your monthly compliance report",
                code:`// Generate at the end of each month:
const report = await gs.getComplianceReport("2026-07");

console.log(report.compliance_statement);
// "YourPlatform processed 45,231 scans in 2026-07.
//  23 potential minor accounts detected. 0 CSAM items
//  detected. COPPA/KOSA/GDPR-K compliant."

// Save as evidence for regulatory proceedings:
await fs.writeFile("compliance-2026-07.json",
  JSON.stringify(report, null, 2));`,
              },
            ].map((section, i) => (
              <Card key={i} style={{ marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:10 }}>
                  {section.title}
                </div>
                <pre style={{
                  background:C.bg3, borderRadius:6, padding:"12px 14px",
                  fontSize:11, color:C.text, overflowX:"auto",
                  lineHeight:1.6, fontFamily:"monospace",
                  border:`1px solid ${C.border}`,
                }}>{section.code}</pre>
              </Card>
            ))}

            <Card>
              <div style={{ fontSize:13, fontWeight:700, color:C.white, marginBottom:10 }}>
                Need help?
              </div>
              <div style={{ fontSize:12, color:C.text, lineHeight:1.8 }}>
                Full documentation: <span style={{ color:C.teal }}>guardian.openfeed.network/docs</span><br/>
                Support: <span style={{ color:C.teal }}>safety@openfeed.network</span><br/>
                GitHub: <span style={{ color:C.teal }}>github.com/OpenFeedNetwork/platform</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position:"fixed", bottom:20, right:20,
          padding:"12px 18px", borderRadius:8,
          background: toast.type==="error" ? C.redBg : C.greenBg,
          border:`1px solid ${toast.type==="error" ? C.red : C.green}44`,
          color: toast.type==="error" ? C.red : C.green,
          fontSize:11, fontFamily:"monospace", maxWidth:400,
          animation:"fadeIn 0.2s ease", zIndex:300,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function GuardianShieldDashboard() {
  const [apiKey, setApiKey] = useState(
    typeof window !== "undefined" ? sessionStorage.getItem("gs_api_key") : null
  );

  const handleLogin  = key => { sessionStorage.setItem("gs_api_key", key); setApiKey(key); };
  const handleLogout = ()  => { sessionStorage.removeItem("gs_api_key"); setApiKey(null); };

  if (!apiKey) return <Login onLogin={handleLogin} />;
  return <Dashboard apiKey={apiKey} onLogout={handleLogout} />;
}
