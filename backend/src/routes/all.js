import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize, scopeClient } from '../middleware/auth.js'
import { pluginManager } from '../plugins/engine/PluginManager.js'
import { encrypt, decrypt, mask } from '../middleware/encrypt.js'

// ══════════════════════════════════════════════════════════════════════════════
// ISSUES
// ══════════════════════════════════════════════════════════════════════════════
export const issuesRouter = Router({ mergeParams: true })
issuesRouter.use(authenticate)

issuesRouter.get('/', async (req, res) => {
  try {
    const r = await query(`
      SELECT i.*, d.name as dept_name, et.name as equip_name
      FROM visit_issues i
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN equipment_types et ON et.id = i.equipment_type_id
      WHERE i.site_visit_id = $1
      ORDER BY i.id
    `, [req.params.visitId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

issuesRouter.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      INSERT INTO visit_issues
        (site_visit_id, client_id, department_id, equipment_type_id, sub_area, equipment_custom,
         serial_number, asset_tag, network_point_id, issue_description, root_cause, action_taken,
         status, resolved, resolution_hours, parts_used, parts_cost, further_request,
         priority, followup_date, remarks)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *
    `, [req.params.visitId, v.client_id, v.department_id||null, v.equipment_type_id||null,
        v.sub_area||null, v.equipment_custom||null, v.serial_number||null, v.asset_tag||null,
        v.network_point_id||null, v.issue_description, v.root_cause||null, v.action_taken||null,
        v.status||'in_progress', v.resolved||'no', v.resolution_hours||null, v.parts_used||null,
        v.parts_cost||null, v.further_request||null, v.priority||'medium', v.followup_date||null, v.remarks||null])
    res.status(201).json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

issuesRouter.put('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      UPDATE visit_issues SET
        department_id=$1, equipment_type_id=$2, sub_area=$3, equipment_custom=$4,
        issue_description=$5, root_cause=$6, action_taken=$7, status=$8, resolved=$9,
        resolution_hours=$10, parts_used=$11, parts_cost=$12, further_request=$13,
        priority=$14, followup_date=$15, remarks=$16, updated_at=NOW()
      WHERE id=$17 AND site_visit_id=$18 RETURNING *
    `, [v.department_id||null, v.equipment_type_id||null, v.sub_area||null, v.equipment_custom||null,
        v.issue_description, v.root_cause||null, v.action_taken||null, v.status, v.resolved,
        v.resolution_hours||null, v.parts_used||null, v.parts_cost||null, v.further_request||null,
        v.priority, v.followup_date||null, v.remarks||null, req.params.id, req.params.visitId])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

issuesRouter.delete('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    await query('DELETE FROM visit_issues WHERE id=$1 AND site_visit_id=$2', [req.params.id, req.params.visitId])
    res.json({ message: 'Issue deleted' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// NETWORK POINTS
// ══════════════════════════════════════════════════════════════════════════════
export const networkRouter = Router({ mergeParams: true })
networkRouter.use(authenticate)

networkRouter.get('/', async (req, res) => {
  try {
    const r = await query(`
      SELECT n.*, d.name as dept_name FROM network_points n
      LEFT JOIN departments d ON d.id = n.department_id
      WHERE n.site_visit_id = $1 ORDER BY n.id
    `, [req.params.visitId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Lookup by point_id — used for auto-fill in visit log
networkRouter.get('/lookup/:pointId', async (req, res) => {
  try {
    const r = await query(`
      SELECT n.*, d.name as dept_name FROM network_points n
      LEFT JOIN departments d ON d.id = n.department_id
      WHERE n.point_id = $1 ORDER BY n.created_at DESC LIMIT 1
    `, [req.params.pointId])
    if (!r.rows.length) return res.status(404).json({ message: 'Point not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

networkRouter.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      INSERT INTO network_points
        (site_visit_id, client_id, site_id, point_id, office_room, department_id, device_type,
         connected_to, switch_port, port_status, speed_mbps, device_connected, issue, remarks, accompanied_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [req.params.visitId, v.client_id, v.site_id||null, v.point_id, v.office_room||null,
        v.department_id||null, v.device_type||null, v.connected_to||null, v.switch_port||null,
        v.port_status||'active', v.speed_mbps||null, v.device_connected||null, v.issue||null,
        v.remarks||null, v.accompanied_by||null])
    res.status(201).json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

networkRouter.put('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      UPDATE network_points SET
        point_id=$1, office_room=$2, department_id=$3, device_type=$4, connected_to=$5,
        switch_port=$6, port_status=$7, speed_mbps=$8, device_connected=$9, issue=$10,
        remarks=$11, accompanied_by=$12, updated_at=NOW()
      WHERE id=$13 AND site_visit_id=$14 RETURNING *
    `, [v.point_id, v.office_room||null, v.department_id||null, v.device_type||null,
        v.connected_to||null, v.switch_port||null, v.port_status, v.speed_mbps||null,
        v.device_connected||null, v.issue||null, v.remarks||null, v.accompanied_by||null,
        req.params.id, req.params.visitId])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

networkRouter.delete('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    await query('DELETE FROM network_points WHERE id=$1 AND site_visit_id=$2', [req.params.id, req.params.visitId])
    res.json({ message: 'Network point deleted' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// CREDENTIALS
// ══════════════════════════════════════════════════════════════════════════════
export const credentialsRouter = Router()
credentialsRouter.use(authenticate, scopeClient)

credentialsRouter.get('/', async (req, res) => {
  try {
    let where = ['deleted_at IS NULL']; const params = []
    if (req.clientScope) { params.push(req.clientScope); where.push(`client_id=$${params.length}`) }
    if (req.query.category) { params.push(req.query.category); where.push(`device_category=$${params.length}`) }
    const r = await query(`SELECT * FROM device_credentials WHERE ${where.join(' AND ')} ORDER BY device_category, device_label`, params)
    const isSA = req.user.role === 'super_admin'
    res.json(r.rows.map(c => formatCred(c, isSA, false)))
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

credentialsRouter.get('/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM device_credentials WHERE id=$1 AND deleted_at IS NULL', [req.params.id])
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' })
    const isSA = req.user.role === 'super_admin'
    res.json(formatCred(r.rows[0], isSA, isSA))
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

credentialsRouter.post('/', authorize('super_admin'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      INSERT INTO device_credentials
        (client_id, site_id, department_id, device_category, device_label, make_model, ip_address,
         mac_address, location, ssid, wifi_band, security_type, vlan, channels, active_cameras,
         remote_view_app, hdd_size, retention_days, hostname, os_version, domain_workgroup,
         remote_desktop, username_enc, password_enc, secondary_username_enc, secondary_password_enc,
         firmware_version, credentials_last_changed, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING *
    `, [v.client_id, v.site_id||null, v.department_id||null, v.device_category, v.device_label,
        v.make_model||null, v.ip_address||null, v.mac_address||null, v.location||null,
        v.ssid||null, v.wifi_band||null, v.security_type||null, v.vlan||null,
        v.channels||null, v.active_cameras||null, v.remote_view_app||null,
        v.hdd_size||null, v.retention_days||null, v.hostname||null, v.os_version||null,
        v.domain_workgroup||null, v.remote_desktop||false,
        encrypt(v.username), encrypt(v.password_masked),
        encrypt(v.secondary_username), encrypt(v.secondary_password_masked),
        v.firmware_version||null, v.credentials_last_changed||null, v.notes||null])
    res.status(201).json(formatCred(r.rows[0], true, true))
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

credentialsRouter.put('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const v = req.body
    const r = await query(`
      UPDATE device_credentials SET
        device_label=$1, make_model=$2, ip_address=$3, mac_address=$4, location=$5,
        ssid=$6, wifi_band=$7, security_type=$8, vlan=$9, hostname=$10, os_version=$11,
        username_enc=$12, password_enc=$13, secondary_username_enc=$14, secondary_password_enc=$15,
        firmware_version=$16, credentials_last_changed=$17, notes=$18, updated_at=NOW()
      WHERE id=$19 RETURNING *
    `, [v.device_label, v.make_model||null, v.ip_address||null, v.mac_address||null, v.location||null,
        v.ssid||null, v.wifi_band||null, v.security_type||null, v.vlan||null,
        v.hostname||null, v.os_version||null,
        v.username ? encrypt(v.username) : undefined,
        v.password_masked ? encrypt(v.password_masked) : undefined,
        v.secondary_username ? encrypt(v.secondary_username) : undefined,
        v.secondary_password_masked ? encrypt(v.secondary_password_masked) : undefined,
        v.firmware_version||null, v.credentials_last_changed||null, v.notes||null, req.params.id])
    res.json(formatCred(r.rows[0], true, true))
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

credentialsRouter.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    await query('UPDATE device_credentials SET deleted_at=NOW() WHERE id=$1', [req.params.id])
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

function formatCred(c, isSA, reveal) {
  const out = { ...c }
  const fields = { username_enc:'username', password_enc:'password', secondary_username_enc:'secondary_username', secondary_password_enc:'secondary_password' }
  for (const [enc, plain] of Object.entries(fields)) {
    const decrypted = decrypt(c[enc])
    out[plain] = reveal && isSA ? decrypted : mask(decrypted)
    delete out[enc]
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKETS
// ══════════════════════════════════════════════════════════════════════════════
export const ticketsRouter = Router()
ticketsRouter.use(authenticate, scopeClient)

const genTicket = async () => {
  const yr = new Date().getFullYear()
  const r  = await query(`SELECT COUNT(*) FROM tickets WHERE EXTRACT(YEAR FROM created_at)=$1`, [yr])
  return `TKT-${yr}-${String(parseInt(r.rows[0].count)+1).padStart(4,'0')}`
}

ticketsRouter.get('/', async (req, res) => {
  try {
    const { status, priority, page=1, limit=20 } = req.query
    const offset = (page-1)*limit
    let where = ['t.deleted_at IS NULL']; const params = []
    if (req.clientScope) { params.push(req.clientScope); where.push(`t.client_id=$${params.length}`) }
    if (status)   { params.push(status);   where.push(`t.status=$${params.length}`) }
    if (priority) { params.push(priority); where.push(`t.priority=$${params.length}`) }
    const ws = 'WHERE ' + where.join(' AND ')
    const count = await query(`SELECT COUNT(*) FROM tickets t ${ws}`, params)
    params.push(limit, offset)
    const data  = await query(`
      SELECT t.*, c.name as client_name, u.name as submitter_name, a.name as assignee_name,
             d.name as dept_name
      FROM tickets t
      LEFT JOIN clients c ON c.id=t.client_id
      LEFT JOIN users u ON u.id=t.submitted_by
      LEFT JOIN users a ON a.id=t.assigned_to
      LEFT JOIN departments d ON d.id=t.department_id
      ${ws} ORDER BY t.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params)
    res.json({ data: data.rows, total: parseInt(count.rows[0].count), page: parseInt(page) })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

ticketsRouter.post('/', async (req, res) => {
  try {
    const v = req.body
    const clientId = req.user.role === 'client' ? req.user.client_id : v.client_id
    const num = await genTicket()
    const r = await query(`
      INSERT INTO tickets (client_id, site_id, department_id, submitted_by, ticket_number, title, description, equipment, location, priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [clientId, v.site_id||null, v.department_id||null, req.user.id, num, v.title, v.description, v.equipment||null, v.location||null, v.priority||'medium'])
    const ticket = r.rows[0]
    // Load submitter + client for notification hooks
    const [submitterRes, clientRes] = await Promise.all([
      query('SELECT id, name, email, phone FROM users WHERE id=$1', [req.user.id]),
      query('SELECT * FROM clients WHERE id=$1', [clientId]),
    ])
    await pluginManager.hooks.doAction('ticket.created', {
      ticket, submitter: submitterRes.rows[0], client: clientRes.rows[0]
    })
    // Fire critical alert if needed
    if (ticket.priority === 'critical') {
      await pluginManager.hooks.doAction('issue.critical', { issue: ticket, client: clientRes.rows[0] })
    }
    res.status(201).json(ticket)
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

ticketsRouter.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, c.name as client_name, u.name as submitter_name, a.name as assignee_name
      FROM tickets t
      LEFT JOIN clients c ON c.id=t.client_id
      LEFT JOIN users u ON u.id=t.submitted_by
      LEFT JOIN users a ON a.id=t.assigned_to
      WHERE t.id=$1 AND t.deleted_at IS NULL
    `, [req.params.id])
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' })
    const ticket = r.rows[0]
    if (req.user.role==='client' && ticket.client_id !== req.user.client_id)
      return res.status(403).json({ message: 'Access denied' })

    const commentQ = req.user.role === 'client'
      ? `SELECT tc.*, u.name as user_name FROM ticket_comments tc LEFT JOIN users u ON u.id=tc.user_id WHERE tc.ticket_id=$1 AND tc.is_internal=false ORDER BY tc.created_at`
      : `SELECT tc.*, u.name as user_name FROM ticket_comments tc LEFT JOIN users u ON u.id=tc.user_id WHERE tc.ticket_id=$1 ORDER BY tc.created_at`
    const comments = await query(commentQ, [req.params.id])
    res.json({ ...ticket, comments: comments.rows })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

ticketsRouter.put('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const v = req.body
    const extra = v.status === 'resolved' ? { resolved_by: req.user.id, resolved_at: new Date() } : {}
    const prevRow = await query('SELECT assigned_to FROM tickets WHERE id=$1', [req.params.id])
    const r = await query(`
      UPDATE tickets SET status=COALESCE($1,status), priority=COALESCE($2,priority),
        assigned_to=COALESCE($3,assigned_to), resolution_notes=COALESCE($4,resolution_notes),
        resolved_by=COALESCE($5,resolved_by), resolved_at=COALESCE($6,resolved_at), updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [v.status||null, v.priority||null, v.assigned_to||null, v.resolution_notes||null,
        extra.resolved_by||null, extra.resolved_at||null, req.params.id])
    const updated = r.rows[0]
    // Fire resolved hook
    if (v.status === 'resolved') {
      const [submitterRes, clientRes] = await Promise.all([
        query('SELECT id, name, email, phone FROM users WHERE id=$1', [updated.submitted_by]),
        query('SELECT * FROM clients WHERE id=$1', [updated.client_id]),
      ])
      await pluginManager.hooks.doAction('ticket.resolved', {
        ticket: updated, submitter: submitterRes.rows[0], client: clientRes.rows[0]
      })
    }
    // Fire assigned hook if technician changed
    if (v.assigned_to && v.assigned_to !== prevRow.rows[0]?.assigned_to) {
      const techRes = await query('SELECT id, name, email, phone FROM users WHERE id=$1', [v.assigned_to])
      const clientRes = await query('SELECT name FROM clients WHERE id=$1', [updated.client_id])
      await pluginManager.hooks.doAction('ticket.assigned', {
        ticket: { ...updated, client_name: clientRes.rows[0]?.name },
        technician: techRes.rows[0]
      })
    }
    res.json(updated)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

ticketsRouter.post('/:id/comments', async (req, res) => {
  try {
    const { comment, is_internal=false } = req.body
    // clients can't post internal comments
    const internal = req.user.role === 'client' ? false : is_internal
    const r = await query(`
      INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.params.id, req.user.id, comment, internal])
    res.status(201).json(r.rows[0])
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════════════
export const reportsRouter = Router()
reportsRouter.use(authenticate, authorize('super_admin','manager','technician','client'))

reportsRouter.get('/summary', scopeClient, async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const to   = date_to   || new Date().toISOString().split('T')[0]
    let clientFilter = ''; const base = [from, to]
    if (req.clientScope) { base.push(req.clientScope); clientFilter = `AND client_id=$${base.length}` }

    const [kpis, byDept, byEquip, recentVisits] = await Promise.all([
      query(`SELECT
        COUNT(*) FILTER (WHERE true) as total_issues,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COALESCE(SUM(parts_cost),0) as total_parts_cost,
        ROUND(AVG(resolution_hours)::numeric,1) as avg_resolution_hrs
        FROM visit_issues WHERE created_at BETWEEN $1 AND $2 ${clientFilter}`, base),
      query(`SELECT d.name as department, COUNT(*) as total,
        SUM(CASE WHEN i.resolved='yes' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN i.resolved='no' THEN 1 ELSE 0 END) as unresolved,
        SUM(CASE WHEN i.priority='critical' THEN 1 ELSE 0 END) as critical,
        COALESCE(SUM(i.parts_cost),0) as parts_cost
        FROM visit_issues i LEFT JOIN departments d ON d.id=i.department_id
        WHERE i.created_at BETWEEN $1 AND $2 ${clientFilter}
        GROUP BY d.id, d.name ORDER BY total DESC`, base),
      query(`SELECT et.name as equipment, COUNT(*) as count
        FROM visit_issues i LEFT JOIN equipment_types et ON et.id=i.equipment_type_id
        WHERE i.created_at BETWEEN $1 AND $2 ${clientFilter}
        GROUP BY et.id, et.name ORDER BY count DESC LIMIT 8`, base),
      query(`SELECT v.visit_reference, v.visit_date, v.status, c.name as client, u.name as technician
        FROM site_visits v LEFT JOIN clients c ON c.id=v.client_id LEFT JOIN users u ON u.id=v.lead_technician_id
        WHERE v.visit_date BETWEEN $1 AND $2 ${clientFilter} AND v.deleted_at IS NULL
        ORDER BY v.visit_date DESC LIMIT 10`, base),
    ])

    res.json({
      period: { from, to },
      kpis: kpis.rows[0],
      by_department: byDept.rows,
      by_equipment:  byEquip.rows,
      recent_visits: recentVisits.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// CLIENTS + DEPARTMENTS + USERS + EQUIPMENT REGISTER routes
export const clientsRouter = Router()
clientsRouter.use(authenticate, authorize('super_admin','manager'))
clientsRouter.get('/', async (_req, res) => {
  const r = await query(`SELECT c.*, (SELECT COUNT(*) FROM users WHERE client_id=c.id) as user_count FROM clients c WHERE c.deleted_at IS NULL ORDER BY c.name`)
  res.json(r.rows)
})
clientsRouter.get('/:id', async (req, res) => {
  const r = await query('SELECT * FROM clients WHERE id=$1 AND deleted_at IS NULL', [req.params.id])
  if (!r.rows.length) return res.status(404).json({ message: 'Not found' })
  res.json(r.rows[0])
})
clientsRouter.post('/', authorize('super_admin'), async (req, res) => {
  const { name, contact_person, contact_email, contact_phone, address, contract_number } = req.body
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
  const r = await query(`INSERT INTO clients (name,slug,contact_person,contact_email,contact_phone,address,contract_number) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, slug, contact_person||null, contact_email||null, contact_phone||null, address||null, contract_number||null])
  res.status(201).json(r.rows[0])
})
clientsRouter.put('/:id', authorize('super_admin'), async (req, res) => {
  const { name, contact_person, contact_email, contact_phone, address, status } = req.body
  const r = await query(`UPDATE clients SET name=$1,contact_person=$2,contact_email=$3,contact_phone=$4,address=$5,status=COALESCE($6,status),updated_at=NOW() WHERE id=$7 RETURNING *`,
    [name, contact_person||null, contact_email||null, contact_phone||null, address||null, status||null, req.params.id])
  res.json(r.rows[0])
})

export const deptsRouter = Router({ mergeParams: true })
deptsRouter.use(authenticate)
deptsRouter.get('/', async (req, res) => {
  const r = await query('SELECT * FROM departments WHERE client_id=$1 AND is_active=true ORDER BY name', [req.params.clientId])
  res.json(r.rows)
})
deptsRouter.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  const { name, color } = req.body
  const r = await query(`INSERT INTO departments (client_id,name,color) VALUES ($1,$2,$3) ON CONFLICT (client_id,name) DO UPDATE SET is_active=true RETURNING *`,
    [req.params.clientId, name, color||'#2E75B6'])
  res.status(201).json(r.rows[0])
})
deptsRouter.put('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  const { name, color, is_active } = req.body
  const r = await query('UPDATE departments SET name=$1,color=$2,is_active=COALESCE($3,is_active) WHERE id=$4 RETURNING *',
    [name, color||'#2E75B6', is_active??null, req.params.id])
  res.json(r.rows[0])
})
deptsRouter.delete('/:id', authorize('super_admin','manager'), async (req, res) => {
  await query('UPDATE departments SET is_active=false WHERE id=$1', [req.params.id])
  res.json({ message: 'Department deactivated' })
})

export const usersRouter = Router()
usersRouter.use(authenticate, authorize('super_admin'))
usersRouter.get('/', async (_req, res) => {
  const r = await query(`SELECT u.id,u.name,u.email,u.role,u.designation,u.employee_number,u.is_active,u.last_login_at,u.client_id,c.name as client_name FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.deleted_at IS NULL ORDER BY u.name`)
  res.json(r.rows)
})
usersRouter.post('/', async (req, res) => {
  const { name, email, password, role, client_id, designation, employee_number } = req.body
  const hash = await (await import('bcryptjs')).default.hash(password||'password', 10)
  const r = await query(`INSERT INTO users (name,email,password,role,client_id,designation,employee_number) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,email,role,client_id,designation,is_active`,
    [name, email, hash, role||'client', client_id||null, designation||null, employee_number||null])
  res.status(201).json(r.rows[0])
})
usersRouter.put('/:id', async (req, res) => {
  const { name, email, role, designation, is_active } = req.body
  const r = await query('UPDATE users SET name=$1,email=$2,role=$3,designation=$4,is_active=COALESCE($5,is_active),updated_at=NOW() WHERE id=$6 RETURNING id,name,email,role,designation,is_active',
    [name, email, role, designation||null, is_active??null, req.params.id])
  res.json(r.rows[0])
})

export const equipRegRouter = Router()
equipRegRouter.use(authenticate, scopeClient)
equipRegRouter.get('/', async (req, res) => {
  let where = ['deleted_at IS NULL']; const p = []
  if (req.clientScope) { p.push(req.clientScope); where.push(`client_id=$${p.length}`) }
  const r = await query(`SELECT er.*, d.name as dept_name, et.name as equip_type FROM equipment_register er LEFT JOIN departments d ON d.id=er.department_id LEFT JOIN equipment_types et ON et.id=er.equipment_type_id WHERE ${where.join(' AND ')} ORDER BY er.id`, p)
  res.json(r.rows)
})
equipRegRouter.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  const v = req.body
  const r = await query(`INSERT INTO equipment_register (client_id,site_id,department_id,equipment_type_id,custom_item,location_room,make_model,serial_number,asset_tag,condition,purchase_date,warranty_expiry,assigned_to,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [v.client_id, v.site_id||null, v.department_id||null, v.equipment_type_id||null, v.custom_item||null, v.location_room||null, v.make_model||null, v.serial_number||null, v.asset_tag||null, v.condition||'good', v.purchase_date||null, v.warranty_expiry||null, v.assigned_to||null, v.notes||null])
  res.status(201).json(r.rows[0])
})

export const equipTypesRouter = Router()
equipTypesRouter.use(authenticate)
equipTypesRouter.get('/', async (req, res) => {
  const r = await query('SELECT * FROM equipment_types WHERE (client_id IS NULL OR client_id=$1) AND is_active=true ORDER BY name', [req.query.client_id||null])
  res.json(r.rows)
})
equipTypesRouter.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  const { name, category, client_id } = req.body
  const r = await query('INSERT INTO equipment_types (name,category,client_id) VALUES ($1,$2,$3) RETURNING *', [name, category||'other', client_id||null])
  res.status(201).json(r.rows[0])
})
