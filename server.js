require('dotenv').config()
const express = require('express')
const path = require('path')
const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
app.use(express.static(path.join(__dirname, 'dist')))

// Auth
const VALID_TOKEN = process.env.AUTH_TOKEN || 'coincu_crm_2024'
const USERS = [
  { u: 'Leon', p: process.env.LEON_PASSWORD || 'coincu123' },
  { u: 'admin', p: process.env.ADMIN_PASSWORD || 'coincu2026' }
]

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  if (USERS.some(v => v.u === username && v.p === password)) {
    res.json({ ok: true, token: VALID_TOKEN })
  } else {
    res.json({ ok: false, message: 'Sai username hoặc password' })
  }
})

app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))

// Serve React app for all other routes
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => console.log(`Coincu CRM Chat running on port ${PORT}`))
