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

    // Migrate existing databases — safe to re-run (catches duplicate column error)
    try {
      db.exec('ALTER TABLE users ADD COLUMN trial_start DATETIME');
      db.exec("UPDATE users SET trial_start = created_at WHERE trial_start IS NULL");
    } catch (e) {
      // Column already exists — safe to ignore
    }
    try { db.exec(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'trial'`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN subscription_end INTEGER`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN verify_token TEXT`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN reset_token TEXT`); } catch(e){}
    try { db.exec(`ALTER TABLE users ADD COLUMN reset_token_expiry INTEGER`); } catch(e){}
  }
  return db;
}

module.exports = { getDb };
