require('dotenv').config()
const express = require('express')
const path = require('path')
const axios = require('axios')
const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|html)$/)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  }
  next()
})
app.use(express.static(path.join(__dirname, 'dist')))

const VALID_TOKEN = process.env.AUTH_TOKEN || 'coincu_crm_2024'
const USERS = [
  { u: 'Leon',  p: process.env.LEON_PASSWORD  || 'coincu123'  },
  { u: 'admin', p: process.env.ADMIN_PASSWORD || 'coincu2026' },
]
const TG_API_ID   = parseInt(process.env.TG_API_ID   || '23444646')
const TG_API_HASH =          process.env.TG_API_HASH  || '83816a4a3a3006b19549b2ba782acae0'
const GROQ_KEY    =          process.env.GROQ_API_KEY || ''
const SB_URL      =          process.env.SUPABASE_URL  || 'https://rgtodxxuwdusaacipokt.supabase.co'
const SB_KEY      =          process.env.SUPABASE_KEY  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU'
const SBH         = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

const logs = []
function log(m) { const l='['+new Date().toLocaleTimeString('vi-VN')+'] '+m; console.log(l); logs.push(l); if(logs.length>200)logs.shift() }
log('🚀 Coincu CRM Chat v2 — standalone with TG auth')

function requireAuth(req,res,next){
  const t=req.headers['x-auth-token']||req.query.token
  if(t===VALID_TOKEN)return next()
  res.status(401).json({error:'Unauthorized'})
}

// ── LOGIN ──
app.post('/api/login',(req,res)=>{
  const{username,password}=req.body
  if(USERS.some(v=>v.u===username&&v.p===password)) res.json({ok:true,token:VALID_TOKEN})
  else res.json({ok:false,message:'Sai username hoặc password'})
})

// ── TELEGRAM SESSION (in-memory + env fallback) ──
let _session = process.env.TG_SESSION || ''
let _pendingClient = null

// ── LOAD SESSION FROM SUPABASE ON STARTUP ──
async function loadSessionFromDB() {
  if (_session && _session.length > 10) return
  try {
    const r = await axios.get(SB_URL + '/rest/v1/sessions?key=eq.crmchat_tg_session', { headers: SBH })
    if (r.data && r.data[0] && r.data[0].value && r.data[0].value.length > 10) {
      _session = r.data[0].value
      log('✅ Session loaded from Supabase')
    }
  } catch(e) { log('loadSession: ' + e.message) }
}

async function saveSessionToDB(s) {
  try {
    const h = { ...SBH, Prefer: 'resolution=merge-duplicates' }
    await axios.post(SB_URL + '/rest/v1/sessions',
      { key: 'crmchat_tg_session', value: s, updated_at: new Date().toISOString() },
      { headers: h }
    )
    log('✅ Session saved to Supabase')
  } catch(e) { log('saveSession: ' + e.message) }
}

loadSessionFromDB()

// Persistent client to avoid reconnecting every request
let _client = null
let _clientBusy = false

async function getClient() {
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')
  if (_client && _client.connected) return _client
  _client = new TelegramClient(new StringSession(_session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
  await _client.connect()
  return _client
}

// Resolve entity from string ID (handles negative supergroup IDs)
async function resolveEntity(client, idStr, username) {
  if (username) {
    try { return await client.getEntity(username) } catch {}
  }
  const num = Number(idStr)
  // Negative ID = supergroup/channel — wrap with peer
  if (num < 0) {
    try {
      const { Api } = require('telegram/tl')
      const channelId = Math.abs(num) - 1000000000000
      if (channelId > 0) {
        return await client.getEntity(new Api.PeerChannel({ channelId: BigInt(channelId) }))
      }
      return await client.getEntity(new Api.PeerChat({ chatId: BigInt(Math.abs(num)) }))
    } catch {}
  }
  try { return await client.getEntity(BigInt(idStr)) } catch {}
  try { return await client.getEntity(num) } catch {}
  return idStr // last resort: pass raw string
}

// ── AUTH: check status ──
app.get('/api/tg/status', requireAuth, async (req,res) => {
  res.json({ connected: _session.length > 10 })
})

// ── AUTH: send OTP ──
app.post('/api/tg/send-otp', requireAuth, async (req,res) => {
  const { phone } = req.body
  if (!phone) return res.status(400).json({ error: 'Phone required' })
  try {
    const { TelegramClient } = require('telegram')
    const { StringSession } = require('telegram/sessions')
    const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    const result = await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone)
    _pendingClient = { client, phoneCodeHash: result.phoneCodeHash, phone }
    log('OTP sent to ' + phone)
    res.json({ ok: true, phoneCodeHash: result.phoneCodeHash })
  } catch(e) { log('sendOTP: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── AUTH: verify OTP ──
app.post('/api/tg/verify-otp', requireAuth, async (req,res) => {
  const { phone, code, phoneCodeHash, password } = req.body
  if (!_pendingClient) return res.status(400).json({ error: 'No pending session. Send OTP first.' })
  try {
    const { client, phoneCodeHash: storedHash } = _pendingClient
    try {
      await client.invoke(new (require('telegram/tl').Api.auth.SignIn)({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash || storedHash,
        phoneCode: code
      }))
    } catch(e) {
      if (e.message.includes('SESSION_PASSWORD_NEEDED') && password) {
        const { computeCheck } = require('telegram/Password')
        const pwd = await client.invoke(new (require('telegram/tl').Api.account.GetPassword)())
        const check = await computeCheck(pwd, password)
        await client.invoke(new (require('telegram/tl').Api.auth.CheckPassword)({ password: check }))
      } else throw e
    }
    _session = client.session.save()
    _pendingClient = null
    await saveSessionToDB(_session)
    log('✅ TG authenticated, session saved to Supabase')
    res.json({ ok: true })
  } catch(e) { log('verifyOTP: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── CHAT LIST ──
app.get('/api/chat/list', requireAuth, async (req,res) => {
  if (!_session) return res.json([])
  try {
    const client = await getClient()
    const dialogs = await client.getDialogs({ limit: 60 })
    const chats = dialogs.map(d => ({
      id: d.id.toString(),
      name: d.title || d.name || 'Unknown',
      lastMsg: d.message?.message?.slice(0,80) || '',
      unread: d.unreadCount || 0,
      date: d.message?.date,
      isUser: d.isUser,
      username: d.entity?.username || null,
      accessHash: d.entity?.accessHash?.toString() || null,
    }))
    res.json(chats)
  } catch(e) { log('chatList: '+e.message); res.json([]) }
})

// ── MESSAGES ──
app.get('/api/chat/messages/:id', requireAuth, async (req,res) => {
  if (!_session) return res.json([])
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const msgs = await client.getMessages(entity, { limit: 80 })
    const results = msgs.reverse()
      .map(m => ({ id: m.id, text: m.message, fromMe: m.out, date: m.date }))
      .filter(m => m.text)
    res.json(results)
  } catch(e) { log('messages: '+e.message); res.json([]) }
})

// ── SEND MESSAGE ──
app.post('/api/chat/send', requireAuth, async (req,res) => {
  const { chatId, text } = req.body
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, chatId, req.body.username)
    await client.sendMessage(entity, { message: text })
    log('Sent to '+chatId+': '+text.slice(0,40))
    res.json({ ok: true })
  } catch(e) { log('send: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── AI SUGGEST (Groq) ──
app.post('/api/ai/suggest', requireAuth, async (req,res) => {
  const { contactName, lastMessage, messages, stage, notes } = req.body

  // Build conversation thread for context
  const thread = (messages||[]).slice(-15).map(m =>
    `${m.fromMe ? 'Leon' : (contactName||'Client')}: ${m.text}`
  ).join('\n')

  // Smart rule-based fallback — reads actual last message content
  function ruleBased() {
    const msg = (lastMessage||'').toLowerCase()
    const lastFew = (messages||[]).slice(-5).map(m=>m.text||'').join(' ').toLowerCase()
    const ctx = msg + ' ' + lastFew

    // Pricing questions
    if (ctx.match(/price|cost|how much|rate|bao nhiêu|giá|phí|chi phí/))
      return `CMC News starts at $800 and Coincu PR from $300 — I can bundle both at a better rate. Want me to send a full proposal?`
    // Budget objection
    if (ctx.match(/budget|expensive|afford|no fund|tight|ngân sách|đắt|không có tiền/))
      return `Totally understand — budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?`
    // Focused on product/feedback
    if (ctx.match(/feedback|user|community|product|phản hồi|người dùng|cộng đồng|sản phẩm/))
      return `Makes sense — are you also thinking about visibility for the next public milestone, or is that further down the road?`
    // Raising funds
    if (ctx.match(/raising|round|investor|vc|funding|gọi vốn|nhà đầu tư/))
      return `Good timing — investors do check media presence. Would it make sense to have Coincu coverage ready before the round closes?`
    // Busy / not now
    if (ctx.match(/busy|later|not now|next month|bận|sau|chưa|tháng sau/))
      return `No problem. When's a better time? I'll follow up then and keep it short.`
    // What do you sell
    if (ctx.match(/what.*sell|what.*offer|bán gì|làm gì|dịch vụ gì/))
      return `We mainly help Web3 projects get visibility through Coincu PR and CMC News placement. Is your current focus more awareness, users, or credibility before a milestone?`
    // TGE / launch
    if (ctx.match(/tge|launch|listing|mainnet|token|ra mắt/))
      return `Perfect timing — CMC News right before a TGE or listing really strengthens the narrative. Want me to walk you through what that looks like?`
    // Negotiating stage
    if (stage === 'Negotiating')
      return `Based on what we've discussed, a bundled Coincu PR + CMC News package seems like the best fit. Want me to put together a quick proposal?`
    // Default — based on last message content
    const preview = (lastMessage||'').slice(0,60)
    if (preview.length > 10)
      return `Got it — just to make sure I'm recommending the right thing, is the main goal right now awareness, credibility, or user growth?`
    return `What's the main priority for your project right now — awareness, credibility, or user growth?`
  }

  if (!GROQ_KEY) {
    return res.json({ suggestion: ruleBased() })
  }

  try {
    const prompt = `You are Leon, a BD at Coincu — a crypto PR and media company based in Vietnam. You sell Coincu PR articles, CMC News placements, and banner ads to Web3 projects.

Your style: natural, short, Telegram-like. You never sound salesy. You ask only one question at a time. You focus on the client's actual situation before pitching anything.

---
Contact: ${contactName || 'Client'}
Sales stage: ${stage || 'Contacted'}
Internal notes: ${notes || 'none'}

Full conversation so far:
${thread || '(no messages yet)'}

Last message from client:
"${lastMessage || '(no message)'}"
---

Write ONE short reply as Leon. Rules:
- English only
- Max 2-3 sentences
- Read the conversation carefully — reply specifically to what they said, not generically
- If they asked about pricing, give real numbers (CMC News $800+, Coincu PR $300+)
- If they asked what we sell, explain briefly and ask what their focus is
- If they raised an objection, acknowledge it genuinely before responding
- End with at most one open question
- Do NOT use greetings like "Hi" or sign off with your name
- Do NOT use phrases like "I understand" or "Great question"
- Sound like a real person texting, not a sales bot`

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama3-70b-8192',
      messages: [
        { role: 'system', content: 'You are Leon, a crypto BD professional. Reply naturally and briefly.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.75
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }})

    let suggestion = r.data.choices[0].message.content.trim()
    // Clean up any quotes the model might wrap around the reply
    suggestion = suggestion.replace(/^["']|["']$/g, '').trim()
    res.json({ suggestion })
  } catch(e) {
    log('AI suggest error: ' + e.message)
    res.json({ suggestion: ruleBased() })
  }
})


// ── PROFILE PHOTO (cached in memory) ──
const photoCache = {}
app.get('/api/chat/photo/:id', requireAuth, async (req,res) => {
  if (!_session) return res.status(404).send()
  const cacheKey = req.params.id
  if (photoCache[cacheKey]) {
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(photoCache[cacheKey])
  }
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
    if (buffer && buffer.length > 0) {
      const buf = Buffer.from(buffer)
      photoCache[cacheKey] = buf
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.send(buf)
    } else {
      res.status(404).send()
    }
  } catch(e) { log('photo: '+e.message); res.status(404).send() }
})

app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'dist','index.html')))

app.listen(PORT, () => log('Listening on port '+PORT))
