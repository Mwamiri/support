import { query } from '../db/pool.js'

export const migratePlugins = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS plugins (
      id              SERIAL PRIMARY KEY,
      plugin_id       VARCHAR(100) UNIQUE NOT NULL,
      name            VARCHAR(255) NOT NULL,
      version         VARCHAR(30)  NOT NULL,
      description     TEXT,
      author          VARCHAR(255),
      status          VARCHAR(20) DEFAULT 'inactive'
                      CHECK (status IN ('active','inactive','error','installing')),
      settings        JSONB DEFAULT '{}',
      manifest        JSONB DEFAULT '{}',
      installed_at    TIMESTAMP DEFAULT NOW(),
      activated_at    TIMESTAMP,
      deactivated_at  TIMESTAMP,
      error_message   TEXT,
      is_builtin      BOOLEAN DEFAULT false,
      requires        JSONB DEFAULT '[]',
      hooks           JSONB DEFAULT '[]',
      updated_at      TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS plugin_custom_fields (
      id          SERIAL PRIMARY KEY,
      plugin_id   VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50)  NOT NULL, -- ticket, visit, equipment, client
      field_key   VARCHAR(100) NOT NULL,
      field_label VARCHAR(255) NOT NULL,
      field_type  VARCHAR(30)  NOT NULL, -- text,number,select,date,textarea,checkbox
      field_options JSONB DEFAULT '[]',
      required    BOOLEAN DEFAULT false,
      is_active   BOOLEAN DEFAULT true,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(plugin_id, entity_type, field_key)
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS plugin_custom_field_values (
      id          SERIAL PRIMARY KEY,
      field_id    INTEGER NOT NULL REFERENCES plugin_custom_fields(id) ON DELETE CASCADE,
      entity_type VARCHAR(50)  NOT NULL,
      entity_id   INTEGER      NOT NULL,
      value       TEXT,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(field_id, entity_type, entity_id)
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS ticket_approvals (
      id           SERIAL PRIMARY KEY,
      ticket_id    INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      step         INTEGER NOT NULL DEFAULT 1,
      approver_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status       VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','skipped')),
      comment      TEXT,
      decided_at   TIMESTAMP,
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS asset_requests (
      id             SERIAL PRIMARY KEY,
      client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      submitted_by   INTEGER NOT NULL REFERENCES users(id),
      request_number VARCHAR(50) UNIQUE NOT NULL,
      asset_type     VARCHAR(255) NOT NULL,
      quantity        INTEGER DEFAULT 1,
      justification  TEXT,
      priority        VARCHAR(20) DEFAULT 'medium',
      status          VARCHAR(30) DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','ordered','delivered','rejected')),
      estimated_cost  DECIMAL(10,2),
      approved_by     INTEGER REFERENCES users(id),
      approved_at     TIMESTAMP,
      notes           TEXT,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS plugin_notifications (
      id          SERIAL PRIMARY KEY,
      plugin_id   VARCHAR(100) NOT NULL,
      event_type  VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id   INTEGER,
      recipient   VARCHAR(255),
      channel     VARCHAR(30), -- email, whatsapp, sms
      status      VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
      payload     JSONB,
      error       TEXT,
      sent_at     TIMESTAMP,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `)

  console.log('✅ Plugin tables migrated')
}
