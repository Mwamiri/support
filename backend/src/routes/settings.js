import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router    = Router()

// ── MIGRATE settings table (called on startup) ────────────────────────────────
export const migrateSettings = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id         SERIAL PRIMARY KEY,
      key        VARCHAR(100) UNIQUE NOT NULL,
      value      TEXT,
      type       VARCHAR(30) DEFAULT 'text',
      group_name VARCHAR(50) DEFAULT 'general',
      label      VARCHAR(255),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)

  // Insert default settings (ON CONFLICT DO NOTHING = never overwrite saved values)
  const defaults = [
    // General
    ['site_name',        'NexCore IT Support',       'text',    'general', 'Site / App Name'],
    ['site_tagline',     'IT Maintenance & Support Management', 'text', 'general', 'Tagline'],
    ['site_description', 'Advanced IT support, network maintenance and managed services platform.', 'textarea', 'general', 'Meta Description'],
    ['site_keywords',    'IT support, network maintenance, CCTV, fibre, UTP, helpdesk', 'text', 'general', 'Meta Keywords'],
    ['site_url',         'https://itsupport.yourdomain.com', 'text', 'general', 'Site URL'],
    ['support_email',    'support@nexcoreit.com',    'email',   'general', 'Support Email'],
    ['support_phone',    '+254 700 000 000',          'text',    'general', 'Support Phone'],
    ['support_whatsapp', '+254700000000',             'text',    'general', 'WhatsApp Number'],
    ['company_address',  'Nairobi, Kenya',            'text',    'general', 'Office Address'],
    ['company_name',     'NexCore IT Solutions Ltd',  'text',    'general', 'Legal Company Name'],
    ['timezone',         'Africa/Nairobi',            'text',    'general', 'Timezone'],
    ['currency',         'KES',                       'text',    'general', 'Currency Code'],
    ['date_format',      'DD MMM YYYY',               'text',    'general', 'Date Format'],

    // Branding
    ['logo_url',         '',   'image',   'branding', 'Logo Image URL'],
    ['logo_text',        'NexCore IT',   'text', 'branding', 'Logo Text'],
    ['logo_subtext',     'SUPPORT',      'text', 'branding', 'Logo Sub-text'],
    ['logo_icon',        '🔧',           'text', 'branding', 'Logo Icon (emoji or letter)'],
    ['favicon_url',      '',   'image',   'branding', 'Favicon URL'],
    ['primary_color',    '#2E75B6',      'color','branding', 'Primary Color'],
    ['accent_color',     '#00D4FF',      'color','branding', 'Accent Color'],
    ['dark_color',       '#1F3864',      'color','branding', 'Dark Color'],

    // Login page
    ['login_title',      'Sign in to your account',  'text',    'login', 'Login Page Title'],
    ['login_subtitle',   'IT Maintenance & Support Management', 'text', 'login', 'Login Subtitle'],
    ['login_bg_color',   '#0A0C0F',      'color','login', 'Login Background Color'],
    ['show_demo_creds',  'true',         'boolean','login','Show Demo Credentials'],

    // Email / notifications
    ['email_from_name',  'IT Support',   'text',  'email', 'Email From Name'],
    ['email_footer',     'IT Support Management System', 'text', 'email', 'Email Footer Text'],

    // Features
    ['allow_client_signup', 'false',     'boolean','features','Allow Client Self-Registration'],
    ['require_visit_signoff','true',     'boolean','features','Require Technician Sign-off'],
    ['auto_notify_client',  'true',      'boolean','features','Auto-notify Client on Visit Complete'],
    ['ticket_auto_number',  'true',      'boolean','features','Auto-generate Ticket Numbers'],
    ['max_photo_size_mb',   '10',        'number', 'features','Max Photo Upload Size (MB)'],

    // SEO
    ['og_title',         'NexCore IT Support Management',  'text', 'seo', 'OG Title'],
    ['og_description',   'Advanced IT support, network maintenance and managed services.', 'textarea', 'seo', 'OG Description'],
    ['og_image',         '',  'image', 'seo', 'OG Image URL'],
    ['twitter_handle',   '',  'text',  'seo', 'Twitter/X Handle'],
    ['google_analytics', '',  'text',  'seo', 'Google Analytics ID'],
  ]

  for (const [key, value, type, group_name, label] of defaults) {
    await query(`
      INSERT INTO site_settings (key, value, type, group_name, label)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (key) DO NOTHING
    `, [key, value, type, group_name, label])
  }

  console.log('✅ Site settings table ready')
}

// ── FILE UPLOAD for logos/favicons ────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/branding')
fs.mkdirSync(uploadDir, { recursive: true })

const brandingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename:    (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${file.fieldname}-${Date.now()}${ext}`)
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i
    if (allowed.test(file.originalname)) cb(null, true)
    else cb(new Error('Image files only'))
  }
})

// ── GET /api/settings — public (for applying to frontend) ────────────────────
router.get('/', async (req, res) => {
  try {
    const r = await query('SELECT key, value, type, group_name, label FROM site_settings ORDER BY group_name, id')
    // Return as key→value map for easy use
    const map = {}
    r.rows.forEach(row => { map[row.key] = row.value })
    // Also return full rows for admin UI
    if (req.query.full === 'true' && req.user?.role === 'super_admin') {
      return res.json({ settings: map, rows: r.rows })
    }
    res.json(map)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ── GET /api/settings/grouped — admin view grouped by category ────────────────
router.get('/grouped', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const r = await query('SELECT * FROM site_settings ORDER BY group_name, id')
    const grouped = {}
    r.rows.forEach(row => {
      if (!grouped[row.group_name]) grouped[row.group_name] = []
      grouped[row.group_name].push(row)
    })
    res.json(grouped)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ── PUT /api/settings — bulk update ──────────────────────────────────────────
router.put('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { settings } = req.body // { key: value, ... }
    if (!settings || typeof settings !== 'object')
      return res.status(400).json({ message: 'settings object required' })

    for (const [key, value] of Object.entries(settings)) {
      await query(`
        UPDATE site_settings SET value=$1, updated_at=NOW() WHERE key=$2
      `, [String(value ?? ''), key])
    }
    res.json({ message: 'Settings saved', count: Object.keys(settings).length })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ── PUT /api/settings/:key — update single key ────────────────────────────────
router.put('/:key', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { value } = req.body
    const r = await query(`
      UPDATE site_settings SET value=$1, updated_at=NOW() WHERE key=$2 RETURNING *
    `, [String(value ?? ''), req.params.key])
    if (!r.rows.length) return res.status(404).json({ message: 'Setting not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ── POST /api/settings/upload/logo — upload logo file ────────────────────────
router.post('/upload/logo', authenticate, authorize('super_admin'),
  brandingUpload.single('logo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
      const url = `/api/settings/branding/${req.file.filename}`
      await query(`UPDATE site_settings SET value=$1, updated_at=NOW() WHERE key='logo_url'`, [url])
      res.json({ message: 'Logo uploaded', url })
    } catch (err) { res.status(500).json({ message: 'Server error' }) }
  }
)

// ── POST /api/settings/upload/favicon — upload favicon ───────────────────────
router.post('/upload/favicon', authenticate, authorize('super_admin'),
  brandingUpload.single('favicon'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
      const url = `/api/settings/branding/${req.file.filename}`
      await query(`UPDATE site_settings SET value=$1, updated_at=NOW() WHERE key='favicon_url'`, [url])
      res.json({ message: 'Favicon uploaded', url })
    } catch (err) { res.status(500).json({ message: 'Server error' }) }
  }
)

// ── GET /api/settings/branding/:filename — serve branding files ───────────────
router.get('/branding/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })
  res.sendFile(filePath)
})

// ── POST /api/settings — create custom setting ────────────────────────────────
router.post('/', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { key, value, type, group_name, label } = req.body
    if (!key) return res.status(400).json({ message: 'key is required' })
    const r = await query(`
      INSERT INTO site_settings (key, value, type, group_name, label)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
      RETURNING *
    `, [key, value||'', type||'text', group_name||'general', label||key])
    res.status(201).json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

export default router
