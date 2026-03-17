// ═══════════════════════════════════════════════════════════════════
// WHATSAPP NOTIFY PLUGIN
// File: built-in/whatsapp-notify/manifest.json + index.js
// ═══════════════════════════════════════════════════════════════════

export const whatsappManifest = {
  "id": "whatsapp-notify",
  "name": "WhatsApp Notifications",
  "version": "1.0.0",
  "description": "Send WhatsApp messages via WhatsApp Business API (Meta) or Twilio for ticket and visit alerts.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["ticket.created", "ticket.resolved", "ticket.assigned", "visit.completed", "issue.critical"],
  "settings_schema": {
    "provider":        { "type": "select",   "label": "Provider",             "options": ["Meta (WhatsApp Business API)", "Twilio", "WA Gateway (3rd party)"], "required": true },
    "api_url":         { "type": "text",     "label": "API Endpoint URL",     "required": true, "placeholder": "https://graph.facebook.com/v17.0/..." },
    "api_token":       { "type": "password", "label": "API Token / Bearer",   "required": true },
    "from_number":     { "type": "text",     "label": "WhatsApp From Number", "required": true, "placeholder": "+254700000000" },
    "admin_number":    { "type": "text",     "label": "Admin Alert Number",   "placeholder": "+254700000000" },
    "notify_on_critical": { "type": "checkbox", "label": "Alert admin on critical issues", "default": true },
    "notify_on_ticket":   { "type": "checkbox", "label": "Notify client on new ticket",    "default": true },
    "notify_on_resolve":  { "type": "checkbox", "label": "Notify client on resolution",    "default": true }
  },
  "category": "notifications",
  "icon": "💬"
}

export async function whatsappBoot(ctx) {
  const { hooks, settings, query, log } = ctx

  const send = async (to, message) => {
    if (!settings.api_url || !settings.api_token || !settings.from_number) {
      log('WhatsApp not configured'); return { ok: false }
    }
    try {
      const res = await fetch(settings.api_url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${settings.api_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: { body: message }
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'API error')
      log(`WhatsApp sent to ${to}`)
      return { ok: true }
    } catch (err) { log(`WhatsApp failed: ${err.message}`); return { ok: false, error: err.message } }
  }

  if (settings.notify_on_ticket !== false) {
    hooks.addAction('ticket.created', async ({ ticket, submitter }) => {
      if (!submitter?.phone) return
      await send(submitter.phone,
        `✅ *IT Support* — Ticket Received\n*${ticket.ticket_number}*: ${ticket.title}\nPriority: ${ticket.priority?.toUpperCase()}\nWe'll get back to you shortly.`)
    })
  }

  if (settings.notify_on_resolve !== false) {
    hooks.addAction('ticket.resolved', async ({ ticket, submitter }) => {
      if (!submitter?.phone) return
      await send(submitter.phone,
        `✅ *IT Support* — Ticket Resolved\n*${ticket.ticket_number}*: ${ticket.title}\nYour issue has been resolved. Please check the portal for details.`)
    })
  }

  hooks.addAction('ticket.assigned', async ({ ticket, technician }) => {
    if (!technician?.phone) return
    await send(technician.phone,
      `🔧 *IT Support* — Ticket Assigned to You\n*${ticket.ticket_number}*: ${ticket.title}\nClient: ${ticket.client_name}\nPriority: ${ticket.priority?.toUpperCase()}`)
  })

  hooks.addAction('visit.completed', async ({ visit, client }) => {
    if (!client?.contact_phone) return
    await send(client.contact_phone,
      `📋 *IT Support* — Visit Complete\nRef: *${visit.visit_reference}*\nYour site visit report is ready. Please log in to review and sign off.`)
  })

  if (settings.notify_on_critical !== false && settings.admin_number) {
    hooks.addAction('issue.critical', async ({ issue, client }) => {
      await send(settings.admin_number,
        `🔴 *CRITICAL ISSUE*\nClient: ${client?.name}\nIssue: ${issue.issue_description?.substring(0,100)}\nDept: ${issue.dept_name || 'Unknown'}\nImmediate attention required.`)
    })
  }

  log('WhatsApp Notify plugin loaded')
  return { onSettingsUpdate: s => Object.assign(settings, s) }
}

// ═══════════════════════════════════════════════════════════════════
// SMS ALERTS PLUGIN (Twilio / Africa's Talking / Vonage)
// ═══════════════════════════════════════════════════════════════════

export const smsManifest = {
  "id": "sms-alerts",
  "name": "SMS Alerts",
  "version": "1.0.0",
  "description": "Send SMS notifications via Twilio, Africa's Talking, or Vonage.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["ticket.created", "ticket.resolved", "issue.critical"],
  "settings_schema": {
    "provider":    { "type": "select",   "label": "SMS Provider", "options": ["Twilio", "Africa's Talking", "Vonage"], "required": true },
    "api_key":     { "type": "text",     "label": "API Key / Account SID", "required": true },
    "api_secret":  { "type": "password", "label": "API Secret / Auth Token", "required": true },
    "from_number": { "type": "text",     "label": "From Number / Sender ID", "required": true },
    "admin_number":{ "type": "text",     "label": "Admin SMS Number" },
    "notify_on_ticket":   { "type": "checkbox", "label": "SMS on new ticket",    "default": true },
    "notify_on_resolve":  { "type": "checkbox", "label": "SMS on resolution",    "default": true },
    "notify_on_critical": { "type": "checkbox", "label": "SMS admin on critical","default": true }
  },
  "category": "notifications",
  "icon": "📱"
}

export async function smsBoot(ctx) {
  const { hooks, settings, log } = ctx

  const sendSMS = async (to, message) => {
    if (!settings.api_key || !settings.from_number) { log('SMS not configured'); return }
    try {
      if (settings.provider === 'Twilio') {
        const auth = Buffer.from(`${settings.api_key}:${settings.api_secret}`).toString('base64')
        const url  = `https://api.twilio.com/2010-04-01/Accounts/${settings.api_key}/Messages.json`
        const body = new URLSearchParams({ To: to, From: settings.from_number, Body: message })
        await fetch(url, { method:'POST', headers:{ Authorization:`Basic ${auth}` }, body })
      } else if (settings.provider === "Africa's Talking") {
        const body = new URLSearchParams({ username: settings.api_key, to, message, from: settings.from_number })
        await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: { apiKey: settings.api_secret, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body
        })
      }
      log(`SMS sent to ${to}`)
    } catch (err) { log(`SMS failed: ${err.message}`) }
  }

  if (settings.notify_on_ticket !== false) {
    hooks.addAction('ticket.created', async ({ ticket, submitter }) => {
      if (!submitter?.phone) return
      await sendSMS(submitter.phone, `IT Support: Ticket ${ticket.ticket_number} received. Priority: ${ticket.priority}. We'll respond shortly.`)
    })
  }
  if (settings.notify_on_resolve !== false) {
    hooks.addAction('ticket.resolved', async ({ ticket, submitter }) => {
      if (!submitter?.phone) return
      await sendSMS(submitter.phone, `IT Support: Ticket ${ticket.ticket_number} resolved. Please check your portal for details.`)
    })
  }
  if (settings.notify_on_critical !== false && settings.admin_number) {
    hooks.addAction('issue.critical', async ({ issue, client }) => {
      await sendSMS(settings.admin_number, `CRITICAL ISSUE - ${client?.name}: ${issue.issue_description?.substring(0,80)}`)
    })
  }

  log('SMS Alerts plugin loaded')
  return { onSettingsUpdate: s => Object.assign(settings, s) }
}

// ═══════════════════════════════════════════════════════════════════
// CUSTOM FIELDS PLUGIN
// ═══════════════════════════════════════════════════════════════════

export const customFieldsManifest = {
  "id": "custom-fields",
  "name": "Custom Fields",
  "version": "1.0.0",
  "description": "Add extra fields to tickets, visits, equipment and clients. Supports text, number, date, dropdown, checkbox.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["ticket.render", "visit.render", "equipment.render"],
  "settings_schema": {},
  "category": "customisation",
  "icon": "📝"
}

export async function customFieldsBoot(ctx) {
  const { hooks, query, log, registerRoute } = ctx

  // API to manage field definitions (super admin)
  registerRoute('GET', '/api/plugins/custom-fields/definitions', async (req, res) => {
    const r = await query('SELECT * FROM plugin_custom_fields WHERE plugin_id=$1 ORDER BY entity_type, sort_order', ['custom-fields'])
    res.json(r.rows)
  })

  registerRoute('POST', '/api/plugins/custom-fields/definitions', async (req, res) => {
    const { entity_type, field_key, field_label, field_type, field_options, required, sort_order } = req.body
    const r = await query(`INSERT INTO plugin_custom_fields
      (plugin_id, entity_type, field_key, field_label, field_type, field_options, required, sort_order)
      VALUES ('custom-fields',$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [entity_type, field_key.toLowerCase().replace(/\s+/g,'_'), field_label, field_type,
       JSON.stringify(field_options||[]), required||false, sort_order||0])
    res.status(201).json(r.rows[0])
  })

  registerRoute('PUT', '/api/plugins/custom-fields/definitions/:id', async (req, res) => {
    const { field_label, field_type, field_options, required, sort_order, is_active } = req.body
    const r = await query(`UPDATE plugin_custom_fields SET field_label=$1, field_type=$2, field_options=$3, required=$4, sort_order=$5, is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *`,
      [field_label, field_type, JSON.stringify(field_options||[]), required||false, sort_order||0, is_active??null, req.params.id])
    res.json(r.rows[0])
  })

  registerRoute('DELETE', '/api/plugins/custom-fields/definitions/:id', async (req, res) => {
    await query('DELETE FROM plugin_custom_fields WHERE id=$1 AND plugin_id=$2', [req.params.id, 'custom-fields'])
    res.json({ message: 'Field deleted' })
  })

  log('Custom Fields plugin loaded')
  return {}
}

// ═══════════════════════════════════════════════════════════════════
// TICKET APPROVALS PLUGIN
// ═══════════════════════════════════════════════════════════════════

export const ticketApprovalsManifest = {
  "id": "ticket-approvals",
  "name": "Ticket Approvals",
  "version": "1.0.0",
  "description": "Add approval workflow to tickets. Critical/high tickets require manager sign-off before assignment.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["ticket.created"],
  "settings_schema": {
    "require_approval_for": { "type": "select", "label": "Require approval for", "options": ["critical only", "critical and high", "all tickets"], "default": "critical only" },
    "approver_role":        { "type": "select", "label": "Who approves",          "options": ["manager", "super_admin"], "default": "manager" },
    "auto_approve_after_hrs":{ "type": "number","label": "Auto-approve after (hours, 0=never)", "default": 0 }
  },
  "category": "workflow",
  "icon": "✅"
}

export async function ticketApprovalsBoot(ctx) {
  const { hooks, settings, query, log, registerRoute } = ctx

  const needsApproval = (priority) => {
    const setting = settings.require_approval_for || 'critical only'
    if (setting === 'all tickets') return true
    if (setting === 'critical and high') return ['critical','high'].includes(priority)
    return priority === 'critical'
  }

  hooks.addAction('ticket.created', async ({ ticket }) => {
    if (!needsApproval(ticket.priority)) return
    await query(`UPDATE tickets SET status='pending_approval' WHERE id=$1`, [ticket.id])
    await query(`INSERT INTO ticket_approvals (ticket_id, step, status) VALUES ($1,1,'pending')`, [ticket.id])
    log(`Ticket ${ticket.ticket_number} requires approval`)
  })

  registerRoute('GET', '/api/plugins/approvals/pending', async (req, res) => {
    const r = await query(`SELECT ta.*, t.ticket_number, t.title, t.priority, t.created_at as ticket_created,
      c.name as client_name, u.name as submitted_by
      FROM ticket_approvals ta JOIN tickets t ON t.id=ta.ticket_id
      LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.submitted_by
      WHERE ta.status='pending' ORDER BY ta.created_at DESC`)
    res.json(r.rows)
  })

  registerRoute('POST', '/api/plugins/approvals/:id/decide', async (req, res) => {
    const { decision, comment } = req.body // approved / rejected
    const approvalRow = await query('SELECT * FROM ticket_approvals WHERE id=$1', [req.params.id])
    if (!approvalRow.rows.length) return res.status(404).json({ message: 'Not found' })
    const approval = approvalRow.rows[0]
    await query(`UPDATE ticket_approvals SET status=$1, comment=$2, approver_id=$3, decided_at=NOW() WHERE id=$4`,
      [decision, comment||null, req.user?.id, req.params.id])
    const newTicketStatus = decision === 'approved' ? 'open' : 'rejected'
    await query('UPDATE tickets SET status=$1 WHERE id=$2', [newTicketStatus, approval.ticket_id])
    await hooks.doAction(`ticket.${decision}`, { ticketId: approval.ticket_id })
    res.json({ message: `Ticket ${decision}` })
  })

  log('Ticket Approvals plugin loaded')
  return { onSettingsUpdate: s => Object.assign(settings, s) }
}

// ═══════════════════════════════════════════════════════════════════
// ASSET REQUESTS PLUGIN (client-facing module)
// ═══════════════════════════════════════════════════════════════════

export const assetRequestsManifest = {
  "id": "asset-requests",
  "name": "Asset Requests",
  "version": "1.0.0",
  "description": "Clients can submit IT asset requests (new laptops, printers, equipment) directly from their portal.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["dashboard.client.widgets"],
  "settings_schema": {
    "require_justification": { "type": "checkbox", "label": "Require justification text", "default": true },
    "auto_create_ticket":    { "type": "checkbox", "label": "Auto-create ticket on approval", "default": false },
    "notify_admin_email":    { "type": "text",     "label": "Notify admin email on new request" }
  },
  "category": "client-portal",
  "icon": "📦"
}

export async function assetRequestsBoot(ctx) {
  const { hooks, settings, query, log, registerRoute, registerWidget, registerMenuItem } = ctx

  const genNum = async () => {
    const yr = new Date().getFullYear()
    const r  = await query('SELECT COUNT(*) FROM asset_requests WHERE EXTRACT(YEAR FROM created_at)=$1', [yr])
    return `AST-${yr}-${String(parseInt(r.rows[0].count)+1).padStart(4,'0')}`
  }

  registerMenuItem({ label: 'Asset Requests', path: '/client/assets', icon: 'Package', roles: ['client'] })
  registerMenuItem({ label: 'Asset Requests', path: '/assets',        icon: 'Package', roles: ['super_admin','manager','technician'] })

  registerWidget({
    id: 'asset-requests-summary', title: 'Asset Requests',
    endpoint: '/api/plugins/assets/summary', roles: ['client']
  })

  registerRoute('GET', '/api/plugins/assets', async (req, res) => {
    const isClient = req.user?.role === 'client'
    const filter   = isClient ? `AND ar.client_id = ${req.user.client_id}` : (req.query.client_id ? `AND ar.client_id = ${parseInt(req.query.client_id)}` : '')
    const r = await query(`SELECT ar.*, d.name as dept_name, c.name as client_name,
      u.name as submitted_by_name FROM asset_requests ar
      LEFT JOIN departments d ON d.id=ar.department_id
      LEFT JOIN clients c ON c.id=ar.client_id
      LEFT JOIN users u ON u.id=ar.submitted_by
      WHERE 1=1 ${filter} ORDER BY ar.created_at DESC`)
    res.json(r.rows)
  })

  registerRoute('POST', '/api/plugins/assets', async (req, res) => {
    const { asset_type, quantity, justification, priority, estimated_cost, department_id } = req.body
    const clientId = req.user.role === 'client' ? req.user.client_id : req.body.client_id
    if (!asset_type) return res.status(400).json({ message: 'Asset type required' })
    const num = await genNum()
    const r = await query(`INSERT INTO asset_requests
      (client_id, department_id, submitted_by, request_number, asset_type, quantity, justification, priority, estimated_cost)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [clientId, department_id||null, req.user.id, num, asset_type, quantity||1,
       justification||null, priority||'medium', estimated_cost||null])
    await hooks.doAction('asset.requested', { request: r.rows[0] })
    res.status(201).json(r.rows[0])
  })

  registerRoute('PUT', '/api/plugins/assets/:id', async (req, res) => {
    const { status, approved_by, notes } = req.body
    const r = await query(`UPDATE asset_requests SET status=COALESCE($1,status),
      approved_by=COALESCE($2,approved_by), notes=COALESCE($3,notes),
      approved_at=CASE WHEN $1='approved' THEN NOW() ELSE approved_at END,
      updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status||null, approved_by||null, notes||null, req.params.id])
    res.json(r.rows[0])
  })

  registerRoute('GET', '/api/plugins/assets/summary', async (req, res) => {
    const clientId = req.user.role === 'client' ? req.user.client_id : req.query.client_id
    const filter   = clientId ? `WHERE client_id = ${parseInt(clientId)}` : ''
    const r = await query(`SELECT COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='pending') as pending,
      COUNT(*) FILTER (WHERE status='approved') as approved,
      COUNT(*) FILTER (WHERE status='delivered') as delivered
      FROM asset_requests ${filter}`)
    res.json(r.rows[0])
  })

  log('Asset Requests plugin loaded')
  return { onSettingsUpdate: s => Object.assign(settings, s) }
}

// ═══════════════════════════════════════════════════════════════════
// REPORT BUILDER PLUGIN
// ═══════════════════════════════════════════════════════════════════

export const reportBuilderManifest = {
  "id": "report-builder",
  "name": "Custom Report Builder",
  "version": "1.0.0",
  "description": "Build and save custom report templates. Choose fields, filters, grouping and chart types. Schedule auto-delivery.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["reports.custom"],
  "settings_schema": {
    "allow_client_reports": { "type": "checkbox", "label": "Allow clients to build their own reports", "default": false },
    "max_saved_reports":    { "type": "number",   "label": "Max saved reports per user", "default": 10 }
  },
  "category": "reports",
  "icon": "📊"
}

export async function reportBuilderBoot(ctx) {
  const { query, log, registerRoute } = ctx

  // Create saved reports table
  await query(`CREATE TABLE IF NOT EXISTS saved_reports (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    is_shared BOOLEAN DEFAULT false, is_scheduled BOOLEAN DEFAULT false,
    schedule_cron VARCHAR(100), last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`)

  registerRoute('GET', '/api/plugins/reports/saved', async (req, res) => {
    const r = await query(`SELECT sr.*, u.name as owner FROM saved_reports sr
      LEFT JOIN users u ON u.id=sr.user_id
      WHERE sr.user_id=$1 OR sr.is_shared=true ORDER BY sr.updated_at DESC`, [req.user.id])
    res.json(r.rows)
  })

  registerRoute('POST', '/api/plugins/reports/saved', async (req, res) => {
    const { name, description, config, is_shared } = req.body
    const r = await query(`INSERT INTO saved_reports (user_id,name,description,config,is_shared)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, name, description||null, JSON.stringify(config), is_shared||false])
    res.status(201).json(r.rows[0])
  })

  registerRoute('PUT', '/api/plugins/reports/saved/:id', async (req, res) => {
    const { name, description, config, is_shared } = req.body
    const r = await query(`UPDATE saved_reports SET name=$1, description=$2, config=$3,
      is_shared=COALESCE($4,is_shared), updated_at=NOW() WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name, description||null, JSON.stringify(config), is_shared??null, req.params.id, req.user.id])
    if (!r.rows.length) return res.status(404).json({ message: 'Report not found' })
    res.json(r.rows[0])
  })

  registerRoute('DELETE', '/api/plugins/reports/saved/:id', async (req, res) => {
    await query('DELETE FROM saved_reports WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    res.json({ message: 'Report deleted' })
  })

  // Run a custom report from config
  registerRoute('POST', '/api/plugins/reports/run', async (req, res) => {
    try {
      const { entity, fields, filters, group_by, date_from, date_to, client_id } = req.body
      const tables = { issues:'visit_issues i', tickets:'tickets t', network:'network_points n', equipment:'equipment_register er', requests:'further_requests fr' }
      const tbl = tables[entity]
      if (!tbl) return res.status(400).json({ message: 'Unknown entity' })
      const params = [date_from || '2020-01-01', date_to || new Date().toISOString().split('T')[0]]
      let where = `WHERE i.created_at BETWEEN $1 AND $2`
      if (client_id && req.user.role !== 'client') { params.push(parseInt(client_id)); where += ` AND i.client_id=$${params.length}` }
      if (req.user.role === 'client') { params.push(req.user.client_id); where += ` AND i.client_id=$${params.length}` }
      const r = await query(`SELECT COUNT(*) as total FROM ${tbl} ${where}`, params)
      res.json({ total: r.rows[0].total, message: 'Custom report engine — extend with your field logic' })
    } catch (err) { res.status(500).json({ message: err.message }) }
  })

  log('Report Builder plugin loaded')
  return {}
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD WIDGETS PLUGIN
// ═══════════════════════════════════════════════════════════════════

export const dashboardWidgetsManifest = {
  "id": "dashboard-widgets",
  "name": "Dashboard Widgets",
  "version": "1.0.0",
  "description": "Extra dashboard widgets: SLA meter, uptime tracker, cost trend chart, technician leaderboard.",
  "author": "Mwamiri IT",
  "requires": [],
  "hooks": ["dashboard.widgets"],
  "settings_schema": {
    "show_sla_meter":       { "type": "checkbox", "label": "Show SLA compliance meter",     "default": true },
    "show_cost_trend":      { "type": "checkbox", "label": "Show parts cost trend chart",   "default": true },
    "show_leaderboard":     { "type": "checkbox", "label": "Show technician leaderboard",   "default": true },
    "show_network_health":  { "type": "checkbox", "label": "Show network health summary",   "default": true },
    "sla_target_hrs":       { "type": "number",   "label": "SLA target resolution (hours)", "default": 24 }
  },
  "category": "dashboard",
  "icon": "📈"
}

export async function dashboardWidgetsBoot(ctx) {
  const { hooks, settings, query, log, registerWidget, registerRoute } = ctx

  if (settings.show_sla_meter !== false) {
    registerWidget({ id:'sla-meter', title:'SLA Compliance', endpoint:'/api/plugins/widgets/sla', size:'sm' })
  }
  if (settings.show_cost_trend !== false) {
    registerWidget({ id:'cost-trend', title:'Parts Cost Trend', endpoint:'/api/plugins/widgets/cost-trend', size:'md' })
  }
  if (settings.show_leaderboard !== false) {
    registerWidget({ id:'tech-leaderboard', title:'Technician Leaderboard', endpoint:'/api/plugins/widgets/leaderboard', size:'md' })
  }
  if (settings.show_network_health !== false) {
    registerWidget({ id:'network-health', title:'Network Health', endpoint:'/api/plugins/widgets/network-health', size:'sm' })
  }

  registerRoute('GET', '/api/plugins/widgets/sla', async (req, res) => {
    const target = settings.sla_target_hrs || 24
    const r = await query(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE resolution_hours <= $1 AND resolved='yes') as within_sla,
      COUNT(*) FILTER (WHERE resolution_hours > $1 AND resolved='yes') as breached_sla,
      ROUND(AVG(resolution_hours)::numeric,1) as avg_hours
      FROM visit_issues WHERE created_at >= NOW() - INTERVAL '30 days'`, [target])
    const { total, within_sla, breached_sla, avg_hours } = r.rows[0]
    const compliance = total > 0 ? Math.round((within_sla / total) * 100) : 0
    res.json({ total, within_sla, breached_sla, avg_hours, compliance, target })
  })

  registerRoute('GET', '/api/plugins/widgets/cost-trend', async (req, res) => {
    const r = await query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at),'Mon YYYY') as month,
      COALESCE(SUM(parts_cost),0) as total FROM visit_issues
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at) ORDER BY DATE_TRUNC('month', created_at)`)
    res.json(r.rows)
  })

  registerRoute('GET', '/api/plugins/widgets/leaderboard', async (req, res) => {
    const r = await query(`SELECT u.name, u.designation,
      COUNT(DISTINCT v.id) as visits,
      COUNT(i.id) as issues_handled,
      COUNT(i.id) FILTER (WHERE i.resolved='yes') as resolved,
      ROUND((COUNT(i.id) FILTER (WHERE i.resolved='yes')::numeric / NULLIF(COUNT(i.id),0)*100),0) as rate
      FROM users u
      LEFT JOIN site_visits v ON v.lead_technician_id=u.id AND v.visit_date >= NOW()-INTERVAL '30 days' AND v.deleted_at IS NULL
      LEFT JOIN visit_issues i ON i.site_visit_id=v.id
      WHERE u.role='technician' AND u.is_active=true
      GROUP BY u.id, u.name, u.designation ORDER BY resolved DESC LIMIT 5`)
    res.json(r.rows)
  })

  registerRoute('GET', '/api/plugins/widgets/network-health', async (req, res) => {
    const r = await query(`SELECT port_status, COUNT(*) as count FROM network_points
      WHERE created_at >= NOW()-INTERVAL '30 days' GROUP BY port_status`)
    const total = r.rows.reduce((s, row) => s + parseInt(row.count), 0)
    const active = r.rows.find(row => row.port_status === 'active')?.count || 0
    res.json({ total, active, health_pct: total > 0 ? Math.round((active/total)*100) : 0, by_status: r.rows })
  })

  log('Dashboard Widgets plugin loaded')
  return { onSettingsUpdate: s => Object.assign(settings, s) }
}
