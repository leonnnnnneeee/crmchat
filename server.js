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
  const { contactName, lastMessage, lastMessageFromMe, messages, stage, notes } = req.body

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
    // "both" — bundle offer
    if (ctx.match(/both|bundle|all/))
      return `We can package both Coincu PR + CMC News — bundle starts around $950. Want me to put together a quick proposal?`
    // Short positive replies
    if (msg.match(/^(ok|yes|sure|sounds good|great|perfect|👍|interested|okay)\.?$/i))
      return `Perfect — I'll put together a quick proposal. Which would you prefer to start with, Coincu PR or CMC News?`
    // Default
    return `Got it — to make sure I recommend the right fit, is the main goal awareness, credibility, or user growth?`
  }

  if (!GROQ_KEY) {
    return res.json({ suggestion: ruleBased() })
  }

  try {
    // Build system prompt — who Leon is and how he writes
    const systemPrompt = `You are Leon, BD at Coincu — a crypto PR and media company in Vietnam.
You sell: Coincu PR articles ($300+), CMC News placements ($800+), banner ads.
Your writing style: short, direct, natural Telegram messages. Never salesy. Never generic.
You read the full conversation carefully and reply to exactly what the client just said.
Rules:
- English only
- Max 2 sentences
- Reply specifically to their last message — not a generic sales pitch
- If they asked about price: give real numbers
- If they raised an objection: acknowledge it first, then one soft follow-up
- If they mentioned a milestone (TGE, launch, raise): connect it to visibility
- End with at most ONE question — and only if it moves the conversation forward
- Never start with "Hi", "Hey", "Great", "I understand", "Sure"
- Never sign off with your name
- Sound like a real person texting on Telegram`

    // Build full conversation thread
    const history = (messages||[]).slice(-20)
    const lastClientMsg = [...history].reverse().find(m => !m.fromMe)?.text || lastMessage || ''
    const thread = history.map(m => `${m.fromMe ? 'Leon' : contactName}: ${m.text}`).join('\n')

    // Determine what to respond to
    const respondTo = lastClientMsg || '(no message yet)'
    const isMyTurn = !lastMessageFromMe // true if client sent last message

    const groqMessages = [
      {
        role: 'system',
        content: `You are Leon, BD at Coincu — crypto PR company in Vietnam.
Products: Coincu PR ($300+), CMC News ($800+), Banner Ads.
Write short, natural Telegram replies. Never repeat what you already said. Never generic.`
      },
      {
        role: 'user',
        content: `Conversation with ${contactName}:
---
${thread}
---
Their last message: "${respondTo}"

Write ONE reply (1-2 sentences). Be specific:
- "credibility" or "both" → "CMC News is the strongest credibility play — goes live on CoinMarketCap directly. Want me to send the rate card?"
- "awareness" → pitch Coincu PR reach (500K readers)
- "both" → bundle offer: "We can do both — Coincu PR + CMC News bundle starts around $950. Want a quick proposal?"
- want to buy → confirm which service, offer proposal
- price question → give exact numbers
- short reply like "ok" / "yes" → move forward, ask next step
English only. No greeting. No "Makes sense". No repeating your previous messages.`
      }
    ]

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama3-70b-8192',
      messages: groqMessages,
      max_tokens: 80,
      temperature: 0.5
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }})

    let suggestion = r.data.choices[0].message.content.trim()
    suggestion = suggestion.replace(/^["'`]|["'`]$/g, '').trim()
    suggestion = suggestion.replace(/^(Leon:|Reply:|REPLY:|Sure,|Of course,)/i, '').trim()
    suggestion = suggestion.split('\n')[0].trim()

    log('AI suggest for "' + lastClientMsg.slice(0,30) + '": ' + suggestion.slice(0,60))
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

const http = require('http')
const { WebSocketServer } = require('ws')

const httpServer = http.createServer(app)
const wss = new WebSocketServer({ server: httpServer })

// Track connected WS clients: Map<ws, { token, chatIds }>
const wsClients = new Map()

wss.on('connection', (ws, req) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'auth') {
        if (msg.token !== VALID_TOKEN) { ws.close(); return }
        wsClients.set(ws, { token: msg.token, chatIds: new Set() })
        ws.send(JSON.stringify({ type: 'auth_ok' }))
        log('WS client connected')
      }
      if (msg.type === 'subscribe' && wsClients.has(ws)) {
        wsClients.get(ws).chatIds.add(msg.chatId)
      }
      if (msg.type === 'unsubscribe' && wsClients.has(ws)) {
        wsClients.get(ws).chatIds.delete(msg.chatId)
      }
    } catch {}
  })
  ws.on('close', () => { wsClients.delete(ws); log('WS client disconnected') })
  ws.on('error', () => wsClients.delete(ws))
})

function broadcast(chatId, message) {
  const payload = JSON.stringify({ type: 'new_message', chatId, message })
  for (const [ws, info] of wsClients) {
    if (ws.readyState === 1 && info.chatIds.has(chatId)) {
      try { ws.send(payload) } catch {}
    }
  }
}

// Start Telegram event listener for incoming messages
async function startTGListener() {
  if (!_session || _session.length < 10) {
    setTimeout(startTGListener, 5000)
    return
  }
  try {
    const { TelegramClient, events } = require('telegram')
    const { StringSession } = require('telegram/sessions')
    const listenerClient = new TelegramClient(
      new StringSession(_session), TG_API_ID, TG_API_HASH,
      { connectionRetries: 5 }
    )
    await listenerClient.connect()
    log('✅ TG event listener started')

    listenerClient.addEventHandler(async (event) => {
      try {
        const msg = event.message
        if (!msg || !msg.text) return
        const chatId = msg.chatId?.toString()
        if (!chatId) return
        const message = {
          id: msg.id,
          text: msg.text,
          fromMe: msg.out,
          date: msg.date
        }
        broadcast(chatId, message)
      } catch(e) { log('TG event error: ' + e.message) }
    }, new events.NewMessage({}))

  } catch(e) {
    log('TG listener error: ' + e.message + ' — retrying in 10s')
    setTimeout(startTGListener, 10000)
  }
}

// Start listener after session is loaded
setTimeout(startTGListener, 3000)

httpServer.listen(PORT, () => log('Listening on port ' + PORT))
