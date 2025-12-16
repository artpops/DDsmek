const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { format, startOfMonth, endOfMonth, eachDayOfInterval } = require('date-fns');
const db = require('./src/db');
const { getAvailableAwards, checkDailyReward, getUserCollectibles } = require('./src/rewards');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/awards', express.static(path.join(__dirname, '..', 'public', 'awards')));

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing token' });
  const [, token] = header.split(' ');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/awards', (req, res) => {
  res.json({ awards: getAvailableAwards() });
});

app.post(
  '/api/auth/register',
  body('username').isLength({ min: 3, max: 20 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { username, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    db.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
      (err, row) => {
        if (row) return res.status(400).json({ error: 'Username or email already exists' });
        db.run(
          'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [username, email, hashed],
          function (insertErr) {
            if (insertErr) return res.status(500).json({ error: 'Could not create user' });
            const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token });
          }
        );
      }
    );
  }
);

app.post('/api/auth/login', body('username').notEmpty(), body('password').notEmpty(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  });
});

app.get('/api/habits', authenticate, (req, res) => {
  db.all('SELECT * FROM habits WHERE user_id = ? AND is_active = 1 ORDER BY id', [req.user.id], (err, rows) => {
    res.json({ habits: rows || [] });
  });
});

app.post('/api/habits', authenticate, body('name').isLength({ min: 1, max: 100 }), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  db.get('SELECT COUNT(*) as count FROM habits WHERE user_id = ?', [req.user.id], (err, row) => {
    if (row && row.count >= 20) return res.status(400).json({ error: 'Maximum habits limit reached' });
    db.run(
      'INSERT INTO habits (user_id, name, created_at, is_active) VALUES (?, ?, CURRENT_TIMESTAMP, 1)',
      [req.user.id, req.body.name],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ error: 'Could not add habit' });
        res.json({ id: this.lastID, name: req.body.name });
      }
    );
  });
});

app.put('/api/habits/:id', authenticate, body('name').isLength({ min: 1, max: 100 }), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  db.run('UPDATE habits SET name = ? WHERE id = ? AND user_id = ?', [req.body.name, req.params.id, req.user.id], function (err) {
    if (this.changes === 0) return res.status(404).json({ error: 'Habit not found' });
    res.json({ success: true });
  });
});

app.delete('/api/habits/:id', authenticate, (req, res) => {
  db.run('DELETE FROM habits WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function (err) {
    if (this.changes === 0) return res.status(404).json({ error: 'Habit not found' });
    res.json({ success: true });
  });
});

app.get('/api/today', authenticate, (req, res) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  db.all(
    `SELECT h.id, h.name, CASE WHEN hc.id IS NULL THEN 0 ELSE 1 END AS completed
     FROM habits h
     LEFT JOIN habit_completions hc ON hc.habit_id = h.id AND hc.completed_date = ?
     WHERE h.user_id = ? AND h.is_active = 1
     ORDER BY h.id`,
    [today, req.user.id],
    (err, rows) => res.json({ habits: rows || [] })
  );
});

app.post('/api/completions/toggle', authenticate, body('habitId').isInt(), body('date').isISO8601(), (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { habitId, date, completed } = req.body;
  if (completed) {
    db.run(
      'INSERT OR IGNORE INTO habit_completions (user_id, habit_id, completed_date) VALUES (?, ?, ?)',
      [req.user.id, habitId, date],
      function (err) {
        checkDailyReward(req.user.id, date, db);
        return res.json({ success: true });
      }
    );
  } else {
    db.run(
      'DELETE FROM habit_completions WHERE habit_id = ? AND completed_date = ? AND user_id = ?',
      [habitId, date, req.user.id],
      function (err) {
        return res.json({ success: true });
      }
    );
  }
});

app.get('/api/completions', authenticate, (req, res) => {
  const month = req.query.month ? new Date(`${req.query.month}-01`) : new Date();
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });

  db.all(
    `SELECT completed_date, COUNT(*) as completed
     FROM habit_completions
     WHERE user_id = ? AND completed_date BETWEEN ? AND ?
     GROUP BY completed_date`,
    [req.user.id, format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')],
    (err, rows) => {
      db.get('SELECT COUNT(*) as total FROM habits WHERE user_id = ? AND is_active = 1', [req.user.id], (habErr, totalRow) => {
        const total = totalRow ? totalRow.total : 0;
        const map = {};
        rows?.forEach((r) => {
          map[r.completed_date] = r.completed;
        });
        const result = days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const completed = map[key] || 0;
          const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
          return { date: key, completed, total, percentage };
        });
        res.json({ days: result });
      });
    }
  );
});

app.get('/api/collectibles', authenticate, (req, res) => {
  getUserCollectibles(req.user.id, db, (collectibles) => res.json({ collectibles }));
});

app.get('/api/profile/:username', (req, res) => {
  const { username } = req.params;
  db.get('SELECT id, username, created_at FROM users WHERE username = ?', [username], (err, user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });
    getUserCollectibles(user.id, db, (collectibles) => {
      const startDate = startOfMonth(new Date());
      const endDate = endOfMonth(new Date());
      db.all(
        `SELECT completed_date, COUNT(*) as completed
         FROM habit_completions WHERE user_id = ? AND completed_date BETWEEN ? AND ? GROUP BY completed_date`,
        [user.id, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
        (err2, rows) => {
          const days = eachDayOfInterval({ start: startDate, end: endDate });
          db.get('SELECT COUNT(*) as total FROM habits WHERE user_id = ? AND is_active = 1', [user.id], (err3, totalRow) => {
            const total = totalRow ? totalRow.total : 0;
            const map = {};
            rows?.forEach((r) => (map[r.completed_date] = r.completed));
            const daySummary = days.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const completed = map[key] || 0;
              const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
              return { date: key, percentage };
            });
            res.json({
              username: user.username,
              memberSince: user.created_at,
              collectibles,
              summary: daySummary,
              totalCollectibles: collectibles.length,
            });
          });
        }
      );
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

