const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.RAILWAY_ENVIRONMENT
  ? '/data/mck-sketch.db'
  : path.join(__dirname, '..', 'db', 'mck-sketch.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);

    // Migrate existing databases — only ignore "duplicate column" errors
    function safeMigrate(sql) {
      try { db.exec(sql); } catch (e) {
        if (!e.message.includes('duplicate column')) throw e;
      }
    }

    try {
      db.exec('ALTER TABLE users ADD COLUMN trial_start DATETIME');
      db.exec("UPDATE users SET trial_start = created_at WHERE trial_start IS NULL");
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
    safeMigrate('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT');
    safeMigrate("ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'trial'");
    safeMigrate('ALTER TABLE users ADD COLUMN subscription_end INTEGER');
    safeMigrate('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
    safeMigrate('ALTER TABLE users ADD COLUMN verify_token TEXT');
    safeMigrate('ALTER TABLE users ADD COLUMN reset_token TEXT');
    safeMigrate('ALTER TABLE users ADD COLUMN reset_token_expiry INTEGER');
    safeMigrate('ALTER TABLE users ADD COLUMN refresh_token TEXT');
    safeMigrate('ALTER TABLE users ADD COLUMN refresh_token_expiry INTEGER');
  }
  return db;
}

module.exports = { getDb };
