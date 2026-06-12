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

// ── Retry helper ─────────────────────────────────────────────────────────────
// node-sqlite3-wasm doesn't honour PRAGMA busy_timeout, so we retry every
// locked operation in JavaScript. During a Railway rolling deploy the old
// container holds a write lock for a few seconds — this gives it time to die.
function syncSleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function withRetry(label, fn, attempts = 30, delay = 500) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return fn();
    } catch (err) {
      if (String(err).toLowerCase().includes('locked') && i < attempts) {
        console.log(`⏳ [${label}] DB locked — retry ${i}/${attempts} in ${delay}ms...`);
        syncSleep(delay);
      } else {
        console.error(`💥 [${label}] failed after ${i} attempt(s):`, String(err));
        throw err;
      }
    }
  }
}

// ── Open database (with retry in case old container holds a lock) ─────────────
const db = withRetry('open', () => new Database(DB_PATH));

withRetry('WAL',  () => db.exec('PRAGMA journal_mode = WAL'));
withRetry('FK',   () => db.exec('PRAGMA foreign_keys = ON'));

// ── Schema initialization ─────────────────────────────────────────────────────
// Only run CREATE TABLE on first startup (brand-new DB).
// On every subsequent deploy the tables already exist — we do a read-only
// check and skip the write entirely, which is safe even with concurrent readers.
const alreadyInitialized = withRetry('check-init', () => {
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='admins'"
  );
  const row = stmt.get([]);
  stmt.finalize();
  return !!row;
});

if (!alreadyInitialized) {
  console.log('🆕 New database — running schema + seeding niches...');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  withRetry('schema', () => db.exec(schema));

  const { v4: uuidv4 } = require('uuid');
  const insertNiche = db.prepare(
    'INSERT INTO niches (id, name, description) VALUES (?, ?, ?)'
  );
  [
    ['Roofing',             'Roof repair, replacement, and inspection'],
    ['Plumbing',            'Pipe repair, installation, and emergency plumbing'],
    ['HVAC',                'Heating, ventilation, and air conditioning'],
    ['Electrical',          'Wiring, panel upgrades, and electrical repairs'],
    ['Landscaping',         'Lawn care, landscaping, and tree services'],
    ['Painting',            'Interior and exterior painting'],
    ['General Contracting', 'Home renovation and general contracting'],
  ].forEach(([name, desc]) => insertNiche.run([uuidv4(), name, desc]));
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
