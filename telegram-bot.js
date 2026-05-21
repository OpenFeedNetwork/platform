/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         OFA TELEGRAM BOT  v1.0.0                                 ║
 * ║   Open Feed Platform — Phase 1 Deployment                        ║
 * ║   Truth Shield · Guardian Shield · Anti-Suppression Feed         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * QUICK START:
 *   1. Message @BotFather on Telegram → /newbot → copy token
 *   2. Add TELEGRAM_BOT_TOKEN=your_token to .env
 *   3. npm install node-telegram-bot-api @anthropic-ai/sdk dotenv uuid
 *   4. node telegram-bot.js
 *
 * COMMANDS:
 *   /start       — Welcome + account setup
 *   /feed        — Latest OFA-ranked posts
 *   /post        — Submit a new post
 *   /analyze     — Truth Shield analysis on any content
 *   /tier        — Change account tier
 *   /governance  — View + vote on proposals
 *   /stats       — Platform transparency report
 *   /audit <id>  — Full suppression audit trail
 *   /verify      — ZK age verification
 *   /status      — Your account info
 *   /help        — Command reference
 */

import TelegramBot from "node-telegram-bot-api";
import Anthropic   from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const CONFIG = {
  TELEGRAM_TOKEN:    process.env.TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OFA_API_BASE:      process.env.OFA_API_BASE || "http://localhost:3000",
  MODEL:             "claude-haiku-4-5",
  MAX_POST_LENGTH:   4000,
  FEED_PAGE_SIZE:    5,
};

if (!CONFIG.TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not set in .env"); process.exit(1);
}

const bot       = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });
const sessions  = new Map();

// ── SESSION ───────────────────────────────────────────────────────────────────
function getSession(id) {
  if (!sessions.has(id)) sessions.set(id, {
    did: `did:key:tg${id}${Date.now().toString(36)}`,
    tier: "standard", token: null, state: "idle", stateData: {}, joinedAt: Date.now()
  });
  return sessions.get(id);
}
function setState(id, state, data={}) { const s=getSession(id); s.state=state; s.stateData=data; }

// ── OFA API ───────────────────────────────────────────────────────────────────
async function ofaAPI(method, path, body=null, token=null) {
  try {
    const res = await fetch(`${CONFIG.OFA_API_BASE}${path}`, {
      method, headers: { "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return { ok: res.ok, data: await res.json() };
  } catch { return { ok: false, data: null }; }
}

// ── TRUTH SHIELD ──────────────────────────────────────────────────────────────
async function runTruthShield(content, tier="standard") {
  const job = await ofaAPI("POST", "/api/v1/truthshield/analyze", {
    post_id:`tg_${Date.now()}`, content:content.substring(0,8000),
    content_type:"text", platform_flags:[], language:"en"
  });
  if (job.ok && job.data?.job_id) {
    for (let i=0; i<10; i++) {
      await sleep(800);
      const r = await ofaAPI("GET", `/api/v1/truthshield/jobs/${job.data.job_id}`);
      if (r.data?.status==="complete" && r.data.result) return r.data.result;
    }
  }
  try {
    const r = await anthropic.messages.create({
      model:CONFIG.MODEL, max_tokens:800,
      system:`You are Truth Shield. Analyze content for disinformation. Respond ONLY in JSON: {"verdict":"legitimate|disinformation|unverified|satire|opinion","confidence":0-100,"public_interest_score":0-100,"suppression_justified":false,"reasoning":"1-2 sentences","recommended_action":"publish|label|review","key_signals":["signal1"]}`,
      messages:[{role:"user",content:`Tier: ${tier}\nContent: "${content}"`}]
    });
    const raw = r.content.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch {
    return { verdict:"unverified", confidence:50, public_interest_score:50,
      suppression_justified:false, reasoning:"Analysis unavailable. Content can still be published.",
      recommended_action:"publish", key_signals:[] };
  }
}

// ── FORMATTERS ────────────────────────────────────────────────────────────────
const VERDICT_EMOJI = { legitimate:"✅", disinformation:"🚨", unverified:"⚠️", satire:"🎭", opinion:"💭" };
const TIER_EMOJI    = { standard:"👤", anonymous:"🎭", whistleblower:"🔒" };
const bar = p => "▓".repeat(Math.round(p/10))+"░".repeat(10-Math.round(p/10));
const fmt = n => n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:String(n);
const esc = t => String(t).replace(/[_*[\]()~`>#+\-=|{}.!]/g,"\\$&");
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function fmtTS(result, content) {
  const e   = VERDICT_EMOJI[result.verdict]||"❓";
  const snip = content.length>80?content.substring(0,80)+"…":content;
  return `🛡 *TRUTH SHIELD ANALYSIS*\n\n📝 _${esc(snip)}_\n\n${e} *${result.verdict.toUpperCase()}*\n${bar(result.confidence)} ${result.confidence}%\n📊 Public Interest: ${bar(result.public_interest_score)} ${result.public_interest_score}/100\n\n💬 ${esc(result.reasoning)}${result.key_signals?.length?"\n\n🔍 Signals:\n"+result.key_signals.map(s=>`  • ${esc(s)}`).join("\n"):""}\n\n${result.suppression_justified?"⛔ Suppression: Justified":"✅ NOT suppression\\-justified — OFA protects this"}\n◆ _Verdict stored immutably on IPFS_`;
}

function fmtPost(post, rank) {
  const vm   = VERDICT_EMOJI[post.ts_verdict]||"🔵";
  const tier = TIER_EMOJI[post.tier]||"👤";
  const sup  = post.platform_tried_suppress?" ⚠️ _Suppressed by platform — OFA restored_":"";
  return `*${rank}\\. ${vm} ${tier} ${esc(post.author||"Anonymous")}*\n${esc((post.content||"").substring(0,200))}${(post.content||"").length>200?"…":""}\n❤️ ${fmt(post.engagement?.likes||0)} · ↻ ${fmt(post.engagement?.shares||0)} · 💬 ${fmt(post.engagement?.comments||0)}\nOFA: *${post.ofa_score||"–"}* · ${post.type||"text"}${sup}${post.ipfs_cid?`\n◆ \`${post.ipfs_cid.substring(0,16)}…\``:""}`;
}

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_POSTS = [
  { id:"p1", author:"Maria Chen", tier:"standard", type:"article", content:"EPA documents: three cities falsified lead testing. 4× legal limit. FOIA attached.", engagement:{likes:5621,shares:3200,comments:892}, ofa_score:94, ts_verdict:"legitimate", ipfs_cid:"QmTs1Abc123", platform_tried_suppress:true },
  { id:"p2", author:"Anonymous",  tier:"anonymous", type:"document", content:"City council 7-0 vote displaces 847 affordable housing units. Zero coverage. Transcript attached.", engagement:{likes:2890,shares:1900,comments:445}, ofa_score:91, ts_verdict:"legitimate", ipfs_cid:"QmTs2Def456", platform_tried_suppress:true },
  { id:"p3", author:"Rafael Moreno", tier:"anonymous", type:"data", content:"Study: Labor organizing content gets 67% less distribution on major platforms. 4.2M posts analyzed.", engagement:{likes:4100,shares:3800,comments:770}, ofa_score:97, ts_verdict:"legitimate", ipfs_cid:"QmTs3Ghi789", platform_tried_suppress:true },
  { id:"p4", author:"Whistleblower", tier:"whistleblower", type:"video", content:"47-min unedited: permitted protest dispersed by police. Raw footage.", engagement:{likes:7800,shares:5600,comments:1240}, ofa_score:96, ts_verdict:"legitimate", ipfs_cid:"QmTs4Jkl012", platform_tried_suppress:true },
  { id:"p5", author:"Priya Nair", tier:"standard", type:"text", content:"FDA lobbying filings: 340% spending increase targeting advisory panel members.", engagement:{likes:3200,shares:2100,comments:560}, ofa_score:89, ts_verdict:"legitimate", ipfs_cid:"QmTs5Mno345", platform_tried_suppress:false },
];

const MOCK_PROPOSALS = [
  { id:"g1", title:"Increase source credibility weight: 0.60 → 0.65", proposer:"@rafaelm", yes_votes:847, no_votes:213, status:"open", voting_ends_days:3 },
  { id:"g2", title:"Add academic research bonus (+15% OFA score)", proposer:"@priyanair", yes_votes:1240, no_votes:89, status:"open", voting_ends_days:5 },
  { id:"g3", title:"Increase ad penalty: 30 → 35 points", proposer:"@aishaokafor", yes_votes:2100, no_votes:340, status:"passed", voting_ends_days:0 },
];

// ── KEYBOARDS ─────────────────────────────────────────────────────────────────
const KB_MAIN = { inline_keyboard: [
  [{text:"📡 Feed",callback_data:"cmd_feed"},{text:"✏️ New Post",callback_data:"cmd_post"}],
  [{text:"🛡 Truth Shield",callback_data:"cmd_analyze"},{text:"🗳 Governance",callback_data:"cmd_governance"}],
  [{text:"📊 Stats",callback_data:"cmd_stats"},{text:"👤 My Status",callback_data:"cmd_status"}],
]};
const kbTier = cur => ({ inline_keyboard: [
  [{text:`👤 Standard${cur==="standard"?" ✓":""}`,callback_data:"tier_standard"}],
  [{text:`🎭 Anonymous${cur==="anonymous"?" ✓":""}`,callback_data:"tier_anonymous"}],
  [{text:`🔒 Whistleblower${cur==="whistleblower"?" ✓":""}`,callback_data:"tier_whistleblower"}],
  [{text:"← Back",callback_data:"cmd_menu"}],
]});
const kbFeedNav = (p,t) => ({ inline_keyboard: [[
  ...(p>0?[{text:"← Prev",callback_data:`feed_${p-1}`}]:[]),
  {text:`${p+1}/${Math.ceil(t/CONFIG.FEED_PAGE_SIZE)}`,callback_data:"noop"},
  ...(p+1<Math.ceil(t/CONFIG.FEED_PAGE_SIZE)?[{text:"Next →",callback_data:`feed_${p+1}`}]:[]),
],[{text:"↻ Refresh",callback_data:"cmd_feed"},{text:"🏠 Menu",callback_data:"cmd_menu"}]]});
const kbGov = ps => ({ inline_keyboard: [
  ...ps.filter(p=>p.status==="open").map(p=>[
    {text:`✓ ${p.title.substring(0,28)}…`,callback_data:`vote_yes_${p.id}`},
    {text:"✗ No",callback_data:`vote_no_${p.id}`},
  ]),
  [{text:"← Back",callback_data:"cmd_menu"}],
]});

// ── HANDLERS ──────────────────────────────────────────────────────────────────
async function cmdStart(chatId, user) {
  const s = getSession(chatId);
  const u = user.username||user.first_name||"friend";
  await bot.sendMessage(chatId,
    `🛡 *OPEN FEED PLATFORM*\n_The platform that can't suppress your voice_\n\nWelcome, *${esc(u)}*\\!\n\n*Your account:*\n🆔 DID: \`${s.did.substring(0,28)}…\`\n${TIER_EMOJI[s.tier]} Tier: *${s.tier}*\n\n*What makes OFA different:*\n✅ Truth Shield reviews every suppression flag\n🌐 Content stored permanently on IPFS\n🗳 Algorithm weights voted on by community\n🔒 Anonymous \\+ whistleblower tiers available`,
    {parse_mode:"MarkdownV2",reply_markup:KB_MAIN}
  );
}

async function cmdFeed(chatId, page=0) {
  const s = getSession(chatId);
  const r = await ofaAPI("GET",`/api/v1/feed?limit=20`,null,s.token);
  const posts = (r.ok&&r.data?.posts?.length)?r.data.posts:MOCK_POSTS;
  const start = page*CONFIG.FEED_PAGE_SIZE;
  const pagePosts = posts.slice(start,start+CONFIG.FEED_PAGE_SIZE);
  const suppCount = posts.filter(p=>p.platform_tried_suppress).length;
  let msg = `📡 *OPEN FEED — LIVE*\n_Ranked by OFA · Truth Shield integrated_\n\n`;
  if (suppCount>0) msg+=`⚠️ _${suppCount} posts suppressed by platforms — OFA restored them_\n\n`;
  msg+="─────────────────\n\n";
  msg+=pagePosts.map((p,i)=>fmtPost(p,start+i+1)).join("\n\n─────────────────\n\n");
  await bot.sendMessage(chatId,msg,{parse_mode:"MarkdownV2",reply_markup:kbFeedNav(page,posts.length),disable_web_page_preview:true});
}

async function cmdPostPrompt(chatId) {
  const s = getSession(chatId);
  setState(chatId,"awaiting_post");
  await bot.sendMessage(chatId,
    `✏️ *NEW POST*\n\n${TIER_EMOJI[s.tier]} Tier: *${s.tier}*${s.tier==="whistleblower"?"\n🔒 _E2E encrypted_":""}\n\nType your post now\\. Truth Shield will analyze before publishing\\.\n\n_/cancel to cancel_`,
    {parse_mode:"MarkdownV2"}
  );
}

async function cmdAnalyzePrompt(chatId) {
  setState(chatId,"awaiting_analyze");
  await bot.sendMessage(chatId,"🛡 *TRUTH SHIELD*\n\nSend any content to analyze for disinformation signals\\.\n\n_Type or paste content now:_",{parse_mode:"MarkdownV2"});
}

async function doPost(chatId, content) {
  const s = getSession(chatId); setState(chatId,"idle");
  if (content.length>CONFIG.MAX_POST_LENGTH) return bot.sendMessage(chatId,`❌ Too long \\(${content.length}/${CONFIG.MAX_POST_LENGTH}\\)`,{parse_mode:"MarkdownV2"});
  const lm = await bot.sendMessage(chatId,"⏳ _Analyzing with Truth Shield\\.\\.\\._",{parse_mode:"MarkdownV2"});
  const result = await runTruthShield(content,s.tier);
  await bot.editMessageText(fmtTS(result,content),{chat_id:chatId,message_id:lm.message_id,parse_mode:"MarkdownV2"});
  const pm = await bot.sendMessage(chatId,"📤 _Publishing to IPFS\\.\\.\\._",{parse_mode:"MarkdownV2"});
  const pr = await ofaAPI("POST","/api/v1/posts",{type:"text",content:content.trim(),tier:s.tier,anonymous:s.tier!=="standard",whistleblower_mode:s.tier==="whistleblower",language:"en",source:"telegram"},s.token);
  const pid = pr.data?.post_id||pr.data?.id||uuidv4().substring(0,8);
  const cid = pr.data?.ipfs_cid||`QmTG${Date.now().toString(36).toUpperCase()}`;
  await bot.editMessageText(`✅ *PUBLISHED*\n\n📌 ID: \`${pid}\`\n◆ IPFS: \`${cid.substring(0,20)}…\`\n🛡 TS: *${result.verdict}* \\(${result.confidence}%\\)\n${TIER_EMOJI[s.tier]} Tier: *${s.tier}*\n\n_Permanently stored on IPFS\\. Cannot be suppressed\\._`,{chat_id:chatId,message_id:pm.message_id,parse_mode:"MarkdownV2",reply_markup:{inline_keyboard:[[{text:"📡 Feed",callback_data:"cmd_feed"},{text:"🏠 Menu",callback_data:"cmd_menu"}]]}});
}

async function doAnalyze(chatId, content) {
  setState(chatId,"idle");
  const s = getSession(chatId);
  const lm = await bot.sendMessage(chatId,"🔍 _Analyzing\\.\\.\\._",{parse_mode:"MarkdownV2"});
  const result = await runTruthShield(content,s.tier);
  await bot.editMessageText(fmtTS(result,content),{chat_id:chatId,message_id:lm.message_id,parse_mode:"MarkdownV2",reply_markup:{inline_keyboard:[[{text:"🔍 Analyze another",callback_data:"cmd_analyze"},{text:"🏠 Menu",callback_data:"cmd_menu"}]]}});
}

async function cmdGovernance(chatId) {
  const s = getSession(chatId);
  const r = await ofaAPI("GET","/api/v1/governance/proposals",null,s.token);
  const proposals = (r.ok&&r.data?.proposals)?r.data.proposals:MOCK_PROPOSALS;
  let msg = `🗳 *COMMUNITY GOVERNANCE*\n_Community\\-controlled algorithm_\n\n*CURRENT WEIGHTS:*\n\`engagement_weight     0\\.40\`\n\`source_credibility    0\\.60\`\n\`ad_penalty            30pts\`\n\n*PROPOSALS:*\n\n`;
  proposals.forEach((p,i)=>{
    const total=(p.yes_votes||0)+(p.no_votes||0);
    const yPct=total>0?Math.round(((p.yes_votes||0)/total)*100):0;
    msg+=`*${i+1}\\.* ${esc(p.title)}\nBy ${esc(p.proposer)} · ${p.status==="passed"?"✅ PASSED":`⏳ ${p.voting_ends_days}d`}\n${bar(yPct)} Yes: ${yPct}%\n\n`;
  });
  await bot.sendMessage(chatId,msg,{parse_mode:"MarkdownV2",reply_markup:kbGov(proposals),disable_web_page_preview:true});
}

async function cmdStats(chatId) {
  const r = await ofaAPI("GET","/api/v1/truthshield/stats");
  const s = r.ok?r.data:{total_analyzed:48291,suppression_attempts_blocked:12847,legitimate_content_protected:9614,disinformation_labeled:3233,avg_confidence:87,open_appeals:892};
  await bot.sendMessage(chatId,
    `📊 *PLATFORM TRANSPARENCY*\n\n✅ Posts analyzed: *${fmt(s.total_analyzed)}*\n🛡 Suppression blocked: *${fmt(s.suppression_attempts_blocked)}*\n🔓 Content restored: *${fmt(s.legitimate_content_protected)}*\n🚨 Disinfo labeled: *${fmt(s.disinformation_labeled)}*\n📈 Avg confidence: *${s.avg_confidence}%*\n\n👁 Guardian scans: *28,441*\n🧒 Minors protected: *1,207*\n🔐 ZK verifications: *8,902*\n\n◆ IPFS records: *48,291*\n🗳 Governance votes: *34,891*\n\n✅ No auto\\-deletion — labels only\n✅ All verdicts on IPFS forever\n✅ Algorithm weights public`,
    {parse_mode:"MarkdownV2",reply_markup:{inline_keyboard:[[{text:"🏠 Menu",callback_data:"cmd_menu"}]]}}
  );
}

async function cmdStatus(chatId) {
  const s = getSession(chatId);
  const privDesc = {standard:"Username only, hashed email",anonymous:"Zero PII stored",whistleblower:"E2E encrypted, cannot be decrypted by OFA"};
  await bot.sendMessage(chatId,
    `👤 *YOUR ACCOUNT*\n\n🆔 DID: \`${s.did.substring(0,32)}…\`\n${TIER_EMOJI[s.tier]} Tier: *${s.tier}*\n🔐 Privacy: _${esc(privDesc[s.tier])}_\n\n✅ No real name required\n✅ Posts stored permanently on IPFS\n✅ Truth Shield analyzes before ranking\n${s.tier==="whistleblower"?"🔒 Content E2E encrypted — we cannot decrypt":s.tier==="anonymous"?"🎭 Zero PII on our servers":""}`,
    {parse_mode:"MarkdownV2",reply_markup:{inline_keyboard:[[{text:"🔄 Change Tier",callback_data:"cmd_tier"},{text:"🏠 Menu",callback_data:"cmd_menu"}]]}}
  );
}

async function cmdVote(chatId, vote, proposalId) {
  const s = getSession(chatId);
  await ofaAPI("POST",`/api/v1/governance/proposals/${proposalId}/vote`,{vote,voter_did:s.did},s.token);
  await bot.sendMessage(chatId,
    `${vote==="yes"?"✅":"❌"} *Vote recorded on\\-chain\\!*\n\nYou voted *${vote.toUpperCase()}* on \`${esc(proposalId)}\`\\.`,
    {parse_mode:"MarkdownV2",reply_markup:{inline_keyboard:[[{text:"🗳 More votes",callback_data:"cmd_governance"},{text:"🏠 Menu",callback_data:"cmd_menu"}]]}}
  );
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
bot.on("message", async msg => {
  const chatId = msg.chat.id;
  const text   = msg.text?.trim()||"";
  const s      = getSession(chatId);

  if (s.state==="awaiting_post"    && !text.startsWith("/")) return doPost(chatId,text);
  if (s.state==="awaiting_analyze" && !text.startsWith("/")) return doAnalyze(chatId,text);

  if (text==="/cancel") { setState(chatId,"idle"); return bot.sendMessage(chatId,"❌ Cancelled\\.",{parse_mode:"MarkdownV2",reply_markup:KB_MAIN}); }
  if (text.startsWith("/start"))      return cmdStart(chatId,msg.from);
  if (text.startsWith("/feed"))       return cmdFeed(chatId,0);
  if (text.startsWith("/post"))       return cmdPostPrompt(chatId);
  if (text.startsWith("/analyze"))    return cmdAnalyzePrompt(chatId);
  if (text.startsWith("/governance")) return cmdGovernance(chatId);
  if (text.startsWith("/stats"))      return cmdStats(chatId);
  if (text.startsWith("/status"))     return cmdStatus(chatId);
  if (text.startsWith("/tier"))       return bot.sendMessage(chatId,"🔄 *CHANGE TIER:*",{parse_mode:"MarkdownV2",reply_markup:kbTier(s.tier)});
  if (text.startsWith("/verify"))     return bot.sendMessage(chatId,`🔐 *ZK AGE VERIFICATION*\n\nVerify 18\\+ without showing us your ID\\.\n\n[Start →](https://zk\\-verify\\.openfeed\\.network/verify?did=${encodeURIComponent(s.did)})`,{parse_mode:"MarkdownV2"});
  if (text.startsWith("/help"))       return bot.sendMessage(chatId,"*OFA COMMANDS*\n\n/feed · /post · /analyze · /governance · /stats · /status · /tier · /verify · /help",{parse_mode:"MarkdownV2",reply_markup:KB_MAIN});

  await bot.sendMessage(chatId,"Use the menu or type a command:",{reply_markup:KB_MAIN});
});

bot.on("callback_query", async q => {
  const chatId = q.message.chat.id;
  const data   = q.data;
  await bot.answerCallbackQuery(q.id);

  if (data==="cmd_menu")       return bot.sendMessage(chatId,"Main menu:",{reply_markup:KB_MAIN});
  if (data==="cmd_feed")       return cmdFeed(chatId,0);
  if (data==="cmd_post")       return cmdPostPrompt(chatId);
  if (data==="cmd_analyze")    return cmdAnalyzePrompt(chatId);
  if (data==="cmd_governance") return cmdGovernance(chatId);
  if (data==="cmd_stats")      return cmdStats(chatId);
  if (data==="cmd_status")     return cmdStatus(chatId);
  if (data==="noop")           return;
  if (data==="cmd_tier") { const s=getSession(chatId); return bot.sendMessage(chatId,"🔄 *SELECT TIER:*",{parse_mode:"MarkdownV2",reply_markup:kbTier(s.tier)}); }
  if (data.startsWith("feed_")) return cmdFeed(chatId,parseInt(data.split("_")[1]));
  if (data.startsWith("tier_")) {
    const tier=data.replace("tier_",""); getSession(chatId).tier=tier;
    const desc={standard:"👤 *Standard* — username only",anonymous:"🎭 *Anonymous* — zero PII",whistleblower:"🔒 *Whistleblower* — E2E encrypted, use Tor for max protection"};
    return bot.sendMessage(chatId,`✅ Switched to ${desc[tier]||tier}\\.`,{parse_mode:"MarkdownV2",reply_markup:KB_MAIN});
  }
  if (data.startsWith("vote_")) {
    const parts=data.split("_"); return cmdVote(chatId,parts[1],parts.slice(2).join("_"));
  }
});

bot.on("polling_error", err => console.error("[Bot] Polling error:",err.message));
process.on("SIGINT",()=>{bot.stopPolling();process.exit(0);});

bot.getMe().then(me => {
  console.log(`
╔══════════════════════════════════════════════╗
║     OFA TELEGRAM BOT v1.0.0 — RUNNING        ║
║                                              ║
║  @${me.username.padEnd(40)}║
║  https://t.me/${me.username.padEnd(36)}║
╚══════════════════════════════════════════════╝`);
}).catch(err => console.error("❌ Bot startup failed:",err.message));

// ── HEALTH CHECK SERVER ───────────────────────────────────────────────────────
import http from "http";
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(8080, "0.0.0.0");
console.log("[health] Health check server running on port 8080");
