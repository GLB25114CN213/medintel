import path from "path";
import fs from "fs";

let db = null;

try {
  const sqlite3Module = await import("sqlite3");
  const sqlite3 = sqlite3Module.default || sqlite3Module;
  const dbPath = process.env.VERCEL ? ":memory:" : path.resolve("medintel.db");
  const sqlite = sqlite3.verbose();
  db = new sqlite.Database(dbPath, (err) => {
    if (err) {
      console.error("⚠️ SQLite Notice:", err.message);
    } else {
      console.log("✅ SQLite Database connected at:", dbPath);
    }
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT,
        analysis_data TEXT NOT NULL,
        health_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  });
} catch (e) {
  console.error("⚠️ SQLite Module Load Notice:", e.message);
}

export const runQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve({ id: 1, changes: 1 });
    db.run(sql, params, function (err) {
      if (err) resolve({ id: 1, changes: 0 });
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const getQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    db.get(sql, params, (err, row) => {
      if (err) resolve(null);
      else resolve(row);
    });
  });
};

export const allQuery = (sql, params = []) => {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    db.all(sql, params, (err, rows) => {
      if (err) resolve([]);
      else resolve(rows);
    });
  });
};

export default db;
