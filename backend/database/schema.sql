-- =============================================
-- Lead Booking App - Database Schema
-- =============================================

-- Admins (you / your team)
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Service niches (e.g. roofing, plumbing, HVAC)
CREATE TABLE IF NOT EXISTS niches (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contractors
CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  niche_id TEXT NOT NULL,
  service_zip_codes TEXT NOT NULL,  -- JSON array of zip codes they serve
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
  google_refresh_token TEXT,        -- for Google Calendar sync
  google_calendar_id TEXT,          -- their calendar ID
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (niche_id) REFERENCES niches(id)
);

-- Leads (homeowners / people needing a job done)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  niche_id TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  description TEXT,                 -- what work they need done
  status TEXT DEFAULT 'new',        -- new | matched | booked | completed | cancelled
  assigned_contractor_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (niche_id) REFERENCES niches(id),
  FOREIGN KEY (assigned_contractor_id) REFERENCES contractors(id)
);

-- Contractor availability (recurring weekly schedule)
CREATE TABLE IF NOT EXISTS availability_slots (
  id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,     -- 0=Sun, 1=Mon, ... 6=Sat
  start_time TEXT NOT NULL,         -- "09:00"
  end_time TEXT NOT NULL,           -- "17:00"
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (contractor_id) REFERENCES contractors(id)
);

-- Date-specific overrides (blackouts or special availability)
CREATE TABLE IF NOT EXISTS availability_overrides (
  id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  date TEXT NOT NULL,               -- "YYYY-MM-DD"
  is_available INTEGER DEFAULT 0,   -- 0 = blocked out, 1 = special open slot
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  FOREIGN KEY (contractor_id) REFERENCES contractors(id)
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  contractor_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,     -- "YYYY-MM-DD"
  scheduled_time TEXT NOT NULL,     -- "HH:MM"
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'pending',    -- pending | confirmed | cancelled | completed
  google_event_id TEXT,             -- Google Calendar event ID
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id),
  FOREIGN KEY (contractor_id) REFERENCES contractors(id)
);

-- Booking tokens (for homeowner to confirm/pick slots without an account)
CREATE TABLE IF NOT EXISTS booking_tokens (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- Round-robin tracking per niche+zip
CREATE TABLE IF NOT EXISTS round_robin_state (
  id TEXT PRIMARY KEY,
  niche_id TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  last_contractor_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(niche_id, zip_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contractors_niche ON contractors(niche_id);
CREATE INDEX IF NOT EXISTS idx_leads_niche_zip ON leads(niche_id, zip_code);
CREATE INDEX IF NOT EXISTS idx_appointments_contractor ON appointments(contractor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_availability_contractor ON availability_slots(contractor_id);
