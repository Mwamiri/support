import { query } from './pool.js'
import dotenv from 'dotenv'
dotenv.config()

const migrate = async () => {
  console.log('🔧 Running migrations...')

  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      slug        VARCHAR(255) UNIQUE NOT NULL,
      contact_person VARCHAR(255),
      contact_email  VARCHAR(255),
      contact_phone  VARCHAR(50),
      address        TEXT,
      contract_number VARCHAR(100),
      po_number       VARCHAR(100),
      status      VARCHAR(20) DEFAULT 'active',
      notes       TEXT,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW(),
      deleted_at  TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      name            VARCHAR(255) NOT NULL,
      email           VARCHAR(255) UNIQUE NOT NULL,
      phone           VARCHAR(50),
      employee_number VARCHAR(50),
      designation     VARCHAR(255),
      password        VARCHAR(255) NOT NULL,
      role            VARCHAR(30) DEFAULT 'client' CHECK (role IN ('super_admin','manager','technician','client')),
      is_active       BOOLEAN DEFAULT true,
      last_login_at   TIMESTAMP,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW(),
      deleted_at      TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS sites (
      id         SERIAL PRIMARY KEY,
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name       VARCHAR(255) NOT NULL,
      building   VARCHAR(255),
      address    TEXT,
      city       VARCHAR(100),
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS departments (
      id         SERIAL PRIMARY KEY,
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name       VARCHAR(255) NOT NULL,
      color      VARCHAR(7) DEFAULT '#2E75B6',
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(client_id, name)
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS equipment_types (
      id         SERIAL PRIMARY KEY,
      client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      name       VARCHAR(255) NOT NULL,
      category   VARCHAR(50) DEFAULT 'general',
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS site_visits (
      id                        SERIAL PRIMARY KEY,
      client_id                 INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      site_id                   INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      lead_technician_id        INTEGER NOT NULL REFERENCES users(id),
      visit_reference           VARCHAR(50) UNIQUE NOT NULL,
      visit_date                DATE NOT NULL,
      time_in                   TIME,
      time_out                  TIME,
      next_visit_date           DATE,
      contract_number           VARCHAR(100),
      client_representative     VARCHAR(255),
      client_designation        VARCHAR(255),
      scope                     JSONB DEFAULT '[]',
      summary                   TEXT,
      status                    VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','signed')),
      tech_signature_name       VARCHAR(255),
      tech_signed_at            TIMESTAMP,
      client_signature_name     VARCHAR(255),
      client_signature_designation VARCHAR(255),
      client_signed_at          TIMESTAMP,
      created_at                TIMESTAMP DEFAULT NOW(),
      updated_at                TIMESTAMP DEFAULT NOW(),
      deleted_at                TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS visit_issues (
      id                  SERIAL PRIMARY KEY,
      site_visit_id       INTEGER NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
      client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      department_id       INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      equipment_type_id   INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
      sub_area            VARCHAR(255),
      equipment_custom    VARCHAR(255),
      serial_number       VARCHAR(100),
      asset_tag           VARCHAR(100),
      network_point_id    VARCHAR(50),
      issue_description   TEXT NOT NULL,
      root_cause          TEXT,
      action_taken        TEXT,
      status              VARCHAR(30) DEFAULT 'in_progress' CHECK (status IN ('resolved','in_progress','unresolved','recurring','pending_parts')),
      resolved            VARCHAR(10) DEFAULT 'no' CHECK (resolved IN ('yes','no','partial')),
      resolution_hours    DECIMAL(5,2),
      parts_used          TEXT,
      parts_cost          DECIMAL(10,2),
      further_request     TEXT,
      priority            VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
      followup_date       DATE,
      remarks             TEXT,
      created_at          TIMESTAMP DEFAULT NOW(),
      updated_at          TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS network_points (
      id               SERIAL PRIMARY KEY,
      site_visit_id    INTEGER NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
      client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      site_id          INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      point_id         VARCHAR(50) NOT NULL,
      office_room      VARCHAR(255),
      department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      device_type      VARCHAR(100),
      connected_to     VARCHAR(255),
      switch_port      VARCHAR(100),
      port_status      VARCHAR(30) DEFAULT 'active' CHECK (port_status IN ('active','dead','intermittent','not_patched','disabled','reterminate')),
      speed_mbps       VARCHAR(20),
      device_connected VARCHAR(255),
      issue            TEXT,
      remarks          TEXT,
      accompanied_by   VARCHAR(255),
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS equipment_register (
      id                  SERIAL PRIMARY KEY,
      client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      site_id             INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      department_id       INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      equipment_type_id   INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
      custom_item         VARCHAR(255),
      location_room       VARCHAR(255),
      make_model          VARCHAR(255),
      serial_number       VARCHAR(100),
      asset_tag           VARCHAR(100) UNIQUE,
      condition           VARCHAR(30) DEFAULT 'good' CHECK (condition IN ('excellent','good','fair','poor','for_repair','decommissioned')),
      purchase_date       DATE,
      warranty_expiry     DATE,
      assigned_to         VARCHAR(255),
      notes               TEXT,
      created_at          TIMESTAMP DEFAULT NOW(),
      updated_at          TIMESTAMP DEFAULT NOW(),
      deleted_at          TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS device_credentials (
      id                      SERIAL PRIMARY KEY,
      client_id               INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      site_id                 INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      department_id           INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      device_category         VARCHAR(30) NOT NULL CHECK (device_category IN ('router','wifi_ap','nvr_dvr','computer','switch','server','other')),
      device_label            VARCHAR(100) NOT NULL,
      make_model              VARCHAR(255),
      ip_address              VARCHAR(50),
      mac_address             VARCHAR(50),
      location                VARCHAR(255),
      ssid                    VARCHAR(255),
      wifi_band               VARCHAR(50),
      security_type           VARCHAR(50),
      vlan                    VARCHAR(50),
      channels                INTEGER,
      active_cameras          INTEGER,
      remote_view_app         VARCHAR(255),
      hdd_size                VARCHAR(50),
      retention_days          INTEGER,
      hostname                VARCHAR(255),
      os_version              VARCHAR(100),
      domain_workgroup        VARCHAR(100),
      remote_desktop          BOOLEAN DEFAULT false,
      username_enc            TEXT,
      password_enc            TEXT,
      secondary_username_enc  TEXT,
      secondary_password_enc  TEXT,
      firmware_version        VARCHAR(100),
      credentials_last_changed DATE,
      notes                   TEXT,
      created_at              TIMESTAMP DEFAULT NOW(),
      updated_at              TIMESTAMP DEFAULT NOW(),
      deleted_at              TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id               SERIAL PRIMARY KEY,
      client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      site_id          INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      submitted_by     INTEGER NOT NULL REFERENCES users(id),
      assigned_to      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ticket_number    VARCHAR(50) UNIQUE NOT NULL,
      title            VARCHAR(255) NOT NULL,
      description      TEXT NOT NULL,
      equipment        VARCHAR(255),
      location         VARCHAR(255),
      priority         VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
      status           VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','closed','rejected')),
      resolution_notes TEXT,
      resolved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at      TIMESTAMP,
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW(),
      deleted_at       TIMESTAMP
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id          SERIAL PRIMARY KEY,
      ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      comment     TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT false,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS further_requests (
      id             SERIAL PRIMARY KEY,
      site_visit_id  INTEGER REFERENCES site_visits(id) ON DELETE SET NULL,
      client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      description    TEXT NOT NULL,
      item_required  VARCHAR(255),
      custom_item    VARCHAR(255),
      estimated_cost DECIMAL(10,2),
      priority       VARCHAR(20) DEFAULT 'medium',
      requested_by   VARCHAR(255),
      due_date       DATE,
      progress       VARCHAR(30) DEFAULT 'pending' CHECK (progress IN ('pending','approved','in_progress','completed','rejected')),
      notes          TEXT,
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    )
  `)

  // Indexes for performance
  await query(`CREATE INDEX IF NOT EXISTS idx_visits_client    ON site_visits(client_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_visits_date      ON site_visits(visit_date)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_issues_visit     ON visit_issues(site_visit_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_issues_client    ON visit_issues(client_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_network_point_id ON network_points(point_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_client   ON tickets(client_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status)`)

  console.log('✅ All tables created successfully')
  process.exit(0)
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1) })

// Import and run plugin migration
import { migratePlugins } from '../plugins/engine/pluginMigration.js'
await migratePlugins()
