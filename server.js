require('dotenv').config()
const express = require('express')
const path = require('path')
const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
app.use(express.static(path.join(__dirname, 'dist')))

const VALID_TOKEN = process.env.AUTH_TOKEN || 'coincu_crm_2024'
const USERS = [
  { u: 'Leon',  p: process.env.LEON_PASSWORD  || 'coincu123'  },
  { u: 'admin', p: process.env.ADMIN_PASSWORD || 'coincu2026' },
]

const TG_API_ID   = parseInt(process.env.TG_API_ID   || '23444646')
const TG_API_HASH =          process.env.TG_API_HASH  || '83816a4a3a3006b19549b2ba782acae0'
const SB_URL      =          process.env.SUPABASE_URL || 'https://rgtodxxuwdusaacipokt.supabase.co'
const SB_KEY      =          process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU'
const SBH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

const axios = require('axios')
const logs = []
function log(m) { const l = '[' + new Date().toLocaleTimeString('vi-VN') + '] ' + m; console.log(l); logs.push(l); if (logs.length > 200) logs.shift() }
log('🚀 Coincu CRM Chat standalone')

function requireAuth(req, res, next) {
  const t = req.headers['x-auth-token'] || req.query.token
  if (t === VALID_TOKEN) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  if (USERS.some(v => v.u === username && v.p === password)) {
    res.json({ ok: true, token: VALID_TOKEN })
  } else {
    res.json({ ok: false, message: 'Sai username hoặc password' })
  }
})

// ── SESSION from Supabase (shared with main app) ──
let _session = null
async function getSession() {
  if (_session && _session.length > 10) return _session
  try {
    const r = await axios.get(SB_URL + '/rest/v1/sessions?key=eq.telegram_session', { headers: SBH })
    if (r.data && r.data[0] && r.data[0].value && r.data[0].value.length > 10) {
      _session = r.data[0].value
      log('✅ TG session loaded')
      return _session
    }
  } catch (e) { log('getSession: ' + e.message) }
  return null
}

// ── LEADS from Supabase ──
app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const r = await axios.get(SB_URL + '/rest/v1/leads?order=created_at.asc', { headers: SBH })
    res.json(r.data || [])
  } catch (e) { res.json([]) }
})

// ── TELEGRAM CHAT LIST ──
app.get('/api/chat/list', requireAuth, async (req, res) => {
  const session = await getSession()
  if (!session) return res.json([])
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')
  try {
    const client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    const dialogs = await client.getDialogs({ limit: 50 })
    const chats = dialogs.map(d => ({
      id: d.id.toString(),
      name: d.title || 'Unknown',
      lastMsg: d.message?.message?.slice(0, 60) || '',
      unread: d.unreadCount,
      date: d.message?.date
    }))
    await client.disconnect()
    res.json(chats)
  } catch (e) { log('Chat list: ' + e.message); res.json([]) }
})

// ── MESSAGES ──
app.get('/api/chat/messages/:id', requireAuth, async (req, res) => {
  const session = await getSession()
  if (!session) return res.json([])
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')
  try {
    const client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    const entity = await client.getEntity(req.params.id)
    const msgs = await client.getMessages(entity, { limit: 60 })
    const results = msgs.reverse().map(m => ({ text: m.message, fromMe: m.out, date: m.date })).filter(m => m.text)
    await client.disconnect()
    res.json(results)
  } catch (e) { log('Messages: ' + e.message); res.json([]) }
})

// ── SEND MESSAGE ──
app.post('/api/chat/send', requireAuth, async (req, res) => {
  const { chatId, text } = req.body
  const session = await getSession()
  if (!session) return res.status(401).json({ error: 'No TG session' })
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')
  try {
    const client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    await client.sendMessage(chatId, { message: text })
    await client.disconnect()
    res.json({ ok: true })
  } catch (e) { log('Send: ' + e.message); res.status(500).json({ error: e.message }) }
})

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/api/logs', requireAuth, (req, res) => res.json(logs))
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => log('Listening on port ' + PORT))
