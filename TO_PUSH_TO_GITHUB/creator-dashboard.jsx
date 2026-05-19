import { useState, useEffect } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA CREATOR MONETIZATION DASHBOARD                            ║
 * ║   Open Feed Network, Inc.                                        ║
 * ║                                                                  ║
 * ║   Where creators manage their earnings, tiers,                  ║
 * ║   and revenue share from the platform.                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK = {
  creator: {
    display_name:     "Maria Gonzalez",
    tier:             "verified",
    stripe_onboarded: true,
    subscribers:      847,
    monthly_sub_revenue: "$4,235.00/month",
    earnings: {
      total:             "$12,847.50",
      from_tips:         "$3,200.00",
      from_subscriptions:"$8,470.00",
      from_api_share:    "$1,177.50",
    },
    subscription_tiers: [
      { id:"t1", name:"Supporter",  price_cents:500,  subscriber_count:512, benefits:["Early access","Monthly Q&A"] },
      { id:"t2", name:"Champion",   price_cents:1500, subscriber_count:287, benefits:["All Supporter perks","Direct messages","Exclusive content"] },
      { id:"t3", name:"Patron",     price_cents:5000, subscriber_count:48,  benefits:["All Champion perks","Monthly 1-on-1 call","Your name in credits"] },
    ],
    recent_tips: [
      { id:"tip1", amount_cents:1000, message:"Love your work!", created_at:"2026-05-18T10:23:00Z" },
      { id:"tip2", amount_cents:500,  message:"Thank you for the truth", created_at:"2026-05-18T09:15:00Z" },
      { id:"tip3", amount_cents:2000, message:"Keep going!", created_at:"2026-05-17T22:44:00Z" },
      { id:"tip4", amount_cents:1000, message:"",            created_at:"2026-05-17T18:30:00Z" },
      { id:"tip5", amount_cents:250,  message:"Small but from the heart", created_at:"2026-05-17T14:12:00Z" },
    ],
    recent_api_share: [
      { month:"2026-05", amount_cents:58750, quality_score:87.3 },
      { month:"2026-04", amount_cents:47200, quality_score:82.1 },
      { month:"2026-03", amount_cents:71800, quality_score:91.5 },
    ],
    platform_fees: { tips:"5%", subscriptions:"8%", brand_deals:"10%" },
    tax_note: "You will receive a 1099-NEC for this tax year",
  }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt  = cents => `$${(cents/100).toLocaleString("en-US", {minimumFractionDigits:2})}`;
const ago  = iso => {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60)    return `${Math.floor(d)}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background:"#0A1628",
      border:`1px solid #1E3A5F`,
      borderTop:`3px solid ${color}`,
      borderRadius:12, padding:"1.2rem",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:11, color:"#64748B", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:6 }}>
            {label.toUpperCase()}
          </div>
          <div style={{ fontSize:28, fontWeight:700, color, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>
            {value}
          </div>
          {sub && <div style={{ fontSize:11, color:"#475569", marginTop:6 }}>{sub}</div>}
        </div>
        <div style={{ fontSize:24 }}>{icon}</div>
      </div>
    </div>
  );
}

function TierCard({ tier, onEdit }) {
  const colors = ["#00C9B1","#F5A623","#E8547A"];
  const color  = colors[tier.id === "t1" ? 0 : tier.id === "t2" ? 1 : 2] || "#00C9B1";
  const monthly = tier.subscriber_count * tier.price_cents;

  return (
    <div style={{
      background:"#060E1A", border:`1px solid #1E3A5F`,
      borderLeft:`3px solid ${color}`,
      borderRadius:10, padding:"1rem", marginBottom:10,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:"#E2E8F0", fontFamily:"'Fraunces',serif" }}>{tier.name}</div>
          <div style={{ fontSize:22, fontWeight:700, color, fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>
            {fmt(tier.price_cents)}<span style={{ fontSize:12, color:"#64748B" }}>/month</span>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:20, fontWeight:700, color:"#E2E8F0", fontFamily:"'IBM Plex Mono',monospace" }}>
            {tier.subscriber_count.toLocaleString()}
          </div>
          <div style={{ fontSize:11, color:"#64748B" }}>subscribers</div>
        </div>
      </div>
      <div style={{ fontSize:11, color:"#475569", marginBottom:8 }}>
        Monthly revenue: <span style={{ color:"#00C9B1", fontWeight:600 }}>{fmt(monthly)}</span>
        <span style={{ color:"#475569" }}> · OFA keeps {fmt(Math.round(monthly * 0.08))}</span>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
        {(tier.benefits||[]).map((b,i) => (
          <span key={i} style={{
            fontSize:10, padding:"2px 8px", borderRadius:4,
            background:`${color}15`, color, border:`1px solid ${color}33`,
            fontFamily:"'IBM Plex Mono',monospace",
          }}>{b}</span>
        ))}
      </div>
    </div>
  );
}

function AddTierModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name:"", price:"", benefits:["","",""] });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
      backdropFilter:"blur(8px)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={onClose}>
      <div style={{
        background:"#060E1A", border:"1px solid #1E3A5F",
        borderRadius:16, width:"100%", maxWidth:480, padding:"1.5rem",
      }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.2rem" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#E2E8F0", fontFamily:"'Fraunces',serif" }}>
            New Subscription Tier
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>

        {[
          { label:"Tier Name", key:"name", placeholder:"e.g. Supporter, Champion, VIP" },
          { label:"Monthly Price (USD)", key:"price", placeholder:"e.g. 5.00" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:6 }}>
              {f.label.toUpperCase()}
            </div>
            <input value={form[f.key]}
              onChange={e=>set(f.key,e.target.value)}
              placeholder={f.placeholder}
              style={{ width:"100%", background:"#0A1628", border:"1px solid #1E3A5F",
                borderRadius:6, padding:"8px 10px", color:"#E2E8F0", fontSize:14, outline:"none" }}
            />
          </div>
        ))}

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:6 }}>
            BENEFITS (up to 3)
          </div>
          {form.benefits.map((b,i) => (
            <input key={i} value={b}
              onChange={e=>{ const nb=[...form.benefits]; nb[i]=e.target.value; set("benefits",nb); }}
              placeholder={`Benefit ${i+1}`}
              style={{ width:"100%", background:"#0A1628", border:"1px solid #1E3A5F",
                borderRadius:6, padding:"7px 10px", color:"#E2E8F0", fontSize:13,
                outline:"none", marginBottom:6 }}
            />
          ))}
        </div>

        {form.price && (
          <div style={{ padding:"10px 14px", background:"#00C9B115", border:"1px solid #00C9B133",
            borderRadius:8, marginBottom:14, fontSize:12, color:"#00C9B1" }}>
            You receive {fmt(Math.round(parseFloat(form.price||0)*100*0.92))} per subscriber per month
            (8% platform fee)
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"none",
            border:"1px solid #1E3A5F", borderRadius:8,
            color:"#475569", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace", fontSize:12,
          }}>CANCEL</button>
          <button onClick={()=>{ onSave(form); onClose(); }} style={{
            flex:2, padding:"10px",
            background:"#00C9B115", border:"1px solid #00C9B1",
            borderRadius:8, color:"#00C9B1", cursor:"pointer",
            fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700,
          }}>CREATE TIER →</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function CreatorDashboard() {
  const [data, setData]         = useState(MOCK.creator);
  const [tab, setTab]           = useState("earnings");
  const [showAddTier, setShowAddTier] = useState(false);
  const [toast, setToast]       = useState(null);

  const showToast = (msg, color="#00C9B1") => {
    setToast({msg,color});
    setTimeout(()=>setToast(null), 3500);
  };

  const totalSubs = data.subscription_tiers.reduce((s,t)=>s+t.subscriber_count,0);

  return (
    <div style={{
      minHeight:"100vh", background:"#030912",
      color:"#E2E8F0", fontFamily:"'IBM Plex Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#1E3A5F;border-radius:2px}
        input{font-family:inherit}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* HEADER */}
      <div style={{
        background:"#060E1A", borderBottom:"1px solid #0F2040",
        padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
        position:"sticky", top:0, zIndex:100,
      }}>
        <div>
          <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:2 }}>
            OPEN FEED NETWORK
          </div>
          <div style={{ fontSize:16, fontWeight:700, color:"#E2E8F0", fontFamily:"'Fraunces',serif" }}>
            Creator Dashboard
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            padding:"4px 12px", borderRadius:20,
            background: data.tier==="verified" ? "#00C9B115" : "#F5A62315",
            border:`1px solid ${data.tier==="verified" ? "#00C9B1" : "#F5A623"}`,
            fontSize:11, color: data.tier==="verified" ? "#00C9B1" : "#F5A623",
            fontFamily:"'IBM Plex Mono',monospace", fontWeight:700,
          }}>
            {data.tier==="verified" ? "✓ VERIFIED" : "STANDARD"}
          </div>
          <div style={{ fontSize:14, fontWeight:600, color:"#E2E8F0" }}>{data.display_name}</div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"16px 20px" }}>

        {/* STATS ROW */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10, marginBottom:20 }}>
          <StatCard label="Total Earned"       value={data.earnings.total}             color="#00C9B1" icon="💰" sub="All time" />
          <StatCard label="From Tips"          value={data.earnings.from_tips}         color="#4A9EFF" icon="💙" sub="Direct tips" />
          <StatCard label="From Subscriptions" value={data.earnings.from_subscriptions}color="#F5A623" icon="⭐" sub={`${totalSubs} subscribers`} />
          <StatCard label="API Revenue Share"  value={data.earnings.from_api_share}    color="#E8547A" icon="📡" sub="Your platform contribution" />
          <StatCard label="Monthly Revenue"    value={data.monthly_sub_revenue.split("/")[0]} color="#9B72CF" icon="📈" sub="Recurring subscriptions" />
        </div>

        {/* SETUP BANNER if not onboarded */}
        {!data.stripe_onboarded && (
          <div style={{
            padding:"14px 18px", background:"#F5A62315",
            border:"1px solid #F5A623", borderRadius:10, marginBottom:16,
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#F5A623" }}>
                ⚠ Complete your payment setup to start receiving earnings
              </div>
              <div style={{ fontSize:11, color:"#94A3B8", marginTop:4 }}>
                Connect your bank account via Stripe to receive tips and subscription payments
              </div>
            </div>
            <button onClick={()=>showToast("Stripe onboarding opens in new window")} style={{
              padding:"8px 16px", background:"#F5A623", border:"none",
              borderRadius:8, color:"#050F1E", cursor:"pointer",
              fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:700,
            }}>SETUP PAYMENTS →</button>
          </div>
        )}

        {/* TABS */}
        <div style={{ display:"flex", borderBottom:"1px solid #0F2040", marginBottom:16 }}>
          {[
            { id:"earnings",  label:"Earnings"      },
            { id:"tiers",     label:"Subscriptions" },
            { id:"tips",      label:"Tips"          },
            { id:"apishare",  label:"API Share"     },
          ].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"10px 16px", background:"none", border:"none",
              borderBottom: tab===t.id ? "2px solid #00C9B1" : "2px solid transparent",
              color: tab===t.id ? "#00C9B1" : "#475569",
              cursor:"pointer", fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
              fontWeight: tab===t.id ? 700 : 400, letterSpacing:0.5,
            }}>{t.label.toUpperCase()}</button>
          ))}
        </div>

        {/* EARNINGS TAB */}
        {tab==="earnings" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {/* Revenue breakdown */}
              <div style={{ background:"#060E1A", border:"1px solid #0F2040", borderRadius:12, padding:"1.2rem" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#94A3B8", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:14 }}>
                  REVENUE BREAKDOWN
                </div>
                {[
                  { label:"Subscriptions", value:data.earnings.from_subscriptions, color:"#F5A623", pct:66 },
                  { label:"Tips",          value:data.earnings.from_tips,          color:"#4A9EFF", pct:25 },
                  { label:"API Share",     value:data.earnings.from_api_share,     color:"#E8547A", pct:9  },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, color:"#94A3B8" }}>{row.label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:row.color, fontFamily:"'IBM Plex Mono',monospace" }}>{row.value}</span>
                    </div>
                    <div style={{ height:6, background:"#0D1B2A", borderRadius:999, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${row.pct}%`, background:row.color, borderRadius:999 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Platform fees */}
              <div style={{ background:"#060E1A", border:"1px solid #0F2040", borderRadius:12, padding:"1.2rem" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#94A3B8", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:14 }}>
                  PLATFORM FEES
                </div>
                {[
                  { type:"Tips",          fee:"5%",  keep:"95%", note:"vs YouTube's 45%" },
                  { type:"Subscriptions", fee:"8%",  keep:"92%", note:"vs Patreon's 12%" },
                  { type:"Brand Deals",   fee:"10%", keep:"90%", note:"vs agency's 30%" },
                ].map(row => (
                  <div key={row.type} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 0", borderBottom:"1px solid #0F2040",
                  }}>
                    <div>
                      <div style={{ fontSize:12, color:"#E2E8F0" }}>{row.type}</div>
                      <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{row.note}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#00C9B1", fontFamily:"'IBM Plex Mono',monospace" }}>
                        {row.keep} yours
                      </div>
                      <div style={{ fontSize:10, color:"#475569" }}>{row.fee} to OFA</div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop:14, padding:"10px", background:"#00C9B115", borderRadius:8,
                  border:"1px solid #00C9B133", fontSize:11, color:"#00C9B1", lineHeight:1.6 }}>
                  Plus 15% of monthly API revenue distributed to verified creators based on quality scores
                </div>
              </div>
            </div>

            {/* Tax notice */}
            <div style={{ marginTop:16, padding:"12px 14px", background:"#F5A62310",
              border:"1px solid #F5A62333", borderRadius:8, fontSize:12, color:"#F5A623" }}>
              📋 {data.tax_note}
            </div>
          </div>
        )}

        {/* SUBSCRIPTIONS TAB */}
        {tab==="tiers" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, color:"#94A3B8" }}>
                {totalSubs.toLocaleString()} total subscribers · {data.monthly_sub_revenue} recurring
              </div>
              <button onClick={()=>setShowAddTier(true)} style={{
                padding:"7px 14px", background:"#00C9B115",
                border:"1px solid #00C9B1", borderRadius:6,
                color:"#00C9B1", cursor:"pointer",
                fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:700,
              }}>+ ADD TIER</button>
            </div>
            {data.subscription_tiers.map(tier => (
              <TierCard key={tier.id} tier={tier} onEdit={()=>{}} />
            ))}
            <div style={{ marginTop:14, padding:"12px 14px", background:"#0A1628",
              border:"1px solid #1E3A5F", borderRadius:8, fontSize:11, color:"#64748B", lineHeight:1.7 }}>
              Subscribers are charged automatically each month. You receive payment directly to your bank account within 2-3 business days of each charge. OFA keeps 8%.
            </div>
          </div>
        )}

        {/* TIPS TAB */}
        {tab==="tips" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ marginBottom:14, padding:"12px 14px", background:"#4A9EFF10",
              border:"1px solid #4A9EFF33", borderRadius:8,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:"#4A9EFF" }}>
                Tips are sent directly to your Stripe account · 5% platform fee · 95% yours
              </div>
            </div>
            {data.recent_tips.map((tip,i) => (
              <div key={tip.id} style={{
                background:"#060E1A", border:"1px solid #0F2040",
                borderLeft:"3px solid #4A9EFF",
                borderRadius:10, padding:"1rem", marginBottom:8,
                display:"flex", justifyContent:"space-between", alignItems:"center",
                animation:`fadeIn 0.3s ease ${i*0.06}s both`,
              }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#4A9EFF", fontFamily:"'IBM Plex Mono',monospace" }}>
                    {fmt(tip.amount_cents)}
                  </div>
                  {tip.message && (
                    <div style={{ fontSize:12, color:"#94A3B8", marginTop:4, fontStyle:"italic" }}>
                      "{tip.message}"
                    </div>
                  )}
                </div>
                <div style={{ fontSize:11, color:"#475569", fontFamily:"'IBM Plex Mono',monospace" }}>
                  {ago(tip.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* API SHARE TAB */}
        {tab==="apishare" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ padding:"14px", background:"#E8547A10", border:"1px solid #E8547A33",
              borderRadius:10, marginBottom:16, lineHeight:1.7, fontSize:12, color:"#94A3B8" }}>
              <span style={{ color:"#E8547A", fontWeight:600 }}>API Revenue Share</span> — 15% of OFA's monthly API revenue is distributed to verified creators based on quality scores. Your score is calculated from content accuracy, genuine engagement, governance participation, and community mentorship. No follower count required. Quality is what earns.
            </div>

            {data.recent_api_share.map((share,i) => (
              <div key={i} style={{
                background:"#060E1A", border:"1px solid #0F2040",
                borderLeft:"3px solid #E8547A",
                borderRadius:10, padding:"1rem", marginBottom:10,
                animation:`fadeIn 0.3s ease ${i*0.08}s both`,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>
                      {share.month}
                    </div>
                    <div style={{ fontSize:24, fontWeight:700, color:"#E8547A", fontFamily:"'IBM Plex Mono',monospace" }}>
                      {fmt(share.amount_cents)}
                    </div>
                    <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>
                      From platform API revenue share pool
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>
                      QUALITY SCORE
                    </div>
                    <div style={{ fontSize:22, fontWeight:700, color:"#00C9B1", fontFamily:"'IBM Plex Mono',monospace" }}>
                      {share.quality_score}
                    </div>
                    <div style={{ height:6, background:"#0D1B2A", borderRadius:999, overflow:"hidden", width:80, marginTop:4 }}>
                      <div style={{ height:"100%", width:`${share.quality_score}%`, background:"#00C9B1", borderRadius:999 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop:16, background:"#060E1A", border:"1px solid #0F2040",
              borderRadius:10, padding:"1rem" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#94A3B8", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:12 }}>
                HOW YOUR QUALITY SCORE IS CALCULATED
              </div>
              {[
                { label:"Content Accuracy",           weight:"35%", color:"#4A9EFF", desc:"Truth Shield verification score on your content" },
                { label:"Genuine Engagement",         weight:"35%", color:"#F5A623", desc:"Real community response — not rage engagement" },
                { label:"Governance Participation",   weight:"20%", color:"#9B72CF", desc:"Voting on platform proposals and contributing to community decisions" },
                { label:"Community Mentorship",       weight:"10%", color:"#00C9B1", desc:"Helping new members, welcoming new voices" },
              ].map(row => (
                <div key={row.label} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                  <div style={{ width:40, textAlign:"right", fontSize:12, fontWeight:700, color:row.color, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0 }}>
                    {row.weight}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#E2E8F0" }}>{row.label}</div>
                    <div style={{ fontSize:10, color:"#475569" }}>{row.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ADD TIER MODAL */}
      {showAddTier && (
        <AddTierModal
          onClose={()=>setShowAddTier(false)}
          onSave={(tier)=>{
            showToast(`✓ ${tier.name} tier created — subscribers can now sign up`);
          }}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24,
          padding:"12px 18px", borderRadius:10,
          background:"#060E1A", border:`1px solid ${toast.color}44`,
          color:toast.color, fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
          animation:"fadeIn 0.2s ease", zIndex:300,
          boxShadow:`0 0 30px ${toast.color}22`,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
