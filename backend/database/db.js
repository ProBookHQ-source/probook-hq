const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Store DB in user's home directory so it survives app restarts
// and avoids any network-filesystem lock issues.
// Override with DB_PATH env var if needed.
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

// Initialize schema with retry logic.
// node-sqlite3-wasm doesn't honour PRAGMA busy_timeout, so we retry in JS.
// During a rolling deploy the old container briefly holds the write lock;
// retrying for up to 15 s gives it time to shut down cleanly.
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
function syncSleep(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch (_) { const end = Date.now() + ms; while (Date.now() < end) {} }
}
let schemaLoaded = false;
for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    db.exec(schema);
    schemaLoaded = true;
    break;
  } catch (err) {
    if (err.message && err.message.includes('locked') && attempt < 30) {
      console.log(`⏳ DB locked — retrying in 500ms (attempt ${attempt}/30)...`);
      syncSleep(500);
    } else {
      throw err;
    }
  }
}

// Seed default niches if empty
const _rawStmt = db.prepare('SELECT COUNT(*) as count FROM niches');
const nicheCount = _rawStmt.get([]);
_rawStmt.finalize();

if (nicheCount.count === 0) {
  const { v4: uuidv4 } = require('uuid');
  const insertNiche = db.prepare('INSERT INTO niches (id, name, description) VALUES (?, ?, ?)');
  const defaultNiches = [
    ['Roofing',            'Roof repair, replacement, and inspection'],
    ['Plumbing',           'Pipe repair, installation, and emergency plumbing'],
    ['HVAC',               'Heating, ventilation, and air conditioning'],
    ['Electrical',         'Wiring, panel upgrades, and electrical repairs'],
    ['Landscaping',        'Lawn care, landscaping, and tree services'],
    ['Painting',           'Interior and exterior painting'],
    ['General Contracting','Home renovation and general contracting'],
  ];
  defaultNiches.forEach(([name, desc]) => insertNiche.run([uuidv4(), name, desc]));
  insertNiche.finalize();
  console.log('✅ Default niches seeded');
}

console.log(`✅ Database ready at ${DB_PATH}`);

// ── Compatibility shim ────────────────────────────────────────────────────────
// node-sqlite3-wasm expects params as an array; routes call .run(a, b, c).
// This wraps prepare() so both styles work transparently.
const _prepare = db.prepare.bind(db);
db.prepare = function (sql) {
  const stmt = _prepare(sql);
  const normalize = (args) =>
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return {
    run(...args)     { return stmt.run(normalize(args)); },
    get(...args)     { return stmt.get(normalize(args)); },
    all(...args)     { return stmt.all(normalize(args)); },
    finalize()       { return stmt.finalize(); },
  };
};

module.exports = db;
