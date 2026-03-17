import { query } from '../db/pool.js'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ══════════════════════════════════════════════════════════════════════════════
// HOOK SYSTEM — WordPress-style action/filter hooks
// ══════════════════════════════════════════════════════════════════════════════
class HookSystem {
  constructor() {
    this.hooks = {}   // action hooks  — fire and forget
    this.filters = {} // filter hooks  — transform data
  }

  // Register a hook listener
  addAction(event, callback, priority = 10) {
    if (!this.hooks[event]) this.hooks[event] = []
    this.hooks[event].push({ callback, priority })
    this.hooks[event].sort((a, b) => a.priority - b.priority)
  }

  // Fire all listeners for an event
  async doAction(event, data = {}) {
    if (!this.hooks[event]) return
    for (const { callback } of this.hooks[event]) {
      try { await callback(data) } catch (err) {
        console.error(`[Hook:${event}] Error in listener:`, err.message)
      }
    }
  }

  // Register a filter
  addFilter(name, callback, priority = 10) {
    if (!this.filters[name]) this.filters[name] = []
    this.filters[name].push({ callback, priority })
    this.filters[name].sort((a, b) => a.priority - b.priority)
  }

  // Apply all filters to a value
  async applyFilter(name, value, context = {}) {
    if (!this.filters[name]) return value
    let result = value
    for (const { callback } of this.filters[name]) {
      try { result = await callback(result, context) } catch (err) {
        console.error(`[Filter:${name}] Error:`, err.message)
      }
    }
    return result
  }

  // Remove all hooks for a plugin (on deactivate)
  removePluginHooks(pluginId) {
    for (const event of Object.keys(this.hooks)) {
      this.hooks[event] = this.hooks[event].filter(h => h.pluginId !== pluginId)
    }
    for (const name of Object.keys(this.filters)) {
      this.filters[name] = this.filters[name].filter(f => f.pluginId !== pluginId)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PLUGIN MANAGER — Install, activate, deactivate, uninstall, settings
// ══════════════════════════════════════════════════════════════════════════════
class PluginManager {
  constructor() {
    this.hooks    = new HookSystem()
    this.loaded   = {}   // pluginId → plugin instance
    this.routes   = []   // express routes registered by plugins
    this.widgets  = []   // dashboard widgets registered
    this.menuItems= []   // nav menu items
  }

  // ── LOAD ALL ACTIVE PLUGINS ON STARTUP ────────────────────────────────────
  async loadAll(expressApp) {
    this.app = expressApp
    // First load builtins into DB if not already there
    await this._syncBuiltins()
    // Load all active plugins
    const result = await query(`SELECT * FROM plugins WHERE status = 'active' ORDER BY id`)
    for (const row of result.rows) {
      try {
        await this._loadPlugin(row)
      } catch (err) {
        console.error(`[PluginManager] Failed to load ${row.plugin_id}:`, err.message)
        await query(`UPDATE plugins SET status='error', error_message=$1 WHERE plugin_id=$2`,
          [err.message, row.plugin_id])
      }
    }
    console.log(`[PluginManager] Loaded ${Object.keys(this.loaded).length} plugin(s)`)
  }

  // ── ACTIVATE ──────────────────────────────────────────────────────────────
  async activate(pluginId) {
    const row = await this._getPluginRow(pluginId)
    if (!row) throw new Error(`Plugin ${pluginId} not found`)
    if (row.status === 'active') throw new Error('Plugin already active')

    // Check dependencies
    const requires = row.requires || []
    for (const dep of requires) {
      const depRow = await this._getPluginRow(dep)
      if (!depRow || depRow.status !== 'active') {
        throw new Error(`Required plugin "${dep}" is not active. Please activate it first.`)
      }
    }

    await this._loadPlugin(row)
    await query(`UPDATE plugins SET status='active', activated_at=NOW(), error_message=NULL WHERE plugin_id=$1`, [pluginId])
    await this.hooks.doAction('plugin.activated', { pluginId })
    return { message: `Plugin "${row.name}" activated` }
  }

  // ── DEACTIVATE ────────────────────────────────────────────────────────────
  async deactivate(pluginId) {
    const row = await this._getPluginRow(pluginId)
    if (!row) throw new Error(`Plugin ${pluginId} not found`)

    // Check if other active plugins depend on this one
    const dependents = await query(
      `SELECT name FROM plugins WHERE status='active' AND requires @> $1::jsonb`,
      [JSON.stringify([pluginId])]
    )
    if (dependents.rows.length > 0) {
      const names = dependents.rows.map(r => r.name).join(', ')
      throw new Error(`Cannot deactivate — required by: ${names}`)
    }

    // Run plugin's own deactivate hook
    const plugin = this.loaded[pluginId]
    if (plugin?.onDeactivate) await plugin.onDeactivate()

    // Remove hooks
    this.hooks.removePluginHooks(pluginId)
    // Remove registered routes (can't easily remove express routes — mark inactive)
    delete this.loaded[pluginId]
    this.widgets  = this.widgets.filter(w => w.pluginId !== pluginId)
    this.menuItems= this.menuItems.filter(m => m.pluginId !== pluginId)

    await query(`UPDATE plugins SET status='inactive', deactivated_at=NOW() WHERE plugin_id=$1`, [pluginId])
    await this.hooks.doAction('plugin.deactivated', { pluginId })
    return { message: `Plugin "${row.name}" deactivated` }
  }

  // ── UNINSTALL ─────────────────────────────────────────────────────────────
  async uninstall(pluginId) {
    const row = await this._getPluginRow(pluginId)
    if (!row) throw new Error(`Plugin ${pluginId} not found`)
    if (row.is_builtin) throw new Error('Built-in plugins cannot be uninstalled')
    if (row.status === 'active') await this.deactivate(pluginId)

    // Run uninstall hook
    const plugin = this.loaded[pluginId]
    if (plugin?.onUninstall) await plugin.onUninstall()

    // Clean up custom fields
    await query(`DELETE FROM plugin_custom_fields WHERE plugin_id=$1`, [pluginId])
    await query(`DELETE FROM plugins WHERE plugin_id=$1`, [pluginId])

    // Remove uploaded files
    const pluginDir = path.join(__dirname, '../../uploads/plugins', pluginId)
    if (fs.existsSync(pluginDir)) fs.rmSync(pluginDir, { recursive: true })

    return { message: `Plugin "${row.name}" uninstalled` }
  }

  // ── UPDATE SETTINGS ───────────────────────────────────────────────────────
  async updateSettings(pluginId, settings) {
    await query(`UPDATE plugins SET settings = settings || $1::jsonb, updated_at=NOW() WHERE plugin_id=$2`,
      [JSON.stringify(settings), pluginId])
    // Notify loaded plugin
    const plugin = this.loaded[pluginId]
    if (plugin?.onSettingsUpdate) await plugin.onSettingsUpdate(settings)
    return { message: 'Settings saved' }
  }

  // ── GET ALL PLUGINS ───────────────────────────────────────────────────────
  async getAll() {
    const result = await query(`SELECT id, plugin_id, name, version, description, author,
      status, settings, manifest, installed_at, activated_at, deactivated_at,
      error_message, is_builtin, requires, hooks, updated_at
      FROM plugins ORDER BY is_builtin DESC, name ASC`)
    return result.rows
  }

  // ── GET SINGLE PLUGIN ─────────────────────────────────────────────────────
  async getOne(pluginId) {
    return this._getPluginRow(pluginId)
  }

  // ── REGISTER ROUTE (called by plugins) ───────────────────────────────────
  registerRoute(method, path, handler, pluginId) {
    if (this.app) {
      this.app[method.toLowerCase()](path, handler)
      this.routes.push({ method, path, pluginId })
    }
  }

  // ── REGISTER WIDGET (called by plugins) ──────────────────────────────────
  registerWidget(widget, pluginId) {
    this.widgets.push({ ...widget, pluginId })
  }

  // ── REGISTER MENU ITEM ────────────────────────────────────────────────────
  registerMenuItem(item, pluginId) {
    this.menuItems.push({ ...item, pluginId })
  }

  // ── PRIVATE: Load a single plugin ─────────────────────────────────────────
  async _loadPlugin(row) {
    let pluginModule
    // Try built-in first
    const builtinPath = path.join(__dirname, '../built-in', row.plugin_id, 'index.js')
    if (fs.existsSync(builtinPath)) {
      const mod = await import(builtinPath)
      pluginModule = mod.default || mod
    } else {
      // Try uploaded plugin
      const uploadedPath = path.join(__dirname, '../../uploads/plugins', row.plugin_id, 'index.js')
      if (!fs.existsSync(uploadedPath)) throw new Error(`Plugin file not found: ${row.plugin_id}`)
      const mod = await import(uploadedPath)
      pluginModule = mod.default || mod
    }

    // Instantiate and boot
    const settings = row.settings || {}
    const ctx = {
      hooks:          this.hooks,
      query,
      settings,
      registerRoute:  (m, p, h) => this.registerRoute(m, p, h, row.plugin_id),
      registerWidget: (w)       => this.registerWidget(w, row.plugin_id),
      registerMenuItem:(item)   => this.registerMenuItem(item, row.plugin_id),
      log:            (...args) => console.log(`[Plugin:${row.plugin_id}]`, ...args),
    }

    if (typeof pluginModule === 'function') {
      this.loaded[row.plugin_id] = await pluginModule(ctx)
    } else if (pluginModule.boot) {
      this.loaded[row.plugin_id] = await pluginModule.boot(ctx)
    }
  }

  // ── PRIVATE: Sync built-in plugins to DB ─────────────────────────────────
  async _syncBuiltins() {
    const builtinDir = path.join(__dirname, '../built-in')
    if (!fs.existsSync(builtinDir)) return
    const dirs = fs.readdirSync(builtinDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name)

    for (const dir of dirs) {
      const manifestPath = path.join(builtinDir, dir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      await query(`
        INSERT INTO plugins (plugin_id, name, version, description, author, status,
          manifest, is_builtin, requires, hooks)
        VALUES ($1,$2,$3,$4,$5,'inactive',$6,true,$7,$8)
        ON CONFLICT (plugin_id) DO UPDATE SET
          name=$2, version=$3, description=$4, manifest=$6,
          requires=$7, hooks=$8, updated_at=NOW()
      `, [
        manifest.id, manifest.name, manifest.version, manifest.description,
        manifest.author, JSON.stringify(manifest),
        JSON.stringify(manifest.requires || []),
        JSON.stringify(manifest.hooks || [])
      ])
    }
  }

  async _getPluginRow(pluginId) {
    const r = await query('SELECT * FROM plugins WHERE plugin_id=$1', [pluginId])
    return r.rows[0] || null
  }
}

// Singleton
export const pluginManager = new PluginManager()
export const hooks = pluginManager.hooks
