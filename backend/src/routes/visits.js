import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { scopeByRole, buildClientFilter, canAccessClient } from '../middleware/scope.js'
import { pluginManager } from '../plugins/engine/PluginManager.js'

const router = Router()
router.use(authenticate, scopeByRole)

const genRef = async () => {
  const yr = new Date().getFullYear()
  const r  = await query(`SELECT COUNT(*) FROM site_visits WHERE EXTRACT(YEAR FROM created_at)=$1`, [yr])
  return `VIS-${yr}-${String(parseInt(r.rows[0].count)+1).padStart(4,'0')}`
}

// GET /api/visits
router.get('/', async (req, res) => {
  try {
    const { page=1, limit=20, status, date_from, date_to } = req.query
    const offset = (page-1)*limit
    const baseParams = []
    let where = ['v.deleted_at IS NULL']

    // Client/technician scope
    if (req.clientScope) {
      baseParams.push(req.clientScope)
      where.push(`v.client_id = $${baseParams.length}`)
    } else if (req.clientIds && req.clientIds.length > 0) {
      const ph = req.clientIds.map((_, i) => `$${baseParams.length + i + 1}`).join(',')
      baseParams.push(...req.clientIds)
      where.push(`v.client_id IN (${ph})`)
    }

    if (status)    { baseParams.push(status);    where.push(`v.status = $${baseParams.length}`) }
    if (date_from) { baseParams.push(date_from); where.push(`v.visit_date >= $${baseParams.length}`) }
    if (date_to)   { baseParams.push(date_to);   where.push(`v.visit_date <= $${baseParams.length}`) }
    if (req.user.role === 'client') where.push(`v.status != 'draft'`)

    const ws = 'WHERE ' + where.join(' AND ')
    const countRes = await query(`SELECT COUNT(*) FROM site_visits v ${ws}`, baseParams)
    const dataParams = [...baseParams, parseInt(limit), parseInt(offset)]
    const dataRes = await query(`
      SELECT v.*, c.name as client_name, s.name as site_name, u.name as technician_name,
             (SELECT COUNT(*) FROM visit_issues WHERE site_visit_id=v.id) as issue_count,
             (SELECT COUNT(*) FROM visit_issues WHERE site_visit_id=v.id AND resolved='yes') as resolved_count
      FROM site_visits v
      LEFT JOIN clients c ON c.id=v.client_id
      LEFT JOIN sites   s ON s.id=v.site_id
      LEFT JOIN users   u ON u.id=v.lead_technician_id
      ${ws}
      ORDER BY v.visit_date DESC, v.created_at DESC
      LIMIT $${dataParams.length-1} OFFSET $${dataParams.length}
    `, dataParams)

    res.json({ data: dataRes.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// POST /api/visits
router.post('/', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const { client_id, site_id, visit_date, time_in, time_out, next_visit_date,
            contract_number, client_representative, client_designation, scope, summary } = req.body
    if (!client_id || !visit_date) return res.status(400).json({ message: 'client_id and visit_date required' })

    // Technician scope enforcement
    const allowed = await canAccessClient(req.user, client_id)
    if (!allowed) return res.status(403).json({ message: 'You are not assigned to this client' })

    const ref = await genRef()
    const r = await query(`
      INSERT INTO site_visits
        (client_id, site_id, lead_technician_id, visit_reference, visit_date, time_in, time_out,
         next_visit_date, contract_number, client_representative, client_designation, scope, summary, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft') RETURNING *
    `, [client_id, site_id||null, req.user.id, ref, visit_date, time_in||null, time_out||null,
        next_visit_date||null, contract_number||null, client_representative||null,
        client_designation||null, JSON.stringify(scope||[]), summary||null])

    res.status(201).json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// GET /api/visits/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT v.*, c.name as client_name, c.contact_email as client_email,
             c.contact_phone as client_phone, c.contact_person,
             s.name as site_name, u.name as technician_name, u.phone as technician_phone
      FROM site_visits v
      LEFT JOIN clients c ON c.id=v.client_id
      LEFT JOIN sites   s ON s.id=v.site_id
      LEFT JOIN users   u ON u.id=v.lead_technician_id
      WHERE v.id=$1 AND v.deleted_at IS NULL
    `, [req.params.id])
    if (!r.rows.length) return res.status(404).json({ message: 'Visit not found' })
    const visit = r.rows[0]

    // Access enforcement
    if (req.user.role === 'client' && visit.client_id !== req.user.client_id)
      return res.status(403).json({ message: 'Access denied' })
    if (req.user.role === 'technician') {
      const allowed = await canAccessClient(req.user, visit.client_id)
      if (!allowed) return res.status(403).json({ message: 'Access denied — not your client' })
    }

    const [issues, netPoints, requests, checkins, photos] = await Promise.all([
      query(`SELECT i.*, d.name as dept_name, et.name as equip_name FROM visit_issues i
             LEFT JOIN departments d ON d.id=i.department_id
             LEFT JOIN equipment_types et ON et.id=i.equipment_type_id
             WHERE i.site_visit_id=$1 ORDER BY i.id`, [req.params.id]),
      query(`SELECT n.*, d.name as dept_name FROM network_points n
             LEFT JOIN departments d ON d.id=n.department_id
             WHERE n.site_visit_id=$1 ORDER BY n.id`, [req.params.id]),
      query(`SELECT fr.*, d.name as dept_name FROM further_requests fr
             LEFT JOIN departments d ON d.id=fr.department_id
             WHERE fr.site_visit_id=$1 ORDER BY fr.id`, [req.params.id]),
      query(`SELECT vc.*, u.name as user_name FROM visit_checkins vc
             LEFT JOIN users u ON u.id=vc.user_id
             WHERE vc.site_visit_id=$1 ORDER BY vc.timestamp`, [req.params.id]),
      query(`SELECT fp.*, u.name as uploaded_by_name FROM field_photos fp
             LEFT JOIN users u ON u.id=fp.uploaded_by
             WHERE fp.site_visit_id=$1 ORDER BY fp.created_at`, [req.params.id]),
    ])

    res.json({ ...visit, issues: issues.rows, network_points: netPoints.rows,
               further_requests: requests.rows, checkins: checkins.rows, photos: photos.rows })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// PUT /api/visits/:id
router.put('/:id', authorize('super_admin','manager','technician'), async (req, res) => {
  try {
    const { site_id, visit_date, time_in, time_out, next_visit_date, contract_number,
            client_representative, client_designation, scope, summary, status } = req.body
    const r = await query(`
      UPDATE site_visits SET site_id=$1, visit_date=$2, time_in=$3, time_out=$4,
        next_visit_date=$5, contract_number=$6, client_representative=$7,
        client_designation=$8, scope=$9, summary=$10, status=COALESCE($11,status), updated_at=NOW()
      WHERE id=$12 AND deleted_at IS NULL RETURNING *
    `, [site_id||null, visit_date, time_in||null, time_out||null, next_visit_date||null,
        contract_number||null, client_representative||null, client_designation||null,
        JSON.stringify(scope||[]), summary||null, status||null, req.params.id])
    if (!r.rows.length) return res.status(404).json({ message: 'Visit not found' })
    res.json(r.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// POST /api/visits/:id/sign
// Technician sign → status = completed → fire visit.completed hook → client notified
router.post('/:id/sign', async (req, res) => {
  try {
    const { signer_type, signer_name, designation } = req.body
    if (!signer_type || !signer_name) return res.status(400).json({ message: 'signer_type and signer_name required' })

    let updatedVisit

    if (signer_type === 'technician') {
      const r = await query(`
        UPDATE site_visits SET tech_signature_name=$1, tech_signed_at=NOW(),
          status='completed', updated_at=NOW()
        WHERE id=$2 RETURNING *
      `, [signer_name, req.params.id])
      updatedVisit = r.rows[0]

      // Load client + technician for notification
      const [clientRes, techRes] = await Promise.all([
        query('SELECT * FROM clients WHERE id=$1', [updatedVisit.client_id]),
        query('SELECT id, name, email, phone FROM users WHERE id=$1', [updatedVisit.lead_technician_id]),
      ])

      // Fire hook — email-alerts / whatsapp / sms plugins handle delivery
      await pluginManager.hooks.doAction('visit.completed', {
        visit:      updatedVisit,
        client:     clientRes.rows[0] || null,
        technician: techRes.rows[0]   || null,
      })

    } else {
      // Client counter-signs
      const r = await query(`
        UPDATE site_visits SET client_signature_name=$1, client_signature_designation=$2,
          client_signed_at=NOW(), status='signed', updated_at=NOW()
        WHERE id=$3 RETURNING *
      `, [signer_name, designation||null, req.params.id])
      updatedVisit = r.rows[0]
    }

    res.json({ message: 'Signature recorded', visit: updatedVisit })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// DELETE /api/visits/:id
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    await query('UPDATE site_visits SET deleted_at=NOW() WHERE id=$1', [req.params.id])
    res.json({ message: 'Visit deleted' })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

export default router
