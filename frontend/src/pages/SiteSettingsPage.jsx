import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import { useSettings } from '../context/SettingsContext'
import { Page, SectionHeader, Spinner } from '../components/ui/index'
import toast from 'react-hot-toast'
import {
  Globe, Palette, Mail, Plug, Search, Upload, Save,
  RefreshCw, Eye, EyeOff, Loader2, AlertTriangle,
  Monitor, Smartphone, Check, X
} from 'lucide-react'
import clsx from 'clsx'

const TABS = [
  { id:'general',  label:'General',   icon:Globe,    desc:'Site name, URL, contact info, timezone' },
  { id:'branding', label:'Branding',  icon:Palette,  desc:'Logo, favicon, colors, icons' },
  { id:'login',    label:'Login Page',icon:Monitor,  desc:'Login screen appearance' },
  { id:'seo',      label:'SEO & Meta',icon:Search,   desc:'Meta tags, OG image, analytics' },
  { id:'email',    label:'Email',     icon:Mail,     desc:'Email branding and footer' },
  { id:'features', label:'Features',  icon:Plug,     desc:'Toggle system features on/off' },
]

// ── FIELD RENDERERS ───────────────────────────────────────────────────────────
function SettingField({ row, value, onChange }) {
  const { key, type, label } = row
  const inputCls = 'input w-full'

  if (type === 'boolean') return (
    <label className="flex items-center gap-3 cursor-pointer py-1">
      <div onClick={() => onChange(key, value === 'true' ? 'false' : 'true')}
        className={clsx('relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          value === 'true' ? 'bg-blue-600' : 'bg-gray-200')}>
        <span className={clsx('inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
          value === 'true' ? 'translate-x-5' : 'translate-x-0')} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
      <span className={clsx('text-xs font-medium', value==='true'?'text-green-600':'text-gray-400')}>
        {value === 'true' ? 'Enabled' : 'Disabled'}
      </span>
    </label>
  )

  if (type === 'color') return (
    <div className="flex items-center gap-3">
      <input type="color" value={value || '#2E75B6'}
        onChange={e => onChange(key, e.target.value)}
        className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5 bg-white"/>
      <input className={inputCls} value={value || ''}
        placeholder="#000000"
        onChange={e => onChange(key, e.target.value)}/>
      <div className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0" style={{background: value}}/>
    </div>
  )

  if (type === 'textarea') return (
    <textarea className={inputCls + ' resize-none'} rows={3}
      value={value || ''} placeholder={label}
      onChange={e => onChange(key, e.target.value)}/>
  )

  if (type === 'image') return (
    <div className="space-y-2">
      <input className={inputCls} value={value || ''}
        placeholder="https://... or upload below"
        onChange={e => onChange(key, e.target.value)}/>
      {value && (
        <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
          <img src={value.startsWith('http') ? value : `${import.meta.env.VITE_API_URL||''}${value}`}
            alt="preview" className="w-12 h-12 object-contain rounded border border-gray-200 bg-white"/>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-600">Current image</p>
            <p className="text-xs text-gray-400 truncate">{value}</p>
          </div>
          <button onClick={() => onChange(key, '')}
            className="p-1 text-red-400 hover:text-red-600">
            <X className="w-4 h-4"/>
          </button>
        </div>
      )}
    </div>
  )

  if (type === 'email') return (
    <input type="email" className={inputCls} value={value || ''}
      placeholder={label} onChange={e => onChange(key, e.target.value)}/>
  )

  if (type === 'number') return (
    <input type="number" className={inputCls} value={value || ''}
      placeholder="0" onChange={e => onChange(key, e.target.value)}/>
  )

  return (
    <input className={inputCls} value={value || ''}
      placeholder={label} onChange={e => onChange(key, e.target.value)}/>
  )
}

// ── LOGO UPLOADER ─────────────────────────────────────────────────────────────
function LogoUploader({ type, label, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append(type, file)
      const r = await api.post(`/settings/upload/${type}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onUploaded(r.data.url)
      toast.success(`${label} uploaded!`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally { setUploading(false) }
  }

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  const previewSrc = currentUrl ? (currentUrl.startsWith('http') ? currentUrl : `${baseUrl}${currentUrl}`) : null

  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-4 hover:border-blue-400 transition-colors">
      <div className="flex items-center gap-4">
        {previewSrc ? (
          <img src={previewSrc} alt={label}
            className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-gray-50"/>
        ) : (
          <div className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
            <Upload className="w-6 h-6 text-gray-300"/>
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, SVG, ICO · max 5MB</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="btn-secondary text-xs py-1.5 px-3">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5"/>}
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
            {previewSrc && (
              <a href={previewSrc} target="_blank" rel="noreferrer"
                className="btn-secondary text-xs py-1.5 px-3">
                <Eye className="w-3.5 h-3.5"/> Preview
              </a>
            )}
          </div>
        </div>
      </div>
      <input ref={inputRef} type="file"
        accept="image/*,.ico,.svg"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}/>
    </div>
  )
}

// ── LIVE PREVIEW ──────────────────────────────────────────────────────────────
function LivePreview({ values }) {
  const name     = values.site_name    || 'IT Support'
  const logoText = values.logo_text    || 'IT Support'
  const logoSub  = values.logo_subtext || 'SYSTEM'
  const logoIcon = values.logo_icon    || '🔧'
  const primary  = values.primary_color || '#2E75B6'
  const accent   = values.accent_color  || '#00D4FF'
  const baseUrl  = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  const logoSrc  = values.logo_url ? (values.logo_url.startsWith('http') ? values.logo_url : `${baseUrl}${values.logo_url}`) : null
  const favSrc   = values.favicon_url ? (values.favicon_url.startsWith('http') ? values.favicon_url : `${baseUrl}${values.favicon_url}`) : null

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <Eye className="w-4 h-4 text-gray-400"/>
        <span className="text-sm font-semibold text-gray-700">Live Preview</span>
      </div>
      <div className="p-5 space-y-4">
        {/* Browser tab preview */}
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Browser Tab</p>
          <div className="flex items-center gap-2 bg-gray-100 rounded-t-lg px-3 py-2 border border-gray-200 max-w-xs">
            {favSrc ? (
              <img src={favSrc} alt="favicon" className="w-4 h-4 object-contain"/>
            ) : (
              <span className="text-sm">{logoIcon}</span>
            )}
            <span className="text-xs text-gray-700 truncate">{name}</span>
          </div>
          <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg px-3 py-1">
            <span className="text-xs text-blue-600">{values.site_url || 'https://itsupport.yourdomain.com'}</span>
          </div>
        </div>

        {/* Logo preview */}
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Logo / Nav Bar</p>
          <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl">
            {logoSrc ? (
              <img src={logoSrc} alt="logo" className="h-10 w-auto object-contain"/>
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{background:`linear-gradient(135deg, ${accent}, ${primary})`}}>
                {logoIcon}
              </div>
            )}
            <div>
              <span className="text-white font-bold text-base block">{logoText}</span>
              <span className="text-xs font-medium block" style={{color:accent}}>{logoSub}</span>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Brand Colors</p>
          <div className="flex gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg border border-gray-200" style={{background:primary}}/>
              <span className="text-xs text-gray-400">Primary</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg border border-gray-200" style={{background:accent}}/>
              <span className="text-xs text-gray-400">Accent</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-lg border border-gray-200" style={{background:values.dark_color||'#1F3864'}}/>
              <span className="text-xs text-gray-400">Dark</span>
            </div>
          </div>
        </div>

        {/* Meta preview */}
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Google / SEO Preview</p>
          <div className="border border-gray-200 rounded-lg p-3 bg-white">
            <p className="text-blue-700 text-sm font-medium truncate">{values.og_title || name}</p>
            <p className="text-green-700 text-xs">{values.site_url || 'https://itsupport.yourdomain.com'}</p>
            <p className="text-gray-600 text-xs mt-1 line-clamp-2">{values.og_description || values.site_description || 'No description set'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function SiteSettingsPage() {
  const qc = useQueryClient()
  const { refresh } = useSettings()
  const [activeTab, setActiveTab] = useState('general')
  const [values,    setValues]    = useState({})
  const [dirty,     setDirty]     = useState(false)
  const [saving,    setSaving]    = useState(false)

  const { data: grouped, isLoading } = useQuery({
    queryKey: ['settings-grouped'],
    queryFn:  () => api.get('/settings/grouped').then(r => r.data),
  })

  // Init values from loaded settings
  useEffect(() => {
    if (!grouped) return
    const flat = {}
    Object.values(grouped).flat().forEach(row => { flat[row.key] = row.value || '' })
    setValues(flat)
    setDirty(false)
  }, [grouped])

  const handleChange = (key, value) => {
    setValues(p => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/settings', { settings: values })
      toast.success('Settings saved and applied!')
      setDirty(false)
      qc.invalidateQueries(['settings-grouped'])
      refresh() // apply to DOM
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const currentTab = grouped?.[activeTab] || []

  return (
    <Page>
      <SectionHeader
        title="Site Settings"
        subtitle="Configure site name, branding, SEO, features — changes apply immediately"
        action={
          <button onClick={handleSave} disabled={saving || !dirty}
            className={clsx('btn-primary', !dirty && 'opacity-50 cursor-not-allowed')}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
          </button>
        }
      />

      {dirty && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0"/>
          <p className="text-sm text-amber-700 font-medium">You have unsaved changes</p>
          <button onClick={handleSave} className="ml-auto btn-primary text-xs py-1.5">
            Save Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar tabs */}
        <div className="space-y-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all',
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'hover:bg-gray-100 text-gray-600'
              )}>
              <tab.icon className="w-4 h-4 mt-0.5 flex-shrink-0"/>
              <div>
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className={clsx('text-xs mt-0.5 hidden sm:block', activeTab===tab.id?'text-blue-100':'text-gray-400')}>
                  {tab.desc}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Settings fields */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="card p-12 flex justify-center"><Spinner size="lg"/></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h2 className="text-base font-semibold text-gray-900">
                  {TABS.find(t=>t.id===activeTab)?.label}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {TABS.find(t=>t.id===activeTab)?.desc}
                </p>
              </div>
              <div className="p-6 space-y-6">
                {/* Special uploader section for branding tab */}
                {activeTab === 'branding' && (
                  <div className="space-y-4 pb-6 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">File Uploads</h3>
                    <LogoUploader
                      type="logo" label="Logo Image"
                      currentUrl={values.logo_url}
                      onUploaded={url => handleChange('logo_url', url)}
                    />
                    <LogoUploader
                      type="favicon" label="Favicon (.ico / .png / .svg)"
                      currentUrl={values.favicon_url}
                      onUploaded={url => handleChange('favicon_url', url)}
                    />
                  </div>
                )}

                {/* All settings for current tab */}
                {currentTab.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">No settings in this category</p>
                )}
                {currentTab.map(row => (
                  <div key={row.key}>
                    {row.type !== 'boolean' && (
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {row.label}
                        <span className="ml-2 text-xs font-normal text-gray-400 font-mono">{row.key}</span>
                      </label>
                    )}
                    <SettingField
                      row={row}
                      value={values[row.key] ?? ''}
                      onChange={handleChange}
                    />
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button onClick={handleSave} disabled={saving}
                  className="btn-primary">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live preview sidebar */}
        <div className="hidden lg:block">
          <LivePreview values={values}/>
        </div>
      </div>
    </Page>
  )
}
