import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize, scopeClient } from '../middleware/auth.js'

const router = Router()
router.use(authenticate, scopeClient)

// ── HELPERS ───────────────────────────────────────────────────────────────────
const buildDateFilter = (from, to, alias = '') => {
  const col = alias ? `${alias}.created_at` : 'created_at'
  const f = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const t = to   || new Date().toISOString().split('T')[0]
  return { from: f, to: t, col }
}

const clientWhere = (clientScope, params, alias = '') => {
  if (!clientScope) return ''
  const col = alias ? `${alias}.client_id` : 'client_id'
  params.push(clientScope)
  return `AND ${col} = $${params.length}`
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/summary
// Master summary — KPIs, by dept, by equipment, recent visits
// ══════════════════════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const cw = clientWhere(req.clientScope, params, 'i')

    const [kpis, byDept, byEquip, byPriority, recentVisits, topIssues] = await Promise.all([
      // KPIs
      query(`SELECT
        COUNT(*) as total_issues,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE resolved='partial') as partial,
        COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status='pending_parts') as pending_parts,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COUNT(*) FILTER (WHERE priority='high') as high,
        COALESCE(SUM(parts_cost),0) as total_parts_cost,
        ROUND(AVG(resolution_hours)::numeric,1) as avg_resolution_hrs,
        ROUND(
          (COUNT(*) FILTER (WHERE resolved='yes')::numeric /
          NULLIF(COUNT(*),0) * 100), 1
        ) as resolution_rate
        FROM visit_issues i
        WHERE i.created_at BETWEEN $1 AND $2 ${cw.replace('i.', '')}`,
        params.slice(0, cw ? params.length : 2)),

      // By department
      query(`SELECT
        COALESCE(d.name,'Unknown') as department, d.color,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE i.resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE i.resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE i.priority='critical') as critical,
        COUNT(*) FILTER (WHERE i.priority='high') as high,
        COALESCE(SUM(i.parts_cost),0) as parts_cost,
        ROUND(AVG(i.resolution_hours)::numeric,1) as avg_hours,
        COUNT(*) FILTER (WHERE i.further_request IS NOT NULL AND i.further_request != '') as further_requests
        FROM visit_issues i
        LEFT JOIN departments d ON d.id = i.department_id
        WHERE i.created_at BETWEEN $1 AND $2 ${clientWhere(req.clientScope, [...params])}
        GROUP BY d.id, d.name, d.color ORDER BY total DESC`,
        params),

      // By equipment
      query(`SELECT
        COALESCE(et.name, i.equipment_custom, 'Unknown') as equipment,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE i.resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE i.priority='critical') as critical
        FROM visit_issues i
        LEFT JOIN equipment_types et ON et.id = i.equipment_type_id
        WHERE i.created_at BETWEEN $1 AND $2 ${clientWhere(req.clientScope, [...params])}
        GROUP BY et.id, et.name, i.equipment_custom ORDER BY total DESC LIMIT 10`,
        params),

      // By priority breakdown
      query(`SELECT priority, COUNT(*) as count
        FROM visit_issues i
        WHERE i.created_at BETWEEN $1 AND $2 ${clientWhere(req.clientScope, [...params])}
        GROUP BY priority ORDER BY count DESC`,
        params),

      // Recent visits
      query(`SELECT v.visit_reference, v.visit_date, v.status,
        c.name as client, s.name as site, u.name as technician,
        (SELECT COUNT(*) FROM visit_issues WHERE site_visit_id = v.id) as issue_count,
        (SELECT COUNT(*) FROM visit_issues WHERE site_visit_id = v.id AND resolved='yes') as resolved_count
        FROM site_visits v
        LEFT JOIN clients c ON c.id = v.client_id
        LEFT JOIN sites   s ON s.id = v.site_id
        LEFT JOIN users   u ON u.id = v.lead_technician_id
        WHERE v.visit_date BETWEEN $1 AND $2
        ${req.clientScope ? `AND v.client_id = $3` : ''}
        AND v.deleted_at IS NULL
        ORDER BY v.visit_date DESC LIMIT 10`,
        req.clientScope ? [from, to, req.clientScope] : [from, to]),

      // Top recurring issues
      query(`SELECT issue_description, COUNT(*) as occurrences,
        COALESCE(d.name,'Unknown') as department
        FROM visit_issues i LEFT JOIN departments d ON d.id = i.department_id
        WHERE i.created_at BETWEEN $1 AND $2 ${clientWhere(req.clientScope, [...params])}
        GROUP BY i.issue_description, d.name
        HAVING COUNT(*) > 1 ORDER BY occurrences DESC LIMIT 8`,
        params),
    ])

    res.json({
      meta: { from, to, generated_at: new Date().toISOString() },
      kpis: kpis.rows[0],
      by_department: byDept.rows,
      by_equipment:  byEquip.rows,
      by_priority:   byPriority.rows,
      recent_visits: recentVisits.rows,
      top_recurring: topIssues.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/weekly?year=2025&week=12
// ══════════════════════════════════════════════════════════════════════════════
router.get('/weekly', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear()
    const week = parseInt(req.query.week) || getISOWeek(new Date())

    // Calculate week start/end
    const jan4  = new Date(year, 0, 4)
    const startOfYear = new Date(jan4)
    startOfYear.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
    const weekStart = new Date(startOfYear)
    weekStart.setDate(startOfYear.getDate() + (week - 1) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    const from = weekStart.toISOString().split('T')[0]
    const to   = weekEnd.toISOString().split('T')[0]

    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND client_id = $${params.length}`) : ''

    // Get daily breakdown (Mon-Sun)
    const [kpis, daily, byDept, tickets] = await Promise.all([
      query(`SELECT
        COUNT(*) as total_issues,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COALESCE(SUM(parts_cost),0) as total_parts_cost,
        ROUND(AVG(resolution_hours)::numeric,1) as avg_hours,
        ROUND((COUNT(*) FILTER (WHERE resolved='yes')::numeric / NULLIF(COUNT(*),0)*100),1) as resolution_rate
        FROM visit_issues WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'Dy') as day_name,
        DATE_TRUNC('day', created_at)::date as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved
        FROM visit_issues WHERE created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY DATE_TRUNC('day', created_at) ORDER BY date`, params),

      query(`SELECT COALESCE(d.name,'Unknown') as department,
        COUNT(*) as total, COUNT(*) FILTER (WHERE i.resolved='yes') as resolved
        FROM visit_issues i LEFT JOIN departments d ON d.id=i.department_id
        WHERE i.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY d.name ORDER BY total DESC`, params),

      query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='open') as open,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as closed,
        COUNT(*) FILTER (WHERE priority='critical') as critical
        FROM tickets WHERE created_at BETWEEN $1 AND $2 ${cw.replace('client_id','client_id')}`, params),
    ])

    // Fill in missing days of week
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const dailyMap = {}
    daily.rows.forEach(d => { dailyMap[d.day_name] = d })
    const dailyFull = days.map(d => dailyMap[d] || { day_name:d, total:0, resolved:0 })

    res.json({
      meta:          { type:'weekly', year, week, from, to, generated_at: new Date().toISOString() },
      kpis:          kpis.rows[0],
      daily:         dailyFull,
      by_department: byDept.rows,
      tickets:       tickets.rows[0],
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/monthly?year=2025&month=3
// ══════════════════════════════════════════════════════════════════════════════
router.get('/monthly', async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear()
    const month = parseInt(req.query.month) || new Date().getMonth() + 1

    const from = `${year}-${String(month).padStart(2,'0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`

    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND client_id = $${params.length}`) : ''

    const [kpis, weekly, byDept, byEquip, tickets, furtherReqs, visits] = await Promise.all([
      query(`SELECT
        COUNT(*) as total_issues,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COUNT(*) FILTER (WHERE priority='high') as high,
        COALESCE(SUM(parts_cost),0) as total_parts_cost,
        ROUND(AVG(resolution_hours)::numeric,1) as avg_hours,
        ROUND((COUNT(*) FILTER (WHERE resolved='yes')::numeric / NULLIF(COUNT(*),0)*100),1) as resolution_rate,
        COUNT(DISTINCT site_visit_id) as visits_with_issues
        FROM visit_issues WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      // Weekly grouping within month
      query(`SELECT
        EXTRACT(WEEK FROM created_at) as week_num,
        MIN(DATE_TRUNC('week', created_at)::date) as week_start,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved='yes') as resolved
        FROM visit_issues WHERE created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY EXTRACT(WEEK FROM created_at) ORDER BY week_num`, params),

      query(`SELECT COALESCE(d.name,'Unknown') as department, d.color,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE i.resolved='yes') as resolved,
        COUNT(*) FILTER (WHERE i.resolved='no') as unresolved,
        COUNT(*) FILTER (WHERE i.priority='critical') as critical,
        COALESCE(SUM(i.parts_cost),0) as parts_cost,
        ROUND(AVG(i.resolution_hours)::numeric,1) as avg_hours,
        COUNT(*) FILTER (WHERE i.further_request IS NOT NULL AND i.further_request!='') as further_requests
        FROM visit_issues i LEFT JOIN departments d ON d.id=i.department_id
        WHERE i.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY d.id, d.name, d.color ORDER BY total DESC`, params),

      query(`SELECT COALESCE(et.name, i.equipment_custom,'Unknown') as equipment,
        COUNT(*) as total, COALESCE(SUM(i.parts_cost),0) as parts_cost
        FROM visit_issues i LEFT JOIN equipment_types et ON et.id=i.equipment_type_id
        WHERE i.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY et.id, et.name, i.equipment_custom ORDER BY total DESC LIMIT 10`, params),

      query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='open') as open,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as closed,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)::numeric,1) as avg_resolution_hrs
        FROM tickets WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE progress='pending') as pending,
        COUNT(*) FILTER (WHERE progress='approved') as approved,
        COUNT(*) FILTER (WHERE progress='completed') as completed,
        COALESCE(SUM(estimated_cost),0) as total_estimated_cost
        FROM further_requests WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='signed') as signed,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='draft') as draft
        FROM site_visits WHERE visit_date BETWEEN $1 AND $2
        ${req.clientScope ? `AND client_id = $3` : ''} AND deleted_at IS NULL`,
        req.clientScope ? [from, to, req.clientScope] : [from, to]),
    ])

    res.json({
      meta:           { type:'monthly', year, month, from, to, generated_at: new Date().toISOString() },
      kpis:           kpis.rows[0],
      weekly_trend:   weekly.rows,
      by_department:  byDept.rows,
      by_equipment:   byEquip.rows,
      tickets:        tickets.rows[0],
      further_requests: furtherReqs.rows[0],
      visits:         visits.rows[0],
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/technician?technician_id=3&date_from=&date_to=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/technician', authorize('super_admin','manager'), async (req, res) => {
  try {
    const { technician_id, date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)

    // All technicians or specific one
    const techFilter = technician_id ? `AND v.lead_technician_id = ${parseInt(technician_id)}` : ''

    const [techs, breakdown] = await Promise.all([
      query(`SELECT
        u.id, u.name, u.designation, u.email,
        COUNT(DISTINCT v.id) as total_visits,
        COUNT(i.id) as total_issues,
        COUNT(i.id) FILTER (WHERE i.resolved='yes') as resolved,
        COUNT(i.id) FILTER (WHERE i.priority='critical') as critical,
        COALESCE(SUM(i.parts_cost),0) as total_parts_cost,
        ROUND(AVG(i.resolution_hours)::numeric,1) as avg_resolution_hrs,
        ROUND((COUNT(i.id) FILTER (WHERE i.resolved='yes')::numeric / NULLIF(COUNT(i.id),0)*100),1) as resolution_rate,
        MIN(v.visit_date) as first_visit, MAX(v.visit_date) as last_visit
        FROM users u
        LEFT JOIN site_visits v ON v.lead_technician_id = u.id
          AND v.visit_date BETWEEN $1 AND $2 AND v.deleted_at IS NULL
        LEFT JOIN visit_issues i ON i.site_visit_id = v.id
        WHERE u.role = 'technician' AND u.is_active = true ${techFilter}
        GROUP BY u.id, u.name, u.designation, u.email
        ORDER BY total_visits DESC`, [from, to]),

      // Per technician per department
      technician_id ? query(`SELECT
        COALESCE(d.name,'Unknown') as department,
        COUNT(*) as total, COUNT(*) FILTER (WHERE i.resolved='yes') as resolved
        FROM visit_issues i
        JOIN site_visits v ON v.id = i.site_visit_id
        LEFT JOIN departments d ON d.id = i.department_id
        WHERE v.visit_date BETWEEN $1 AND $2
          AND v.lead_technician_id = $3 AND v.deleted_at IS NULL
        GROUP BY d.name ORDER BY total DESC`, [from, to, parseInt(technician_id)])
      : Promise.resolve({ rows: [] }),
    ])

    res.json({
      meta:       { type:'technician', from, to, generated_at: new Date().toISOString() },
      technicians: techs.rows,
      by_department: breakdown.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/department?department_id=5&date_from=&date_to=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/department', async (req, res) => {
  try {
    const { department_id, date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const deptFilter = department_id ? (params.push(parseInt(department_id)), `AND i.department_id = $${params.length}`) : ''
    const cw = req.clientScope ? (params.push(req.clientScope), `AND i.client_id = $${params.length}`) : ''

    const [issues, trend, equipment, furtherReqs] = await Promise.all([
      query(`SELECT i.*,
        d.name as dept_name, et.name as equip_name, u.name as technician,
        v.visit_reference, v.visit_date
        FROM visit_issues i
        LEFT JOIN departments d ON d.id = i.department_id
        LEFT JOIN equipment_types et ON et.id = i.equipment_type_id
        LEFT JOIN site_visits v ON v.id = i.site_visit_id
        LEFT JOIN users u ON u.id = v.lead_technician_id
        WHERE i.created_at BETWEEN $1 AND $2 ${deptFilter} ${cw}
        ORDER BY i.created_at DESC LIMIT 100`, params),

      query(`SELECT DATE_TRUNC('week', created_at)::date as week,
        COUNT(*) as total, COUNT(*) FILTER (WHERE resolved='yes') as resolved
        FROM visit_issues i WHERE i.created_at BETWEEN $1 AND $2 ${deptFilter} ${cw}
        GROUP BY DATE_TRUNC('week', created_at) ORDER BY week`, params),

      query(`SELECT COALESCE(et.name, i.equipment_custom,'Unknown') as equipment,
        COUNT(*) as total, COUNT(*) FILTER (WHERE i.resolved='yes') as resolved
        FROM visit_issues i LEFT JOIN equipment_types et ON et.id=i.equipment_type_id
        WHERE i.created_at BETWEEN $1 AND $2 ${deptFilter} ${cw}
        GROUP BY et.id, et.name, i.equipment_custom ORDER BY total DESC`, params),

      query(`SELECT description, item_required, estimated_cost, progress, priority, created_at
        FROM further_requests WHERE created_at BETWEEN $1 AND $2
        ${department_id ? `AND department_id = $${params.indexOf(parseInt(department_id))+1}` : ''}
        ${req.clientScope ? `AND client_id = $${params.length}` : ''}
        ORDER BY created_at DESC`, params),
    ])

    const kpis = {
      total:           issues.rows.length,
      resolved:        issues.rows.filter(i=>i.resolved==='yes').length,
      unresolved:      issues.rows.filter(i=>i.resolved==='no').length,
      critical:        issues.rows.filter(i=>i.priority==='critical').length,
      total_parts_cost:issues.rows.reduce((s,i)=>s+parseFloat(i.parts_cost||0),0),
    }

    res.json({
      meta:            { type:'department', from, to, department_id, generated_at: new Date().toISOString() },
      kpis,
      issues:          issues.rows,
      trend:           trend.rows,
      by_equipment:    equipment.rows,
      further_requests:furtherReqs.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/network?date_from=&date_to=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/network', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND n.client_id = $${params.length}`) : ''

    const [summary, byStatus, byDept, points] = await Promise.all([
      query(`SELECT
        COUNT(*) as total_points,
        COUNT(*) FILTER (WHERE port_status='active') as active,
        COUNT(*) FILTER (WHERE port_status='dead') as dead,
        COUNT(*) FILTER (WHERE port_status='intermittent') as intermittent,
        COUNT(*) FILTER (WHERE port_status='not_patched') as not_patched,
        COUNT(*) FILTER (WHERE port_status='disabled') as disabled,
        COUNT(*) FILTER (WHERE port_status='reterminate') as reterminate,
        COUNT(*) FILTER (WHERE issue IS NOT NULL AND issue != '') as with_issues
        FROM network_points n WHERE n.created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT port_status, COUNT(*) as count
        FROM network_points n WHERE n.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY port_status ORDER BY count DESC`, params),

      query(`SELECT COALESCE(d.name,'Unknown') as department,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE n.port_status='active') as active,
        COUNT(*) FILTER (WHERE n.port_status!='active') as issues
        FROM network_points n LEFT JOIN departments d ON d.id=n.department_id
        WHERE n.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY d.name ORDER BY total DESC`, params),

      query(`SELECT n.point_id, n.office_room, n.device_type, n.port_status,
        n.connected_to, n.speed_mbps, n.issue, d.name as dept_name,
        v.visit_date, v.visit_reference
        FROM network_points n
        LEFT JOIN departments d ON d.id=n.department_id
        LEFT JOIN site_visits v ON v.id=n.site_visit_id
        WHERE n.created_at BETWEEN $1 AND $2 ${cw}
        ORDER BY n.port_status, n.point_id`, params),
    ])

    res.json({
      meta:       { type:'network', from, to, generated_at: new Date().toISOString() },
      summary:    summary.rows[0],
      by_status:  byStatus.rows,
      by_department: byDept.rows,
      points:     points.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/tickets?date_from=&date_to=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/tickets', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND client_id = $${params.length}`) : ''

    const [kpis, byStatus, byPriority, byDept, list] = await Promise.all([
      query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='open') as open,
        COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as closed,
        COUNT(*) FILTER (WHERE status='rejected') as rejected,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COUNT(*) FILTER (WHERE priority='high') as high,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)::numeric,1) as avg_resolution_hrs,
        ROUND((COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::numeric / NULLIF(COUNT(*),0)*100),1) as close_rate
        FROM tickets WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT status, COUNT(*) as count FROM tickets
        WHERE created_at BETWEEN $1 AND $2 ${cw} GROUP BY status ORDER BY count DESC`, params),

      query(`SELECT priority, COUNT(*) as count FROM tickets
        WHERE created_at BETWEEN $1 AND $2 ${cw} GROUP BY priority ORDER BY count DESC`, params),

      query(`SELECT COALESCE(d.name,'Unknown') as department, COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status IN ('resolved','closed')) as closed
        FROM tickets t LEFT JOIN departments d ON d.id=t.department_id
        WHERE t.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY d.name ORDER BY total DESC`, params),

      query(`SELECT t.ticket_number, t.title, t.priority, t.status,
        t.created_at, t.resolved_at, c.name as client,
        u.name as submitted_by, a.name as assigned_to,
        ROUND(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))/3600::numeric,1) as resolution_hrs
        FROM tickets t
        LEFT JOIN clients c ON c.id=t.client_id
        LEFT JOIN users u ON u.id=t.submitted_by
        LEFT JOIN users a ON a.id=t.assigned_to
        WHERE t.created_at BETWEEN $1 AND $2 ${cw}
        ORDER BY t.created_at DESC LIMIT 100`, params),
    ])

    res.json({
      meta:       { type:'tickets', from, to, generated_at: new Date().toISOString() },
      kpis:       kpis.rows[0],
      by_status:  byStatus.rows,
      by_priority:byPriority.rows,
      by_department: byDept.rows,
      tickets:    list.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/procurement?date_from=&date_to=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/procurement', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND client_id = $${params.length}`) : ''

    const [summary, byDept, byProgress, items] = await Promise.all([
      query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE progress='pending') as pending,
        COUNT(*) FILTER (WHERE progress='approved') as approved,
        COUNT(*) FILTER (WHERE progress='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE progress='completed') as completed,
        COUNT(*) FILTER (WHERE progress='rejected') as rejected,
        COUNT(*) FILTER (WHERE priority='critical') as critical,
        COALESCE(SUM(estimated_cost),0) as total_estimated_cost,
        COALESCE(SUM(estimated_cost) FILTER (WHERE progress='pending'),0) as pending_cost,
        COALESCE(SUM(estimated_cost) FILTER (WHERE progress='approved'),0) as approved_cost
        FROM further_requests WHERE created_at BETWEEN $1 AND $2 ${cw}`, params),

      query(`SELECT COALESCE(d.name,'Unknown') as department,
        COUNT(*) as total, COALESCE(SUM(fr.estimated_cost),0) as total_cost,
        COUNT(*) FILTER (WHERE fr.progress='pending') as pending
        FROM further_requests fr LEFT JOIN departments d ON d.id=fr.department_id
        WHERE fr.created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY d.name ORDER BY total DESC`, params),

      query(`SELECT progress, COUNT(*) as count, COALESCE(SUM(estimated_cost),0) as total_cost
        FROM further_requests WHERE created_at BETWEEN $1 AND $2 ${cw}
        GROUP BY progress ORDER BY count DESC`, params),

      query(`SELECT fr.*, COALESCE(d.name,'Unknown') as dept_name, c.name as client_name
        FROM further_requests fr
        LEFT JOIN departments d ON d.id=fr.department_id
        LEFT JOIN clients c ON c.id=fr.client_id
        WHERE fr.created_at BETWEEN $1 AND $2 ${cw}
        ORDER BY CASE fr.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        fr.created_at DESC`, params),
    ])

    res.json({
      meta:          { type:'procurement', from, to, generated_at: new Date().toISOString() },
      summary:       summary.rows[0],
      by_department: byDept.rows,
      by_progress:   byProgress.rows,
      items:         items.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/export/csv?type=summary&date_from=&date_to=
// Returns CSV string for download
// ══════════════════════════════════════════════════════════════════════════════
router.get('/export/csv', async (req, res) => {
  try {
    const { type = 'issues', date_from, date_to } = req.query
    const { from, to } = buildDateFilter(date_from, date_to)
    const params = [from, to]
    const cw = req.clientScope ? (params.push(req.clientScope), `AND i.client_id = $${params.length}`) : ''

    let rows = [], headers = []

    if (type === 'issues') {
      const r = await query(`SELECT
        v.visit_reference, v.visit_date, c.name as client, u.name as technician,
        COALESCE(d.name,'Unknown') as department, i.sub_area,
        COALESCE(et.name, i.equipment_custom,'Unknown') as equipment,
        i.issue_description, i.root_cause, i.action_taken,
        i.status, i.resolved, i.priority,
        i.resolution_hours, i.parts_used, i.parts_cost,
        i.further_request, i.followup_date, i.remarks
        FROM visit_issues i
        JOIN site_visits v ON v.id=i.site_visit_id
        LEFT JOIN clients c ON c.id=i.client_id
        LEFT JOIN users u ON u.id=v.lead_technician_id
        LEFT JOIN departments d ON d.id=i.department_id
        LEFT JOIN equipment_types et ON et.id=i.equipment_type_id
        WHERE i.created_at BETWEEN $1 AND $2 ${cw}
        ORDER BY v.visit_date DESC, i.id`, params)
      rows = r.rows
      headers = ['Visit Ref','Date','Client','Technician','Department','Sub-Area','Equipment','Issue','Root Cause','Action Taken','Status','Resolved','Priority','Hours','Parts Used','Parts Cost','Further Request','Follow-up Date','Remarks']
    } else if (type === 'tickets') {
      const r = await query(`SELECT
        t.ticket_number, t.created_at::date as date, c.name as client,
        u.name as submitted_by, a.name as assigned_to,
        d.name as department, t.title, t.description, t.equipment, t.location,
        t.priority, t.status, t.resolution_notes, t.resolved_at
        FROM tickets t
        LEFT JOIN clients c ON c.id=t.client_id
        LEFT JOIN users u ON u.id=t.submitted_by
        LEFT JOIN users a ON a.id=t.assigned_to
        LEFT JOIN departments d ON d.id=t.department_id
        WHERE t.created_at BETWEEN $1 AND $2 ${cw.replace('i.client_id','t.client_id')}
        ORDER BY t.created_at DESC`, params)
      rows = r.rows
      headers = ['Ticket #','Date','Client','Submitted By','Assigned To','Department','Title','Description','Equipment','Location','Priority','Status','Resolution Notes','Resolved At']
    } else if (type === 'network') {
      const r = await query(`SELECT
        v.visit_reference, v.visit_date, c.name as client,
        n.point_id, n.office_room, d.name as department,
        n.device_type, n.connected_to, n.switch_port, n.port_status,
        n.speed_mbps, n.device_connected, n.issue, n.accompanied_by
        FROM network_points n
        JOIN site_visits v ON v.id=n.site_visit_id
        LEFT JOIN clients c ON c.id=n.client_id
        LEFT JOIN departments d ON d.id=n.department_id
        WHERE n.created_at BETWEEN $1 AND $2 ${cw.replace('i.client_id','n.client_id')}
        ORDER BY v.visit_date DESC, n.point_id`, params)
      rows = r.rows
      headers = ['Visit Ref','Date','Client','Point ID','Office/Room','Department','Device Type','Connected To','Switch Port','Status','Speed (Mbps)','Device Connected','Issue','Admin Accompanied']
    } else if (type === 'procurement') {
      const r = await query(`SELECT
        c.name as client, d.name as department, fr.description,
        fr.item_required, fr.custom_item, fr.estimated_cost,
        fr.priority, fr.progress, fr.requested_by, fr.due_date, fr.notes
        FROM further_requests fr
        LEFT JOIN clients c ON c.id=fr.client_id
        LEFT JOIN departments d ON d.id=fr.department_id
        WHERE fr.created_at BETWEEN $1 AND $2 ${cw.replace('i.client_id','fr.client_id')}
        ORDER BY CASE fr.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`, params)
      rows = r.rows
      headers = ['Client','Department','Description','Item Required','Custom Item','Estimated Cost','Priority','Progress','Requested By','Due Date','Notes']
    }

    // Build CSV
    const escape = val => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`
      return s
    }

    const csv = [
      headers.join(','),
      ...rows.map(row => Object.values(row).map(escape).join(','))
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="itsupport-${type}-${from}-to-${to}.csv"`)
    res.send(csv)
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ── HELPER ────────────────────────────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0,0,0,0)
  d.setDate(d.getDate() + 3 - (d.getDay()+6)%7)
  const week1 = new Date(d.getFullYear(),0,4)
  return 1 + Math.round(((d.getTime()-week1.getTime())/86400000 - 3 + (week1.getDay()+6)%7)/7)
}

export default router
