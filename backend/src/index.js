import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
dotenv.config()

import authRouter    from './routes/auth.js'
import visitsRouter  from './routes/visits.js'
import reportsRouter from './routes/reports.js'
import lookupRouter  from './routes/lookup.js'
import pluginsRouter     from './routes/plugins.js'
import techniciansRouter from './routes/technicians.js'
import settingsRouter, { migrateSettings } from './routes/settings.js'
import { pluginManager } from './plugins/engine/PluginManager.js'
import {
  issuesRouter, networkRouter, credentialsRouter, ticketsRouter,
  clientsRouter, deptsRouter, usersRouter, equipRegRouter, equipTypesRouter
} from './routes/all.js'

const app  = express()
const PORT = process.env.PORT || 5000

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500 }))
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20, message: { message: 'Too many login attempts' } }))

// Core routes
app.use('/api/auth',                          authRouter)
app.use('/api/visits',                        visitsRouter)
app.use('/api/visits/:visitId/issues',        issuesRouter)
app.use('/api/visits/:visitId/network',       networkRouter)
app.use('/api/network/lookup',                lookupRouter)
app.use('/api/credentials',                   credentialsRouter)
app.use('/api/tickets',                       ticketsRouter)
app.use('/api/reports',                       reportsRouter)
app.use('/api/clients',                       clientsRouter)
app.use('/api/clients/:clientId/departments', deptsRouter)
app.use('/api/users',                         usersRouter)
app.use('/api/equipment-register',            equipRegRouter)
app.use('/api/equipment-types',               equipTypesRouter)
app.use('/api/plugins',                       pluginsRouter)
app.use('/api/technicians',                   techniciansRouter)
app.use('/api/settings',                      settingsRouter)

app.get('/health', (_req, res) => res.json({
  status: 'ok', time: new Date().toISOString(),
  plugins_loaded: Object.keys(pluginManager.loaded).length
}))
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }))
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: 'Internal server error' }) })

// Boot server + load plugins
const startServer = async () => {
  app.listen(PORT, async () => {
    console.log(`\n🚀  IT Support API — port ${PORT}`)
    console.log(`    Health: http://localhost:${PORT}/health`)
    console.log(`    First deploy: npm run setup\n`)
    // Load active plugins after server starts
    try {
      await migrateSettings()
      await pluginManager.loadAll(app)
    } catch (err) {
      console.error('Plugin load error:', err.message)
    }
  })
}
startServer()
