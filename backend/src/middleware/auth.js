import jwt from 'jsonwebtoken'
import { query } from '../db/pool.js'

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' })
    }
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const result = await query(
      'SELECT id, name, email, role, client_id, designation, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    )
    if (!result.rows.length) return res.status(401).json({ message: 'User not found' })
    if (!result.rows[0].is_active) return res.status(403).json({ message: 'Account deactivated' })

    req.user = result.rows[0]
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Access denied',
      required: roles,
      yours: req.user.role
    })
  }
  next()
}

// Scope client data — clients only see their own records
export const scopeClient = (req, res, next) => {
  if (req.user.role === 'client') {
    req.clientScope = req.user.client_id
  } else {
    req.clientScope = req.query.client_id ? parseInt(req.query.client_id) : null
  }
  next()
}
