import { query } from '../db/pool.js'

/**
 * scopeByRole — determines what data a user can see
 *
 * Attaches to req:
 *   req.clientScope     — single client_id or null (means all)
 *   req.clientIds       — array of allowed client IDs (for IN queries)
 *   req.isRestricted    — true if user cannot see all clients
 *
 * Rules:
 *   client role     → only req.user.client_id
 *   technician      → depends on access_level:
 *                       'all'      → no restriction
 *                       'selected' → only assigned client IDs
 *                       'single'   → only primary_client_id
 *   manager         → all clients (read only — no restriction)
 *   super_admin     → all clients
 */
export const scopeByRole = async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next()

    if (user.role === 'client') {
      req.clientScope  = user.client_id
      req.clientIds    = [user.client_id]
      req.isRestricted = true
      return next()
    }

    if (user.role === 'technician') {
      const level = user.access_level || 'all'

      if (level === 'single') {
        const cid = user.primary_client_id
        req.clientScope  = cid
        req.clientIds    = cid ? [cid] : []
        req.isRestricted = true

      } else if (level === 'selected') {
        const r = await query(
          'SELECT client_id FROM technician_clients WHERE technician_id = $1',
          [user.id]
        )
        const ids = r.rows.map(row => row.client_id)
        req.clientScope  = ids.length === 1 ? ids[0] : null
        req.clientIds    = ids
        req.isRestricted = true

      } else {
        // 'all' — no restriction
        req.clientScope  = null
        req.clientIds    = null
        req.isRestricted = false
      }
      return next()
    }

    // manager / super_admin — unrestricted
    // But respect explicit ?client_id= query param for filtering
    const qClientId = req.query.client_id ? parseInt(req.query.client_id) : null
    req.clientScope  = qClientId
    req.clientIds    = qClientId ? [qClientId] : null
    req.isRestricted = false
    next()

  } catch (err) {
    console.error('scopeByRole error:', err)
    next()
  }
}

/**
 * buildClientFilter — generates SQL WHERE clause fragment
 *
 * Usage:
 *   const { clause, params } = buildClientFilter(req, 'v', existingParams)
 *   const sql = `SELECT ... FROM site_visits v WHERE 1=1 ${clause}`
 *   await query(sql, params)
 */
export const buildClientFilter = (req, tableAlias = '', existingParams = []) => {
  const col    = tableAlias ? `${tableAlias}.client_id` : 'client_id'
  const params = [...existingParams]

  if (req.clientScope) {
    // Single client
    params.push(req.clientScope)
    return { clause: `AND ${col} = $${params.length}`, params }
  }

  if (req.clientIds && req.clientIds.length > 0) {
    // Multiple selected clients
    const placeholders = req.clientIds.map((id, i) => `$${params.length + i + 1}`).join(', ')
    params.push(...req.clientIds)
    return { clause: `AND ${col} IN (${placeholders})`, params }
  }

  // No restriction
  return { clause: '', params }
}

/**
 * canAccessClient — check if user can access a specific client
 */
export const canAccessClient = async (user, clientId) => {
  if (['super_admin', 'manager'].includes(user.role)) return true
  if (user.role === 'client') return user.client_id === parseInt(clientId)

  if (user.role === 'technician') {
    const level = user.access_level || 'all'
    if (level === 'all') return true
    if (level === 'single') return user.primary_client_id === parseInt(clientId)
    if (level === 'selected') {
      const r = await query(
        'SELECT 1 FROM technician_clients WHERE technician_id=$1 AND client_id=$2',
        [user.id, parseInt(clientId)]
      )
      return r.rows.length > 0
    }
  }
  return false
}
