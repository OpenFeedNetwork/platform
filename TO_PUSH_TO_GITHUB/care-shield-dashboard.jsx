import { useState, useEffect, useCallback } from "react";

/**
 * Care Shield Admin Dashboard
 * For The People's Voice Platform community team
 *
 * Shows flagged members who may need outreach
 * Allows the community team to send warm personal responses
 * Tracks outcomes — did the person respond? Are they okay?
 *
 * PRINCIPLE: This dashboard exists to help humans help humans.
 * The AI detects. The humans care.
 */

const API = "http://localhost:3006";

const C = {
  bg0:"#060B14", bg1:"#0A1220", bg2:"#0F1A2E", bg3:"#152038",
  green:"#00E676", greenBg:"#001A0D",
  teal:"#00BCD4",  tealBg:"#001A1F",
  gold:"#FFD700",  goldBg:"#1A1400",
  red:"#FF5252",   redBg:"#1A0505",
  amber:"#FF8C00", amberBg:"#1A0E00",
  blue:"#4A9EFF",  blueBg:"#000F1A",
  white:"#F0F4FF", text:"#B8C4D8", dim:"#5A6B88",
  border:"#1A2840",
  heart:"#FF6B9D",
};

const levelColor = l => [C.dim,C.teal,C.gold,C.amber,C.red][l] || C.dim;
const levelLabel = l => ["OK","Watchful","Elevated","High Distress","CRISIS"][l] || "Unknown";
const levelBg    = l => [C.bg2,C.tealBg,C.goldBg,C.amberBg,C.redBg][l] || C.bg2;

const RESOURCES = [
  { label:"988 Lifeline", value:"988", desc:"Call or text 988 — 24/7 real people", color:C.blue },
  { label:"Crisis Text", value:"crisis_text", desc:"Text HOME to 741741", color:C.green },
  { label:"988 Chat", value:"chat_988", desc:"988lifeline.org/chat", color:C.teal },
  { label:"NAMI Helpline", value:"nami", desc:"1-800-950-6264", color:C.gold },
];

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      background:C.bg2, border:`1px solid ${C.border}`,
      borderTop:`3px solid ${color}`, borderRadius:10, padding:"1rem",
    }}>
      <div style={{ fontSize:10, color:C.dim, marginBottom:4 }}>{label}</div>
      <div style={{
        fontSize:28, fontWeight:700, color,
        fontFamily:"monospace", lineHeight:1,
        textShadow:`0 0 20px ${color}44`,
      }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function MemberCard({ member, onRespond, onMarkOkay }) {
  const [expanded, setExpanded] = useState(false);
  const color = levelColor(member.signal_level);
  const bg    = levelBg(member.signal_level);
  const isCrisis = member.signal_level >= 4;

  return (
    <div style={{
      background: bg, border:`1px solid ${color}44`,
      borderLeft:`4px solid ${color}`,
      borderRadius:8, marginBottom:12, overflow:"hidden",
      animation: isCrisis ? "pulseBorder 2s ease infinite" : "none",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding:"12px 16px", cursor:"pointer",
          display:"flex", justifyContent:"space-between", alignItems:"center",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:10, height:10, borderRadius:"50%",
            background:color, boxShadow:`0 0 10px ${color}`,
            flexShrink:0,
            animation: isCrisis ? "blink 0.8s ease infinite" : "none",
          }} />
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.white, fontFamily:"monospace" }}>
                Member #{member.user_ref}
              </span>
              <span style={{
                fontSize:9, padding:"1px 7px", borderRadius:4,
                background:`${color}18`, color, border:`1px solid ${color}44`,
                fontFamily:"monospace", fontWeight:700,
              }}>
                {levelLabel(member.signal_level)}
              </span>
              {isCrisis && (
                <span style={{
                  fontSize:9, padding:"1px 7px", borderRadius:4,
                  background:C.redBg, color:C.red, border:`1px solid ${C.red}`,
                  fontWeight:700, animation:"blink 1s ease infinite",
                }}>
                  ⚡ IMMEDIATE
                </span>
              )}
            </div>
            <div style={{ fontSize:10, color:C.dim, fontFamily:"monospace" }}>
              Score: {member.crisis_score} · Layer: {member.layer_triggered} ·{" "}
              {new Date(member.created_at).toLocaleString()}
            </div>
          </div>
        </div>
        <span style={{ color:C.dim, fontSize:14 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding:"0 16px 16px" }}>
          {/* Signals */}
          {member.signals_found?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:C.dim, marginBottom:6 }}>SIGNALS DETECTED</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {member.signals_found.map((s, i) => (
                  <span key={i} style={{
                    fontSize:10, padding:"2px 8px", borderRadius:4,
                    background:`${color}15`, color, border:`1px solid ${color}33`,
                    fontFamily:"monospace",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Crisis resources */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.dim, marginBottom:8 }}>SHARE THESE RESOURCES</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {RESOURCES.map(r => (
                <div key={r.value} style={{
                  padding:"8px 10px", background:C.bg3, borderRadius:6,
                  border:`1px solid ${r.color}33`,
                }}>
                  <div style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.label}</div>
                  <div style={{ fontSize:10, color:C.dim }}>{r.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button
              onClick={() => onRespond(member, "reach")}
              style={{
                padding:"7px 14px", background:`${C.heart}18`,
                border:`1px solid ${C.heart}`, borderRadius:6,
                color:C.heart, fontFamily:"monospace", fontWeight:700,
                fontSize:10, cursor:"pointer",
              }}
            >
              💙 Send warm message
            </button>
            <button
              onClick={() => onRespond(member, "crisis")}
              style={{
                padding:"7px 14px", background:C.redBg,
                border:`1px solid ${C.red}`, borderRadius:6,
                color:C.red, fontFamily:"monospace", fontWeight:700,
                fontSize:10, cursor:"pointer",
              }}
            >
              🚨 Crisis response
            </button>
            <button
              onClick={() => onMarkOkay(member)}
              style={{
                padding:"7px 14px", background:C.greenBg,
                border:`1px solid ${C.green}44`, borderRadius:6,
                color:C.green, fontFamily:"monospace", fontWeight:700,
                fontSize:10, cursor:"pointer",
              }}
            >
              ✓ Mark as okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseModal({ member, type, onClose, adminToken }) {
  const [notes, setNotes]     = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const messages = {
    reach: `Hey 💙

I wanted to reach out personally because something you shared caught my attention — not to monitor you or judge you, but because this community genuinely cares about its members.

Whatever you're going through right now, I want you to know:

You are seen.
Your pain is real.
You deserve to still be here tomorrow.

If you want to talk — right here, right now — I'm listening. No scripts. Just a real person who gives a damn.

If you'd prefer to talk to someone confidentially right now, you can reach the 988 Suicide and Crisis Lifeline by calling or texting 988. Real people, 24/7.

— The People's Voice Platform Community Team`,

    crisis: `Friend 💙 — I see you right now, and I'm not going anywhere.

What you're feeling is real. The pain is real. And I need you to know that it can get better — even when it feels completely impossible.

Right now, please reach out to one of these:

🔵 Call or text 988 — Suicide and Crisis Lifeline
🟢 Text HOME to 741741 — Crisis Text Line
🟣 Chat at 988lifeline.org/chat

I'm also here. Reply to this message and I will respond personally.

You reached out to this community because part of you is still fighting. Please stay.

💙`,
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await fetch(`${API}/api/v1/care/admin/outcome/${member.id}`, {
        method:  "POST",
        headers: { "Content-Type":"application/json", "x-admin-token":adminToken },
        body:    JSON.stringify({ outcome:"outreach_sent", notes }),
      });
      setSent(true);
      setTimeout(() => onClose(), 2000);
    } catch(err) {
      console.error(err);
    }
    setSending(false);
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"#000000CC",
      backdropFilter:"blur(4px)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }}>
      <div style={{
        background:C.bg1, border:`1px solid ${C.border}`,
        borderRadius:12, width:"100%", maxWidth:560,
        maxHeight:"85vh", overflowY:"auto",
      }}>
        <div style={{
          padding:"12px 18px", borderBottom:`1px solid ${C.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center",
        }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.white, fontFamily:"monospace" }}>
            {type === "crisis" ? "🚨 Crisis Response" : "💙 Warm Outreach"}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        <div style={{ padding:18 }}>
          {sent ? (
            <div style={{
              textAlign:"center", padding:"30px 20px",
              color:C.green, fontSize:14, fontFamily:"monospace",
            }}>
              ✓ Outreach logged — Member #{member.user_ref} will receive warm support
            </div>
          ) : (
            <>
              <div style={{ fontSize:11, color:C.dim, marginBottom:8 }}>MESSAGE TEMPLATE</div>
              <div style={{
                padding:"12px 14px", background:C.bg3, borderRadius:6,
                fontSize:11, color:C.text, lineHeight:1.8, marginBottom:14,
                fontFamily:"Georgia, serif", whiteSpace:"pre-line",
                border:`1px solid ${type==="crisis" ? C.red : C.heart}33`,
              }}>
                {messages[type]}
              </div>

              <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}>YOUR NOTES (internal only)</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="What context do you have? What did you observe? (Not shared with member)"
                rows={3}
                style={{
                  width:"100%", background:C.bg3, border:`1px solid ${C.border}`,
                  borderRadius:6, padding:"8px 10px", color:C.text,
                  fontSize:11, resize:"vertical", marginBottom:14,
                }}
              />

              <div style={{
                padding:"10px 12px", background:C.greenBg,
                border:`1px solid ${C.green}33`, borderRadius:6,
                fontSize:10, color:C.green, lineHeight:1.6, marginBottom:14,
              }}>
                💙 Remember: the goal is for them to feel seen and heard — not processed or managed.
                Read their post again before sending. Personalize if you can.
                You don't have to follow the template exactly.
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={onClose} style={{
                  padding:"8px 16px", background:"none",
                  border:`1px solid ${C.border}`, borderRadius:6,
                  color:C.dim, fontFamily:"monospace", fontSize:11, cursor:"pointer",
                }}>Cancel</button>
                <button onClick={handleSend} disabled={sending} style={{
                  flex:1, padding:"8px 16px",
                  background: type==="crisis" ? C.redBg : `${C.heart}18`,
                  border:`1px solid ${type==="crisis" ? C.red : C.heart}`,
                  borderRadius:6,
                  color: type==="crisis" ? C.red : C.heart,
                  fontFamily:"monospace", fontWeight:700, fontSize:11, cursor:"pointer",
                }}>
                  {sending ? "⏳ Sending…" : type==="crisis" ? "🚨 Log Crisis Response" : "💙 Log Warm Outreach"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CareShieldDashboard() {
  const [adminToken, setAdminToken] = useState(
    typeof window !== "undefined" ? sessionStorage.getItem("care_admin_token") : null
  );
  const [data, setData]       = useState(null);
  const [modal, setModal]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [loginErr, setLoginErr]     = useState(null);

  const loadDashboard = useCallback(async (token) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/care/admin/dashboard`, {
        headers: { "x-admin-token": token || adminToken },
      });
      if (r.ok) {
        setData(await r.json());
      } else {
        setLoginErr("Invalid admin token");
        setAdminToken(null);
      }
    } catch {
      setLoginErr(`Cannot connect to Care Shield at ${API}`);
    }
    setLoading(false);
  }, [adminToken]);

  useEffect(() => {
    if (adminToken) loadDashboard();
  }, [adminToken, loadDashboard]);

  const handleLogin = async () => {
    if (!loginToken.trim()) return;
    try {
      const r = await fetch(`${API}/api/v1/care/admin/dashboard`, {
        headers: { "x-admin-token": loginToken },
      });
      if (r.ok) {
        sessionStorage.setItem("care_admin_token", loginToken);
        setAdminToken(loginToken);
        setData(await r.json());
      } else {
        setLoginErr("Invalid token");
      }
    } catch { setLoginErr(`Cannot connect to ${API}`); }
  };

  if (!adminToken) return (
    <div style={{
      minHeight:"100vh", background:C.bg0,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'JetBrains Mono',monospace", padding:20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button{font-family:inherit;outline:none}
      `}</style>
      <div style={{ width:"100%", maxWidth:400, animation:"fadeIn 0.4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>💙</div>
          <div style={{ fontSize:20, fontWeight:800, color:C.white }}>Care Shield</div>
          <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>Community Care Dashboard</div>
          <div style={{ fontSize:11, color:C.dim }}>The People's Voice Platform</div>
        </div>
        <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:12, padding:24 }}>
          <div style={{
            padding:"10px 12px", background:C.greenBg,
            border:`1px solid ${C.green}33`, borderRadius:6,
            fontSize:10, color:C.green, lineHeight:1.6, marginBottom:16,
          }}>
            This dashboard is for community team members who respond to members in distress.
            Your warmth and care are the most important tools here.
          </div>
          <div style={{ fontSize:9, color:C.dim, letterSpacing:1, marginBottom:6 }}>ADMIN TOKEN</div>
          <input
            type="password" value={loginToken}
            onChange={e => setLoginToken(e.target.value)}
            onKeyDown={e => e.key==="Enter" && handleLogin()}
            placeholder="Enter CARE_SHIELD_ADMIN_TOKEN"
            style={{
              width:"100%", background:C.bg3,
              border:`1px solid ${loginErr?C.red:C.border}`, borderRadius:6,
              padding:"10px 12px", color:C.white, fontSize:12, marginBottom:12,
            }}
          />
          {loginErr && <div style={{ color:C.red, fontSize:10, marginBottom:10 }}>{loginErr}</div>}
          <button onClick={handleLogin} disabled={!loginToken.trim()} style={{
            width:"100%", padding:"10px", background:`${C.heart}18`,
            border:`1px solid ${C.heart}`, borderRadius:6, color:C.heart,
            fontFamily:"monospace", fontWeight:700, fontSize:12, cursor:"pointer",
          }}>
            💙 Enter Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{
      minHeight:"100vh", background:C.bg0, display:"flex",
      alignItems:"center", justifyContent:"center",
      color:C.dim, fontFamily:"monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes pulseBorder{0%,100%{box-shadow:0 0 0 0 rgba(255,82,82,0)}50%{box-shadow:0 0 0 4px rgba(255,82,82,0.15)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button{font-family:inherit;outline:none}
      `}</style>
      {loading ? "💙 Loading…" : "No data"}
    </div>
  );

  const crisis      = data.flagged_members?.filter(m => m.signal_level >= 4) || [];
  const highDistress= data.flagged_members?.filter(m => m.signal_level === 3) || [];
  const elevated    = data.flagged_members?.filter(m => m.signal_level === 2) || [];

  return (
    <div style={{ minHeight:"100vh", background:C.bg0, color:C.text, fontFamily:"'JetBrains Mono',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes pulseBorder{0%,100%{box-shadow:0 0 0 0 rgba(255,82,82,0)}50%{box-shadow:0 0 0 4px rgba(255,82,82,0.15)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E2840;border-radius:2px}
        input,textarea,button{font-family:inherit;outline:none}
      `}</style>

      {/* TOP BAR */}
      <div style={{
        background:C.bg1, borderBottom:`1px solid ${C.border}`,
        padding:"10px 20px", display:"flex", justifyContent:"space-between",
        alignItems:"center", position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>💙</span>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:C.heart, letterSpacing:1 }}>
              CARE SHIELD
            </div>
            <div style={{ fontSize:9, color:C.dim }}>
              Community Care Dashboard · The People's Voice Platform
            </div>
          </div>
          {crisis.length > 0 && (
            <div style={{
              padding:"3px 10px", background:C.redBg,
              border:`1px solid ${C.red}`, borderRadius:4,
              fontSize:10, color:C.red, fontWeight:700,
              animation:"blink 1.5s ease infinite",
            }}>
              {crisis.length} CRISIS ALERT{crisis.length > 1 ? "S" : ""}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => loadDashboard()} style={{
            background:"none", border:`1px solid ${C.border}`, borderRadius:6,
            color:C.dim, cursor:"pointer", fontSize:10, padding:"5px 10px",
          }}>↻ Refresh</button>
          <button onClick={() => { sessionStorage.removeItem("care_admin_token"); setAdminToken(null); }} style={{
            background:"none", border:`1px solid ${C.border}`, borderRadius:6,
            color:C.dim, cursor:"pointer", fontSize:10, padding:"5px 10px",
          }}>← Logout</button>
        </div>
      </div>

      <div style={{ padding:"16px 20px", maxWidth:1000, margin:"0 auto" }}>

        {/* STATS */}
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",
          gap:10, marginBottom:20,
        }}>
          <StatCard label="Crisis (24h)"      value={data.summary?.crisis_24h||0}        color={C.red}   sub="Immediate response needed" />
          <StatCard label="High Distress (24h)"value={data.summary?.high_distress_24h||0} color={C.amber} sub="Personal outreach needed" />
          <StatCard label="Elevated (24h)"     value={data.summary?.elevated_24h||0}      color={C.gold}  sub="Gentle check-in" />
          <StatCard label="Total Scans (24h)"  value={data.summary?.total_scans_24h||0}   color={C.teal}  sub="Posts watched over" />
          <StatCard label="Silence Alerts"     value={data.silence_alerts||0}             color={C.amber} sub="Went quiet after distress" />
        </div>

        {/* CRISIS RESOURCES BAR */}
        <div style={{
          padding:"10px 16px", background:C.greenBg,
          border:`1px solid ${C.green}33`, borderRadius:8,
          display:"flex", gap:20, flexWrap:"wrap", marginBottom:20, fontSize:11,
        }}>
          <span style={{ color:C.green, fontWeight:700 }}>Crisis Resources:</span>
          <span style={{ color:C.white }}>📞 988 Lifeline — call or text 988</span>
          <span style={{ color:C.white }}>💬 Crisis Text — text HOME to 741741</span>
          <span style={{ color:C.white }}>🌐 988lifeline.org/chat</span>
          <span style={{ color:C.white }}>📞 NAMI — 1-800-950-6264</span>
        </div>

        {/* MISSION REMINDER */}
        <div style={{
          padding:"12px 16px", background:C.bg2,
          border:`1px solid ${C.heart}22`, borderRadius:8, marginBottom:20,
          fontSize:11, color:C.text, lineHeight:1.7, fontFamily:"Georgia, serif",
          borderLeft:`4px solid ${C.heart}`,
        }}>
          💙 <em>"On my darkest day I just wished for someone to see me, validate my pain, and help me survive another day."</em>
          <span style={{ color:C.dim }}> — Ronny, Founder</span>
          <br />
          <span style={{ color:C.dim, fontSize:10 }}>
            Every person in this queue is a real human going through something real. Read before you respond. Be a person, not a process.
          </span>
        </div>

        {/* CRISIS MEMBERS */}
        {crisis.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{
              fontSize:14, fontWeight:700, color:C.red, marginBottom:12,
              display:"flex", alignItems:"center", gap:8,
            }}>
              <span style={{ animation:"blink 0.8s ease infinite" }}>⚡</span>
              Crisis — Respond Now ({crisis.length})
            </div>
            {crisis.map(m => (
              <MemberCard key={m.id} member={m}
                onRespond={(member, type) => setModal({ member, type })}
                onMarkOkay={member => { /* mark okay */ }} />
            ))}
          </div>
        )}

        {/* HIGH DISTRESS */}
        {highDistress.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:12 }}>
              ⚠ High Distress — Personal Outreach Needed ({highDistress.length})
            </div>
            {highDistress.map(m => (
              <MemberCard key={m.id} member={m}
                onRespond={(member, type) => setModal({ member, type })}
                onMarkOkay={member => { /* mark okay */ }} />
            ))}
          </div>
        )}

        {/* ELEVATED */}
        {elevated.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.gold, marginBottom:12 }}>
              Elevated — Gentle Check-in ({elevated.length})
            </div>
            {elevated.map(m => (
              <MemberCard key={m.id} member={m}
                onRespond={(member, type) => setModal({ member, type })}
                onMarkOkay={member => { /* mark okay */ }} />
            ))}
          </div>
        )}

        {crisis.length === 0 && highDistress.length === 0 && elevated.length === 0 && (
          <div style={{
            textAlign:"center", padding:"60px 20px",
            border:`1px solid ${C.border}`, borderRadius:8, background:C.bg2,
          }}>
            <div style={{ fontSize:32, marginBottom:12 }}>💙</div>
            <div style={{ fontSize:14, color:C.green, fontWeight:700 }}>
              All clear — No members in distress right now
            </div>
            <div style={{ fontSize:11, color:C.dim, marginTop:8 }}>
              Care Shield is watching over your community. Last scan: {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <ResponseModal
          member={modal.member}
          type={modal.type}
          adminToken={adminToken}
          onClose={() => { setModal(null); loadDashboard(); }}
        />
      )}
    </div>
  );
}
