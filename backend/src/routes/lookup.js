import { Router } from 'express'
import { query } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/network/lookup/:pointId
// Auto-fill: find the latest network point record for a given point ID
router.get('/:pointId', async (req, res) => {
  try {
    const r = await query(`
      SELECT n.*, d.name as dept_name
      FROM network_points n
      LEFT JOIN departments d ON d.id = n.department_id
      WHERE n.point_id = $1
      ORDER BY n.created_at DESC
      LIMIT 1
    `, [req.params.pointId])

    if (!r.rows.length) return res.status(404).json({ message: 'Network point not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
