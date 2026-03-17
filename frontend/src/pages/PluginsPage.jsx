import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Page, SectionHeader, Modal, EmptyState, PageLoader } from '../components/ui/index'
import toast from 'react-hot-toast'
import {
  Power, Settings, Trash2, Upload, Package, CheckCircle,
  XCircle, AlertTriangle, Loader2, RefreshCw, Info,
  Plug, ChevronDown, ChevronUp, Search
} from 'lucide-react'
import clsx from 'clsx'

const CATEGORY_COLORS = {
  notifications:  { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  customisation:  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  workflow:       { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'client-portal':{ bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
  reports:        { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200' },
  dashboard:      { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
}

function StatusBadge({ status }) {
  const map = {
    active:     { cls: 'bg-green-100 text-green-700 border border-green-200', icon: CheckCircle, label: 'Active' },
    inactive:   { cls: 'bg-gray-100 text-gray-500 border border-gray-200',   icon: XCircle,     label: 'Inactive' },
    error:      { cls: 'bg-red-100 text-red-700 border border-red-200',      icon: AlertTriangle,label: 'Error' },
    installing: { cls: 'bg-blue-100 text-blue-700 border border-blue-200',   icon: Loader2,     label: 'Installing' },
  }
  const s = map[status] || map.inactive
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', s.cls)}>
      <s.icon className="w-3 h-3" /> {s.label}
    </span>
  )
}

function SettingField({ fieldKey, schema, value, onChange }) {
  const { type, label, placeholder, options, required } = schema
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (type === 'checkbox') return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600"
        checked={!!value} onChange={e => onChange(fieldKey, e.target.checked)} />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )

  if (type === 'select') return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <select className={inputCls + ' bg-white'} value={value || ''} onChange={e => onChange(fieldKey, e.target.value)}>
        <option value="">Select...</option>
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  if (type === 'textarea') return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea className={inputCls + ' resize-none'} rows={3} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(fieldKey, e.target.value)} />
    </div>
  )

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input className={inputCls} type={type === 'password' ? 'password' : type === 'number' ? 'number' : 'text'}
        value={value || ''} placeholder={placeholder}
        onChange={e => onChange(fieldKey, e.target.value)} />
    </div>
  )
}

function PluginCard({ plugin, onActivate, onDeactivate, onUninstall, onOpenSettings }) {
  const [expanded, setExpanded] = useState(false)
  const isActive  = plugin.status === 'active'
  const isBuiltin = plugin.is_builtin
  const catStyle  = CATEGORY_COLORS[plugin.manifest?.category] || CATEGORY_COLORS.notifications
  const hasSettings = plugin.manifest?.settings_schema && Object.keys(plugin.manifest.settings_schema).length > 0

  return (
    <div className={clsx(
      'card overflow-hidden transition-all',
      isActive && 'ring-2 ring-blue-200',
      plugin.status === 'error' && 'ring-2 ring-red-200'
    )}>
      {/* Active indicator bar */}
      <div className={clsx('h-1', isActive ? 'bg-blue-600' : plugin.status === 'error' ? 'bg-red-500' : 'bg-gray-200')} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="text-3xl flex-shrink-0">{plugin.manifest?.icon || '🔌'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900 truncate">{plugin.name}</h3>
                <StatusBadge status={plugin.status} />
                {isBuiltin && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Built-in</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', catStyle.bg, catStyle.text)}>
                  {plugin.manifest?.category?.replace('-', ' ') || 'general'}
                </span>
                <span className="text-xs text-gray-400">v{plugin.version}</span>
                {plugin.author && <span className="text-xs text-gray-400">· by {plugin.author}</span>}
              </div>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={() => isActive ? onDeactivate(plugin.plugin_id) : onActivate(plugin.plugin_id)}
            className={clsx(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
              isActive ? 'bg-blue-600' : 'bg-gray-200'
            )}
          >
            <span className={clsx(
              'inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
              isActive ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">{plugin.description}</p>

        {/* Error message */}
        {plugin.status === 'error' && plugin.error_message && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{plugin.error_message}</p>
          </div>
        )}

        {/* Dependencies */}
        {plugin.requires?.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">Requires:</span>
            {plugin.requires.map(dep => (
              <span key={dep} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">{dep}</span>
            ))}
          </div>
        )}

        {/* Hooks */}
        {expanded && plugin.hooks?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Event hooks:</p>
            <div className="flex flex-wrap gap-1">
              {plugin.hooks.map(h => (
                <span key={h} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{h}</span>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            {hasSettings && (
              <button onClick={() => onOpenSettings(plugin)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                <Settings className="w-3.5 h-3.5" /> Settings
              </button>
            )}
            {!isBuiltin && (
              <button onClick={() => onUninstall(plugin)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Uninstall
              </button>
            )}
            <button onClick={() => setExpanded(p => !p)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <Info className="w-3.5 h-3.5" /> Details
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <span className="text-xs text-gray-300">
            {plugin.activated_at ? `Active since ${new Date(plugin.activated_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}` : plugin.installed_at ? `Installed ${new Date(plugin.installed_at).toLocaleDateString('en-GB')}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function PluginsPage() {
  const { user }  = useAuth()
  const qc        = useQueryClient()
  const [settingsPlugin, setSettingsPlugin] = useState(null)
  const [settingsValues, setSettingsValues] = useState({})
  const [uploadFile, setUploadFile]         = useState(null)
  const [uploading, setUploading]           = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [uninstallTarget, setUninstallTarget] = useState(null)
  const [search, setSearch]   = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: plugins, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn:  () => api.get('/plugins').then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries(['plugins'])

  const handleActivate = async (id) => {
    try {
      await api.post(`/plugins/${id}/activate`)
      toast.success('Plugin activated ✅')
      invalidate()
    } catch (err) { toast.error(err.response?.data?.message || 'Activation failed') }
  }

  const handleDeactivate = async (id) => {
    try {
      await api.post(`/plugins/${id}/deactivate`)
      toast.success('Plugin deactivated')
      invalidate()
    } catch (err) { toast.error(err.response?.data?.message || 'Deactivation failed') }
  }

  const handleUninstall = async () => {
    if (!uninstallTarget) return
    try {
      await api.delete(`/plugins/${uninstallTarget.plugin_id}`)
      toast.success('Plugin uninstalled')
      setUninstallTarget(null)
      invalidate()
    } catch (err) { toast.error(err.response?.data?.message || 'Uninstall failed') }
  }

  const openSettings = (plugin) => {
    setSettingsPlugin(plugin)
    setSettingsValues(plugin.settings || {})
  }

  const handleSettingChange = (key, value) => {
    setSettingsValues(p => ({ ...p, [key]: value }))
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.put(`/plugins/${settingsPlugin.plugin_id}/settings`, settingsValues)
      toast.success('Settings saved')
      setSettingsPlugin(null)
      invalidate()
    } catch (err) { toast.error('Failed to save settings') }
    finally { setSavingSettings(false) }
  }

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append('plugin', uploadFile)
    try {
      const r = await api.post('/plugins/install', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(r.data.message)
      setUploadFile(null)
      invalidate()
    } catch (err) { toast.error(err.response?.data?.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  // Filter plugins
  const categories = ['all', ...new Set((plugins || []).map(p => p.manifest?.category).filter(Boolean))]
  const filtered = (plugins || []).filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.description?.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter !== 'all' && p.manifest?.category !== catFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  })

  const activeCount   = plugins?.filter(p => p.status === 'active').length || 0
  const inactiveCount = plugins?.filter(p => p.status === 'inactive').length || 0
  const errorCount    = plugins?.filter(p => p.status === 'error').length || 0

  return (
    <Page>
      <SectionHeader
        title="Plugin Manager"
        subtitle="Install, activate, configure and manage system plugins — like WordPress"
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Plugins',   value: plugins?.length || 0,  color:'text-gray-800',  bg:'bg-white' },
          { label:'Active',          value: activeCount,            color:'text-green-600', bg:'bg-green-50' },
          { label:'Inactive',        value: inactiveCount,          color:'text-gray-500',  bg:'bg-gray-50' },
          { label:'Errors',          value: errorCount,             color:'text-red-600',   bg:'bg-red-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={clsx('card p-4 text-center', bg)}>
            <p className={clsx('text-2xl font-bold', color)}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Upload new plugin */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" /> Install New Plugin
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center gap-3 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl px-4 py-3 cursor-pointer transition-colors">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">
              {uploadFile ? uploadFile.name : 'Click to select plugin .zip file'}
            </span>
            <input type="file" accept=".zip" className="hidden"
              onChange={e => setUploadFile(e.target.files?.[0] || null)} />
          </label>
          <button onClick={handleUpload} disabled={!uploadFile || uploading}
            className="btn-primary flex-shrink-0 disabled:opacity-60">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Installing...' : 'Install'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Plugin must be a .zip file containing a <code className="bg-gray-100 px-1 rounded">manifest.json</code> and <code className="bg-gray-100 px-1 rounded">index.js</code>
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search plugins..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors',
                catFilter === c ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300')}>
              {c === 'all' ? 'All Categories' : c.replace('-', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['all','active','inactive','error'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors',
                statusFilter === s ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-200 text-gray-600')}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={invalidate} className="btn-secondary text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Plugin grid */}
      {isLoading ? <PageLoader /> : (
        <>
          {filtered.length === 0 && (
            <EmptyState icon={Plug} title="No plugins found"
              message="Try adjusting your search or filters" />
          )}
          {/* Group by category */}
          {Object.entries(
            filtered.reduce((acc, p) => {
              const cat = p.manifest?.category || 'general'
              if (!acc[cat]) acc[cat] = []
              acc[cat].push(p)
              return acc
            }, {})
          ).map(([cat, catPlugins]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full capitalize',
                  CATEGORY_COLORS[cat]?.bg || 'bg-gray-100',
                  CATEGORY_COLORS[cat]?.text || 'text-gray-600')}>
                  {cat.replace('-', ' ')}
                </span>
                <span className="text-xs text-gray-400">{catPlugins.length} plugin{catPlugins.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                {catPlugins.map(plugin => (
                  <PluginCard
                    key={plugin.plugin_id}
                    plugin={plugin}
                    onActivate={handleActivate}
                    onDeactivate={handleDeactivate}
                    onUninstall={setUninstallTarget}
                    onOpenSettings={openSettings}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── SETTINGS MODAL ───────────────────────────────────────────────────── */}
      <Modal
        open={!!settingsPlugin}
        onClose={() => setSettingsPlugin(null)}
        title={`${settingsPlugin?.manifest?.icon || '🔌'} ${settingsPlugin?.name} — Settings`}
        size="lg"
      >
        {settingsPlugin && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 pb-3 border-b">{settingsPlugin.description}</p>

            {/* Checkbox fields grouped separately */}
            {Object.entries(settingsPlugin.manifest?.settings_schema || {}).filter(([,s]) => s.type !== 'checkbox').map(([key, schema]) => (
              <SettingField key={key} fieldKey={key} schema={schema}
                value={settingsValues[key] ?? schema.default}
                onChange={handleSettingChange} />
            ))}

            {Object.entries(settingsPlugin.manifest?.settings_schema || {}).filter(([,s]) => s.type === 'checkbox').length > 0 && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Notification triggers</p>
                <div className="space-y-3">
                  {Object.entries(settingsPlugin.manifest?.settings_schema || {}).filter(([,s]) => s.type === 'checkbox').map(([key, schema]) => (
                    <SettingField key={key} fieldKey={key} schema={schema}
                      value={settingsValues[key] ?? schema.default}
                      onChange={handleSettingChange} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button className="btn-secondary" onClick={() => setSettingsPlugin(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── UNINSTALL CONFIRM ─────────────────────────────────────────────────── */}
      <Modal open={!!uninstallTarget} onClose={() => setUninstallTarget(null)} title="Uninstall Plugin" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Permanently uninstall {uninstallTarget?.name}?</p>
              <p className="text-sm text-red-700 mt-1">
                All plugin data, custom fields and settings will be permanently deleted. This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setUninstallTarget(null)}>Cancel</button>
            <button className="btn-danger" onClick={handleUninstall}>
              <Trash2 className="w-4 h-4" /> Uninstall Permanently
            </button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
