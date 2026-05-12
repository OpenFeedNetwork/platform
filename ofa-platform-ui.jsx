import { useState, useEffect, useRef } from "react";

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg0:      "#080A0F",
  bg1:      "#0D1017",
  bg2:      "#131720",
  bg3:      "#1A2030",
  border:   "#1E2535",
  border2:  "#252D40",
  green:    "#00E676",
  greenDim: "#00C853",
  cyan:     "#00BCD4",
  blue:     "#1F6FEB",
  blueSoft: "#79C0FF",
  amber:    "#FFB300",
  red:      "#FF5252",
  purple:   "#CE93D8",
  text:     "#CDD5E0",
  textDim:  "#6B7A99",
  textMuted:"#3D4A63",
  white:    "#EAEEF5",
};

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_POSTS = [
  { id:1, author:"Maria Chen", handle:"@mariachen", avatar:"MC", color:"#e74c3c", type:"article", content:"THREAD: After 8 months of FOIA requests, I've obtained internal EPA documents showing three municipal water systems falsified lead testing results before public release. The documents show city officials knew about contamination levels 4x above the legal limit. Full thread with documents attached.", tags:["environment","accountability","public health"], time:"2h", likes:5621, shares:3200, comments:892, ts_verdict:"legitimate", ts_score:94, public_interest:98, suppressed:true, flags:["sensitive_topic","health_misinformation_review"], ipfs:"QmTruth1abc" },
  { id:2, author:"Devon Williams", handle:"@devonw", avatar:"DW", color:"#3498db", type:"document", content:"City council voted 7-0 last night to approve a rezoning plan that will displace 3 affordable housing complexes — 847 units, 2,100+ residents. Zero local news coverage. Here is the full meeting transcript and zoning map.", tags:["housing","local gov","accountability"], time:"4h", likes:2890, shares:1900, comments:445, ts_verdict:"legitimate", ts_score:91, public_interest:96, suppressed:true, flags:["low_follower_account"], ipfs:"QmTruth2def" },
  { id:3, author:"Rafael Moreno", handle:"@rafaelm", avatar:"RM", color:"#9b59b6", type:"data", content:"New peer-reviewed study published: Algorithmic suppression of labor organizing content across major social platforms. Analysis of 4.2 million posts shows content mentioning unions, strikes, or collective bargaining receives 67% less algorithmic distribution than similar non-labor content.", tags:["research","labor","algorithms"], time:"6h", likes:4100, shares:3800, comments:770, ts_verdict:"legitimate", ts_score:97, public_interest:95, suppressed:true, flags:["labor_content","sensitive_topic"], ipfs:"QmTruth3ghi" },
  { id:4, author:"Priya Nair", handle:"@priyanair", avatar:"PN", color:"#27ae60", type:"text", content:"Something I haven't seen covered anywhere: the pharmaceutical lobbying disclosure filings from last quarter show a 340% increase in spending targeting FDA advisory panel members specifically. This is documented public record — FDA FOIA response attached.", tags:["health","lobbying","policy"], time:"8h", likes:3200, shares:2100, comments:560, ts_verdict:"legitimate", ts_score:89, public_interest:93, suppressed:false, flags:[], ipfs:"QmTruth4jkl" },
  { id:5, author:"Sponsored", handle:"@brandpartner", avatar:"AD", color:"#555", type:"link", content:"✨ Transform your life with our premium AI wellness program! Join 50,000+ happy customers. Limited time 70% off!", tags:["ad","wellness"], time:"1h", likes:32, shares:8, comments:3, ts_verdict:"opinion", ts_score:40, public_interest:5, suppressed:false, flags:[], isAd:true, ipfs:null },
  { id:6, author:"Aisha Okafor", handle:"@aishaokafor", avatar:"AO", color:"#e67e22", type:"video", content:"Documenting: Protest at the state capitol today — police used crowd dispersal tactics against a peaceful permitted march. Raw footage, no edits. 47 minutes of continuous recording.", tags:["civil rights","journalism","police"], time:"3h", likes:7800, shares:5600, comments:1240, ts_verdict:"legitimate", ts_score:96, public_interest:97, suppressed:true, flags:["sensitive_topic","police_content"], ipfs:"QmTruth5mno" },
];

const CONTENT_TYPES = ["text","article","image","video","audio","data","link","poll","thread","document"];

const TYPE_ICONS = { text:"📝", article:"📰", image:"🖼", video:"🎥", audio:"🎙", data:"📊", link:"🔗", poll:"📋", thread:"🧵", document:"📁" };

const VERDICT_CONFIG = {
  legitimate:     { label:"✓ Verified Legitimate", color:T.green,  bg:"#00E67615" },
  disinformation: { label:"⚠ Disinformation",       color:T.red,   bg:"#FF525215" },
  unverified:     { label:"◉ Unverified",            color:T.amber, bg:"#FFB30015" },
  satire:         { label:"◎ Satire / Parody",       color:T.purple,bg:"#CE93D815" },
  opinion:        { label:"◈ Opinion",               color:T.cyan,  bg:"#00BCD415" },
};

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function Avatar({ initials, color, size = 38 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:color,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize: size < 34 ? 10 : 12, fontWeight:700, color:"#fff",
      fontFamily:"monospace", flexShrink:0, border:`2px solid ${color}44` }}>
      {initials}
    </div>
  );
}

function TruthBadge({ verdict, score }) {
  if (!verdict) return null;
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.unverified;
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6,
      background:cfg.bg, border:`1px solid ${cfg.color}44`,
      borderRadius:20, padding:"3px 10px", fontSize:10, color:cfg.color,
      fontFamily:"monospace", fontWeight:600 }}>
      {cfg.label}
      {score && <span style={{ opacity:0.7 }}>· {score}%</span>}
    </div>
  );
}

function SuppressionAlert({ flags }) {
  if (!flags?.length) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6,
      fontSize:10, color:T.amber, fontFamily:"monospace" }}>
      <span>⚠</span>
      <span>Platform tried to suppress: [{flags.join(", ")}] — OFA overrode</span>
    </div>
  );
}

function PostCard({ post, animDelay = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const isAd = post.isAd;

  return (
    <div style={{
      background:T.bg2, border:`1px solid ${isAd ? T.textMuted : T.border}`,
      borderLeft:`3px solid ${isAd ? T.textMuted : (post.ts_verdict === "legitimate" ? T.green : T.amber)}`,
      borderRadius:10, padding:"14px 16px", marginBottom:10,
      opacity: isAd ? 0.6 : 1,
      animation:`fadeSlideIn 0.4s ease ${animDelay}s both`,
      transition:"border-color 0.2s",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Avatar initials={post.avatar} color={post.color} />
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:T.white }}>{post.author}</div>
            <div style={{ fontSize:11, color:T.textDim }}>{post.handle} · {post.time} · {TYPE_ICONS[post.type]} {post.type}</div>
          </div>
        </div>
        {post.ipfs && (
          <div style={{ fontSize:9, color:T.textMuted, fontFamily:"monospace", textAlign:"right" }}>
            <div style={{ color:T.green }}>◆ IPFS</div>
            <div>{post.ipfs.substring(0, 12)}…</div>
          </div>
        )}
      </div>

      <p style={{ fontSize:13, color:T.text, lineHeight:1.6, margin:"0 0 10px" }}>
        {expanded || post.content.length < 200 ? post.content : post.content.substring(0,200) + "…"}
        {post.content.length >= 200 && (
          <button onClick={() => setExpanded(!expanded)}
            style={{ background:"none", border:"none", color:T.blueSoft, cursor:"pointer", fontSize:12, marginLeft:4 }}>
            {expanded ? "less" : "more"}
          </button>
        )}
      </p>

      <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center", marginBottom:8 }}>
        {post.tags.map(t => (
          <span key={t} style={{ fontSize:10, background:T.bg3, color:T.textDim,
            padding:"2px 8px", borderRadius:10, border:`1px solid ${T.border}` }}>#{t}</span>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:16, fontSize:12, color:T.textDim }}>
          <span>❤️ {post.likes.toLocaleString()}</span>
          <span>🔁 {post.shares.toLocaleString()}</span>
          <span>💬 {post.comments.toLocaleString()}</span>
        </div>
        <TruthBadge verdict={post.ts_verdict} score={post.ts_score} />
      </div>

      {post.suppressed && <SuppressionAlert flags={post.flags} />}
    </div>
  );
}

function ComposePanel({ onClose }) {
  const [type, setType] = useState("text");
  const [content, setContent] = useState("");
  const [tier, setTier] = useState("standard");
  const [tags, setTags] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    if (!content.trim()) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system:`You are Truth Shield analyzing content before it is published to the Open Feed Platform. Analyze the content for disinformation signals, public interest value, and source credibility. Respond only in JSON: {"verdict":"legitimate|disinformation|unverified|satire|opinion","confidence":0-100,"public_interest_score":0-100,"suppression_justified":false,"context_label":null,"reasoning":"one sentence","recommended_action":"publish|label|review"}`,
          messages:[{ role:"user", content:`Content type: ${type}\nTier: ${tier}\nContent: "${content}"\nTags: ${tags}` }]
        })
      });
      const data = await resp.json();
      const raw = data.content?.find(b => b.type === "text")?.text || "{}";
      setResult(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch(e) {
      setResult({ verdict:"unverified", confidence:50, public_interest_score:50, suppression_justified:false, reasoning:"Analysis unavailable — content will be reviewed after posting.", recommended_action:"publish" });
    }
    setAnalyzing(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000CC", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:T.bg1, border:`1px solid ${T.border2}`, borderRadius:14, width:"100%", maxWidth:620, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:T.white, fontFamily:"monospace" }}>◆ NEW POST</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.textDim, cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        <div style={{ padding:20 }}>
          {/* Account tier */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textDim, fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>ACCOUNT TIER</div>
            <div style={{ display:"flex", gap:8 }}>
              {["standard","anonymous","whistleblower"].map(t => (
                <button key={t} onClick={() => setTier(t)} style={{
                  flex:1, padding:"8px 4px", borderRadius:6, cursor:"pointer", fontSize:11,
                  fontFamily:"monospace", fontWeight:600, border:`1px solid ${tier===t ? T.green : T.border}`,
                  background: tier===t ? `${T.green}15` : T.bg2,
                  color: tier===t ? T.green : T.textDim
                }}>
                  {t==="standard" ? "👤 Standard" : t==="anonymous" ? "🎭 Anonymous" : "🔒 Whistleblower"}
                </button>
              ))}
            </div>
            {tier === "whistleblower" && (
              <div style={{ marginTop:8, fontSize:10, color:T.amber, fontFamily:"monospace", padding:"6px 10px", background:"#FFB30010", borderRadius:6, border:`1px solid ${T.amber}33` }}>
                ⚠ E2E encrypted · Anonymous routing · Recommend Tor Browser
              </div>
            )}
          </div>

          {/* Content type */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textDim, fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>CONTENT TYPE</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {CONTENT_TYPES.map(ct => (
                <button key={ct} onClick={() => setType(ct)} style={{
                  padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:11,
                  border:`1px solid ${type===ct ? T.cyan : T.border}`,
                  background: type===ct ? `${T.cyan}15` : T.bg2,
                  color: type===ct ? T.cyan : T.textDim, fontFamily:"monospace"
                }}>
                  {TYPE_ICONS[ct]} {ct}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:T.textDim, fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>CONTENT</div>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={`What's your ${type}? Be specific — Truth Shield rewards verifiable claims...`}
              style={{ width:"100%", minHeight:120, background:T.bg3, border:`1px solid ${T.border}`,
                borderRadius:8, padding:12, color:T.text, fontSize:13, fontFamily:"inherit",
                resize:"vertical", outline:"none", lineHeight:1.6, boxSizing:"border-box" }} />
            <div style={{ fontSize:10, color:T.textMuted, textAlign:"right", marginTop:4 }}>
              {content.length}/10000
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textDim, fontFamily:"monospace", marginBottom:6, letterSpacing:1 }}>TAGS (comma separated)</div>
            <input value={tags} onChange={e => setTags(e.target.value)}
              placeholder="accountability, local-gov, environment..."
              style={{ width:"100%", background:T.bg3, border:`1px solid ${T.border}`,
                borderRadius:8, padding:"10px 12px", color:T.text, fontSize:13,
                fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
          </div>

          {/* Truth Shield pre-analysis */}
          {result && (
            <div style={{ marginBottom:16, background:T.bg3, border:`1px solid ${VERDICT_CONFIG[result.verdict]?.color || T.border}44`,
              borderRadius:8, padding:14 }}>
              <div style={{ fontSize:11, color:T.textDim, fontFamily:"monospace", marginBottom:8, letterSpacing:1 }}>🛡 TRUTH SHIELD PRE-ANALYSIS</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                <TruthBadge verdict={result.verdict} score={result.confidence} />
                <span style={{ fontSize:10, background:`${T.green}15`, color:T.green, padding:"3px 10px", borderRadius:20, fontFamily:"monospace" }}>
                  Public Interest: {result.public_interest_score}/100
                </span>
              </div>
              <p style={{ fontSize:12, color:T.text, margin:0, lineHeight:1.5 }}>{result.reasoning}</p>
              {result.recommended_action === "publish" && (
                <div style={{ marginTop:8, fontSize:10, color:T.green }}>✓ Ready to publish</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={analyze} disabled={analyzing || !content.trim()}
              style={{ flex:1, padding:"10px", background: analyzing ? T.bg3 : `${T.cyan}15`,
                border:`1px solid ${T.cyan}`, borderRadius:8, color: analyzing ? T.textDim : T.cyan,
                fontFamily:"monospace", fontWeight:700, fontSize:12, cursor: analyzing ? "not-allowed" : "pointer" }}>
              {analyzing ? "⏳ ANALYZING…" : "🛡 PRE-ANALYZE"}
            </button>
            <button onClick={onClose}
              style={{ flex:2, padding:"10px", background:`${T.green}20`,
                border:`1px solid ${T.green}`, borderRadius:8, color:T.green,
                fontFamily:"monospace", fontWeight:700, fontSize:12, cursor:"pointer" }}>
              ◆ PUBLISH TO FEED
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, stats }) {
  const nav = [
    { id:"feed",       icon:"📡", label:"Feed" },
    { id:"compose",    icon:"✏️",  label:"New Post" },
    { id:"guardian",   icon:"🛡",  label:"Guardian Shield" },
    { id:"governance", icon:"🗳",  label:"Governance" },
    { id:"stats",      icon:"📊",  label:"Platform Stats" },
  ];

  return (
    <div style={{ width:220, flexShrink:0, background:T.bg1, borderRight:`1px solid ${T.border}`,
      display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh", overflowY:"auto" }}>

      {/* Logo */}
      <div style={{ padding:"20px 16px 14px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:16, fontWeight:800, color:T.white, fontFamily:"monospace", letterSpacing:2 }}>
          OFA <span style={{ color:T.green }}>◆</span>
        </div>
        <div style={{ fontSize:9, color:T.textMuted, letterSpacing:1, marginTop:2 }}>OPEN FEED PLATFORM</div>
        <div style={{ marginTop:10, fontSize:9, display:"flex", gap:6 }}>
          <span style={{ background:`${T.green}15`, color:T.green, padding:"2px 6px", borderRadius:4, fontFamily:"monospace" }}>LIVE</span>
          <span style={{ background:`${T.blue}15`, color:T.blueSoft, padding:"2px 6px", borderRadius:4, fontFamily:"monospace" }}>v1.0</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1 }}>
        {nav.map(item => (
          <button key={item.id} onClick={() => setActive(item.id)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10,
              padding:"10px 12px", borderRadius:8, border:"none", cursor:"pointer",
              background: active === item.id ? `${T.green}12` : "transparent",
              borderLeft: active === item.id ? `2px solid ${T.green}` : "2px solid transparent",
              color: active === item.id ? T.green : T.textDim,
              fontSize:13, fontWeight: active === item.id ? 700 : 400,
              fontFamily:"monospace", transition:"all 0.15s", marginBottom:2 }}>
            <span style={{ fontSize:14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Quick stats */}
      <div style={{ padding:16, borderTop:`1px solid ${T.border}` }}>
        <div style={{ fontSize:9, color:T.textMuted, letterSpacing:1, marginBottom:8 }}>PLATFORM STATUS</div>
        {[
          { label:"Posts analyzed", val:stats.posts, color:T.blueSoft },
          { label:"Suppression blocked", val:stats.suppressed, color:T.green },
          { label:"Accounts protected", val:stats.protected, color:T.purple },
        ].map(s => (
          <div key={s.label} style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:10, color:T.textDim }}>{s.label}</span>
            <span style={{ fontSize:10, color:s.color, fontFamily:"monospace", fontWeight:700 }}>{s.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedView({ posts }) {
  const [filter, setFilter] = useState("all");
  const filters = ["all","legitimate","suppressed","article","video","data","document"];

  const filtered = posts.filter(p => {
    if (filter === "all") return true;
    if (filter === "suppressed") return p.suppressed;
    if (filter === "legitimate") return p.ts_verdict === "legitimate";
    return p.type === filter;
  });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"5px 12px", borderRadius:20, border:`1px solid ${filter===f ? T.green : T.border}`,
            background: filter===f ? `${T.green}15` : T.bg2,
            color: filter===f ? T.green : T.textDim, fontSize:11,
            fontFamily:"monospace", cursor:"pointer", fontWeight: filter===f ? 700 : 400
          }}>
            {f}
          </button>
        ))}
        <div style={{ marginLeft:"auto", fontSize:11, color:T.textDim, display:"flex", alignItems:"center" }}>
          {filtered.length} posts
        </div>
      </div>

      {/* Suppression banner */}
      {filter !== "suppressed" && posts.filter(p => p.suppressed).length > 0 && (
        <div style={{ background:"#FFB30010", border:`1px solid ${T.amber}33`, borderRadius:8,
          padding:"10px 14px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, color:T.amber }}>
            ⚠ {posts.filter(p => p.suppressed).length} posts were suppressed by platform algorithms — OFA restored them
          </span>
          <button onClick={() => setFilter("suppressed")}
            style={{ fontSize:11, color:T.amber, background:"none", border:`1px solid ${T.amber}44`,
              borderRadius:6, padding:"3px 8px", cursor:"pointer", fontFamily:"monospace" }}>
            VIEW
          </button>
        </div>
      )}

      {filtered.map((post, i) => <PostCard key={post.id} post={post} animDelay={i * 0.05} />)}
    </div>
  );
}

function GuardianView() {
  const [did, setDid] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    if (!did.trim()) return;
    setAnalyzing(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 1800));
    // Simulate Guardian Shield analysis
    const score = Math.floor(Math.random() * 100);
    setResult({
      did: did.trim(),
      minor_confidence: score,
      status: score >= 85 ? "suspended" : score >= 65 ? "soft_locked" : score >= 40 ? "monitoring" : "clear",
      action: score >= 85 ? "suspend" : score >= 65 ? "soft_lock" : score >= 40 ? "monitoring" : "none",
      layer_scores: { layer_1: Math.min(100,score+10), layer_2: Math.max(0,score-15), layer_3: score, layer_4: Math.max(0,score-20) },
      zk_verified: false,
    });
    setAnalyzing(false);
  };

  const STATUS_COLOR = { clear:T.green, monitoring:T.amber, soft_locked:T.amber, suspended:T.red, verified_adult:T.green };
  const STATUS_LABEL = { clear:"✓ Clear — Adult confirmed", monitoring:"◉ Monitoring mode", soft_locked:"⚠ Soft locked — verify age", suspended:"🚫 Suspended — verify age", verified_adult:"✓ ZK Verified Adult" };

  return (
    <div>
      <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.white, marginBottom:4 }}>🛡 Guardian Shield — Child Protection</div>
        <div style={{ fontSize:12, color:T.textDim, marginBottom:16, lineHeight:1.5 }}>
          7-layer behavioral detection system. Analyzes accounts for minor signals without storing personal identity data.
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <input value={did} onChange={e => setDid(e.target.value)}
            placeholder="Enter account DID (e.g. did:key:abc123…)"
            style={{ flex:1, background:T.bg3, border:`1px solid ${T.border}`, borderRadius:8,
              padding:"10px 14px", color:T.text, fontSize:13, fontFamily:"monospace", outline:"none" }} />
          <button onClick={analyze} disabled={analyzing || !did.trim()}
            style={{ padding:"10px 16px", background:`${T.purple}20`, border:`1px solid ${T.purple}`,
              borderRadius:8, color:T.purple, fontFamily:"monospace", fontWeight:700,
              fontSize:12, cursor: analyzing ? "not-allowed" : "pointer" }}>
            {analyzing ? "⏳ SCANNING…" : "ANALYZE"}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ background:T.bg2, border:`1px solid ${STATUS_COLOR[result.status]}44`, borderRadius:10, padding:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:12, color:T.textDim, fontFamily:"monospace", marginBottom:4 }}>{result.did}</div>
              <div style={{ fontSize:14, fontWeight:700, color:STATUS_COLOR[result.status] }}>
                {STATUS_LABEL[result.status]}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:28, fontWeight:800, color:STATUS_COLOR[result.status], fontFamily:"monospace" }}>
                {result.minor_confidence}%
              </div>
              <div style={{ fontSize:10, color:T.textDim }}>minor confidence</div>
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"monospace", letterSpacing:1, marginBottom:8 }}>DETECTION LAYER SCORES</div>
            {Object.entries(result.layer_scores).map(([layer, score]) => {
              const labels = { layer_1:"Linguistic AI", layer_2:"Behavioral Pattern", layer_3:"Profile Signals", layer_4:"Network Graph" };
              return (
                <div key={layer} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:T.textDim }}>{labels[layer] || layer}</span>
                    <span style={{ fontSize:11, color:score >= 65 ? T.red : score >= 40 ? T.amber : T.green, fontFamily:"monospace" }}>{score}%</span>
                  </div>
                  <div style={{ height:4, background:T.bg3, borderRadius:2 }}>
                    <div style={{ height:4, width:`${score}%`, borderRadius:2, transition:"width 0.6s ease",
                      background: score >= 65 ? T.red : score >= 40 ? T.amber : T.green }} />
                  </div>
                </div>
              );
            })}
          </div>

          {result.status !== "clear" && (
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ flex:1, padding:"8px", background:`${T.cyan}15`, border:`1px solid ${T.cyan}`,
                borderRadius:8, color:T.cyan, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>
                🔐 ZK Age Verify
              </button>
              <button style={{ flex:1, padding:"8px", background:`${T.blue}15`, border:`1px solid ${T.blueSoft}`,
                borderRadius:8, color:T.blueSoft, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>
                ⚖ Appeal (24h review)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detection layers overview */}
      <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:20, marginTop:16 }}>
        <div style={{ fontSize:11, color:T.textDim, fontFamily:"monospace", letterSpacing:1, marginBottom:12 }}>7 ACTIVE DETECTION LAYERS</div>
        {[
          { n:1, label:"Linguistic AI Analysis", desc:"Claude AI analyzes vocabulary, syntax, slang for age signals", color:T.green },
          { n:2, label:"Behavioral Pattern", desc:"Posting times vs school schedules, content interest mapping", color:T.cyan },
          { n:3, label:"Profile Signal Analysis", desc:"Username patterns, bio language, birth year detection", color:T.amber },
          { n:4, label:"Network Graph", desc:"Connections to other flagged accounts", color:T.purple },
          { n:5, label:"Proof of Humanity", desc:"Optional — confirms unique human without revealing identity", color:T.blue },
          { n:6, label:"ZK Age Verification", desc:"Optional — cryptographic adult proof, zero PII stored", color:T.green },
          { n:7, label:"Community Reports", desc:"Weighted community flagging with false-report tracking", color:T.amber },
        ].map(layer => (
          <div key={layer.n} style={{ display:"flex", gap:12, marginBottom:10, alignItems:"flex-start" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", background:`${layer.color}20`,
              border:`1px solid ${layer.color}44`, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:10, color:layer.color, fontFamily:"monospace", fontWeight:700, flexShrink:0 }}>
              {layer.n}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{layer.label}</div>
              <div style={{ fontSize:11, color:T.textDim, lineHeight:1.4 }}>{layer.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GovernanceView() {
  const proposals = [
    { id:1, title:"Increase source credibility weight from 0.60 to 0.65", proposer:"@rafaelm", yes:847, no:213, status:"open", ends:"3 days" },
    { id:2, title:"Add 'academic research' content type boost (+15% OFA score)", proposer:"@priyanair", yes:1240, no:89, status:"open", ends:"5 days" },
    { id:3, title:"Reduce ad content penalty from 30 to 35 points", proposer:"@aishaokafor", yes:2100, no:340, status:"passed", ends:"Passed" },
  ];

  return (
    <div>
      <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.white, marginBottom:6 }}>🗳 Community Governance</div>
        <div style={{ fontSize:12, color:T.textDim, lineHeight:1.5 }}>
          Algorithm weights and platform policies are controlled by verified community members. Every vote is recorded on-chain. No single entity can change ranking parameters unilaterally.
        </div>
      </div>

      {proposals.map(p => {
        const total = p.yes + p.no;
        const yesRatio = total > 0 ? (p.yes / total) * 100 : 0;
        return (
          <div key={p.id} style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:18, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:13, color:T.text, fontWeight:600, flex:1, marginRight:16 }}>{p.title}</div>
              <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontFamily:"monospace", flexShrink:0,
                background: p.status === "passed" ? `${T.green}20` : `${T.amber}20`,
                color: p.status === "passed" ? T.green : T.amber,
                border: `1px solid ${p.status === "passed" ? T.green : T.amber}44` }}>
                {p.status === "passed" ? "✓ PASSED" : `⏳ ${p.ends}`}
              </span>
            </div>
            <div style={{ fontSize:11, color:T.textDim, marginBottom:12 }}>Proposed by {p.proposer}</div>
            <div style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:11, color:T.green }}>✓ Yes: {p.yes.toLocaleString()}</span>
                <span style={{ fontSize:11, color:T.red }}>✗ No: {p.no.toLocaleString()}</span>
              </div>
              <div style={{ height:6, background:T.bg3, borderRadius:3 }}>
                <div style={{ height:6, width:`${yesRatio}%`, background: yesRatio > 60 ? T.green : T.amber, borderRadius:3, transition:"width 0.6s" }} />
              </div>
            </div>
            {p.status === "open" && (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ flex:1, padding:"7px", background:`${T.green}15`, border:`1px solid ${T.green}44`, borderRadius:6, color:T.green, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>✓ Vote Yes</button>
                <button style={{ flex:1, padding:"7px", background:`${T.red}15`, border:`1px solid ${T.red}44`, borderRadius:6, color:T.red, fontFamily:"monospace", fontSize:11, cursor:"pointer" }}>✗ Vote No</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatsView() {
  const stats = [
    { label:"Total Posts Analyzed", val:"48,291", color:T.blueSoft, icon:"📊" },
    { label:"Suppression Attempts Blocked", val:"12,847", color:T.green, icon:"🛡" },
    { label:"Truth Shield Verdicts", val:"41,203", color:T.cyan, icon:"✓" },
    { label:"Legitimate Content Restored", val:"9,614", color:T.green, icon:"🔓" },
    { label:"Disinformation Labeled", val:"3,233", color:T.red, icon:"⚠" },
    { label:"Guardian Shield Scans", val:"28,441", color:T.purple, icon:"👁" },
    { label:"Minors Detected & Protected", val:"1,207", color:T.amber, icon:"🛡" },
    { label:"ZK Age Verifications", val:"8,902", color:T.cyan, icon:"🔐" },
    { label:"Governance Votes Cast", val:"34,891", color:T.green, icon:"🗳" },
    { label:"IPFS Records Created", val:"48,291", color:T.blue, icon:"◆" },
    { label:"Appeals Filed", val:"892", color:T.amber, icon:"⚖" },
    { label:"Appeals Overturned", val:"431", color:T.green, icon:"✓" },
  ];

  return (
    <div>
      <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:T.white, marginBottom:4 }}>📊 Platform Transparency Report</div>
        <div style={{ fontSize:11, color:T.textDim }}>All data publicly auditable · On-chain verified · Updated every 5 minutes</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:10 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"monospace" }}>{s.val}</div>
            <div style={{ fontSize:10, color:T.textDim, marginTop:4, lineHeight:1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:16, background:`${T.green}08`, border:`1px solid ${T.green}22`, borderRadius:10, padding:16 }}>
        <div style={{ fontSize:11, color:T.green, fontFamily:"monospace", marginBottom:8, fontWeight:700 }}>CORE PRINCIPLES — ALWAYS ACTIVE</div>
        {["No content is ever auto-deleted — context labels only","All suppression attempts logged permanently on IPFS","Algorithm weights are public and community-governed","Zero PII stored for anonymous and whistleblower accounts","Guardian Shield scores auto-purged after 90 days if unconfirmed"].map(p => (
          <div key={p} style={{ fontSize:11, color:T.textDim, padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
            <span style={{ color:T.green }}>✓</span> {p}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState("feed");
  const [composing, setComposing] = useState(false);

  const stats = { posts:"48.2K", suppressed:"12.8K", protected:"1.2K" };

  const handleNav = (id) => {
    if (id === "compose") { setComposing(true); return; }
    setActive(id);
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:T.bg0, color:T.text, fontFamily:"'JetBrains Mono', 'Fira Code', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1E2535; border-radius: 2px; }
        textarea, input { outline: none; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <Sidebar active={active} setActive={handleNav} stats={stats} />

      {/* Main content */}
      <div style={{ flex:1, overflowY:"auto", padding:"24px", maxWidth:760 }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:T.white, letterSpacing:1 }}>
              {active === "feed" && "📡 Open Feed"}
              {active === "guardian" && "🛡 Guardian Shield"}
              {active === "governance" && "🗳 Governance"}
              {active === "stats" && "📊 Transparency Report"}
            </div>
            <div style={{ fontSize:11, color:T.textDim, marginTop:2 }}>
              {active === "feed" && "Anti-suppression feed · Truth Shield integrated · Transparent ranking"}
              {active === "guardian" && "Child protection · 7-layer detection · COPPA compliant"}
              {active === "governance" && "Community-controlled algorithm · On-chain verified"}
              {active === "stats" && "Fully public · Auditable · Updated live"}
            </div>
          </div>
          <button onClick={() => setComposing(true)}
            style={{ padding:"9px 16px", background:`${T.green}20`, border:`1px solid ${T.green}`,
              borderRadius:8, color:T.green, fontFamily:"monospace", fontWeight:700,
              fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            ✏️ New Post
          </button>
        </div>

        {active === "feed"       && <FeedView posts={MOCK_POSTS} />}
        {active === "guardian"   && <GuardianView />}
        {active === "governance" && <GovernanceView />}
        {active === "stats"      && <StatsView />}
      </div>

      {composing && <ComposePanel onClose={() => setComposing(false)} />}
    </div>
  );
}
