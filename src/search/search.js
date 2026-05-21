const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function search(req, res) {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    const posts = await pool.query(
      'SELECT p.id, p.content, u.username FROM posts p JOIN users u ON p.user_id = u.id WHERE p.content ILIKE $1 LIMIT $2',
      ['%'+q+'%', limit]
    );
    res.json({ query: q, posts: posts.rows });
  } catch (err) { res.status(500).json({ error: 'Search failed' }); }
}
module.exports = { search };