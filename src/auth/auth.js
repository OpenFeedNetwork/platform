const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET;

async function register(req, res) {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, username, email, display_name',
      [username, email, hash, display_name || username]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
}

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { register, login, authenticate };
