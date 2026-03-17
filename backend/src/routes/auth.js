import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' })

    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase().trim()]
    )
    const user = result.rows[0]
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })
    if (!user.is_active) return res.status(403).json({ message: 'Account deactivated' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])

    // Load client info if client role
    let clientInfo = null
    if (user.client_id) {
      const cr = await query('SELECT id, name, slug FROM clients WHERE id = $1', [user.client_id])
      clientInfo = cr.rows[0] || null
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.json({
      token,
      user: {
        id:              user.id,
        name:            user.name,
        email:           user.email,
        role:            user.role,
        designation:     user.designation,
        employee_number: user.employee_number,
        client_id:       user.client_id,
        client:          clientInfo,
      }
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    let clientInfo = null
    if (req.user.client_id) {
      const cr = await query('SELECT id, name, slug FROM clients WHERE id = $1', [req.user.client_id])
      clientInfo = cr.rows[0] || null
    }
    res.json({ ...req.user, client: clientInfo })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// PUT /api/auth/me
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, phone, designation } = req.body
    await query(
      'UPDATE users SET name=$1, phone=$2, designation=$3, updated_at=NOW() WHERE id=$4',
      [name, phone, designation, req.user.id]
    )
    res.json({ message: 'Profile updated' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body
    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id])
    const valid = await bcrypt.compare(current_password, result.rows[0].password)
    if (!valid) return res.status(400).json({ message: 'Current password incorrect' })

    const hashed = await bcrypt.hash(new_password, 10)
    await query('UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2', [hashed, req.user.id])
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
