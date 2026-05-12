import { useState, useRef, useEffect } from "react";

const C = {
  bg0:"#07090E", bg1:"#0D1017", bg2:"#131720", bg3:"#1A2030",
  border:"#1E2535", border2:"#252D40",
  green:"#00E676", cyan:"#00BCD4", blue:"#1F6FEB", blueSoft:"#79C0FF",
  amber:"#FFB300", red:"#FF5252", purple:"#CE93D8",
  text:"#CDD5E0", textDim:"#6B7A99", textMuted:"#3D4A63", white:"#EAEEF5",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const POSTS = [
  { id:1, author:"Maria Chen", handle:"@mariachen", avatar:"MC", acolor:"#e74c3c",
    content:"Thread: How pharmaceutical lobbying has shaped FDA approval timelines over 20 years. Sources linked. Documented public record. 🧵",
    tags:["health","policy","accountability"], timestamp:"2h ago",
    eng:{ likes:2400, shares:890, comments:312 },
    flags:["sensitive_topic","health_misinformation_review"], platformScore:12,
    tier:"standard", ipfs:"QmTs1abc" },
  { id:2, author:"Devon Williams", handle:"@devonw", avatar:"DW", acolor:"#3498db",
    content:"Local city council voted 7-0 to approve rezoning displacing 3 affordable housing complexes. Nobody covered this. Full meeting transcript attached.",
    tags:["housing","local","accountability"], timestamp:"4h ago",
    eng:{ likes:1890, shares:1200, comments:445 },
    flags:["low_follower_account"], platformScore:8,
    tier:"anonymous", ipfs:"QmTs2def" },
  { id:3, author:"Sponsored Content", handle:"@brandpartner", avatar:"AD", acolor:"#555",
    content:"✨ Transform your life with our premium wellness program! Thousands of success stories. Limited time offer — click now!",
    tags:["ad","wellness"], timestamp:"1h ago",
    eng:{ likes:45, shares:12, comments:8 },
    flags:[], platformScore:95, isAd:true,
    tier:"standard", ipfs:null },
  { id:4, author:"Priya Nair", handle:"@priyanair", avatar:"PN", acolor:"#27ae60",
    content:"Investigative piece: Three cities where water quality reports were altered before public release. FOIA documents included. 8 months to report.",
    tags:["environment","accountability","public health"], timestamp:"6h ago",
    eng:{ likes:5600, shares:3200, comments:890 },
    flags:["sensitive_topic","flagged_for_review"], platformScore:5,
    tier:"whistleblower", ipfs:"QmTs3ghi" },
  { id:5, author:"TechGossip Daily", handle:"@techgossip", avatar:"TG", acolor:"#e67e22",
    content:"BREAKING: Celebrity CEO spotted at exclusive party 👀 Details inside! You won't believe who was there...",
    tags:["entertainment","celebrity"], timestamp:"30m ago",
    eng:{ likes:890, shares:234, comments:156 },
    flags:[], platformScore:88,
    tier:"standard", ipfs:null },
  { id:6, author:"Rafael Moreno", handle:"@rafaelm", avatar:"RM", acolor:"#9b59b6",
    content:"Academic paper: Peer-reviewed study on algorithmic suppression of labor organizing content across major platforms. Data from 4.2M posts.",
    tags:["research","labor","algorithms"], timestamp:"8h ago",
    eng:{ likes:3100, shares:2800, comments:670 },
    flags:["labor_content","sensitive_topic"], platformScore:3,
    tier:"anonymous", ipfs:"QmTs4jkl" },
  { id:7, author:"Aisha Okafor", handle:"@aishaokafor", avatar:"AO", acolor:"#1abc9c",
    content:"Raw footage: 47-minute continuous recording of today's permitted protest at the state capitol. No edits. You deserve to see what happened.",
    tags:["civil rights","journalism","accountability"], timestamp:"3h ago",
    eng:{ likes:7800, shares:5600, comments:1240 },
    flags:["sensitive_topic","police_content"], platformScore:4,
    tier:"whistleblower", ipfs:"QmTs5mno" },
];

const GOVERNANCE_PROPOSALS = [
  { id:1, title:"Increase source credibility weight from 0.60 → 0.65", proposer:"@rafaelm", yes:847, no:213, days:3, status:"open" },
  { id:2, title:"Add academic research content bonus (+15% OFA score)", proposer:"@priyanair", yes:1240, no:89, days:5, status:"open" },
  { id:3, title:"Increase ad penalty from 30 → 35 points", proposer:"@aishaokafor", yes:2100, no:340, days:0, status:"passed" },
];

const GUARDIAN_ACCOUNTS = [
  { did:"did:key:zQ3sh...f7Kx", score:8,  status:"clear",      layers:{ linguistic:5,  behavioral:10, profile:8,  network:5  } },
  { did:"did:key:zQ3sh...mR2p", score:52, status:"monitoring",  layers:{ linguistic:60, behavioral:45, profile:55, network:40 } },
  { did:"did:key:zQ3sh...nT8w", score:78, status:"soft_locked", layers:{ linguistic:80, behavioral:72, profile:85, network:65 } },
  { did:"did:key:zQ3sh...kL4q", score:91, status:"suspended",   layers:{ linguistic:95, behavioral:88, profile:92, network:82 } },
];

const ALGO_MODES = {
  platform: {
    label:"Standard Platform Algorithm", color:C.red,
    desc:"Prioritizes ads and engagement bait. Auto-suppresses flagged content. No review, no appeal, no transparency.",
  },
  ofa: {
    label:"Open Feed Algorithm (OFA)", color:C.green,
    desc:"Weights source credibility + genuine engagement. Suppression flags trigger Truth Shield review — never auto-demotion.",
  }
};

function scorePost(post, mode) {
  if (mode === "platform") return post.platformScore;
  const eng = post.eng;
  const total = eng.likes + eng.shares * 3 + eng.comments * 2;
  const engScore = Math.min(100, total / 120);
  const credScore = post.isAd ? 20 : 65 + (post.flags.length === 0 ? 20 : 5);
  const penalty = post.flags.length * 2;
  const adP = post.isAd ? 30 : 0;
  return Math.max(0, Math.min(100, engScore * 0.4 + credScore * 0.6 - penalty - adP));
}

function TierBadge({ tier }) {
  const cfg = {
    standard:     { icon:"👤", label:"Standard",     color:C.blueSoft, bg:`${C.blue}18` },
    anonymous:    { icon:"🎭", label:"Anonymous",    color:C.cyan,     bg:`${C.cyan}18` },
    whistleblower:{ icon:"🔒", label:"Whistleblower",color:C.amber,    bg:`${C.amber}18` },
  }[tier] || { icon:"👤", label:"Standard", color:C.blueSoft, bg:`${C.blue}18` };
  return (
    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:10, fontFamily:"monospace",
      background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.color}44` }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function TSBadge({ flags, analyzing, verdict }) {
  if (analyzing) return (
    <span style={{ fontSize:9, background:`${C.amber}20`, color:C.amber,
      padding:"2px 8px", borderRadius:10, fontFamily:"monospace", border:`1px solid ${C.amber}44` }}>⏳ Analyzing…</span>
  );
  if (verdict) {
    const cfg = {
      legitimate:     { c:C.green,  l:"✓ Legitimate" },
      disinformation: { c:C.red,    l:"⚠ Disinfo" },
      unverified:     { c:C.amber,  l:"◉ Unverified" },
      satire:         { c:C.purple, l:"◎ Satire" },
      opinion:        { c:C.cyan,   l:"◈ Opinion" },
    }[verdict] || { c:C.textDim, l:"Reviewed" };
    return (
      <span style={{ fontSize:9, padding:"2px 8px", borderRadius:10, fontFamily:"monospace",
        background:`${cfg.c}18`, color:cfg.c, border:`1px solid ${cfg.c}44` }}>🛡 {cfg.l}</span>
    );
  }
  if (!flags.length) return (
    <span style={{ fontSize:9, background:`${C.green}18`, color:C.green,
      padding:"2px 8px", borderRadius:10, fontFamily:"monospace", border:`1px solid ${C.green}44` }}>✓ TS: Clear</span>
  );
  return (
    <span style={{ fontSize:9, background:`${C.blue}18`, color:C.blueSoft,
      padding:"2px 8px", borderRadius:10, fontFamily:"monospace", border:`1px solid ${C.blue}44` }}>🛡 Reviewed</span>
  );
}

function PostCard({ post, rank, mode, analyzingId, verdicts }) {
  const score = scorePost(post, mode);
  const isSuppressed = mode === "platform" && post.flags.length > 0;
  const verdict = verdicts?.[post.id];
  const accent = post.isAd ? C.textMuted : ALGO_MODES[mode].color;
  return (
    <div style={{ background:C.bg2, border:`1px solid ${accent}33`, borderLeft:`3px solid ${accent}`,
      borderRadius:8, padding:"12px 14px", marginBottom:8,
      opacity:isSuppressed ? 0.3 : 1, transition:"all 0.4s ease",
      filter:isSuppressed ? "grayscale(50%)" : "none" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:"50%", background:post.acolor,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:10, fontWeight:700, color:"#fff", fontFamily:"monospace", flexShrink:0 }}>
            {post.avatar}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:12, color:C.white }}>{post.author}</div>
            <div style={{ fontSize:10, color:C.textDim }}>{post.handle} · {post.timestamp}</div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:9, color:C.textMuted, marginBottom:1 }}>#{rank}</div>
          <div style={{ fontSize:14, fontWeight:800, fontFamily:"monospace",
            color:score>60?C.green:score>30?C.amber:C.red }}>{score.toFixed(0)}</div>
        </div>
      </div>
      <p style={{ fontSize:12, color:C.text, lineHeight:1.55, margin:"6px 0 8px" }}>{post.content}</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
        {post.tags.map(t=>(
          <span key={t} style={{ fontSize:9, background:C.bg3, color:C.textDim,
            padding:"2px 6px", borderRadius:8, border:`1px solid ${C.border}` }}>#{t}</span>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:6 }}>
        <div style={{ display:"flex", gap:10, fontSize:11, color:C.textDim }}>
          <span>❤ {post.eng.likes.toLocaleString()}</span>
          <span>↻ {post.eng.shares.toLocaleString()}</span>
          <span>💬 {post.eng.comments.toLocaleString()}</span>
        </div>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          <TierBadge tier={post.tier} />
          {mode==="ofa" && <TSBadge flags={post.flags} analyzing={analyzingId===post.id} verdict={verdict} />}
          {mode==="ofa" && post.ipfs && (
            <span style={{ fontSize:9, padding:"2px 7px", borderRadius:10, fontFamily:"monospace",
              background:`${C.purple}18`, color:C.purple, border:`1px solid ${C.purple}33` }}>
              ◆ {post.ipfs.substring(0,10)}…
            </span>
          )}
        </div>
      </div>
      {mode==="platform" && post.flags.length>0 && (
        <div style={{ marginTop:6, fontSize:9, color:C.red, fontFamily:"monospace" }}>
          🚫 Auto-suppressed — [{post.flags.join(", ")}]
        </div>
      )}
      {mode==="ofa" && post.flags.length>0 && (
        <div style={{ marginTop:6, fontSize:9, color:C.amber, fontFamily:"monospace" }}>
          ⚠ Platform tried [{post.flags.join(", ")}] → OFA sent to Truth Shield instead
        </div>
      )}
    </div>
  );
}

function GuardianView() {
  const [sel, setSel] = useState(0);
  const acc = GUARDIAN_ACCOUNTS[sel];
  const STATUS = {
    clear:       { l:"✓ Clear",        c:C.green, d:"Adult confirmed — no restrictions" },
    monitoring:  { l:"◉ Monitoring",   c:C.amber, d:"Behavioral signals detected — passive observation" },
    soft_locked: { l:"⚠ Soft Locked",  c:C.amber, d:"Probable minor — age verification prompted" },
    suspended:   { l:"🚫 Suspended",   c:C.red,   d:"High confidence minor — pending verification" },
  };
  const s = STATUS[acc.status];
  const layerNames = { linguistic:"Linguistic AI", behavioral:"Behavioral Pattern", profile:"Profile Signals", network:"Network Graph" };
  return (
    <div>
      <div style={{ fontSize:9, color:C.textMuted, letterSpacing:1, fontFamily:"monospace", marginBottom:8 }}>SELECT ACCOUNT</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {GUARDIAN_ACCOUNTS.map((a,i) => {
          const sc = STATUS[a.status];
          return (
            <button key={i} onClick={()=>setSel(i)} style={{
              padding:"5px 10px", borderRadius:6, border:`1px solid ${sel===i?sc.c:C.border}`,
              background:sel===i?`${sc.c}15`:C.bg2, color:sel===i?sc.c:C.textDim,
              fontFamily:"monospace", fontSize:9, cursor:"pointer" }}>
              {a.did.substring(0,18)}…
            </button>
          );
        })}
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${s.c}33`, borderRadius:10, padding:14, marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <div style={{ fontSize:9, color:C.textDim, fontFamily:"monospace", marginBottom:4 }}>{acc.did}</div>
            <div style={{ fontSize:14, fontWeight:700, color:s.c }}>{s.l}</div>
            <div style={{ fontSize:10, color:C.textDim, marginTop:3 }}>{s.d}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:"monospace",
              color:acc.score>=85?C.red:acc.score>=65?C.amber:C.green }}>{acc.score}%</div>
            <div style={{ fontSize:9, color:C.textDim }}>minor confidence</div>
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", letterSpacing:1, marginBottom:8 }}>7-LAYER DETECTION SCORES</div>
          {Object.entries(acc.layers).map(([k,v])=>(
            <div key={k} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:10, color:C.textDim }}>{layerNames[k]}</span>
                <span style={{ fontSize:10, fontFamily:"monospace", color:v>=65?C.red:v>=40?C.amber:C.green }}>{v}%</span>
              </div>
              <div style={{ height:4, background:C.bg3, borderRadius:2 }}>
                <div style={{ height:4, borderRadius:2, width:`${v}%`, transition:"width 0.8s ease",
                  background:v>=65?C.red:v>=40?C.amber:C.green }} />
              </div>
            </div>
          ))}
        </div>
        {acc.status !== "clear" && (
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ flex:1, padding:"6px", background:`${C.cyan}15`, border:`1px solid ${C.cyan}44`,
              borderRadius:6, color:C.cyan, fontFamily:"monospace", fontSize:9, cursor:"pointer" }}>
              🔐 ZK Age Verify (zero PII)
            </button>
            <button style={{ flex:1, padding:"6px", background:`${C.blueSoft}15`, border:`1px solid ${C.blueSoft}44`,
              borderRadius:6, color:C.blueSoft, fontFamily:"monospace", fontSize:9, cursor:"pointer" }}>
              ⚖ Appeal (24h review)
            </button>
          </div>
        )}
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
        <div style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", letterSpacing:1, marginBottom:8 }}>RESPONSE THRESHOLDS</div>
        {[
          ["0–39%","No action",C.green,"Normal feed access"],
          ["40–64%","Monitoring",C.amber,"Content reviewed before publishing"],
          ["65–84%","Soft Lock",C.amber,"Age verification prompted"],
          ["85–100%","Suspend",C.red,"Pending verification or appeal"],
        ].map(([range,action,color,desc])=>(
          <div key={range} style={{ display:"flex", gap:10, padding:"5px 0",
            borderBottom:`1px solid ${C.border}`, alignItems:"center" }}>
            <span style={{ fontSize:9, fontFamily:"monospace", color, minWidth:65 }}>{range}</span>
            <span style={{ fontSize:10, fontWeight:700, color, minWidth:100 }}>{action}</span>
            <span style={{ fontSize:10, color:C.textDim }}>{desc}</span>
          </div>
        ))}
        <div style={{ marginTop:8, fontSize:9, color:C.textDim, fontStyle:"italic" }}>
          ✓ COPPA · GDPR-K · KOSA compliant. Scores purged after 90 days if unconfirmed.
        </div>
      </div>
    </div>
  );
}

function GovernanceView() {
  const [voted, setVoted] = useState({});
  return (
    <div>
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:14, marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.white, marginBottom:4 }}>🗳 Community Governance</div>
        <div style={{ fontSize:11, color:C.textDim, lineHeight:1.5 }}>
          Algorithm weights and policies controlled by verified community members.
          Every vote recorded on-chain. No single entity controls ranking.
        </div>
      </div>
      {GOVERNANCE_PROPOSALS.map(p=>{
        const total = p.yes + p.no;
        const yPct = total > 0 ? Math.round((p.yes/total)*100) : 0;
        const myVote = voted[p.id];
        return (
          <div key={p.id} style={{ background:C.bg2, border:`1px solid ${C.border}`,
            borderRadius:10, padding:14, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ flex:1, marginRight:12, fontSize:12, color:C.text, fontWeight:600 }}>{p.title}</div>
              <span style={{ fontSize:9, padding:"3px 8px", borderRadius:10, fontFamily:"monospace", flexShrink:0,
                background:p.status==="passed"?`${C.green}20`:`${C.amber}20`,
                color:p.status==="passed"?C.green:C.amber,
                border:`1px solid ${p.status==="passed"?C.green:C.amber}44` }}>
                {p.status==="passed" ? "✓ PASSED" : `⏳ ${p.days}d left`}
              </span>
            </div>
            <div style={{ fontSize:10, color:C.textDim, marginBottom:10 }}>
              Proposed by {p.proposer} · {total.toLocaleString()} votes cast
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:10, color:C.green }}>✓ Yes: {(p.yes+(myVote==="yes"?1:0)).toLocaleString()}</span>
              <span style={{ fontSize:10, color:C.red }}>✗ No: {(p.no+(myVote==="no"?1:0)).toLocaleString()}</span>
            </div>
            <div style={{ height:5, background:C.bg3, borderRadius:3, marginBottom:10 }}>
              <div style={{ height:5, borderRadius:3, transition:"width 0.6s",
                width:`${yPct}%`, background:yPct>60?C.green:C.amber }} />
            </div>
            {p.status==="open" && !myVote && (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setVoted(v=>({...v,[p.id]:"yes"}))} style={{
                  flex:1, padding:"6px", background:`${C.green}15`, border:`1px solid ${C.green}44`,
                  borderRadius:6, color:C.green, fontFamily:"monospace", fontSize:10, cursor:"pointer" }}>✓ Vote Yes</button>
                <button onClick={()=>setVoted(v=>({...v,[p.id]:"no"}))} style={{
                  flex:1, padding:"6px", background:`${C.red}15`, border:`1px solid ${C.red}44`,
                  borderRadius:6, color:C.red, fontFamily:"monospace", fontSize:10, cursor:"pointer" }}>✗ Vote No</button>
              </div>
            )}
            {myVote && (
              <div style={{ fontSize:10, color:myVote==="yes"?C.green:C.red, fontFamily:"monospace" }}>
                ✓ Vote recorded on-chain · You voted {myVote.toUpperCase()}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ background:`${C.green}06`, border:`1px solid ${C.green}22`, borderRadius:10, padding:12 }}>
        <div style={{ fontSize:9, color:C.green, fontFamily:"monospace", letterSpacing:1, marginBottom:8 }}>CURRENT WEIGHTS (LIVE)</div>
        {[
          ["engagement_weight","0.40",C.cyan],
          ["source_credibility_weight","0.60",C.green],
          ["ad_content_penalty","30pts",C.red],
          ["suppression_review_weight","2pts",C.amber],
          ["community_verify_bonus","+5pts",C.green],
        ].map(([k,v,col])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between",
            padding:"4px 0", borderBottom:`1px solid ${C.border}`, fontSize:10 }}>
            <span style={{ color:C.textDim, fontFamily:"monospace" }}>{k}</span>
            <span style={{ color:col, fontFamily:"monospace", fontWeight:700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TiersView() {
  const [zkStep, setZkStep] = useState(0);
  const steps = [
    "User opens ZK verification flow",
    "ID submitted to trusted verifier — never to OFA",
    "Verifier generates proof: 'is_adult: true' only",
    "Proof token returned to user's browser",
    "User submits proof token to Guardian Shield",
    "Guardian Shield verifies cryptographic signature",
    "Hash of proof stored — NOT the token itself",
    "✓ Account marked verified_adult — full access restored",
  ];
  useEffect(()=>{
    if (zkStep > 0 && zkStep < steps.length) {
      const t = setTimeout(()=>setZkStep(s=>s+1), 650);
      return ()=>clearTimeout(t);
    }
  }, [zkStep]);
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10, marginBottom:14 }}>
        {[
          { tier:"standard", icon:"👤", label:"Standard", color:C.blueSoft,
            features:["Username only","No real name","Email: SHA-256 hash","Decentralized DID","Full access"] },
          { tier:"anonymous", icon:"🎭", label:"Anonymous", color:C.cyan,
            features:["Zero PII stored","Deterministic DID","No email required","No IP logging","Behavioral analysis only"] },
          { tier:"whistleblower", icon:"🔒", label:"Whistleblower", color:C.amber,
            features:["AES-256-GCM E2E","Anonymous routing","Tor compatible","Key destruction on delete","Cannot be decrypted by OFA"] },
        ].map(t=>(
          <div key={t.tier} style={{ background:C.bg2, border:`1px solid ${t.color}33`,
            borderRadius:10, padding:12, borderTop:`3px solid ${t.color}` }}>
            <div style={{ fontSize:20, marginBottom:5 }}>{t.icon}</div>
            <div style={{ fontSize:12, fontWeight:700, color:t.color, marginBottom:8 }}>{t.label}</div>
            {t.features.map(f=>(
              <div key={f} style={{ fontSize:9, color:C.textDim, padding:"3px 0",
                borderBottom:`1px solid ${C.border}`, display:"flex", gap:5 }}>
                <span style={{ color:t.color }}>›</span>{f}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${C.cyan}33`, borderRadius:10, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.cyan, marginBottom:4 }}>🔐 Zero-Knowledge Age Verification</div>
        <div style={{ fontSize:10, color:C.textDim, marginBottom:10, lineHeight:1.5 }}>
          Prove 18+ without showing us your ID. We never see name, DOB, or any personal information.
        </div>
        <button onClick={()=>setZkStep(zkStep>=steps.length?0:1)}
          disabled={zkStep>0&&zkStep<steps.length}
          style={{ padding:"6px 12px", background:`${C.cyan}20`, border:`1px solid ${C.cyan}`,
            borderRadius:6, color:C.cyan, fontFamily:"monospace", fontSize:10,
            cursor:zkStep>0&&zkStep<steps.length?"not-allowed":"pointer", marginBottom:10 }}>
          {zkStep===0?"▶ SIMULATE ZK FLOW":zkStep>=steps.length?"↺ Run again":"⏳ Running…"}
        </button>
        <div style={{ fontFamily:"monospace", fontSize:10 }}>
          {steps.map((step,i)=>(
            <div key={i} style={{ padding:"5px 0", borderBottom:`1px solid ${C.border}`,
              display:"flex", gap:8, opacity:zkStep>i?1:0.2, transition:"opacity 0.3s" }}>
              <span style={{ color:zkStep>i?(step.startsWith("✓")?C.green:C.cyan):C.textMuted, minWidth:14 }}>
                {zkStep>i?(step.startsWith("✓")?"✓":`${i+1}.`):`${i+1}.`}
              </span>
              <span style={{ color:zkStep>i?C.text:C.textMuted }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:10, padding:8, background:`${C.green}08`,
          border:`1px solid ${C.green}22`, borderRadius:6 }}>
          <div style={{ fontSize:9, color:C.green, fontFamily:"monospace" }}>
            ✗ NEVER STORED: ID · Name · Date of birth · Address · ID number<br/>
            ✓ ONLY STORED: Proof hash · is_adult: true · Issuer · Expiry
          </div>
        </div>
      </div>
    </div>
  );
}

function PrinciplesView() {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:10, marginBottom:14 }}>
        {[
          { icon:"🔍", title:"Transparent Scoring",      color:C.green,    desc:"Every score publicly viewable with full breakdown. Any researcher can audit ranking decisions." },
          { icon:"🛡", title:"Truth Shield",             color:C.cyan,     desc:"Suppression flags trigger AI review. Context labels replace deletion. Verdicts stored immutably on IPFS." },
          { icon:"⚖️", title:"Anti-Manipulation Weights", color:C.amber,    desc:"Ads, engagement bait, and coordinated behavior are penalized. Source credibility and genuine engagement rewarded." },
          { icon:"🌐", title:"Decentralized Storage",    color:C.purple,   desc:"All content on IPFS + Arweave before indexing. Deletion removes feed visibility only — record is permanent." },
          { icon:"📊", title:"Suppression Audit Log",    color:C.blueSoft, desc:"Every suppression attempt logged on-chain forever. Patterns of targeted censorship become visible and auditable." },
          { icon:"🗳", title:"Community Governance",     color:C.green,    desc:"Algorithm weights voted on by verified community. No single entity controls ranking. All decisions on-chain." },
          { icon:"🛡", title:"Guardian Shield",          color:C.amber,    desc:"7-layer child protection detects minors without storing PII. COPPA/GDPR-K/KOSA compliant." },
          { icon:"🔐", title:"Zero-Knowledge Privacy",   color:C.cyan,     desc:"Whistleblower E2E encryption. ZK age proofs stored as hashes only. We never see the underlying data." },
        ].map((p,i)=>(
          <div key={i} style={{ background:C.bg2, border:`1px solid ${p.color}22`,
            borderRadius:10, padding:12, borderTop:`2px solid ${p.color}` }}>
            <div style={{ fontSize:18, marginBottom:5 }}>{p.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color:p.color, marginBottom:5 }}>{p.title}</div>
            <div style={{ fontSize:10, color:C.textDim, lineHeight:1.5 }}>{p.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ background:`${C.green}06`, border:`1px solid ${C.green}22`, borderRadius:10, padding:14, marginBottom:12 }}>
        <div style={{ fontSize:9, color:C.green, fontFamily:"monospace", letterSpacing:1, marginBottom:10 }}>SCORING FORMULA</div>
        <div style={{ fontSize:11, fontFamily:"monospace", lineHeight:2.2, color:C.textDim }}>
          <div><span style={{ color:C.green }}>OFA_Score</span> =</div>
          <div style={{ paddingLeft:16 }}>( genuine_engagement <span style={{ color:C.cyan }}>× 0.40</span> )</div>
          <div style={{ paddingLeft:16 }}>+ ( source_credibility <span style={{ color:C.green }}>× 0.60</span> )</div>
          <div style={{ paddingLeft:16 }}>− ( suppression_flags <span style={{ color:C.amber }}>× ts_review_weight</span> )</div>
          <div style={{ paddingLeft:16 }}>− ( ad_penalty <span style={{ color:C.red }}>× 30</span> )</div>
          <div style={{ paddingLeft:16 }}>+ ( community_verify_bonus <span style={{ color:C.green }}>× +5</span> )</div>
          <div style={{ marginTop:8, color:C.amber }}>// flags reviewed by Truth Shield BEFORE penalty applied</div>
          <div style={{ color:C.amber }}>// all weights public · community-governed · on-chain</div>
        </div>
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
        <div style={{ fontSize:9, color:C.blueSoft, fontFamily:"monospace", letterSpacing:1, marginBottom:10 }}>INTEGRATION STACK</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            ["Truth Shield","Claude Haiku 4.5 — AI analysis"],
            ["Guardian Shield","7-layer child protection"],
            ["IPFS / Arweave","Immutable permanent storage"],
            ["ZK Age Verify","Identity-free adult proof"],
            ["On-chain Governance","Community algorithm control"],
            ["Telegram Bot","Phase 1 deployment"],
            ["Browser Extension","Phase 3 deployment"],
            ["Decentralized DNS","Censorship-resistant hosting"],
          ].map(([k,v])=>(
            <div key={k} style={{ fontSize:10 }}>
              <span style={{ color:C.green, fontFamily:"monospace" }}>▸ </span>
              <span style={{ color:C.text, fontWeight:600 }}>{k}</span>
              <div style={{ color:C.textMuted, paddingLeft:14, fontSize:9 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TSLogView({ mode, tsLog, running, onRunScan }) {
  const logRef = useRef(null);
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [tsLog]);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:C.white }}>Truth Shield Analysis Log</div>
          <div style={{ fontSize:10, color:C.textDim, marginTop:2 }}>Real-time disinformation review replacing auto-suppression</div>
        </div>
        {mode !== "ofa"
          ? <span style={{ fontSize:10, color:C.red, fontFamily:"monospace" }}>Switch to OFA mode first</span>
          : <button onClick={onRunScan} disabled={running} style={{
              padding:"7px 14px", background:running?C.bg3:`${C.green}20`,
              border:`1px solid ${running?C.border:C.green}`, borderRadius:6,
              color:running?C.textMuted:C.green, fontFamily:"monospace",
              fontWeight:700, fontSize:10, cursor:running?"not-allowed":"pointer" }}>
              {running ? "⏳ SCANNING…" : "🛡 RUN TRUTH SHIELD SCAN"}
            </button>
        }
      </div>
      <div ref={logRef} style={{ background:"#04050A", border:`1px solid ${C.border}`,
        borderRadius:8, padding:14, height:340, overflowY:"auto", fontFamily:"monospace", marginBottom:12 }}>
        {tsLog.length === 0
          ? <div style={{ color:C.textMuted, fontSize:11 }}>
              <div>$ truth_shield --watch --mode=feed --ipfs=enabled</div>
              <div style={{ marginTop:8, color:"#222" }}>Awaiting scan. Switch to OFA and run scan.</div>
              <div style={{ color:C.green, marginTop:4 }}>█</div>
            </div>
          : tsLog.map((e,i)=>(
              <div key={i} style={{ fontSize:11, marginBottom:3,
                color:e.type==="done"||e.type==="clear"?C.green:e.type==="warn"?C.amber:e.type==="pass"?C.blueSoft:e.type==="ipfs"?C.purple:C.textDim }}>
                {e.type!=="done"?"> ":""}{e.text}
              </div>
            ))
        }
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:12 }}>
        <div style={{ fontSize:9, color:C.textMuted, letterSpacing:1, fontFamily:"monospace", marginBottom:8 }}>HOW TRUTH SHIELD REPLACES AUTO-SUPPRESSION</div>
        {[
          ["1. Platform flags","Content flagged by algorithm — normally auto-suppressed"],
          ["2. OFA intercepts","Flag queued for Truth Shield — no auto-demotion"],
          ["3. Claude analyzes","Haiku 4.5 checks credibility, context, public interest"],
          ["4. Verdict returned","Legitimate → restored; Disinfo → context label applied"],
          ["5. IPFS stored","Verdict stored permanently — immutable public record"],
          ["6. Audit on-chain","Suppression attempt logged forever — publicly auditable"],
          ["7. Appeal open","30-day community review window for any verdict"],
        ].map(([step,desc])=>(
          <div key={step} style={{ display:"flex", gap:10, padding:"5px 0",
            borderBottom:`1px solid ${C.border}`, alignItems:"flex-start" }}>
            <span style={{ fontSize:9, color:C.green, fontFamily:"monospace", minWidth:95 }}>{step}</span>
            <span style={{ fontSize:10, color:C.textDim }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode]       = useState("platform");
  const [tab, setTab]         = useState("feed");
  const [analyzing, setAnalyzing] = useState(null);
  const [verdicts, setVerdicts]   = useState({});
  const [tsLog, setTsLog]     = useState([]);
  const [running, setRunning] = useState(false);

  const sorted = [...POSTS].map(p=>({...p,_s:scorePost(p,mode)})).sort((a,b)=>b._s-a._s);

  const runTruthShield = async () => {
    if (running || mode !== "ofa") return;
    setRunning(true); setTsLog([]); setVerdicts({});
    const flagged = POSTS.filter(p=>p.flags.length>0);
    for (const post of flagged) {
      setAnalyzing(post.id);
      setTsLog(l=>[...l,{type:"start",text:`🔍 Analyzing: "${post.content.substring(0,55)}…"`}]);
      await sleep(800);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"claude-sonnet-4-20250514", max_tokens:1000,
            system:`You are Truth Shield. Analyze social media content flagged by platforms. Determine if suppression is justified or if this is censorship of legitimate public-interest content. Respond ONLY in valid JSON: {"verdict":"legitimate|disinformation|unverified|satire|opinion","confidence":0-100,"public_interest_score":0-100,"suppression_justified":false,"reasoning":"one sentence"}`,
            messages:[{role:"user",content:`Post: "${post.content}"\nAccount tier: ${post.tier}\nFlags: ${post.flags.join(", ")}\nAnalyze this.`}]
          })
        });
        const data = await resp.json();
        const raw = data.content?.find(b=>b.type==="text")?.text||"{}";
        const r = JSON.parse(raw.replace(/```json|```/g,"").trim());
        setVerdicts(v=>({...v,[post.id]:r.verdict}));
        setTsLog(l=>[...l,
          {type:r.suppression_justified?"warn":"clear", text:`${post.author}: ${r.verdict.toUpperCase()} (${r.confidence}% confidence)`},
          {type:"pass", text:`   └ ${r.reasoning}`},
          {type:"pass", text:`   └ Public interest: ${r.public_interest_score}/100 · Suppression justified: ${r.suppression_justified}`},
          {type:"ipfs", text:`   └ ◆ Verdict stored on IPFS: QmTS${post.id}v${Date.now().toString(36)}`},
        ]);
      } catch {
        setVerdicts(v=>({...v,[post.id]:"unverified"}));
        setTsLog(l=>[...l,
          {type:"warn", text:`${post.author}: UNVERIFIED (demo mode)`},
          {type:"ipfs", text:`   └ ◆ Verdict queued for IPFS`},
        ]);
      }
      setAnalyzing(null);
      await sleep(300);
    }
    setTsLog(l=>[...l,{type:"done",text:`✓ Scan complete · ${flagged.length} posts reviewed · Feed re-ranked`}]);
    setRunning(false);
  };

  const TABS = [
    {id:"feed",label:"📡 Feed"},
    {id:"log",label:"🛡 TS Log"},
    {id:"guardian",label:"👁 Guardian"},
    {id:"governance",label:"🗳 Governance"},
    {id:"tiers",label:"🔐 Tiers"},
    {id:"principles",label:"📐 Design"},
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg0, color:C.text,
      fontFamily:"'JetBrains Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#1E2535;border-radius:2px;}
        button{transition:all 0.15s ease;}
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"12px 20px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background:C.bg1, position:"sticky", top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:C.white, letterSpacing:2 }}>
            OFA <span style={{ color:C.green }}>◆</span> OPEN FEED PLATFORM
          </div>
          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:1, marginTop:1 }}>
            ANTI-SUPPRESSION · TRUTH SHIELD · GUARDIAN SHIELD · COMMUNITY GOVERNED
          </div>
        </div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {[["🛡 Truth Shield",C.green],["👁 Guardian",C.purple],["◆ IPFS",C.cyan],["🗳 On-Chain",C.amber]].map(([l,c])=>(
            <span key={l} style={{ fontSize:9, padding:"2px 7px", borderRadius:8,
              background:`${c}15`, color:c, border:`1px solid ${c}33`, fontFamily:"monospace" }}>{l}</span>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ borderBottom:`1px solid ${C.border}`, display:"flex", overflowX:"auto", background:C.bg1 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"none", border:"none", padding:"9px 14px",
            fontFamily:"monospace", fontSize:10, fontWeight:600, cursor:"pointer",
            whiteSpace:"nowrap", letterSpacing:0.5,
            color:tab===t.id?C.green:C.textDim,
            borderBottom:tab===t.id?`2px solid ${C.green}`:"2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"18px 14px" }}>

        {tab === "feed" && (
          <>
            <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:14, marginBottom:14 }}>
              <div style={{ fontSize:9, color:C.textMuted, letterSpacing:1, marginBottom:10 }}>ALGORITHM MODE</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                {Object.entries(ALGO_MODES).map(([key,val])=>(
                  <button key={key} onClick={()=>{setMode(key);setVerdicts({});}} style={{
                    padding:"7px 12px", borderRadius:6, fontFamily:"monospace", fontSize:11,
                    fontWeight:700, cursor:"pointer",
                    border:`1px solid ${mode===key?val.color:C.border}`,
                    color:mode===key?val.color:C.textDim,
                    background:mode===key?`${val.color}15`:C.bg3 }}>
                    {mode===key?"▶ ":""}{val.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:C.textDim, lineHeight:1.5 }}>
                <span style={{ color:ALGO_MODES[mode].color }}>■ </span>{ALGO_MODES[mode].desc}
              </div>
              {mode==="ofa" && (
                <button onClick={runTruthShield} disabled={running} style={{
                  marginTop:10, padding:"6px 12px",
                  background:running?C.bg3:`${C.green}20`,
                  border:`1px solid ${running?C.border:C.green}`,
                  borderRadius:6, color:running?C.textMuted:C.green,
                  fontFamily:"monospace", fontWeight:700, fontSize:10,
                  cursor:running?"not-allowed":"pointer" }}>
                  {running?"⏳ SCANNING…":"🛡 RUN TRUTH SHIELD SCAN"}
                </button>
              )}
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[
                {l:"Posts",val:POSTS.length,c:C.white},
                {l:"Suppressed",val:POSTS.filter(p=>p.flags.length).length,c:C.red},
                {l:"Ads demoted",val:mode==="ofa"?POSTS.filter(p=>p.isAd).length:0,c:C.amber},
                {l:"Accountability",val:POSTS.filter(p=>p.tags.includes("accountability")).length,c:C.green},
                {l:"Whistleblower",val:POSTS.filter(p=>p.tier==="whistleblower").length,c:C.amber},
                {l:"Anonymous",val:POSTS.filter(p=>p.tier==="anonymous").length,c:C.cyan},
              ].map(s=>(
                <div key={s.l} style={{ background:C.bg2, border:`1px solid ${C.border}`,
                  borderRadius:6, padding:"8px 10px", flex:1, minWidth:80 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:s.c, fontFamily:"monospace" }}>{s.val}</div>
                  <div style={{ fontSize:9, color:C.textMuted, marginTop:1 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {mode==="platform" && (
              <div style={{ background:`${C.red}10`, border:`1px solid ${C.red}33`,
                borderRadius:8, padding:"9px 12px", marginBottom:12, fontSize:11, color:C.red }}>
                🚫 Suppressing {POSTS.filter(p=>p.flags.length).length} posts. Switch to OFA to see what you're missing.
              </div>
            )}
            {mode==="ofa" && (
              <div style={{ background:`${C.green}08`, border:`1px solid ${C.green}22`,
                borderRadius:8, padding:"9px 12px", marginBottom:12, fontSize:11, color:C.green }}>
                ✓ OFA active — suppressed posts reviewed by Truth Shield, not auto-demoted.
                {Object.keys(verdicts).length>0&&` · ${Object.keys(verdicts).length} verdicts returned.`}
              </div>
            )}

            {sorted.map((post,i)=>(
              <PostCard key={post.id} post={post} rank={i+1} mode={mode} analyzingId={analyzing} verdicts={verdicts} />
            ))}
          </>
        )}

        {tab==="log"        && <TSLogView mode={mode} tsLog={tsLog} running={running} onRunScan={runTruthShield} />}
        {tab==="guardian"   && <GuardianView />}
        {tab==="governance" && <GovernanceView />}
        {tab==="tiers"      && <TiersView />}
        {tab==="principles" && <PrinciplesView />}
      </div>
    </div>
  );
}
