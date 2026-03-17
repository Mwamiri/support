import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ticketsApi, clientsApi, usersApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { StatusBadge, PriorityBadge, Table, Tr, Td, EmptyState, SectionHeader, Page, Modal, PageLoader } from '../components/ui/index'
import { Ticket, Plus, Send, Loader2, User, Building2, Calendar, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ══════════════════════════════════════════════════════════════════════════════
// TICKETS LIST
// ══════════════════════════════════════════════════════════════════════════════
export function TicketsPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [status, setStatus]   = useState('')
  const [priority, setPriority] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', status, priority],
    queryFn:  () => ticketsApi.list({ status: status||undefined, priority: priority||undefined, limit: 50 }).then(r => r.data),
  })

  const tickets = data?.data || []

  return (
    <Page>
      <SectionHeader title="Tickets" subtitle="Support tickets from all clients" />

      <div className="flex flex-wrap gap-3">
        <select className="input w-auto bg-white" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['open','assigned','in_progress','resolved','closed'].map(s =>
            <option key={s} value={s} className="capitalize">{s.replace('_',' ')}</option>
          )}
        </select>
        <select className="input w-auto bg-white" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {['critical','high','medium','low'].map(p =>
            <option key={p} value={p} className="capitalize">{p}</option>
          )}
        </select>
      </div>

      <div className="card">
        <Table
          headers={['Ticket #','Title','Client','Priority','Status','Assigned To','Date']}
          empty={!isLoading && !tickets.length && (
            <EmptyState icon={Ticket} title="No tickets" message="No tickets match the current filters" />
          )}
        >
          {tickets.map(t => (
            <Tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
              <Td><span className="font-mono text-xs text-blue-600">{t.ticket_number}</span></Td>
              <Td><span className="font-medium text-gray-800 truncate max-w-[200px] block">{t.title}</span></Td>
              <Td className="text-gray-500">{t.client_name}</Td>
              <Td><PriorityBadge priority={t.priority} /></Td>
              <Td><StatusBadge status={t.status} /></Td>
              <Td className="text-gray-500">{t.assignee_name || <span className="text-gray-300 italic">Unassigned</span>}</Td>
              <Td className="text-gray-400 text-xs">{format(new Date(t.created_at), 'd MMM yyyy')}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </Page>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET DETAIL
// ══════════════════════════════════════════════════════════════════════════════
export function TicketDetailPage({ clientView = false }) {
  const { id }   = useParams()
  const { user } = useAuth()
  const qc       = useQueryClient()
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [updateModal, setUpdateModal] = useState(false)
  const [newStatus, setNewStatus]     = useState('')
  const [resNotes, setResNotes]       = useState('')
  const [updating, setUpdating]       = useState(false)

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn:  () => ticketsApi.get(id).then(r => r.data),
  })

  const { data: technicians } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data.filter(u => u.role === 'technician')),
    enabled:  !clientView && ['super_admin','manager'].includes(user?.role),
  })

  const handleComment = async () => {
    if (!comment.trim()) return
    setSending(true)
    try {
      await ticketsApi.comment(id, { comment })
      toast.success('Comment added')
      setComment('')
      qc.invalidateQueries(['ticket', id])
    } catch { toast.error('Failed to add comment') }
    finally { setSending(false) }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      await ticketsApi.update(id, { status: newStatus || undefined, resolution_notes: resNotes || undefined })
      toast.success('Ticket updated')
      qc.invalidateQueries(['ticket', id])
      setUpdateModal(false)
    } catch { toast.error('Update failed') }
    finally { setUpdating(false) }
  }

  const handleAssign = async (techId) => {
    try {
      await ticketsApi.update(id, { assigned_to: techId, status: 'assigned' })
      toast.success('Ticket assigned')
      qc.invalidateQueries(['ticket', id])
    } catch { toast.error('Failed to assign') }
  }

  if (isLoading) return <PageLoader />
  if (!ticket)   return <div className="text-center py-20 text-gray-400">Ticket not found</div>

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-blue-600">{ticket.ticket_number}</span>
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{ticket.client_name} · {format(new Date(ticket.created_at), 'd MMM yyyy, HH:mm')}</p>
        </div>
        {!clientView && ['super_admin','manager','technician'].includes(user?.role) && (
          <button onClick={() => { setNewStatus(ticket.status); setResNotes(ticket.resolution_notes||''); setUpdateModal(true) }}
            className="btn-secondary text-xs">Update Status</button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Description</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>
          {ticket.resolution_notes && (
            <div className="card p-5 border-green-200 bg-green-50">
              <h3 className="text-sm font-semibold text-green-700 mb-2">Resolution Notes</h3>
              <p className="text-sm text-green-800">{ticket.resolution_notes}</p>
            </div>
          )}

          {/* Comments */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Comments ({ticket.comments?.length || 0})
            </h3>
            <div className="space-y-3 mb-4">
              {ticket.comments?.map(c => (
                <div key={c.id} className={clsx('rounded-xl p-3 text-sm', c.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50')}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800">{c.user_name}</span>
                    <span className="text-xs text-gray-400">{format(new Date(c.created_at), 'd MMM, HH:mm')}</span>
                    {c.is_internal && <span className="badge badge-yellow">Internal</span>}
                  </div>
                  <p className="text-gray-600">{c.comment}</p>
                </div>
              ))}
              {!ticket.comments?.length && <p className="text-sm text-gray-400">No comments yet</p>}
            </div>
            <div className="flex gap-2">
              <textarea className="input flex-1 resize-none" rows={2} value={comment}
                placeholder="Add a comment..."
                onChange={e => setComment(e.target.value)} />
              <button onClick={handleComment} disabled={sending || !comment.trim()} className="btn-primary self-end">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3 text-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h3>
            {[
              ['Submitted by', ticket.submitter_name],
              ['Department',   ticket.dept_name],
              ['Equipment',    ticket.equipment],
              ['Location',     ticket.location],
              ['Assigned to',  ticket.assignee_name || 'Unassigned'],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-medium text-gray-800">{val || '—'}</p>
              </div>
            ))}
          </div>

          {!clientView && ['super_admin','manager'].includes(user?.role) && technicians?.length > 0 && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Assign Technician</h3>
              <select className="input bg-white text-sm" defaultValue={ticket.assigned_to || ''}
                onChange={e => handleAssign(e.target.value)}>
                <option value="">Unassigned</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Update modal */}
      <Modal open={updateModal} onClose={() => setUpdateModal(false)} title="Update Ticket" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Status</label>
            <select className="input bg-white" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              {['open','assigned','in_progress','resolved','closed','rejected'].map(s =>
                <option key={s} value={s} className="capitalize">{s.replace('_',' ')}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Resolution Notes</label>
            <textarea className="input resize-none" rows={3} value={resNotes}
              onChange={e => setResNotes(e.target.value)}
              placeholder="Describe what was done to resolve this ticket..." />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setUpdateModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleUpdate} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 animate-spin" />} Update
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default TicketsPage
