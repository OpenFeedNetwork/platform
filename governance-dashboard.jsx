import { useState, useEffect, useCallback } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OPEN FEED NETWORK — COMMUNITY GOVERNANCE DASHBOARD            ║
 * ║                                                                  ║
 * ║   Where the community governs the algorithm.                    ║
 * ║   Every vote on the blockchain. Every rule in public.           ║
 * ║   No executive override. No secret suppression.                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── MOCK DATA — replace with real blockchain + API calls ────────────────────
const MOCK_USER = {
  address:  "0x7a3f...c912",
  tokens:   2_847,
  rank:     "Guardian",
  proposals_submitted: 3,
  votes_cast: 27,
  joined:   "February 2026",
};

const MOCK_PROPOSALS = [
  {
    id: "OFP-047",
    title: "Boost local journalism amplification by 20% for verified regional reporters",
    description: "Verified journalists covering local government, city council, and community issues should receive a 20% boost in feed amplification for community members in their geographic area. This addresses the collapse of local news by ensuring community-relevant reporting reaches the people it serves.",
    proposer: "0x3b2a...f441",
    proposer_rank: "Validator",
    category: "Algorithm",
    status: "active",
    votes_yes: 18_420,
    votes_no: 4_230,
    votes_abstain: 892,
    quorum_needed: 20_000,
    tokens_required: 100,
    created_at: "May 12, 2026",
    ends_at: "May 19, 2026",
    ends_ms: Date.now() + 3 * 24 * 60 * 60 * 1000,
    blockchain_tx: "0xf7a3...b291",
    ipfs_hash: "QmX7a3...f291",
    user_voted: null,
    impact: "Feed algorithm — geographic amplification weight",
    parameter: "local_journalism_boost",
    current_value: "0%",
    proposed_value: "+20%",
  },
  {
    id: "OFP-052",
    title: "Community flagged label threshold — reduce from 10 flags to 5",
    description: "Currently a post needs 10 community flags before a 'community flagged' label appears. This is too high — harmful content can reach thousands of people before the threshold is met. Reducing to 5 flags creates faster community protection while Truth Shield completes its analysis.",
    proposer: "0x9c14...e772",
    proposer_rank: "Guardian",
    category: "Moderation",
    status: "active",
    votes_yes: 31_100,
    votes_no: 12_800,
    votes_abstain: 2_100,
    quorum_needed: 20_000,
    tokens_required: 100,
    created_at: "May 10, 2026",
    ends_at: "May 17, 2026",
    ends_ms: Date.now() + 1 * 24 * 60 * 60 * 1000,
    blockchain_tx: "0xa192...cc83",
    ipfs_hash: "QmA192...cc83",
    user_voted: "yes",
    impact: "Community moderation — flag threshold parameter",
    parameter: "community_flag_threshold",
    current_value: "10 flags",
    proposed_value: "5 flags",
  },
  {
    id: "OFP-061",
    title: "New account amplification reduction — 30% for first 7 days",
    description: "Bot accounts and spam typically post intensively in the first 48-72 hours before being detected. A 30% amplification reduction for accounts less than 7 days old would significantly reduce spam impact without preventing new genuine members from participating.",
    proposer: "0x5d8b...3319",
    proposer_rank: "Verified",
    category: "Anti-Spam",
    status: "passed",
    votes_yes: 44_200,
    votes_no: 8_100,
    votes_abstain: 3_400,
    quorum_needed: 20_000,
    tokens_required: 100,
    created_at: "May 5, 2026",
    ends_at: "May 12, 2026",
    ends_ms: Date.now() - 4 * 24 * 60 * 60 * 1000,
    blockchain_tx: "0xc884...9a11",
    ipfs_hash: "QmC884...9a11",
    user_voted: "yes",
    implemented_at: "May 13, 2026",
    impact: "Feed algorithm — new account weight",
    parameter: "new_account_amplification",
    current_value: "100%",
    proposed_value: "70% for first 7 days",
  },
  {
    id: "OFP-038",
    title: "Reduce engagement weight from 40% to 35% in OFA Score formula",
    description: "The current 40% engagement weight still allows viral misinformation to spread faster than corrections. Reducing to 35% while maintaining credibility at 65% would slow viral spread of unverified content without eliminating engagement as a signal.",
    proposer: "0x2f91...aa42",
    proposer_rank: "Guardian",
    category: "Algorithm",
    status: "failed",
    votes_yes: 14_100,
    votes_no: 22_300,
    votes_abstain: 5_100,
    quorum_needed: 20_000,
    tokens_required: 100,
    created_at: "April 28, 2026",
    ends_at: "May 5, 2026",
    ends_ms: Date.now() - 11 * 24 * 60 * 60 * 1000,
    blockchain_tx: "0xd721...3b88",
    ipfs_hash: "QmD721...3b88",
    user_voted: "no",
    impact: "Feed algorithm — engagement vs credibility balance",
    parameter: "engagement_weight",
    current_value: "40%",
    proposed_value: "35%",
  },
];

const MOCK_PARAMETERS = [
  { name:"Engagement weight",         value:"40%",          proposal:"OFP-038 (failed)", category:"Algorithm"  },
  { name:"Source credibility weight",  value:"60%",          proposal:"Genesis",          category:"Algorithm"  },
  { name:"New account amplification",  value:"70% (7 days)", proposal:"OFP-061 (passed)", category:"Anti-Spam"  },
  { name:"Community flag threshold",   value:"10 flags",     proposal:"OFP-052 (pending)",category:"Moderation" },
  { name:"Local journalism boost",     value:"0%",           proposal:"OFP-047 (voting)", category:"Algorithm"  },
  { name:"Ad content penalty",         value:"-30 pts",      proposal:"Genesis",          category:"Algorithm"  },
  { name:"Suppression review bonus",   value:"+2 pts/flag",  proposal:"Genesis",          category:"Moderation" },
  { name:"Verified account bonus",     value:"+5 pts",       proposal:"Genesis",          category:"Algorithm"  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function countdown(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function pct(yes, no, abstain) {
  const total = yes + no + abstain;
  if (!total) return { yes:0, no:0, abstain:0 };
  return {
    yes:     Math.round(yes / total * 100),
    no:      Math.round(no / total * 100),
    abstain: Math.round(abstain / total * 100),
  };
}

function fmt(n) {
  if (n >= 1000) return (n/1000).toFixed(1).replace(".0","") + "K";
  return String(n);
}

const STATUS_COLOR = {
  active: "#00D4AA",
  passed: "#4ADE80",
  failed: "#F87171",
  pending:"#FBBF24",
};

const CAT_COLOR = {
  Algorithm:  "#60A5FA",
  Moderation: "#F472B6",
  "Anti-Spam":"#A78BFA",
  Privacy:    "#34D399",
  Governance: "#FBBF24",
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function VoteBar({ yes, no, abstain, compact }) {
  const p = pct(yes, no, abstain);
  const total = yes + no + abstain;
  return (
    <div>
      <div style={{
        display:"flex", height: compact ? 6 : 10,
        borderRadius:999, overflow:"hidden", gap:2,
        background:"#0D1B2A",
      }}>
        <div style={{ width:`${p.yes}%`,  background:"#00D4AA", borderRadius:"999px 0 0 999px", transition:"width 0.8s ease" }} />
        <div style={{ width:`${p.no}%`,   background:"#F87171", transition:"width 0.8s ease" }} />
        <div style={{ width:`${p.abstain}%`, background:"#64748B", borderRadius:"0 999px 999px 0", transition:"width 0.8s ease" }} />
      </div>
      {!compact && (
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11, color:"#64748B" }}>
          <span style={{ color:"#00D4AA" }}>✓ {p.yes}% ({fmt(yes)})</span>
          <span style={{ color:"#64748B" }}>— {p.abstain}% ({fmt(abstain)})</span>
          <span style={{ color:"#F87171" }}>✗ {p.no}% ({fmt(no)})</span>
        </div>
      )}
      {!compact && (
        <div style={{ fontSize:11, color:"#475569", marginTop:4, textAlign:"center" }}>
          {fmt(total)} total votes
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal, onSelect, onVote }) {
  const [time, setTime] = useState(countdown(proposal.ends_ms));
  useEffect(() => {
    if (proposal.status !== "active") return;
    const t = setInterval(() => setTime(countdown(proposal.ends_ms)), 30000);
    return () => clearInterval(t);
  }, [proposal]);

  const total  = proposal.votes_yes + proposal.votes_no + proposal.votes_abstain;
  const quorum = Math.min(100, Math.round(total / proposal.quorum_needed * 100));

  return (
    <div
      onClick={() => onSelect(proposal)}
      style={{
        background:"#0A1628",
        border:`1px solid ${proposal.status === "active" ? "#1E3A5F" : "#0F2040"}`,
        borderLeft:`3px solid ${STATUS_COLOR[proposal.status] || "#334155"}`,
        borderRadius:12, padding:"1.2rem",
        cursor:"pointer", transition:"all 0.2s ease",
        marginBottom:12,
      }}
      onMouseEnter={e => { e.currentTarget.style.background="#0F1E35"; e.currentTarget.style.borderColor="#2A4A7F"; }}
      onMouseLeave={e => { e.currentTarget.style.background="#0A1628"; e.currentTarget.style.borderColor=proposal.status==="active"?"#1E3A5F":"#0F2040"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
            <span style={{
              fontSize:10, fontFamily:"'IBM Plex Mono',monospace",
              color:"#94A3B8", letterSpacing:0.5,
            }}>{proposal.id}</span>
            <span style={{
              fontSize:10, padding:"2px 8px", borderRadius:4,
              background:`${CAT_COLOR[proposal.category] || "#64748B"}18`,
              color: CAT_COLOR[proposal.category] || "#64748B",
              border:`1px solid ${CAT_COLOR[proposal.category] || "#64748B"}33`,
              fontFamily:"'IBM Plex Mono',monospace",
            }}>{proposal.category}</span>
            <span style={{
              fontSize:10, padding:"2px 8px", borderRadius:4,
              background:`${STATUS_COLOR[proposal.status]}18`,
              color: STATUS_COLOR[proposal.status],
              border:`1px solid ${STATUS_COLOR[proposal.status]}44`,
              fontFamily:"'IBM Plex Mono',monospace", fontWeight:600,
            }}>{proposal.status.toUpperCase()}</span>
            {proposal.user_voted && (
              <span style={{
                fontSize:10, padding:"2px 8px", borderRadius:4,
                background: proposal.user_voted==="yes" ? "#00D4AA18" : "#F8717118",
                color: proposal.user_voted==="yes" ? "#00D4AA" : "#F87171",
                fontFamily:"'IBM Plex Mono',monospace",
              }}>YOU VOTED {proposal.user_voted.toUpperCase()}</span>
            )}
          </div>
          <div style={{
            fontSize:15, fontWeight:600, color:"#E2E8F0",
            fontFamily:"'Fraunces',serif", lineHeight:1.4,
          }}>{proposal.title}</div>
        </div>
      </div>

      <VoteBar yes={proposal.votes_yes} no={proposal.votes_no} abstain={proposal.votes_abstain} compact />

      <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, fontSize:11, color:"#475569" }}>
        <span style={{ color: quorum >= 100 ? "#00D4AA" : "#FBBF24" }}>
          Quorum: {quorum}% {quorum >= 100 ? "✓" : `(need ${fmt(proposal.quorum_needed)})`}
        </span>
        {proposal.status === "active" && (
          <span style={{ color:"#94A3B8", fontFamily:"'IBM Plex Mono',monospace" }}>
            ⏱ {time}
          </span>
        )}
        {proposal.status !== "active" && (
          <span style={{ color: STATUS_COLOR[proposal.status], fontFamily:"'IBM Plex Mono',monospace", fontSize:10 }}>
            {proposal.status === "passed" ? `✓ Implemented ${proposal.implemented_at}` : "✗ Did not pass"}
          </span>
        )}
      </div>

      {proposal.status === "active" && !proposal.user_voted && (
        <div style={{ display:"flex", gap:8, marginTop:12 }} onClick={e=>e.stopPropagation()}>
          {["yes","no","abstain"].map(vote => (
            <button key={vote} onClick={() => onVote(proposal.id, vote)} style={{
              flex:1, padding:"7px 0",
              background: vote==="yes" ? "#00D4AA18" : vote==="no" ? "#F8717118" : "#64748B18",
              border:`1px solid ${vote==="yes" ? "#00D4AA" : vote==="no" ? "#F87171" : "#64748B"}44`,
              borderRadius:6, cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace",
              fontSize:11, fontWeight:600, letterSpacing:0.5,
              color: vote==="yes" ? "#00D4AA" : vote==="no" ? "#F87171" : "#64748B",
              transition:"all 0.15s",
            }}>
              {vote==="yes" ? "✓ YES" : vote==="no" ? "✗ NO" : "— ABSTAIN"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalModal({ proposal, onClose, onVote }) {
  const [time, setTime] = useState(countdown(proposal.ends_ms));
  useEffect(() => {
    const t = setInterval(() => setTime(countdown(proposal.ends_ms)), 1000);
    return () => clearInterval(t);
  }, [proposal]);

  const p = pct(proposal.votes_yes, proposal.votes_no, proposal.votes_abstain);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
      backdropFilter:"blur(8px)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={onClose}>
      <div style={{
        background:"#060E1A", border:`1px solid #1E3A5F`,
        borderRadius:16, width:"100%", maxWidth:680,
        maxHeight:"90vh", overflowY:"auto",
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding:"1.2rem 1.5rem",
          borderBottom:"1px solid #0F2040",
          display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12,
        }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace", color:"#94A3B8" }}>{proposal.id}</span>
              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:`${STATUS_COLOR[proposal.status]}18`, color:STATUS_COLOR[proposal.status], fontFamily:"'IBM Plex Mono',monospace", fontWeight:600 }}>{proposal.status.toUpperCase()}</span>
              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:`${CAT_COLOR[proposal.category]}18`, color:CAT_COLOR[proposal.category], fontFamily:"'IBM Plex Mono',monospace" }}>{proposal.category}</span>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:"#E2E8F0", fontFamily:"'Fraunces',serif", lineHeight:1.4 }}>{proposal.title}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:20, flexShrink:0 }}>✕</button>
        </div>

        <div style={{ padding:"1.2rem 1.5rem" }}>
          {/* Description */}
          <p style={{ fontSize:14, color:"#94A3B8", lineHeight:1.7, marginBottom:"1.2rem" }}>
            {proposal.description}
          </p>

          {/* Parameter change */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:"1.2rem" }}>
            {[
              { label:"Current value", value:proposal.current_value, color:"#F87171" },
              { label:"Proposed value", value:proposal.proposed_value, color:"#00D4AA" },
            ].map(item => (
              <div key={item.label} style={{ background:"#0A1628", borderRadius:8, padding:"0.8rem", border:`1px solid ${item.color}22` }}>
                <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:16, fontWeight:700, color:item.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.value}</div>
                <div style={{ fontSize:10, color:"#475569", marginTop:4 }}>{proposal.parameter}</div>
              </div>
            ))}
          </div>

          {/* Live vote breakdown */}
          <div style={{ background:"#0A1628", borderRadius:10, padding:"1rem", marginBottom:"1.2rem" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#94A3B8", marginBottom:12, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:0.5 }}>
              LIVE VOTE RESULTS
              {proposal.status === "active" && <span style={{ color:"#00D4AA", marginLeft:8 }}>● LIVE</span>}
            </div>
            <VoteBar yes={proposal.votes_yes} no={proposal.votes_no} abstain={proposal.votes_abstain} />

            {/* Individual bars */}
            {[
              { label:"In Favor",  value:proposal.votes_yes,     pct:p.yes,     color:"#00D4AA" },
              { label:"Against",   value:proposal.votes_no,      pct:p.no,      color:"#F87171" },
              { label:"Abstain",   value:proposal.votes_abstain, pct:p.abstain, color:"#64748B" },
            ].map(row => (
              <div key={row.label} style={{ display:"flex", alignItems:"center", gap:10, marginTop:10 }}>
                <span style={{ fontSize:11, color:"#475569", width:70 }}>{row.label}</span>
                <div style={{ flex:1, height:4, background:"#0D1B2A", borderRadius:999, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${row.pct}%`, background:row.color, borderRadius:999, transition:"width 0.8s ease" }} />
                </div>
                <span style={{ fontSize:12, color:row.color, fontFamily:"'IBM Plex Mono',monospace", width:80, textAlign:"right" }}>
                  {fmt(row.value)} ({row.pct}%)
                </span>
              </div>
            ))}
          </div>

          {/* Quorum + timer */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:"1.2rem" }}>
            <div style={{ background:"#0A1628", borderRadius:8, padding:"0.8rem" }}>
              <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>QUORUM</div>
              <div style={{ fontSize:18, fontWeight:700, color: (proposal.votes_yes+proposal.votes_no+proposal.votes_abstain) >= proposal.quorum_needed ? "#00D4AA" : "#FBBF24", fontFamily:"'IBM Plex Mono',monospace" }}>
                {Math.min(100,Math.round((proposal.votes_yes+proposal.votes_no+proposal.votes_abstain)/proposal.quorum_needed*100))}%
              </div>
              <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>Need {fmt(proposal.quorum_needed)} total</div>
            </div>
            <div style={{ background:"#0A1628", borderRadius:8, padding:"0.8rem" }}>
              <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>
                {proposal.status === "active" ? "TIME REMAINING" : "STATUS"}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color: STATUS_COLOR[proposal.status], fontFamily:"'IBM Plex Mono',monospace" }}>
                {proposal.status === "active" ? time : proposal.status.toUpperCase()}
              </div>
              <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>Ends {proposal.ends_at}</div>
            </div>
          </div>

          {/* Blockchain proof */}
          <div style={{ background:"#0A1628", borderRadius:8, padding:"0.8rem", marginBottom:"1.2rem", border:"1px solid #1E3A5F" }}>
            <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:6, letterSpacing:0.5 }}>BLOCKCHAIN VERIFICATION</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <div style={{ fontSize:11, color:"#64748B", fontFamily:"'IBM Plex Mono',monospace" }}>
                TX: <span style={{ color:"#60A5FA" }}>{proposal.blockchain_tx}</span>
              </div>
              <div style={{ fontSize:11, color:"#64748B", fontFamily:"'IBM Plex Mono',monospace" }}>
                IPFS: <span style={{ color:"#60A5FA" }}>{proposal.ipfs_hash}</span>
              </div>
              <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>
                Every vote is permanently recorded on the Polygon blockchain. This proposal cannot be altered, deleted, or overridden by any administrator.
              </div>
            </div>
          </div>

          {/* Vote buttons */}
          {proposal.status === "active" && !proposal.user_voted && (
            <div>
              <div style={{ fontSize:12, color:"#475569", marginBottom:10, fontFamily:"'IBM Plex Mono',monospace" }}>
                YOUR VOTE · {fmt(MOCK_USER.tokens)} tokens available
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {["yes","no","abstain"].map(vote => (
                  <button key={vote} onClick={() => { onVote(proposal.id, vote); onClose(); }} style={{
                    flex:1, padding:"10px 0",
                    background: vote==="yes" ? "#00D4AA18" : vote==="no" ? "#F8717118" : "#64748B18",
                    border:`1px solid ${vote==="yes" ? "#00D4AA" : vote==="no" ? "#F87171" : "#64748B"}`,
                    borderRadius:8, cursor:"pointer",
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700, letterSpacing:1,
                    color: vote==="yes" ? "#00D4AA" : vote==="no" ? "#F87171" : "#64748B",
                  }}>
                    {vote==="yes" ? "✓ VOTE YES" : vote==="no" ? "✗ VOTE NO" : "— ABSTAIN"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {proposal.user_voted && (
            <div style={{
              padding:"10px 14px", borderRadius:8,
              background:`${proposal.user_voted==="yes" ? "#00D4AA" : "#F87171"}12`,
              border:`1px solid ${proposal.user_voted==="yes" ? "#00D4AA" : "#F87171"}33`,
              fontSize:12, color:proposal.user_voted==="yes" ? "#00D4AA" : "#F87171",
              fontFamily:"'IBM Plex Mono',monospace", textAlign:"center",
            }}>
              ✓ You voted {proposal.user_voted.toUpperCase()} on this proposal — recorded on blockchain
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function GovernanceDashboard() {
  const [proposals, setProposals] = useState(MOCK_PROPOSALS);
  const [filter, setFilter]       = useState("all");
  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState("proposals");
  const [toast, setToast]         = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [newProposal, setNewProposal] = useState({ title:"", description:"", category:"Algorithm", parameter:"", current:"", proposed:"" });

  const showToast = (msg, color="#00D4AA") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 4000);
  };

  const handleVote = useCallback((proposalId, vote) => {
    setProposals(prev => prev.map(p =>
      p.id === proposalId
        ? { ...p,
            user_voted:     vote,
            votes_yes:      vote === "yes"     ? p.votes_yes + MOCK_USER.tokens     : p.votes_yes,
            votes_no:       vote === "no"      ? p.votes_no + MOCK_USER.tokens      : p.votes_no,
            votes_abstain:  vote === "abstain" ? p.votes_abstain + MOCK_USER.tokens : p.votes_abstain,
          }
        : p
    ));
    showToast(`✓ Vote cast — recorded on Polygon blockchain`);
  }, []);

  const filtered = proposals.filter(p =>
    filter === "all"    ? true :
    filter === "active" ? p.status === "active" :
    filter === "voted"  ? p.user_voted !== null :
    p.status === filter
  );

  const activeCount = proposals.filter(p => p.status === "active").length;
  const userVoted   = proposals.filter(p => p.user_voted).length;

  return (
    <div style={{
      minHeight:"100vh",
      background:"#030912",
      color:"#E2E8F0",
      fontFamily:"'IBM Plex Sans',sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#1E3A5F;border-radius:2px}
        input,textarea,select,button{font-family:inherit;outline:none}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* HEADER */}
      <div style={{
        background:"#060E1A",
        borderBottom:"1px solid #0F2040",
        padding:"14px 20px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div>
            <div style={{ fontSize:11, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:1, marginBottom:2 }}>
              OPEN FEED NETWORK
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"#E2E8F0", fontFamily:"'Fraunces',serif", letterSpacing:0.5 }}>
              Community Governance
            </div>
          </div>
          <div style={{
            width:8, height:8, borderRadius:"50%", background:"#00D4AA",
            boxShadow:"0 0 12px #00D4AA", animation:"pulse 2s ease infinite",
          }} />
          <span style={{ fontSize:10, color:"#00D4AA", fontFamily:"'IBM Plex Mono',monospace" }}>
            POLYGON MAINNET
          </span>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* User token balance */}
          <div style={{
            background:"#0A1628", border:"1px solid #1E3A5F",
            borderRadius:8, padding:"6px 12px",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#FBBF24" }} />
            <span style={{ fontSize:12, color:"#FBBF24", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600 }}>
              {MOCK_USER.tokens.toLocaleString()} OFA
            </span>
            <span style={{ fontSize:10, color:"#475569" }}>{MOCK_USER.rank}</span>
          </div>
          <div style={{
            fontSize:11, color:"#475569", fontFamily:"'IBM Plex Mono',monospace",
          }}>
            {MOCK_USER.address}
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
        gap:10, padding:"16px 20px",
        maxWidth:1100, margin:"0 auto",
      }}>
        {[
          { label:"Active Proposals",    value:activeCount,              color:"#00D4AA", sub:"Voting open"          },
          { label:"Your Voting Power",   value:MOCK_USER.tokens.toLocaleString(), color:"#FBBF24", sub:MOCK_USER.rank },
          { label:"Proposals You Voted", value:userVoted,                color:"#60A5FA", sub:"This cycle"           },
          { label:"Proposals Submitted", value:MOCK_USER.proposals_submitted, color:"#A78BFA", sub:"By you"          },
          { label:"Total Passed",        value:proposals.filter(p=>p.status==="passed").length, color:"#4ADE80", sub:"All time" },
        ].map((s,i) => (
          <div key={i} style={{
            background:"#060E1A", border:"1px solid #0F2040",
            borderTop:`2px solid ${s.color}`,
            borderRadius:10, padding:"12px 14px",
            animation:`fadeIn 0.4s ease ${i*0.08}s both`,
          }}>
            <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:0.5, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#334155", marginTop:4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={{
        display:"flex", gap:0, padding:"0 20px",
        borderBottom:"1px solid #0F2040",
        maxWidth:1100, margin:"0 auto",
      }}>
        {[
          { id:"proposals", label:"Proposals" },
          { id:"parameters", label:"Live Parameters" },
          { id:"history", label:"Vote History" },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"10px 18px", background:"none", border:"none",
            borderBottom: tab===t.id ? "2px solid #00D4AA" : "2px solid transparent",
            color: tab===t.id ? "#00D4AA" : "#475569",
            cursor:"pointer", fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
            fontWeight: tab===t.id ? 700 : 400, letterSpacing:0.5,
            transition:"all 0.15s",
          }}>{t.label.toUpperCase()}</button>
        ))}
        <div style={{ flex:1 }} />
        <button onClick={() => setShowSubmit(true)} style={{
          margin:"6px 0",
          padding:"6px 14px",
          background:"#00D4AA18", border:"1px solid #00D4AA",
          borderRadius:6, color:"#00D4AA", cursor:"pointer",
          fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:700,
        }}>+ SUBMIT PROPOSAL</button>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"16px 20px" }}>

        {/* PROPOSALS TAB */}
        {tab === "proposals" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            {/* Filter tabs */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {["all","active","passed","failed","voted"].map(f => (
                <button key={f} onClick={()=>setFilter(f)} style={{
                  padding:"5px 12px", borderRadius:20,
                  background: filter===f ? "#00D4AA18" : "transparent",
                  border:`1px solid ${filter===f ? "#00D4AA" : "#1E3A5F"}`,
                  color: filter===f ? "#00D4AA" : "#475569",
                  cursor:"pointer", fontSize:11, fontFamily:"'IBM Plex Mono',monospace",
                  fontWeight: filter===f ? 700 : 400,
                }}>{f.toUpperCase()}</button>
              ))}
              <span style={{ fontSize:11, color:"#334155", alignSelf:"center", marginLeft:4 }}>
                {filtered.length} proposal{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#334155", fontSize:13 }}>
                No proposals match this filter.
              </div>
            )}

            {filtered.map(p => (
              <ProposalCard key={p.id} proposal={p} onSelect={setSelected} onVote={handleVote} />
            ))}
          </div>
        )}

        {/* PARAMETERS TAB */}
        {tab === "parameters" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{
              padding:"10px 14px", background:"#0A1628",
              border:"1px solid #1E3A5F", borderRadius:8, marginBottom:16,
              fontSize:12, color:"#64748B", lineHeight:1.6,
            }}>
              These are the live algorithm parameters governing the OFA feed. Every value was set by community vote and is enforced by smart contract on the Polygon blockchain. No administrator can change these values without a passing governance proposal.
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {MOCK_PARAMETERS.map((param, i) => (
                <div key={i} style={{
                  background:"#060E1A", border:"1px solid #0F2040",
                  borderLeft:`3px solid ${CAT_COLOR[param.category] || "#334155"}`,
                  borderRadius:10, padding:"1rem",
                  animation:`fadeIn 0.3s ease ${i*0.06}s both`,
                }}>
                  <div style={{ fontSize:10, color:`${CAT_COLOR[param.category]}`, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:0.5, marginBottom:6 }}>
                    {param.category.toUpperCase()}
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#94A3B8", marginBottom:8 }}>{param.name}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#00D4AA", fontFamily:"'IBM Plex Mono',monospace", marginBottom:8 }}>
                    {param.value}
                  </div>
                  <div style={{ fontSize:10, color:"#334155", fontFamily:"'IBM Plex Mono',monospace" }}>
                    Set by {param.proposal}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              marginTop:20, padding:"14px 16px",
              background:"#0A1628", border:"1px solid #1E3A5F",
              borderRadius:10, fontSize:12, color:"#475569", lineHeight:1.7,
            }}>
              <div style={{ fontWeight:600, color:"#94A3B8", marginBottom:6, fontFamily:"'IBM Plex Mono',monospace", fontSize:10, letterSpacing:0.5 }}>
                IMMUTABLE PARAMETERS — CANNOT BE CHANGED BY GOVERNANCE
              </div>
              {[
                "suppress_post: false — Content is never hidden. This is constitutionally protected and hardcoded.",
                "CSAM reporting — Federal law requires reporting. This cannot be voted away.",
                "FBI terrorism reporting — Federal law. Non-negotiable.",
                "Care Shield crisis response — The warm response protocol is hardcoded.",
                "ZK privacy protections — User privacy cannot be voted away.",
              ].map((item, i) => (
                <div key={i} style={{ display:"flex", gap:8, marginBottom:4 }}>
                  <span style={{ color:"#F87171", flexShrink:0 }}>🔒</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{
              padding:"10px 14px", background:"#0A1628",
              border:"1px solid #1E3A5F", borderRadius:8, marginBottom:16,
              fontSize:12, color:"#64748B",
            }}>
              Every vote you cast is permanently recorded on the Polygon blockchain. Your voting history is public, verifiable, and cannot be altered.
            </div>

            {proposals.filter(p => p.user_voted).map((p, i) => (
              <div key={i} style={{
                background:"#060E1A", border:"1px solid #0F2040",
                borderLeft:`3px solid ${p.user_voted==="yes" ? "#00D4AA" : "#F87171"}`,
                borderRadius:10, padding:"1rem", marginBottom:10,
                animation:`fadeIn 0.3s ease ${i*0.08}s both`,
                cursor:"pointer",
              }} onClick={() => setSelected(p)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div>
                    <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{p.id} · {p.ends_at}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:"#E2E8F0", fontFamily:"'Fraunces',serif" }}>{p.title}</div>
                  </div>
                  <div style={{
                    padding:"4px 12px", borderRadius:6,
                    background:`${p.user_voted==="yes" ? "#00D4AA" : "#F87171"}18`,
                    color: p.user_voted==="yes" ? "#00D4AA" : "#F87171",
                    fontSize:11, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700,
                    flexShrink:0,
                  }}>
                    {p.user_voted==="yes" ? "✓ YES" : "✗ NO"}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:`${STATUS_COLOR[p.status]}18`, color:STATUS_COLOR[p.status], fontFamily:"'IBM Plex Mono',monospace" }}>
                    {p.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize:10, color:"#334155", fontFamily:"'IBM Plex Mono',monospace" }}>TX: {p.blockchain_tx}</span>
                </div>
              </div>
            ))}

            {proposals.filter(p=>p.user_voted).length === 0 && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#334155", fontSize:13 }}>
                You have not voted on any proposals yet. Cast your first vote above.
              </div>
            )}
          </div>
        )}
      </div>

      {/* SUBMIT PROPOSAL MODAL */}
      {showSubmit && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
          backdropFilter:"blur(8px)", zIndex:200,
          display:"flex", alignItems:"center", justifyContent:"center", padding:20,
        }} onClick={() => setShowSubmit(false)}>
          <div style={{
            background:"#060E1A", border:"1px solid #1E3A5F",
            borderRadius:16, width:"100%", maxWidth:560,
            maxHeight:"90vh", overflowY:"auto",
          }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"1.2rem 1.5rem", borderBottom:"1px solid #0F2040", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#E2E8F0", fontFamily:"'Fraunces',serif" }}>Submit Governance Proposal</div>
              <button onClick={() => setShowSubmit(false)} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
            </div>
            <div style={{ padding:"1.2rem 1.5rem" }}>
              <div style={{ padding:"10px 12px", background:"#0A1628", border:"1px solid #FBBF2433", borderRadius:8, fontSize:12, color:"#FBBF24", marginBottom:"1.2rem", lineHeight:1.6 }}>
                ⚠ You need at least 100 OFA tokens to submit a proposal. You have {MOCK_USER.tokens.toLocaleString()} tokens. Proposals are voted on for 7 days.
              </div>

              {[
                { label:"Proposal Title", field:"title", type:"input", placeholder:"Clear, specific title describing the proposed change" },
                { label:"Description", field:"description", type:"textarea", placeholder:"Explain the problem, the proposed solution, and why the community should vote yes. Be specific about the impact." },
                { label:"Algorithm Parameter", field:"parameter", type:"input", placeholder:"e.g. local_journalism_boost" },
                { label:"Current Value", field:"current", type:"input", placeholder:"e.g. 0%" },
                { label:"Proposed Value", field:"proposed", type:"input", placeholder:"e.g. +20%" },
              ].map(f => (
                <div key={f.field} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:0.5, marginBottom:6 }}>{f.label.toUpperCase()}</div>
                  {f.type === "textarea" ? (
                    <textarea
                      value={newProposal[f.field]}
                      onChange={e => setNewProposal(p => ({...p, [f.field]:e.target.value}))}
                      placeholder={f.placeholder}
                      rows={4}
                      style={{ width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:6, padding:"8px 10px", color:"#E2E8F0", fontSize:13, resize:"vertical" }}
                    />
                  ) : (
                    <input
                      value={newProposal[f.field]}
                      onChange={e => setNewProposal(p => ({...p, [f.field]:e.target.value}))}
                      placeholder={f.placeholder}
                      style={{ width:"100%", background:"#0A1628", border:"1px solid #1E3A5F", borderRadius:6, padding:"8px 10px", color:"#E2E8F0", fontSize:13 }}
                    />
                  )}
                </div>
              ))}

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setShowSubmit(false)} style={{ flex:1, padding:"10px", background:"none", border:"1px solid #1E3A5F", borderRadius:8, color:"#475569", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace", fontSize:12 }}>
                  CANCEL
                </button>
                <button onClick={() => {
                  if (!newProposal.title.trim() || !newProposal.description.trim()) return;
                  setShowSubmit(false);
                  setNewProposal({ title:"", description:"", category:"Algorithm", parameter:"", current:"", proposed:"" });
                  showToast("✓ Proposal submitted — voting opens in 24 hours after community review");
                }} style={{
                  flex:2, padding:"10px",
                  background:"#00D4AA18", border:"1px solid #00D4AA",
                  borderRadius:8, color:"#00D4AA", cursor:"pointer",
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:700,
                }}>
                  SUBMIT TO BLOCKCHAIN →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROPOSAL DETAIL MODAL */}
      {selected && (
        <ProposalModal
          proposal={selected}
          onClose={() => setSelected(null)}
          onVote={(id, vote) => { handleVote(id, vote); setSelected(null); }}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24,
          padding:"12px 18px", borderRadius:10,
          background:"#060E1A", border:`1px solid ${toast.color}44`,
          color:toast.color, fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
          animation:"fadeIn 0.2s ease", zIndex:300, maxWidth:380,
          boxShadow:`0 0 30px ${toast.color}22`,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
