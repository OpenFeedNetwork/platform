import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const sql = [
"CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, wallet_address TEXT, bio TEXT, avatar TEXT, created_at TIMESTAMPTZ DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, media_url TEXT, suppress_post BOOLEAN DEFAULT false NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS follows (follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (follower_id, following_id))",
"CREATE TABLE IF NOT EXISTS likes (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(post_id, user_id))",
"CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
"CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)",
"CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)",
"CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)",
"CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)",
];
async function migrate() {
  console.log("[Migrate] Running...");
  for (const q of sql) await db.query(q).catch(e => console.warn("Skipped:", e.message));
  console.log("[Migrate] Done.");
  await db.end();
}
migrate();
