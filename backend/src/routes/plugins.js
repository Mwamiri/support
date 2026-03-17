import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { pluginManager } from './engine/PluginManager.js'
import { query } from './engine/../db/pool.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import AdmZip from 'adm-zip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// Only Super Admin can manage plugins
router.use(authenticate, authorize('super_admin'))

// Upload storage
const upload = multer({
  dest: path.join(__dirname, '../uploads/plugins/tmp'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.zip')) cb(null, true)
    else cb(new Error('Only .zip files allowed'))
  }
})

// ── GET /api/plugins — List all plugins ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const plugins = await pluginManager.getAll()
    // Attach runtime info
    const enriched = plugins.map(p => ({
      ...p,
      is_loaded:    !!pluginManager.loaded[p.plugin_id],
      widgets:      pluginManager.widgets.filter(w => w.pluginId === p.plugin_id),
      menu_items:   pluginManager.menuItems.filter(m => m.pluginId === p.plugin_id),
    }))
    res.json(enriched)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET /api/plugins/:id — Get single plugin ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const plugin = await pluginManager.getOne(req.params.id)
    if (!plugin) return res.status(404).json({ message: 'Plugin not found' })
    res.json(plugin)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── POST /api/plugins/:id/activate ───────────────────────────────────────────
router.post('/:id/activate', async (req, res) => {
  try {
    const result = await pluginManager.activate(req.params.id)
    res.json(result)
  } catch (err) { res.status(400).json({ message: err.message }) }
})

// ── POST /api/plugins/:id/deactivate ─────────────────────────────────────────
router.post('/:id/deactivate', async (req, res) => {
  try {
    const result = await pluginManager.deactivate(req.params.id)
    res.json(result)
  } catch (err) { res.status(400).json({ message: err.message }) }
})

// ── DELETE /api/plugins/:id — Uninstall ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pluginManager.uninstall(req.params.id)
    res.json(result)
  } catch (err) { res.status(400).json({ message: err.message }) }
})

// ── PUT /api/plugins/:id/settings — Update settings ──────────────────────────
router.put('/:id/settings', async (req, res) => {
  try {
    const result = await pluginManager.updateSettings(req.params.id, req.body)
    res.json(result)
  } catch (err) { res.status(400).json({ message: err.message }) }
})

// ── POST /api/plugins/install — Upload & install zip ─────────────────────────
router.post('/install', upload.single('plugin'), async (req, res) => {
  const tmpFile = req.file?.path
  try {
    if (!tmpFile) return res.status(400).json({ message: 'No file uploaded' })

    // Extract zip
    const zip = new AdmZip(tmpFile)
    const entries = zip.getEntries()

    // Find manifest.json
    const manifestEntry = entries.find(e => e.entryName.endsWith('manifest.json'))
    if (!manifestEntry) return res.status(400).json({ message: 'Invalid plugin: manifest.json not found' })

    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
    const { id: pluginId, name, version, description, author, requires = [], hooks = [] } = manifest

    if (!pluginId || !name || !version) return res.status(400).json({ message: 'Invalid manifest: id, name, version required' })

    // Check if already installed
    const existing = await pluginManager.getOne(pluginId)
    if (existing?.is_builtin) return res.status(400).json({ message: 'Cannot overwrite built-in plugin' })

    // Extract to plugins directory
    const destDir = path.join(__dirname, '../uploads/plugins', pluginId)
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
    fs.mkdirSync(destDir, { recursive: true })
    zip.extractAllTo(destDir, true)

    // Register in DB
    await query(`
      INSERT INTO plugins (plugin_id, name, version, description, author, status, manifest, is_builtin, requires, hooks)
      VALUES ($1,$2,$3,$4,$5,'inactive',$6,false,$7,$8)
      ON CONFLICT (plugin_id) DO UPDATE SET
        name=$2, version=$3, description=$4, manifest=$6, requires=$7, hooks=$8, updated_at=NOW()
    `, [pluginId, name, version, description||'', author||'', JSON.stringify(manifest),
        JSON.stringify(requires), JSON.stringify(hooks)])

    res.status(201).json({ message: `Plugin "${name}" v${version} installed`, plugin_id: pluginId })
  } catch (err) {
    res.status(400).json({ message: err.message })
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
})

// ── GET /api/plugins/widgets — Get registered widgets (for frontend) ───────────
router.get('/meta/widgets', (req, res) => {
  res.json(pluginManager.widgets)
})

// ── GET /api/plugins/menu — Get registered menu items ─────────────────────────
router.get('/meta/menu', (req, res) => {
  res.json(pluginManager.menuItems)
})

// ── GET /api/plugins/custom-fields/:entity — Get custom fields for entity ─────
router.get('/custom-fields/:entity', authenticate, async (req, res) => {
  try {
    const r = await query(`
      SELECT pcf.*, p.name as plugin_name, p.status as plugin_status
      FROM plugin_custom_fields pcf
      JOIN plugins p ON p.plugin_id = pcf.plugin_id
      WHERE pcf.entity_type = $1 AND pcf.is_active = true AND p.status = 'active'
      ORDER BY pcf.sort_order, pcf.id
    `, [req.params.entity])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET /api/plugins/custom-fields/:entity/:entityId/values ───────────────────
router.get('/custom-fields/:entity/:entityId/values', authenticate, async (req, res) => {
  try {
    const r = await query(`
      SELECT pcf.field_key, pcf.field_label, pcf.field_type, pcf.field_options,
             pcfv.value, pcf.id as field_id
      FROM plugin_custom_fields pcf
      LEFT JOIN plugin_custom_field_values pcfv
        ON pcfv.field_id = pcf.id AND pcfv.entity_type = $1 AND pcfv.entity_id = $2
      JOIN plugins p ON p.plugin_id = pcf.plugin_id
      WHERE pcf.entity_type = $1 AND pcf.is_active = true AND p.status = 'active'
      ORDER BY pcf.sort_order
    `, [req.params.entity, req.params.entityId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── POST /api/plugins/custom-fields/:entity/:entityId/values ──────────────────
router.post('/custom-fields/:entity/:entityId/values', authenticate, async (req, res) => {
  try {
    const { values } = req.body // { field_id: value, ... }
    for (const [fieldId, value] of Object.entries(values)) {
      await query(`
        INSERT INTO plugin_custom_field_values (field_id, entity_type, entity_id, value)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (field_id, entity_type, entity_id)
        DO UPDATE SET value=$4, updated_at=NOW()
      `, [parseInt(fieldId), req.params.entity, req.params.entityId, String(value)])
    }
    res.json({ message: 'Values saved' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

export default router
