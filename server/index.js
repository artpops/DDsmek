const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const PORT = process.env.PORT || 4000;
const AWARDS_DIR = path.join(__dirname, '..', 'public', 'awards');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use('/awards', express.static(AWARDS_DIR));

if (!fs.existsSync(AWARDS_DIR)) {
  fs.mkdirSync(AWARDS_DIR, { recursive: true });
}

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    created_at TEXT,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS habit_completions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    habit_id TEXT,
    completed_date TEXT,
    UNIQUE(habit_id, completed_date),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(habit_id) REFERENCES habits(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_collectibles (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    collectible_filename TEXT,
    earned_date TEXT,
    completion_percentage REAL,
    UNIQUE(user_id, collectible_filename),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

const awardFilenames = () => {
  return fs
    .readdirSync(AWARDS_DIR)
    .filter((file) => file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.jpg'));
};

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

app.post('/api/register', async (req, res) => {
  const { username, email, password, confirm } = req.body;
  if (!username || username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!password || password.length < 8 || password !== confirm) {
    return res.status(400).json({ error: 'Passwords must match and be at least 8 characters' });
  }
  const existing = await query('SELECT id FROM users WHERE username = ? OR email = ?', [
    username,
    email,
  ]);
  if (existing.length) {
    return res.status(400).json({ error: 'Username or email already taken' });
  }
  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  await run('INSERT INTO users(id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)', [
    id,
    username,
    email,
    password_hash,
    new Date().toISOString(),
  ]);
  const token = signToken({ id, username });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  return res.json({ id, username, email });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await query('SELECT * FROM users WHERE username = ?', [username]);
  const user = users[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  return res.json({ id: user.id, username: user.username, email: user.email });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const users = await query('SELECT id, username, email, created_at FROM users WHERE id = ?', [
    req.user.id,
  ]);
  return res.json(users[0]);
});

app.get('/api/habits', authMiddleware, async (req, res) => {
  const habits = await query('SELECT * FROM habits WHERE user_id = ? AND is_active = 1', [
    req.user.id,
  ]);
  res.json(habits);
});

app.post('/api/habits', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const existing = await query('SELECT COUNT(*) as count FROM habits WHERE user_id = ?', [req.user.id]);
  if (existing[0].count >= 20) return res.status(400).json({ error: 'Habit limit reached' });
  const id = uuidv4();
  await run('INSERT INTO habits(id, user_id, name, created_at) VALUES (?,?,?,?)', [
    id,
    req.user.id,
    name.trim(),
    new Date().toISOString(),
  ]);
  res.json({ id, name: name.trim() });
});

app.put('/api/habits/:id', authMiddleware, async (req, res) => {
  const { name } = req.body;
  await run('UPDATE habits SET name = ? WHERE id = ? AND user_id = ?', [name, req.params.id, req.user.id]);
  res.json({ id: req.params.id, name });
});

app.delete('/api/habits/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM habits WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  await run('DELETE FROM habit_completions WHERE habit_id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/today', authMiddleware, async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const habits = await query('SELECT * FROM habits WHERE user_id = ? AND is_active = 1', [req.user.id]);
  const completions = await query(
    'SELECT habit_id FROM habit_completions WHERE user_id = ? AND completed_date = ?',
    [req.user.id, today]
  );
  const completedIds = new Set(completions.map((c) => c.habit_id));
  res.json({
    date: today,
    habits: habits.map((h) => ({ ...h, completed: completedIds.has(h.id) })),
  });
});

async function computeCompletionRate(userId, date) {
  const habits = await query('SELECT id FROM habits WHERE user_id = ? AND is_active = 1', [userId]);
  if (!habits.length) return 0;
  const completions = await query(
    'SELECT id FROM habit_completions WHERE user_id = ? AND completed_date = ?',
    [userId, date]
  );
  return completions.length / habits.length;
}

async function awardCollectibleIfEligible(userId, date, completionRate) {
  if (completionRate < 0.9) return null;
  const existing = await query('SELECT id FROM user_collectibles WHERE user_id = ? AND earned_date = ?', [
    userId,
    date,
  ]);
  if (existing.length) return null;
  const available = awardFilenames();
  if (!available.length) return null;
  const owned = await query('SELECT collectible_filename FROM user_collectibles WHERE user_id = ?', [
    userId,
  ]);
  const ownedSet = new Set(owned.map((o) => o.collectible_filename));
  const remaining = available.filter((a) => !ownedSet.has(a));
  const awardPool = remaining.length ? remaining : available;
  const collectible = awardPool[Math.floor(Math.random() * awardPool.length)];
  const id = uuidv4();
  await run(
    'INSERT OR IGNORE INTO user_collectibles(id, user_id, collectible_filename, earned_date, completion_percentage) VALUES (?,?,?,?,?)',
    [id, userId, collectible, date, completionRate]
  );
  return collectible;
}

app.post('/api/completions', authMiddleware, async (req, res) => {
  const { habitId, completed } = req.body;
  const today = dayjs().format('YYYY-MM-DD');
  if (completed) {
    await run(
      'INSERT OR IGNORE INTO habit_completions(id, user_id, habit_id, completed_date) VALUES (?,?,?,?)',
      [uuidv4(), req.user.id, habitId, today]
    );
  } else {
    await run('DELETE FROM habit_completions WHERE habit_id = ? AND completed_date = ?', [habitId, today]);
  }
  const completionRate = await computeCompletionRate(req.user.id, today);
  const awarded = await awardCollectibleIfEligible(req.user.id, today, completionRate);
  res.json({ completionRate, awarded });
});

app.get('/api/collectibles', authMiddleware, async (req, res) => {
  const collectibles = await query('SELECT * FROM user_collectibles WHERE user_id = ? ORDER BY earned_date DESC', [
    req.user.id,
  ]);
  res.json(collectibles);
});

app.get('/api/heatmap', authMiddleware, async (req, res) => {
  const start = dayjs().startOf('month').subtract(1, 'month');
  const end = dayjs().endOf('month');
  const entries = await query(
    'SELECT completed_date, COUNT(*) as completions FROM habit_completions WHERE user_id = ? AND completed_date BETWEEN ? AND ? GROUP BY completed_date',
    [req.user.id, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  );
  const habits = await query('SELECT COUNT(*) as total FROM habits WHERE user_id = ? AND is_active = 1', [
    req.user.id,
  ]);
  const totalHabits = habits[0]?.total || 0;
  const map = {};
  entries.forEach((entry) => {
    const rate = totalHabits ? entry.completions / totalHabits : 0;
    map[entry.completed_date] = rate;
  });
  res.json({ totalHabits, data: map });
});

app.get('/profile/:username', async (req, res) => {
  const users = await query('SELECT id, username, created_at FROM users WHERE username = ?', [req.params.username]);
  const user = users[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  const collectibles = await query(
    'SELECT collectible_filename, earned_date, completion_percentage FROM user_collectibles WHERE user_id = ? ORDER BY earned_date DESC',
    [user.id]
  );
  const habitCounts = await query('SELECT COUNT(*) as total FROM habits WHERE user_id = ?', [user.id]);
  const completions = await query(
    'SELECT completed_date, COUNT(*) as completions FROM habit_completions WHERE user_id = ? GROUP BY completed_date',
    [user.id]
  );
  const totalHabits = habitCounts[0]?.total || 0;
  const heatmap = {};
  completions.forEach((entry) => {
    const rate = totalHabits ? entry.completions / totalHabits : 0;
    heatmap[entry.completed_date] = rate;
  });
  res.json({
    username: user.username,
    memberSince: user.created_at,
    collectibles,
    heatmap,
    stats: {
      totalCollectibles: collectibles.length,
      currentStreak: 0,
      bestStreak: 0,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
