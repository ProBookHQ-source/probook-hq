const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), '.probook', 'booking.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

try { db.exec('PRAGMA journal_mode = WAL'); } catch (_) {}
try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}

// ── Schema initialization ────────────────────────────────────────────────────
// Only write the schema when the DB is brand new. On restarts/redeploys the
// tables already exist, so we do a read-only check and skip the write entirely.
// This prevents "database is locked" crashes during Railway rolling deploys,
// where the old container briefly keeps a write lock while the new one starts.

const checkStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
const alreadyInitialized = !!checkStmt.get([]);
checkStmt.finalize();

if (!alreadyInitialized) {
  console.log('🆕 New database — running schema...');

  // Synchronous sleep helper for retry loop
  function syncSleep(ms) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch (_) {
      // Fallback: busy-wait (only runs on first-ever startup, acceptable)
      const end = Date.now() + ms;
      while (Date.now() < end) {}
    }
  }

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  let done = false;
  for (let attempt = 1; attempt <= 30 && !done; attempt++) {
    try {
      db.exec(schema);
      done = true;
    } catch (err) {
      const msg = String(err);
      if (msg.includes('locked') && attempt < 30) {
        console.log(`⏳ DB locked on init — retry ${attempt}/30 in 500ms...`);
        syncSleep(500);
      } else {
        throw err;
      }
    }
  }

  // Seed default niches
  const { v4: uuidv4 } = require('uuid');
  const insertNiche = db.prepare('INSERT INTO niches (id, name, description) VALUES (?, ?, ?)');
  const defaultNiches = [
    ['Roofing',             'Roof repair, replacement, and inspection'],
    ['Plumbing',            'Pipe repair, installation, and emergency plumbing'],
    ['HVAC',                'Heating, ventilation, and air conditioning'],
    ['Electrical',          'Wiring, panel upgrades, and electrical repairs'],
    ['Landscaping',         'Lawn care, landscaping, and tree services'],
    ['Painting',            'Interior and exterior painting'],
    ['General Contracting', 'Home renovation and general contracting'],
  ];
  defaultNiches.forEach(([name, desc]) => insertNiche.run([uuidv4(), name, desc]));
  insertNiche.finalize();
  console.log('✅ Schema and niches ready');
} else {
  console.log('✅ Database already initialized — skipping schema write');
}

console.log(`✅ Database ready at ${DB_PATH}`);

// ── Compatibility shim ────────────────────────────────────────────────────────
// node-sqlite3-wasm expects params as an array; routes call .run(a, b, c).
const _prepare = db.prepare.bind(db);
db.prepare = function (sql) {
  const stmt = _prepare(sql);
  const normalize = (args) =>
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return {
    run(...args)  { return stmt.run(normalize(args)); },
    get(...args)  { return stmt.get(normalize(args)); },
    all(...args)  { return stmt.all(normalize(args)); },
    finalize()    { return stmt.finalize(); },
  };
};

module.exports = db;
