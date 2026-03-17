import bcrypt from 'bcryptjs'
import { query } from './pool.js'
import dotenv from 'dotenv'
dotenv.config()

const seed = async () => {
  console.log('🌱 Seeding database...')

  // ── CLIENTS ───────────────────────────────────────────────────────────────
  const c1 = await query(`
    INSERT INTO clients (name, slug, contact_person, contact_email, contact_phone, address, contract_number, status)
    VALUES ('St. Mary''s Mission Complex', 'st-marys', 'Fr. Emmanuel Odhiambo', 'admin@stmarys.org', '+254700000001', 'P.O. Box 100, Kisumu, Kenya', 'CON-2024-001', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `)
  const c2 = await query(`
    INSERT INTO clients (name, slug, contact_person, contact_email, contact_phone, status)
    VALUES ('Greenfield Academy', 'greenfield', 'Mrs. Jane Kamau', 'admin@greenfield.ac.ke', '+254700000002', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `)
  const client1Id = c1.rows[0].id
  const client2Id = c2.rows[0].id

  // ── SITES ─────────────────────────────────────────────────────────────────
  await query(`INSERT INTO sites (client_id, name, building) VALUES ($1,'Main Campus','Block A') ON CONFLICT DO NOTHING`, [client1Id])
  await query(`INSERT INTO sites (client_id, name, building) VALUES ($1,'Clinic Wing','Block B') ON CONFLICT DO NOTHING`, [client1Id])
  await query(`INSERT INTO sites (client_id, name, building) VALUES ($1,'Main School','Main Block') ON CONFLICT DO NOTHING`, [client2Id])

  // ── DEPARTMENTS — CLIENT 1 ────────────────────────────────────────────────
  const depts1 = [
    ['School','#2E75B6'],['Homes','#70AD47'],['Education','#ED7D31'],
    ['Finance','#FFC000'],['Procurement','#7030A0'],['Farm & Business','#1ABC9C'],
    ['Clinic','#E74C3C'],['HR','#8E44AD'],['Church','#D4AC0D'],
    ['Admin','#1F3864'],['Teams & Guests','#117A65'],['Central Kitchen','#CA6F1E'],
  ]
  for (const [name, color] of depts1) {
    await query(
      `INSERT INTO departments (client_id, name, color) VALUES ($1,$2,$3) ON CONFLICT (client_id, name) DO NOTHING`,
      [client1Id, name, color]
    )
  }

  // ── DEPARTMENTS — CLIENT 2 ────────────────────────────────────────────────
  const depts2 = [
    ['Administration','#2E75B6'],['Library','#70AD47'],
    ['Science Lab','#ED7D31'],['Sports','#E74C3C'],['Accounts','#7030A0'],
  ]
  for (const [name, color] of depts2) {
    await query(
      `INSERT INTO departments (client_id, name, color) VALUES ($1,$2,$3) ON CONFLICT (client_id, name) DO NOTHING`,
      [client2Id, name, color]
    )
  }

  // ── GLOBAL EQUIPMENT TYPES ────────────────────────────────────────────────
  const equipTypes = [
    ['Desktop Computer','computer'],['Laptop','computer'],['Server','computer'],
    ['CCTV Camera','cctv'],['NVR','cctv'],['DVR','cctv'],
    ['Printer','printer'],['Photocopier','printer'],['Scanner','printer'],
    ['Access Point','network'],['Network Switch','network'],['Router','network'],
    ['UPS / Power Backup','network'],['Monitor','computer'],['Keyboard & Mouse','computer'],
    ['Projector','other'],['Smart TV','other'],['IP Phone','network'],
    ['Tablet','computer'],['External Hard Drive','other'],['OTHER (specify)','other'],
  ]
  for (const [name, category] of equipTypes) {
    await query(
      `INSERT INTO equipment_types (name, category) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [name, category]
    )
  }

  // ── USERS ─────────────────────────────────────────────────────────────────
  const hash = (pw) => bcrypt.hash(pw, 10)

  const users = [
    { name:'System Administrator', email:'admin@itsupport.local',    role:'super_admin', client_id:null,     designation:'System Administrator', employee_number:'EMP-001' },
    { name:'Operations Manager',   email:'manager@itsupport.local',  role:'manager',     client_id:null,     designation:'IT Manager',           employee_number:'EMP-002' },
    { name:'John Otieno',          email:'tech@itsupport.local',     role:'technician',  client_id:null,     designation:'IT Technician',        employee_number:'EMP-003' },
    { name:'Fr. Emmanuel Odhiambo',email:'client@itsupport.local',   role:'client',      client_id:client1Id,designation:'Mission Director',      employee_number:null },
    { name:'Mrs. Jane Kamau',      email:'client2@itsupport.local',  role:'client',      client_id:client2Id,designation:'School Principal',       employee_number:null },
  ]

  for (const u of users) {
    const pw = await hash('password')
    await query(`
      INSERT INTO users (name, email, password, role, client_id, designation, employee_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (email) DO NOTHING
    `, [u.name, u.email, pw, u.role, u.client_id, u.designation, u.employee_number])
  }

  console.log('\n✅ Database seeded successfully!\n')
  console.log('Default login accounts:')
  console.log('─────────────────────────────────────────────────────')
  console.log('Role          | Email                    | Password')
  console.log('─────────────────────────────────────────────────────')
  console.log('Super Admin   | admin@itsupport.local    | password')
  console.log('Manager       | manager@itsupport.local  | password')
  console.log('Technician    | tech@itsupport.local     | password')
  console.log('Client 1      | client@itsupport.local   | password')
  console.log('Client 2      | client2@itsupport.local  | password')
  console.log('─────────────────────────────────────────────────────\n')
  process.exit(0)
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1) })

// ── UPDATE TECHNICIAN ACCESS LEVELS (after users are created) ─────────────────
const techUser = await query("SELECT id FROM users WHERE email='tech@itsupport.local'")
if (techUser.rows.length) {
  const techId = techUser.rows[0].id
  // Default: access to all clients (can be changed via Admin UI)
  await query(`UPDATE users SET access_level='all', can_view_credentials=false WHERE id=$1`, [techId])
}
console.log('✅ Technician access defaults set')
