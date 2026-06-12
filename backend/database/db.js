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

// WAL mode + busy_timeout: if another process holds the lock during a rolling
// deploy, SQLite waits up to 15s instead of crashing immediately.
try { db.exec('PRAGMA journal_mode = WAL'); } catch (_) {}
try { db.exec('PRAGMA busy_timeout = 15000'); } catch (_) {}
try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}

// Initialize schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

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
