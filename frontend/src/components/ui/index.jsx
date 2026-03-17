import clsx from 'clsx'
import { Loader2, X, AlertCircle, InboxIcon } from 'lucide-react'

// ── STATUS BADGE ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  // Visit statuses
  draft:       'badge-gray',
  in_progress: 'badge-orange',
  completed:   'badge-green',
  signed:      'badge-purple',
  // Ticket statuses
  open:        'badge-yellow',
  assigned:    'badge-blue',
  resolved:    'badge-green',
  closed:      'badge-gray',
  rejected:    'badge-red',
  // Issue resolved
  yes:         'badge-green',
  no:          'badge-red',
  partial:     'badge-orange',
  // Priority
  critical:    'badge-red',
  high:        'badge-orange',
  medium:      'badge-yellow',
  low:         'badge-green',
  // Port status
  active:      'badge-green',
  dead:        'badge-red',
  intermittent:'badge-orange',
  not_patched: 'badge-gray',
  disabled:    'badge-gray',
  reterminate: 'badge-orange',
  // Progress
  pending:     'badge-yellow',
  approved:    'badge-blue',
  pending_parts:'badge-orange',
  recurring:   'badge-purple',
  unresolved:  'badge-red',
}

export function StatusBadge({ status, className }) {
  if (!status) return null
  const label = status.replace(/_/g, ' ')
  return (
    <span className={clsx(STATUS_MAP[status] || 'badge-gray', 'capitalize', className)}>
      {label}
    </span>
  )
}

// ── PRIORITY ICON ─────────────────────────────────────────────────────────────
const PRIORITY_ICON = { critical:'🔴', high:'🟠', medium:'🟡', low:'🟢' }
export function PriorityBadge({ priority }) {
  return (
    <span className="text-sm capitalize">
      {PRIORITY_ICON[priority] || '⚪'} {priority}
    </span>
  )
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, icon: Icon, iconBg = 'bg-blue-600', sub, onClick }) {
  return (
    <div
      onClick={onClick}
      className={clsx('card p-5 flex items-start gap-4', onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
    >
      <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── SPINNER ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size]
  return <Loader2 className={clsx('animate-spin text-blue-600', sz, className)} />
}

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const widths = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden', widths[size])}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── EMPTY STATE ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = InboxIcon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      {message && <p className="text-xs text-gray-400 mb-4 max-w-xs">{message}</p>}
      {action}
    </div>
  )
}

// ── FORM FIELD ────────────────────────────────────────────────────────────────
export function Field({ label, required, error, children }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── CONFIRM DIALOG ────────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger = true }) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SECTION HEADER ────────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ── PAGE WRAPPER ──────────────────────────────────────────────────────────────
export function Page({ children, className }) {
  return <div className={clsx('space-y-6', className)}>{children}</div>
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
export function Table({ headers, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">{children}</tbody>
      </table>
      {empty}
    </div>
  )
}

export function Tr({ children, onClick, className }) {
  return (
    <tr
      onClick={onClick}
      className={clsx('hover:bg-gray-50 transition-colors', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className }) {
  return (
    <td className={clsx('px-4 py-3 text-gray-700', className)}>{children}</td>
  )
}
