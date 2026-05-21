const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function createNotification(userId, type, message, data) {
  try {
    const result = await pool.query(
      'INSERT INTO notifications (user_id, type, message, data, read, created_at) VALUES ($1, $2, $3, $4, false, NOW()) RETURNING *',
      [userId, type, message, JSON.stringify(data || {})]
    );
    return result.rows[0];
  } catch (err) { console.error(err); }
}
async function getNotifications(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
}
async function markRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
}
module.exports = { createNotification, getNotifications, markRead };