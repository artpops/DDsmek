const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

function getAwardsDir() {
  return path.join(__dirname, '..', '..', 'public', 'awards');
}

function getAvailableAwards() {
  const awardsDir = getAwardsDir();
  if (!fs.existsSync(awardsDir)) return [];
  return fs
    .readdirSync(awardsDir)
    .filter((file) => !file.startsWith('.'))
    .map((file) => ({ filename: file, url: `/awards/${file}` }));
}

function getUserCollectibles(userId, db, callback) {
  db.all(
    'SELECT collectible_filename, earned_date, completion_percentage FROM user_collectibles WHERE user_id = ? ORDER BY earned_date DESC',
    [userId],
    (err, rows) => {
      callback(rows || []);
    }
  );
}

function awardRandomCollectible(userId, date, completionPercentage, db) {
  const awards = getAvailableAwards();
  if (awards.length === 0) return;
  db.all('SELECT collectible_filename FROM user_collectibles WHERE user_id = ?', [userId], (err, rows) => {
    const owned = new Set(rows?.map((r) => r.collectible_filename) || []);
    const available = awards.filter((a) => !owned.has(a.filename));
    if (available.length === 0) {
      return; // All collected for now
    }
    const random = available[Math.floor(Math.random() * available.length)];
    db.run(
      'INSERT INTO user_collectibles (user_id, collectible_filename, earned_date, completion_percentage) VALUES (?, ?, ?, ?)',
      [userId, random.filename, date, completionPercentage],
      (insertErr) => {}
    );
  });
}

function checkDailyReward(userId, date, db) {
  db.get('SELECT COUNT(*) as total FROM habits WHERE user_id = ? AND is_active = 1', [userId], (err, totalRow) => {
    const total = totalRow ? totalRow.total : 0;
    if (total === 0) return;
    db.all('SELECT completed_date, COUNT(*) as completed FROM habit_completions WHERE user_id = ? AND completed_date = ?', [userId, date], (err2, rows) => {
      const completed = rows && rows.length > 0 ? rows[0].completed : 0;
      const completionRate = completed / total;
      if (completionRate >= 0.9) {
        db.get('SELECT id FROM user_collectibles WHERE user_id = ? AND earned_date = ?', [userId, date], (awardErr, awardRow) => {
          if (awardRow) return;
          awardRandomCollectible(userId, date, Math.round(completionRate * 100), db);
        });
      }
    });
  });
}

module.exports = { getAvailableAwards, checkDailyReward, getUserCollectibles };
