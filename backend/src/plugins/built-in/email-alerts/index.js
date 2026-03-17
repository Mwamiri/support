/**
 * Email Alerts Plugin
 * Sends SMTP emails on key events
 */
export default async function boot(ctx) {
  const { hooks, settings, query, log } = ctx

  const send = async ({ to, subject, html }) => {
    if (!settings.smtp_host || !settings.smtp_user) {
      log('SMTP not configured — skipping email')
      return { ok: false, error: 'SMTP not configured' }
    }
    try {
      // Dynamic import nodemailer (add to package.json dependencies)
      const nodemailer = (await import('nodemailer')).default
      const transporter = nodemailer.createTransporter({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: parseInt(settings.smtp_port) === 465,
        auth: { user: settings.smtp_user, pass: settings.smtp_pass },
      })
      await transporter.sendMail({
        from: `"${settings.from_name || 'IT Support'}" <${settings.from_email}>`,
        to, subject, html,
      })
      log(`Email sent to ${to}: ${subject}`)
      return { ok: true }
    } catch (err) {
      log(`Email failed: ${err.message}`)
      return { ok: false, error: err.message }
    }
  }

  const logNotification = async (event, recipient, status, error = null, payload = {}) => {
    try {
      await query(`INSERT INTO plugin_notifications (plugin_id, event_type, channel, recipient, status, payload, error, sent_at)
        VALUES ('email-alerts',$1,'email',$2,$3,$4,$5,NOW())`,
        [event, recipient, status, JSON.stringify(payload), error])
    } catch {}
  }

  // ── TICKET CREATED → notify client ────────────────────────────────────────
  if (settings.notify_client_on_ticket !== false) {
    hooks.addAction('ticket.created', async ({ ticket, client, submitter }) => {
      if (!submitter?.email) return
      const result = await send({
        to: submitter.email,
        subject: `[${ticket.ticket_number}] Your support ticket has been received`,
        html: emailTemplate({
          title: 'Ticket Received ✅',
          greeting: `Hello ${submitter.name},`,
          body: `Your support ticket has been received and will be attended to shortly.`,
          details: [
            ['Ticket Number', ticket.ticket_number],
            ['Title',         ticket.title],
            ['Priority',      ticket.priority?.toUpperCase()],
            ['Status',        'Open'],
          ],
          cta: null,
          color: '#2E75B6'
        })
      })
      await logNotification('ticket.created', submitter.email, result.ok ? 'sent' : 'failed', result.error, { ticket_id: ticket.id })
    })
  }

  // ── TICKET RESOLVED → notify client ───────────────────────────────────────
  if (settings.notify_client_on_resolve !== false) {
    hooks.addAction('ticket.resolved', async ({ ticket, client, submitter }) => {
      if (!submitter?.email) return
      const result = await send({
        to: submitter.email,
        subject: `[${ticket.ticket_number}] Your ticket has been resolved`,
        html: emailTemplate({
          title: 'Ticket Resolved ✅',
          greeting: `Hello ${submitter.name},`,
          body: `Great news! Your support ticket has been resolved.`,
          details: [
            ['Ticket Number',     ticket.ticket_number],
            ['Title',             ticket.title],
            ['Resolution Notes',  ticket.resolution_notes || 'See portal for details'],
          ],
          cta: null,
          color: '#70AD47'
        })
      })
      await logNotification('ticket.resolved', submitter.email, result.ok ? 'sent' : 'failed', result.error, { ticket_id: ticket.id })
    })
  }

  // ── TICKET ASSIGNED → notify technician ───────────────────────────────────
  if (settings.notify_tech_on_assign !== false) {
    hooks.addAction('ticket.assigned', async ({ ticket, technician }) => {
      if (!technician?.email) return
      const result = await send({
        to: technician.email,
        subject: `[${ticket.ticket_number}] New ticket assigned to you`,
        html: emailTemplate({
          title: 'Ticket Assigned 🔧',
          greeting: `Hello ${technician.name},`,
          body: `A support ticket has been assigned to you. Please review and respond.`,
          details: [
            ['Ticket Number', ticket.ticket_number],
            ['Title',         ticket.title],
            ['Priority',      ticket.priority?.toUpperCase()],
            ['Client',        ticket.client_name],
          ],
          cta: null,
          color: '#ED7D31'
        })
      })
      await logNotification('ticket.assigned', technician.email, result.ok ? 'sent' : 'failed', result.error)
    })
  }

  // ── VISIT COMPLETED → notify client ───────────────────────────────────────
  hooks.addAction('visit.completed', async ({ visit, client, technician }) => {
    if (!client?.contact_email) return
    const result = await send({
      to: client.contact_email,
      subject: `Site Visit Report — ${visit.visit_reference}`,
      html: emailTemplate({
        title: 'Visit Report Ready 📋',
        greeting: `Hello ${client.contact_person || client.name},`,
        body: `Your IT support visit has been completed. Please log in to the portal to view the full report and sign off.`,
        details: [
          ['Visit Reference', visit.visit_reference],
          ['Date',            new Date(visit.visit_date).toDateString()],
          ['Technician',      technician?.name || 'IT Team'],
          ['Status',          'Completed — awaiting your signature'],
        ],
        cta: null,
        color: '#2E75B6'
      })
    })
    await logNotification('visit.completed', client.contact_email, result.ok ? 'sent' : 'failed', result.error)
  })

  // ── CRITICAL ISSUE → notify admin ─────────────────────────────────────────
  if (settings.notify_admin_on_critical !== false && settings.admin_email) {
    hooks.addAction('issue.critical', async ({ issue, visit, client }) => {
      const result = await send({
        to: settings.admin_email,
        subject: `🔴 CRITICAL ISSUE — ${client?.name || 'Client'}: ${issue.issue_description?.substring(0,60)}`,
        html: emailTemplate({
          title: '🔴 Critical Issue Logged',
          greeting: 'Admin Alert,',
          body: `A critical priority issue has been logged during a site visit.`,
          details: [
            ['Client',      client?.name],
            ['Visit Ref',   visit?.visit_reference],
            ['Issue',       issue.issue_description],
            ['Department',  issue.dept_name || 'Unknown'],
            ['Equipment',   issue.equip_name || issue.equipment_custom || '—'],
          ],
          cta: null,
          color: '#C00000'
        })
      })
      await logNotification('issue.critical', settings.admin_email, result.ok ? 'sent' : 'failed', result.error)
    })
  }

  log('Email Alerts plugin loaded')
  return {
    onDeactivate: () => log('Email Alerts deactivated'),
    onSettingsUpdate: (s) => { Object.assign(settings, s); log('Settings updated') }
  }
}

// ── EMAIL TEMPLATE ────────────────────────────────────────────────────────────
function emailTemplate({ title, greeting, body, details, cta, color = '#2E75B6' }) {
  const rows = details?.map(([label, val]) =>
    `<tr><td style="padding:6px 12px;color:#666;font-size:13px;border-bottom:1px solid #f0f0f0">${label}</td>
     <td style="padding:6px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0">${val || '—'}</td></tr>`
  ).join('') || ''

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:${color};padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">${title}</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#333;margin-top:0">${greeting}</p>
    <p style="color:#555;line-height:1.6">${body}</p>
    ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;border-radius:8px;overflow:hidden;border:1px solid #f0f0f0">${rows}</table>` : ''}
    ${cta ? `<div style="margin-top:24px"><a href="${cta.url}" style="background:${color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${cta.label}</a></div>` : ''}
  </div>
  <div style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #eee">
    <p style="color:#aaa;font-size:12px;margin:0">IT Support Management System · Powered by Mwamiri/itsupport</p>
  </div>
</div></body></html>`
}
