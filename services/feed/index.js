import { register, collectDefaultMetrics } from "prom-client";
collectDefaultMetrics();
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pg from "pg";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";
dotenv.config();
const app = express();
const PORT = process.env.FEED_PORT || 3001;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
const JWT = process.env.JWT_SECRET || "change-me";
app.use(helmet()); app.use(cors()); app.use(morgan("combined")); app.use(express.json());
const auth = (req, res, next) => { const token = req.headers.authorization?.replace("Bearer ", ""); if (!token) return res.status(401).json({ error: "Unauthorized" }); try { req.user = jwt.verify(token, JWT); next(); } catch { res.status(401).json({ error: "Invalid token" }); } };
const optAuth = (req, res, next) => { const token = req.headers.authorization?.replace("Bearer ", ""); if (token) try { req.user = jwt.verify(token, JWT); } catch {} next(); };
app.post("/api/v1/auth/register", async (req, res) => {
  const { username, email, password, wallet_address } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "username, email, password required" });
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await db.query("INSERT INTO users (id,username,email,password_hash,wallet_address,created_at) VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id,username,email,wallet_address,created_at", [uuid(), username.toLowerCase(), email.toLowerCase(), hash, wallet_address || null]);
    const token = jwt.sign({ id: r.rows[0].id, username: r.rows[0].username }, JWT, { expiresIn: "30d" });
    res.status(201).json({ token, user: r.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username or email already taken" });
    res.status(500).json({ error: "Registration failed" });
  }
});
app.post("/api/v1/auth/login", async (req, res) => {
  const { email, password, username: uname } = req.body;
  const login = email || uname;
  if (!login || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const r = await db.query("SELECT * FROM users WHERE email=$1 OR username=$1", [login.toLowerCase()]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatar: user.avatar } });
  } catch { res.status(500).json({ error: "Login failed" }); }
});
app.get("/api/v1/auth/me", auth, async (req, res) => {
  const r = await db.query("SELECT id,username,email,bio,avatar,wallet_address,created_at FROM users WHERE id=$1", [req.user.id]);
  if (!r.rows.length) return res.status(404).json({ error: "User not found" });
  res.json(r.rows[0]);
});
app.get("/api/v1/users/:username", optAuth, async (req, res) => {
  const r = await db.query("SELECT u.id,u.username,u.bio,u.avatar,u.created_at,COUNT(DISTINCT f1.follower_id) AS followers,COUNT(DISTINCT f2.following_id) AS following,COUNT(DISTINCT p.id) AS posts FROM users u LEFT JOIN follows f1 ON f1.following_id=u.id LEFT JOIN follows f2 ON f2.follower_id=u.id LEFT JOIN posts p ON p.user_id=u.id AND p.suppress_post=false WHERE u.username=$1 GROUP BY u.id", [req.params.username.toLowerCase()]);
  if (!r.rows.length) return res.status(404).json({ error: "User not found" });
  res.json(r.rows[0]);
});
app.patch("/api/v1/users/me", auth, async (req, res) => {
  const { bio, avatar } = req.body;
  const r = await db.query("UPDATE users SET bio=$1,avatar=$2 WHERE id=$3 RETURNING id,username,bio,avatar", [bio, avatar, req.user.id]);
  res.json(r.rows[0]);
});
app.post("/api/v1/posts", auth, async (req, res) => {
  const { content, media_url } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  try {
    const r = await db.query("INSERT INTO posts (id,user_id,content,media_url,suppress_post,created_at) VALUES ($1,$2,$3,$4,false,NOW()) RETURNING *", [uuid(), req.user.id, content.trim(), media_url || null]);
    const u = await db.query("SELECT username,avatar FROM users WHERE id=$1", [req.user.id]);
    res.status(201).json({ ...r.rows[0], username: u.rows[0]?.username, avatar: u.rows[0]?.avatar });
  } catch { res.status(500).json({ error: "Post failed" }); }
});
app.get("/api/v1/posts/:id", optAuth, async (req, res) => {
  const r = await db.query("SELECT p.*,u.username,u.avatar,COUNT(DISTINCT l.id) AS likes,COUNT(DISTINCT c.id) AS comments,0 AS shares FROM posts p JOIN users u ON p.user_id=u.id LEFT JOIN likes l ON l.post_id=p.id LEFT JOIN comments c ON c.post_id=p.id WHERE p.id=$1 AND p.suppress_post=false GROUP BY p.id,u.username,u.avatar", [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: "Post not found" });
  res.json(r.rows[0]);
});
app.delete("/api/v1/posts/:id", auth, async (req, res) => {
  const r = await db.query("DELETE FROM posts WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  if (!r.rows.length) return res.status(403).json({ error: "Not your post" });
  res.json({ deleted: true });
});
app.post("/api/v1/posts/:id/like", auth, async (req, res) => {
  try {
    await db.query("INSERT INTO likes (id,post_id,user_id,created_at) VALUES ($1,$2,$3,NOW())", [uuid(), req.params.id, req.user.id]);
    res.json({ liked: true });
  } catch {
    await db.query("DELETE FROM likes WHERE post_id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ liked: false });
  }
});
app.get("/api/v1/feed", optAuth, async (req, res) => {
  const { limit = 20, before } = req.query;
  const cursor = before ? "AND p.created_at < '" + before + "'" : "";
  const r = await db.query("SELECT p.*,u.username,u.avatar,COUNT(DISTINCT l.id) AS likes,COUNT(DISTINCT c.id) AS comments,0 AS shares FROM posts p JOIN users u ON p.user_id=u.id LEFT JOIN likes l ON l.post_id=p.id LEFT JOIN comments c ON c.post_id=p.id WHERE p.suppress_post=false " + cursor + " GROUP BY p.id,u.username,u.avatar ORDER BY p.created_at DESC LIMIT $1", [Math.min(parseInt(limit), 100)]);
  res.json({ posts: r.rows, next_cursor: r.rows.at(-1)?.created_at || null });
});
app.get("/api/v1/feed/following", auth, async (req, res) => {
  const { limit = 20, before } = req.query;
  const cursor = before ? "AND p.created_at < '" + before + "'" : "";
  const r = await db.query("SELECT p.*,u.username,u.avatar,COUNT(DISTINCT l.id) AS likes,COUNT(DISTINCT c.id) AS comments,0 AS shares FROM posts p JOIN users u ON p.user_id=u.id JOIN follows f ON f.following_id=p.user_id AND f.follower_id=$1 LEFT JOIN likes l ON l.post_id=p.id LEFT JOIN comments c ON c.post_id=p.id WHERE p.suppress_post=false " + cursor + " GROUP BY p.id,u.username,u.avatar ORDER BY p.created_at DESC LIMIT $2", [req.user.id, Math.min(parseInt(limit), 100)]);
  res.json({ posts: r.rows, next_cursor: r.rows.at(-1)?.created_at || null });
});
app.post("/api/v1/follows/:username", auth, async (req, res) => {
  const target = await db.query("SELECT id FROM users WHERE username=$1", [req.params.username]);
  if (!target.rows.length) return res.status(404).json({ error: "User not found" });
  const targetId = target.rows[0].id;
  if (targetId === req.user.id) return res.status(400).json({ error: "Cannot follow yourself" });
  try {
    await db.query("INSERT INTO follows (follower_id,following_id,created_at) VALUES ($1,$2,NOW())", [req.user.id, targetId]);
    res.json({ following: true });
  } catch {
    await db.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, targetId]);
    res.json({ following: false });
  }
});
app.get("/api/v1/search", async (req, res) => {
  const { q, type = "posts", limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: "q required" });
  if (type === "users") {
    const r = await db.query("SELECT id,username,bio,avatar FROM users WHERE username ILIKE $1 OR bio ILIKE $1 LIMIT $2", ["%" + q + "%", limit]);
    return res.json({ results: r.rows, type: "users" });
  }
  const r = await db.query("SELECT p.*,u.username,u.avatar FROM posts p JOIN users u ON p.user_id=u.id WHERE p.content ILIKE $1 AND p.suppress_post=false ORDER BY p.created_at DESC LIMIT $2", ["%" + q + "%", limit]);
  res.json({ results: r.rows, type: "posts" });
});
app.get("/metrics", async (req, res) => { res.set("Content-Type", register.contentType); res.send(await register.metrics()); });
app.get("/health", async (req, res) => {
  let dbOk = false;
  try { await db.query("SELECT 1"); dbOk = true; } catch {}
  res.json({ status: dbOk ? "ok" : "degraded", service: "candor-feed", version: "1.0.0" });
});


// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────
const mfaSessions = new Map();

async function sendSMS(to, message) {
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: message }).toString()
  });
  return res.ok;
}

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, (process.env.JWT_SECRET || "change-me") + "_admin");
    if (payload.role !== "admin") throw new Error("Not admin");
    req.admin = payload;
    next();
  } catch { res.status(401).json({ error: "Invalid admin token" }); }
};

app.post("/api/v1/admin/auth/password", async (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid password" });
  const token = jwt.sign({ role: "admin" }, (process.env.JWT_SECRET || "change-me") + "_admin", { expiresIn: "1h" });
  res.json({ success: true, token });
});

app.post("/api/v1/admin/auth/mfa", (req, res) => {
  const { session_id, code } = req.body;
  const session = mfaSessions.get(session_id);
  if (!session) return res.status(401).json({ error: "Session not found or expired" });
  if (session.expires < Date.now()) { mfaSessions.delete(session_id); return res.status(401).json({ error: "Code expired" }); }
  if (session.code !== code) return res.status(401).json({ error: "Invalid code" });
  mfaSessions.delete(session_id);
  const token = jwt.sign({ role: "admin" }, (process.env.JWT_SECRET || "change-me") + "_admin", { expiresIn: "1h" });
  res.json({ token });
});

app.post("/api/v1/admin/auth/resend", async (req, res) => {
  const { session_id } = req.body;
  const session = mfaSessions.get(session_id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  session.code = code; session.expires = Date.now() + 10 * 60 * 1000;
  await sendSMS(process.env.ADMIN_PHONE, `Candor Admin: Your new login code is ${code}. Expires in 10 minutes.`);
  res.json({ success: true });
});

app.get("/api/v1/admin/stats", adminAuth, async (req, res) => {
  try {
    const [userStats, postStats, recentUsers, recentPosts] = await Promise.all([
      db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as today, COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as this_week FROM users"),
      db.query("SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as today FROM posts WHERE suppress_post = false"),
      db.query("SELECT id, username, email, created_at FROM users ORDER BY created_at DESC LIMIT 10"),
      db.query("SELECT p.id, p.content, p.created_at, u.username FROM posts p JOIN users u ON p.user_id = u.id WHERE p.suppress_post = false ORDER BY p.created_at DESC LIMIT 10")
    ]);
    res.json({ users: userStats.rows[0], posts: postStats.rows[0], recent_users: recentUsers.rows, recent_posts: recentPosts.rows, machines: [] });
  } catch (e) { res.status(500).json({ error: "Stats query failed", detail: e.message }); }
});
// ─── END ADMIN ROUTES ─────────────────────────────────────────────────────────


// ── MEDIA UPLOAD ─────────────────────────────────────────────
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import { createRequire } from "module";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg","image/png","image/gif","image/webp","video/mp4","video/webm","video/quicktime"];
    cb(null, ok.includes(file.mimetype));
  },
});

function mediaExt(mime) {
  return {"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp",
          "video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"}[mime]||"bin";
}

app.post("/api/v1/posts/upload", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const key = `uploads/${req.user.id}/${uuid()}.${mediaExt(req.file.mimetype)}`;
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      CacheControl: "public, max-age=31536000",
    }));
    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ url, mediaType: req.file.mimetype.startsWith("image/") ? "image" : "video" });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.listen(PORT, () => console.log("[Feed] Running on port " + PORT));
export default app;
