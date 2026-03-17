import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { canAccessClient } from '../middleware/scope.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router    = Router()
router.use(authenticate)

// Photo upload storage
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/photos')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `photo-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  }
})
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Images only'))
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// TECHNICIAN MOBILE DASHBOARD — /api/technicians/dashboard
// The first screen a technician sees on their phone
// ══════════════════════════════════════════════════════════════════════════════
router.get('/dashboard', authorize('technician','super_admin','manager'), async (req, res) => {
  try {
    const userId = req.user.id

    // Get assigned clients
    let assignedClients = []
    if (req.user.access_level === 'all' || ['super_admin','manager'].includes(req.user.role)) {
      const r = await query(`SELECT id, name, contact_phone, status FROM clients WHERE status='active' ORDER BY name`)
      assignedClients = r.rows
    } else if (req.user.access_level === 'single' && req.user.primary_client_id) {
      const r = await query(`SELECT id, name, contact_phone, status FROM clients WHERE id=$1`, [req.user.primary_client_id])
      assignedClients = r.rows
    } else {
      const r = await query(`SELECT c.id, c.name, c.contact_phone, c.status
        FROM clients c JOIN technician_clients tc ON tc.client_id=c.id
        WHERE tc.technician_id=$1 ORDER BY c.name`, [userId])
      assignedClients = r.rows
    }

    // Today's visits
    const todayVisits = await query(`
      SELECT v.id, v.visit_reference, v.visit_date, v.status, v.time_in, v.time_out,
        c.name as client_name, s.name as site_name,
        (SELECT COUNT(*) FROM visit_issues WHERE site_visit_id=v.id) as issue_count,
        (SELECT action FROM visit_checkins WHERE site_visit_id=v.id AND user_id=$1 ORDER BY timestamp DESC LIMIT 1) as checkin_status
      FROM site_visits v
      LEFT JOIN clients c ON c.id=v.client_id
      LEFT JOIN sites s ON s.id=v.site_id
      WHERE v.lead_technician_id=$1 AND v.visit_date=CURRENT_DATE AND v.deleted_at IS NULL
      ORDER BY v.created_at DESC`, [userId])

    // Open tickets assigned to me
    const myTickets = await query(`
      SELECT t.id, t.ticket_number, t.title, t.priority, t.status,
        c.name as client_name, d.name as dept_name, t.created_at
      FROM tickets t
      LEFT JOIN clients c ON c.id=t.client_id
      LEFT JOIN departments d ON d.id=t.department_id
      WHERE t.assigned_to=$1 AND t.status IN ('open','assigned','in_progress')
      ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.created_at
      LIMIT 10`, [userId])

    // Stats this month
    const stats = await query(`
      SELECT COUNT(DISTINCT v.id) as visits_this_month,
        COUNT(i.id) as issues_logged,
        COUNT(i.id) FILTER (WHERE i.resolved='yes') as issues_resolved,
        COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to=$1) as tickets_assigned
      FROM site_visits v
      LEFT JOIN visit_issues i ON i.site_visit_id=v.id
      LEFT JOIN tickets t ON t.assigned_to=$1 AND t.created_at >= DATE_TRUNC('month', NOW())
      WHERE v.lead_technician_id=$1
        AND v.visit_date >= DATE_TRUNC('month', NOW())
        AND v.deleted_at IS NULL`, [userId])

    res.json({
      technician:      req.user,
      assigned_clients:assignedClients,
      todays_visits:   todayVisits.rows,
      my_tickets:      myTickets.rows,
      stats:           stats.rows[0],
    })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/technicians/my-clients — Technician's assigned clients
// ══════════════════════════════════════════════════════════════════════════════
router.get('/my-clients', authorize('technician'), async (req, res) => {
  try {
    const userId = req.user.id
    const level  = req.user.access_level || 'all'
    let clients  = []

    if (level === 'all') {
      const r = await query(`SELECT c.*, (SELECT COUNT(*) FROM site_visits WHERE client_id=c.id AND deleted_at IS NULL) as visit_count FROM clients c WHERE c.status='active' ORDER BY c.name`)
      clients = r.rows
    } else if (level === 'single') {
      const r = await query(`SELECT c.*, (SELECT COUNT(*) FROM site_visits WHERE client_id=c.id AND deleted_at IS NULL) as visit_count FROM clients c WHERE c.id=$1`, [req.user.primary_client_id])
      clients = r.rows
    } else {
      const r = await query(`SELECT c.*, tc.assigned_at, tc.notes as assignment_note,
        (SELECT COUNT(*) FROM site_visits WHERE client_id=c.id AND deleted_at IS NULL) as visit_count
        FROM clients c JOIN technician_clients tc ON tc.client_id=c.id
        WHERE tc.technician_id=$1 ORDER BY c.name`, [userId])
      clients = r.rows
    }

    res.json(clients)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/technicians/checkin — Check in/out of a site visit
// ══════════════════════════════════════════════════════════════════════════════
router.post('/checkin', authorize('technician','super_admin'), async (req, res) => {
  try {
    const { site_visit_id, action, latitude, longitude, notes } = req.body
    if (!site_visit_id || !action) return res.status(400).json({ message: 'site_visit_id and action required' })
    if (!['check_in','check_out'].includes(action)) return res.status(400).json({ message: 'action must be check_in or check_out' })

    // Verify visit exists and belongs to this tech
    const v = await query('SELECT * FROM site_visits WHERE id=$1 AND deleted_at IS NULL', [site_visit_id])
    if (!v.rows.length) return res.status(404).json({ message: 'Visit not found' })
    if (v.rows[0].lead_technician_id !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Not your visit' })
    }

    const r = await query(`INSERT INTO visit_checkins (site_visit_id, user_id, action, latitude, longitude, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [site_visit_id, req.user.id, action, latitude||null, longitude||null, notes||null])

    // Update visit status on check-in
    if (action === 'check_in') {
      await query(`UPDATE site_visits SET status='in_progress', time_in=CURRENT_TIME, updated_at=NOW() WHERE id=$1 AND status='draft'`, [site_visit_id])
    } else {
      await query(`UPDATE site_visits SET time_out=CURRENT_TIME, updated_at=NOW() WHERE id=$1`, [site_visit_id])
    }

    res.status(201).json({ message: `${action === 'check_in' ? 'Checked in' : 'Checked out'} successfully`, checkin: r.rows[0] })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/technicians/photos — Upload field photo
// ══════════════════════════════════════════════════════════════════════════════
router.post('/photos', authorize('technician','super_admin'), uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded' })
    const { site_visit_id, issue_id, caption } = req.body

    const r = await query(`INSERT INTO field_photos
      (site_visit_id, issue_id, uploaded_by, filename, original_name, mime_type, size_bytes, caption)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [site_visit_id||null, issue_id||null, req.user.id, req.file.filename,
       req.file.originalname, req.file.mimetype, req.file.size, caption||null])

    res.status(201).json({ message: 'Photo uploaded', photo: r.rows[0] })
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// GET /api/technicians/photos/:visitId
router.get('/photos/:visitId', async (req, res) => {
  try {
    const r = await query(`SELECT fp.*, u.name as uploaded_by_name FROM field_photos fp
      LEFT JOIN users u ON u.id=fp.uploaded_by WHERE fp.site_visit_id=$1 ORDER BY fp.created_at`, [req.params.visitId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// Serve photo files
router.get('/photos/file/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../../uploads/photos', req.params.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Photo not found' })
  res.sendFile(filePath)
})

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: Assign technicians to clients
// GET /api/technicians/assignments — list all assignments
// ══════════════════════════════════════════════════════════════════════════════
router.get('/assignments', authorize('super_admin','manager'), async (req, res) => {
  try {
    const r = await query(`SELECT u.id, u.name, u.email, u.designation, u.is_active,
      u.access_level, u.primary_client_id, u.can_view_credentials,
      pc.name as primary_client_name,
      COALESCE(
        JSON_AGG(JSON_BUILD_OBJECT('client_id', tc.client_id, 'client_name', c.name, 'assigned_at', tc.assigned_at))
        FILTER (WHERE tc.client_id IS NOT NULL), '[]'
      ) as assigned_clients
      FROM users u
      LEFT JOIN clients pc ON pc.id=u.primary_client_id
      LEFT JOIN technician_clients tc ON tc.technician_id=u.id
      LEFT JOIN clients c ON c.id=tc.client_id
      WHERE u.role='technician' AND u.deleted_at IS NULL
      GROUP BY u.id, u.name, u.email, u.designation, u.is_active,
               u.access_level, u.primary_client_id, u.can_view_credentials, pc.name
      ORDER BY u.name`)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// PUT /api/technicians/:id/access — Set access level + assignments
router.put('/:id/access', authorize('super_admin'), async (req, res) => {
  try {
    const { access_level, primary_client_id, client_ids, can_view_credentials } = req.body
    const techId = parseInt(req.params.id)

    // Validate technician exists
    const u = await query('SELECT id, role FROM users WHERE id=$1 AND role=$2 AND deleted_at IS NULL', [techId, 'technician'])
    if (!u.rows.length) return res.status(404).json({ message: 'Technician not found' })

    // Update user access settings
    await query(`UPDATE users SET
      access_level = COALESCE($1, access_level),
      primary_client_id = $2,
      can_view_credentials = COALESCE($3, can_view_credentials),
      updated_at = NOW()
      WHERE id = $4`,
      [access_level||null, primary_client_id||null, can_view_credentials??null, techId])

    // Update selected client assignments
    if (access_level === 'selected' && Array.isArray(client_ids)) {
      // Remove all existing assignments
      await query('DELETE FROM technician_clients WHERE technician_id=$1', [techId])
      // Add new assignments
      for (const clientId of client_ids) {
        await query(`INSERT INTO technician_clients (technician_id, client_id, assigned_by)
          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [techId, clientId, req.user.id])
      }
    } else if (access_level === 'all' || access_level === 'single') {
      // Clear selected assignments when switching modes
      await query('DELETE FROM technician_clients WHERE technician_id=$1', [techId])
    }

    // Return updated technician
    const updated = await query(`SELECT u.*, pc.name as primary_client_name FROM users u
      LEFT JOIN clients pc ON pc.id=u.primary_client_id WHERE u.id=$1`, [techId])
    res.json({ message: 'Access updated', technician: updated.rows[0] })

  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }) }
})

// POST /api/technicians/:id/assign-client — Add one client
router.post('/:id/assign-client', authorize('super_admin'), async (req, res) => {
  try {
    const { client_id, notes } = req.body
    await query(`INSERT INTO technician_clients (technician_id, client_id, assigned_by, notes)
      VALUES ($1,$2,$3,$4) ON CONFLICT (technician_id,client_id) DO UPDATE SET notes=$4, assigned_at=NOW()`,
      [req.params.id, client_id, req.user.id, notes||null])
    res.json({ message: 'Client assigned' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// DELETE /api/technicians/:id/assign-client/:clientId — Remove one client
router.delete('/:id/assign-client/:clientId', authorize('super_admin'), async (req, res) => {
  try {
    await query('DELETE FROM technician_clients WHERE technician_id=$1 AND client_id=$2', [req.params.id, req.params.clientId])
    res.json({ message: 'Client unassigned' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════════════════
router.post('/push-subscribe', async (req, res) => {
  try {
    const { endpoint, p256dh, auth, device_info } = req.body
    await query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_info)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (endpoint) DO UPDATE SET p256dh=$3, auth=$4, device_info=$5`,
      [req.user.id, endpoint, p256dh, auth, device_info||null])
    res.json({ message: 'Subscribed to push notifications' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

router.delete('/push-subscribe', async (req, res) => {
  try {
    await query('DELETE FROM push_subscriptions WHERE user_id=$1', [req.user.id])
    res.json({ message: 'Unsubscribed' })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

export default router
