const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      created_at TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS habit_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      habit_id INTEGER NOT NULL,
      completed_date DATE,
      UNIQUE(habit_id, completed_date),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(habit_id) REFERENCES habits(id)
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS user_collectibles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      collectible_filename TEXT,
      earned_date DATE,
      completion_percentage REAL,
      UNIQUE(user_id, collectible_filename),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  );
});

module.exports = db;
