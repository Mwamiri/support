import { query } from '../db/pool.js'
import dotenv from 'dotenv'
dotenv.config()

const migrate = async () => {
  console.log('🔧 Running technician assignment migrations...')

  // ── TECHNICIAN → CLIENT ASSIGNMENTS ───────────────────────────────────────
  // access_level:
  //   'all'      = sees every client (super technician)
  //   'selected' = only assigned clients listed in technician_clients
  //   'single'   = locked to one client
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) DEFAULT 'all'
      CHECK (access_level IN ('all','selected','single')),
    ADD COLUMN IF NOT EXISTS primary_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS can_view_credentials BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS field_notes TEXT
  `)

  // Many-to-many: technician ↔ selected clients
  await query(`
    CREATE TABLE IF NOT EXISTS technician_clients (
      id             SERIAL PRIMARY KEY,
      technician_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      assigned_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_at    TIMESTAMP DEFAULT NOW(),
      notes          TEXT,
      UNIQUE(technician_id, client_id)
    )
  `)

  // ── VISIT CHECK-IN / CHECK-OUT ─────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS visit_checkins (
      id           SERIAL PRIMARY KEY,
      site_visit_id INTEGER REFERENCES site_visits(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      action        VARCHAR(10) NOT NULL CHECK (action IN ('check_in','check_out')),
      latitude      DECIMAL(10,8),
      longitude     DECIMAL(11,8),
      timestamp     TIMESTAMP DEFAULT NOW(),
      notes         TEXT
    )
  `)

  // ── FIELD PHOTOS ───────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS field_photos (
      id             SERIAL PRIMARY KEY,
      site_visit_id  INTEGER REFERENCES site_visits(id) ON DELETE CASCADE,
      issue_id       INTEGER REFERENCES visit_issues(id) ON DELETE CASCADE,
      uploaded_by    INTEGER NOT NULL REFERENCES users(id),
      filename       VARCHAR(255) NOT NULL,
      original_name  VARCHAR(255),
      mime_type      VARCHAR(100),
      size_bytes     INTEGER,
      caption        TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `)

  // ── PWA PUSH SUBSCRIPTIONS ─────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT,
      auth        TEXT,
      device_info VARCHAR(255),
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `)

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_tech_clients_tech ON technician_clients(technician_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_tech_clients_client ON technician_clients(client_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_checkins_visit ON visit_checkins(site_visit_id)`)

  console.log('✅ Technician assignment tables ready')
}

migrate().catch(err => { console.error(err); process.exit(1) })
