/**
 * Smart startup — runs automatically inside Docker
 * 1. Wait for DB to be ready
 * 2. Run all migrations (safe to run multiple times — uses IF NOT EXISTS)
 * 3. Seed only if DB is empty (first run only)
 * 4. Start Express server
 */
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const log = (msg) => console.log(`[startup] ${msg}`)

// ── WAIT FOR POSTGRES ─────────────────────────────────────────────────────────
async function waitForDB(retries = 30, delay = 3000) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false })
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1')
      await pool.end()
      log('✅ Database connected')
      return
    } catch (err) {
      log(`⏳ Waiting for database... (${i}/${retries}) — ${err.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('❌ Database not available after maximum retries')
}

// ── RUN MIGRATIONS ────────────────────────────────────────────────────────────
async function runMigrations() {
  log('🔧 Running migrations...')
  // Import and execute all migration files
  await import('./db/migrate.js')
  log('✅ Core migrations complete')

  await import('./db/migrate_technicians.js')
  log('✅ Technician migrations complete')

  // Settings migration is called from index.js on startup (in migrateSettings)
}

// ── SEED IF FIRST RUN ─────────────────────────────────────────────────────────
async function seedIfEmpty() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false })
  try {
    const result = await pool.query('SELECT COUNT(*) FROM users')
    const count  = parseInt(result.rows[0].count)
    if (count === 0) {
      log('🌱 Empty database — running seed...')
      await import('./db/seed.js')
      log('✅ Seed complete')
    } else {
      log(`ℹ️  Database already has ${count} user(s) — skipping seed`)
    }
  } finally {
    await pool.end()
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  log('🚀 IT Support System starting...')
  log(`   Node.js ${process.version}`)
  log(`   Environment: ${process.env.NODE_ENV || 'development'}`)

  try {
    await waitForDB()
    await runMigrations()
    await seedIfEmpty()

    log('✅ All setup complete — starting Express server...\n')

    // Dynamically import and start the Express app
    await import('./index.js')

  } catch (err) {
    console.error('[startup] ❌ Fatal error:', err.message)
    process.exit(1)
  }
}

main()
