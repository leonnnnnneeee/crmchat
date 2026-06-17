require('dotenv').config()
const express = require('express')
const path = require('path')
const axios = require('axios')
const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
// static files served after API routes (see bottom)

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

  // Build conversation thread
  const history = (messages||[]).slice(-20)
  const lastClientMsg = (lastMessage || [...history].reverse().find(m => !m.fromMe)?.text || '').trim()
  const thread = history.map(m => `${m.fromMe ? 'Leon' : (contactName||'Client')}: ${m.text}`).join('\n')

  log('AI suggest — last client: "' + lastClientMsg + '"')

  // Smart English rule-based fallback
  function ruleBased() {
    const msg = lastClientMsg.toLowerCase()
    const ctx = msg + ' ' + history.slice(-5).map(m=>m.text||'').join(' ').toLowerCase()
    if (ctx.match(/\bboth\b/)) return "We can do both — Coincu PR + CMC News bundle starts around $950. Want me to put together a quick proposal?"
    if (ctx.match(/credib/)) return "CMC News is the strongest credibility play — content goes live directly on CoinMarketCap. Want me to send the rate card?"
    if (ctx.match(/aware/)) return "Coincu PR reaches 500K+ monthly readers — great for announcement visibility and SEO. Want the rate card?"
    if (ctx.match(/user|growth|community/)) return "Makes sense. Are you also thinking about visibility for the next public milestone, or is that further down the road?"
    if (ctx.match(/price|cost|how much|rate|bao nhiêu|giá/)) return "CMC News starts at $800 and Coincu PR from $300 — I can bundle both at $950. Want a full proposal?"
    if (ctx.match(/budget|expensive|afford|ngân sách/)) return "Totally understand — are you raising soon, or is this more of a timing issue for next quarter?"
    if (ctx.match(/raising|round|investor|gọi vốn/)) return "Good timing — investors do check media presence. Would it make sense to have Coincu coverage ready before the round closes?"
    if (ctx.match(/tge|launch|listing|mainnet/)) return "Perfect timing — CMC News right before a TGE really strengthens the narrative. Want me to walk you through what that looks like?"
    if (ctx.match(/yes|ok|sure|sounds good|interested|👍|okay|perfect/)) return "Perfect — I'll put together a quick proposal. Should I include both Coincu PR and CMC News, or just one to start?"
    if (ctx.match(/buy|purchase|want.*service|order/)) return "Great — which would you like to start with: Coincu PR, CMC News, or a bundle of both? I can have a proposal ready today."
    if (stage === 'Negotiating') return "Based on what we've discussed, a Coincu PR + CMC News bundle makes the most sense. Want me to put together a proposal?"
    return "Got it — to make sure I recommend the right fit, is the main goal awareness, credibility, or user growth?"
  }

  if (!GROQ_KEY) return res.json({ suggestion: ruleBased() })

  try {
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'system',
          content: `You are Leon, BD at Coincu — crypto PR company in Vietnam.
Products: Coincu PR ($300+), CMC News on CoinMarketCap ($800+), Banner Ads.
Write short, natural Telegram replies. Never repeat your previous messages. Never generic.
Always reply to what the client JUST said.`
        },
        {
          role: 'user',
          content: `My conversation with ${contactName} (stage: ${stage}):
---
${thread}
---
Their latest message: "${lastClientMsg}"

Write my next reply. Strict rules:
- 1-2 sentences ONLY
- Reply DIRECTLY and SPECIFICALLY to the LAST message: "${lastClientMsg}"
- "tell me more" or "what is it" → explain briefly: Coincu PR = article on coincu.com (500K readers, SEO), CMC News = article on CoinMarketCap (top crypto site, credibility). Then ask: which matters more to them right now?
- "sounds interesting" / "interested" → confirm which service, offer to send proposal today
- "both" → bundle offer $950, ask for proposal
- "how much" / "price" → CMC News $800+, Coincu PR $300+, bundle $950
- "yes/ok/sure" → move forward, ask which service to start
- CRITICAL: Do NOT repeat any sentence Leon already said above
- English only, no greeting, no sign-off`
        }
      ],
      max_tokens: 80,
      temperature: 0.4
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }})

    let suggestion = r.data.choices[0].message.content.trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(Leon:|Reply:|Sure,|Of course,|Great,|Makes sense,)/i, '')
      .split('\n')[0].trim()

    log('AI reply: "' + suggestion.slice(0,80) + '"')
    res.json({ suggestion })
  } catch(e) {
    log('AI error: ' + e.message)
    res.json({ suggestion: ruleBased() })
  }
})



// ── POLL new messages since a given message ID ──
app.get('/api/chat/poll/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json([])
  const since = parseInt(req.query.since) || 0
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const msgs = await client.getMessages(entity, { limit: 5, minId: since })
    const results = msgs
      .map(m => ({ id: m.id, text: m.message, fromMe: m.out, date: m.date }))
      .filter(m => m.text && m.id > since)
      .reverse()
    res.json(results)
  } catch(e) {
    res.json([])
  }
})


// ── POLL new messages since a given ID ──
app.get('/api/chat/poll/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json([])
  const since = parseInt(req.query.since) || 0
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const msgs = await client.getMessages(entity, { limit: 5, minId: since })
    const results = msgs
      .map(m => ({ id: m.id, text: m.message, fromMe: m.out, date: m.date }))
      .filter(m => m.text && m.id > since)
      .reverse()
    res.json(results)
  } catch(e) { res.json([]) }
})

app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))




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
        // broadcast removed — using polling
      } catch(e) { log('TG event error: ' + e.message) }
    }, new events.NewMessage({}))

  } catch(e) {
    log('TG listener error: ' + e.message + ' — retrying in 10s')
    setTimeout(startTGListener, 10000)
  }
}

// Start listener after session is loaded
setTimeout(startTGListener, 3000)

// ── STATIC FILES — must be LAST, after all API routes ──
app.use(express.static(require('path').join(__dirname, 'dist')))
app.get('*', (req,res) => res.sendFile(require('path').join(__dirname,'dist','index.html')))

app.listen(PORT, () => log('Listening on port ' + PORT))
