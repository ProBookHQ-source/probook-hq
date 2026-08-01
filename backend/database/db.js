/**
 * db.js — PostgreSQL client
 *
 * Provides a prepare(sql).get/run/all() interface that matches the old SQLite
 * API so routes need minimal changes. All methods are async.
 *
 * Requires DATABASE_URL in env (Railway sets this automatically when you add
 * the Postgres plugin to your service).
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err.message);
});

// ── Placeholder conversion: SQLite ? → PostgreSQL $1, $2, … ─────────────────
function toPostgres(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/CURRENT_TIMESTAMP/gi, 'NOW()');
}

function normalizeParams(args) {
  return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
}

// ── Core API ─────────────────────────────────────────────────────────────────
const db = {
  prepare(sql) {
    const pgSql = toPostgres(sql);
    return {
      async get(...args) {
        const { rows } = await pool.query(pgSql, normalizeParams(args));
        return rows[0] || null;
      },
      async all(...args) {
        const { rows } = await pool.query(pgSql, normalizeParams(args));
        return rows;
      },
      async run(...args) {
        await pool.query(pgSql, normalizeParams(args));
      },
      // finalize is a no-op (needed only for SQLite compatibility)
      finalize() {},
    };
  },

  async query(sql, params = []) {
    return pool.query(toPostgres(sql), params);
  },

  // Transaction helper
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

// ── Schema initialization ─────────────────────────────────────────────────────
async function initialize() {
  console.log('🗄️  Initializing PostgreSQL schema…');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS niches (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contractors (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      company_name TEXT,
      niche_id TEXT NOT NULL REFERENCES niches(id),
      service_zip_codes TEXT NOT NULL,
      google_refresh_token TEXT,
      google_calendar_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      niche_id TEXT NOT NULL REFERENCES niches(id),
      zip_code TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'new',
      assigned_contractor_id TEXT REFERENCES contractors(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS availability_slots (
      id TEXT PRIMARY KEY,
      contractor_id TEXT NOT NULL REFERENCES contractors(id),
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS availability_overrides (
      id TEXT PRIMARY KEY,
      contractor_id TEXT NOT NULL REFERENCES contractors(id),
      date TEXT NOT NULL,
      is_available INTEGER DEFAULT 0,
      start_time TEXT,
      end_time TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      contractor_id TEXT NOT NULL REFERENCES contractors(id),
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'pending',
      google_event_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS booking_tokens (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS round_robin_state (
      id TEXT PRIMARY KEY,
      niche_id TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      last_contractor_id TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(niche_id, zip_code)
    );

    CREATE INDEX IF NOT EXISTS idx_contractors_niche ON contractors(niche_id);
    CREATE INDEX IF NOT EXISTS idx_leads_niche_zip ON leads(niche_id, zip_code);
    CREATE INDEX IF NOT EXISTS idx_appointments_contractor ON appointments(contractor_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_availability_contractor ON availability_slots(contractor_id);

    -- Prevent double-booking at the database level (partial unique index excludes cancelled)
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_appt_slot
      ON appointments(contractor_id, scheduled_date, scheduled_time)
      WHERE status != 'cancelled';
  `);

  // Migration: allow lead_id to be NULL so contractors can block external appointments
  // (safe to run repeatedly — ALTER DROP NOT NULL is idempotent in Postgres)
  await db.query(`
    ALTER TABLE appointments ALTER COLUMN lead_id DROP NOT NULL
  `).catch(() => {}); // ignore if already nullable

  // Migration: store Google Places ID + Twilio test call timestamp + city on contractors
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS place_id TEXT`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS twilio_test_call_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS city TEXT`).catch(() => {});

  // Migration: two-way AI SMS — conversation history + drip tracking
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS sms_conversation JSONB DEFAULT '[]'`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS last_setup_sms_at TIMESTAMPTZ`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS sms_welcome_sent INTEGER DEFAULT 0`).catch(() => {});

  // Migration: trial monitoring — tracks when the 72-hour silence alert was sent (prevents dupes)
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS trial_silence_alert_sent_at TIMESTAMPTZ`).catch(() => {});

  // Migration: SMS drip specialty messages — power message, calendar blocking training, capabilities guide
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS sms_power_message_sent INTEGER DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS sms_calendar_training_sent INTEGER DEFAULT 0`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS sms_capabilities_sent INTEGER DEFAULT 0`).catch(() => {});

  // Migration: homeowner address on leads (so contractor knows where to go)
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT`).catch(() => {});

  // Migration: homeowner SMS sessions — stateful conversational booking via Brain 3
  await db.query(`
    CREATE TABLE IF NOT EXISTS homeowner_sms_sessions (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      contractor_id TEXT NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      state TEXT DEFAULT 'awaiting_address',
      name TEXT,
      address TEXT,
      city TEXT,
      service_description TEXT,
      offered_slots JSONB DEFAULT '[]',
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_homeowner_sessions_phone_contractor ON homeowner_sms_sessions(phone, contractor_id)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_homeowner_sessions_updated ON homeowner_sms_sessions(updated_at DESC)`).catch(() => {});

  // Migration: post-appointment outcome tracking via SMS
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS did_close INTEGER`).catch(() => {});
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS closed_value NUMERIC`).catch(() => {});
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS post_job_sms_sent_at TIMESTAMPTZ`).catch(() => {});

  // Migration: pre-appointment morning-of confirmation SMS tracking
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pre_appt_sms_sent_at TIMESTAMPTZ`).catch(() => {});

  // Migration: post-appointment review request SMS tracking (3 hours after completion)
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS homeowner_review_sms_sent_at TIMESTAMPTZ`).catch(() => {});

  // Migration: allow leads.name and leads.email to be NULL (phone-only Brain 3 path)
  await db.query(`ALTER TABLE leads ALTER COLUMN name DROP NOT NULL`).catch(() => {});
  await db.query(`ALTER TABLE leads ALTER COLUMN email DROP NOT NULL`).catch(() => {});

  // Migration: pgvector + diagnostic knowledge for Brain 3 RAG
  await db.query(`CREATE EXTENSION IF NOT EXISTS vector`).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS diagnostic_knowledge (
      id SERIAL PRIMARY KEY,
      niche TEXT NOT NULL,
      category TEXT,
      symptom_tags TEXT[],
      content TEXT NOT NULL,
      embedding VECTOR(512),
      urgency TEXT DEFAULT 'schedule',
      safety_flag BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_diagnostic_niche ON diagnostic_knowledge(niche)`).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS diagnostic_knowledge_embedding_idx
    ON diagnostic_knowledge USING hnsw (embedding vector_cosine_ops)
  `).catch(() => {});

  // Migration: add metadata + source_site to leads for inbound bridge support
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`).catch(() => {});
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_site TEXT`).catch(() => {});
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_tier TEXT`).catch(() => {});
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_score INTEGER`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source_site)`).catch(() => {});

  // Migration: radius matching + max appointments per day on contractors
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS service_radius_miles INTEGER DEFAULT 25`).catch(() => {});
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER`).catch(() => {});

  // Migration: per-site API keys table
  await db.query(`
    CREATE TABLE IF NOT EXISTS inbound_api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      source_slug TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `).catch(() => {});

  // Migration: lead dedup index on email + created_at
  await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email, created_at DESC)`).catch(() => {});

  // Migration: lead audit trail
  await db.query(`
    CREATE TABLE IF NOT EXISTS lead_events (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT DEFAULT 'system',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id, created_at DESC)`).catch(() => {});

  // Migration: appointment reminder tracking
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`).catch(() => {});

  // Migration: self-service cancel/reschedule tokens for homeowner email links
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token TEXT UNIQUE`).catch(() => {});
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reschedule_token TEXT UNIQUE`).catch(() => {});

  // Migration: track how many times a homeowner has self-cancelled/rescheduled (abuse prevention)
  await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS reschedule_count INTEGER DEFAULT 0`).catch(() => {});

  // Migration: track whether a booking token was issued from a reschedule (for contextual emails)
  await db.query(`ALTER TABLE booking_tokens ADD COLUMN IF NOT EXISTS source TEXT`).catch(() => {});

  // Migration: contractor self-apply timestamp (is_active=0 until admin approves)
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`).catch(() => {});

  // Migration: contractor application declined timestamp
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ`).catch(() => {});

  // Seed niches if not already present
  const { rows } = await pool.query('SELECT COUNT(*) FROM niches');
  if (parseInt(rows[0].count) === 0) {
    console.log('🌱 Seeding niches…');
    const { v4: uuidv4 } = require('uuid');
    const niches = [
      ['Roofing',             'Roof repair, replacement, and inspection'],
      ['Plumbing',            'Pipe repair, installation, and emergency plumbing'],
      ['HVAC',                'Heating, ventilation, and air conditioning'],
      ['Electrical',          'Wiring, panel upgrades, and electrical repairs'],
      ['Landscaping',         'Lawn care, landscaping, and tree services'],
      ['Painting',            'Interior and exterior painting'],
      ['General Contracting', 'Home renovation and general contracting'],
    ];
    for (const [name, desc] of niches) {
      await pool.query(
        'INSERT INTO niches (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [uuidv4(), name, desc]
      );
    }
  }

  console.log('✅ Database ready');
}

// Run schema on module load and export a promise so server can await it
db._ready = initialize().catch(err => {
  console.error('💥 DB initialization failed:', err.message);
  process.exit(1);
});

module.exports = db;
