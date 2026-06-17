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
  const { contactName, lastMessage, messages, stage, notes } = req.body
  const history = (messages||[]).slice(-20)
  const lastClientMsg = (lastMessage||'').trim()

  // What Leon already said — pass to model to prevent repetition
  const leonLines = history.filter(m=>m.fromMe).map(m=>m.text).filter(Boolean)
  const leonSaid  = leonLines.join(' | ')
  const thread    = history.map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')

  // Rule-based fallback — checks last 3 client messages for context
  function ruleBased() {
    const recentClient = history.filter(m=>!m.fromMe).slice(-3).map(m=>(m.text||'').toLowerCase()).join(' ')
    const m = lastClientMsg.toLowerCase()
    const ctx = m + ' ' + recentClient

    // Single word / short replies — use conversation context
    if (/^(cmc|cmc news|coinmarketcap)$/.test(m.trim()))
      return "CMC News puts your content directly on CoinMarketCap — reaches millions of crypto users, strong credibility signal before TGE or any campaign. Want me to send the rate card?"
    if (/^(pr|coincu pr|coincu)$/.test(m.trim()))
      return "Coincu PR is a featured article on coincu.com — 500K+ monthly readers, great for SEO and announcement visibility. Want me to send the rate card?"
    if (/^(all|all of them|both|everything)$/.test(m.trim()))
      return "Perfect — Coincu PR + CMC News bundle starts around $950. That covers both SEO visibility and CoinMarketCap credibility. Want me to put together a proposal?"
    if (/^(yes|ok|okay|sure|yep|yeah|great|perfect|sounds good|go ahead|let'?s? go)$/.test(m.trim()))
      return "Perfect — can you share your project name and website? I'll put together a tailored proposal and have it ready today."
    if (/^(no|nope|not now|later|busy)$/.test(m.trim()))
      return "No worries — when would be a better time to revisit? I'll follow up then."

    // Longer messages
    if (/same thing|repeat|always say|generic/.test(ctx))
      return "Fair point — let me be specific. CMC News = content on CoinMarketCap (top crypto site, credibility). Coincu PR = article on coincu.com (500K readers/month, SEO). Which fits your goal better?"
    if (/tell me more|what is it|explain|how does|what do you|more detail|more info/.test(ctx))
      return "Coincu PR = featured article on coincu.com, 500K crypto readers/month, strong for SEO. CMC News = content on CoinMarketCap, top crypto site globally, stronger credibility signal. Which matters more for you?"
    if (/interested|sounds good|sounds interesting|looks good/.test(ctx))
      return "Glad it resonates — want me to put together a quick proposal? Just need your project name and website to tailor it."
    if (/cmc|coinmarketcap/.test(ctx))
      return "CMC News puts your content directly on CoinMarketCap — reaches millions of crypto users and gives strong credibility. Starts at $800. Want the full rate card?"
    if (/coincu pr|coincu news|article/.test(ctx))
      return "Coincu PR gets you a featured article on coincu.com — 500K+ monthly readers, great for SEO and announcements. Starts at $300. Want the rate card?"
    if (/both|bundle|all|everything|package/.test(ctx))
      return "Coincu PR + CMC News bundle starts around $950 — covers both visibility and credibility. Want me to send a full proposal?"
    if (/price|cost|how much|rate|expensive|budget/.test(ctx))
      return "CMC News from $800, Coincu PR from $300, bundle $950. Want me to send the full rate card with all options?"
    if (/raising|investor|round|funding|vc/.test(ctx))
      return "Good timing — investors check media presence. CMC News on CoinMarketCap is the strongest signal before a raise. Want details?"
    if (/tge|launch|listing|mainnet|token/.test(ctx))
      return "CMC News right before a TGE is one of the best visibility moves — content on CoinMarketCap when people are looking. Want me to walk you through it?"
    if (/proposal|quote|send me|rate card/.test(ctx))
      return "On it — can you share your project name and website? I'll have a tailored proposal ready today."

    // Default — but use last client message as context
    if (lastClientMsg.length > 2)
      return "Got it — based on what you've shared, I'd recommend starting with CMC News for the credibility angle. Want me to put together a quick proposal?"
    return "What's the main goal right now — awareness, credibility, or user growth?"
  }

  // Log what we're working with for debugging
  log('AI suggest — last: "' + lastClientMsg + '" | leonSaid: ' + leonSaid.slice(0,60))

  if (!GROQ_KEY) return res.json({ suggestion: ruleBased() })

  try {
    const userPrompt = [
      'Conversation:',
      thread,
      '',
      'Client last message: "' + lastClientMsg + '"',
      'What Leon already said (DO NOT repeat any of these): ' + (leonSaid || 'nothing yet'),
      '',
      'Write Leon\'s next reply:',
      '- Max 2 sentences, English only',
      '- Reply SPECIFICALLY to: "' + lastClientMsg + '"',
      '- If client says tell me more/what is it: explain Coincu PR (coincu.com, 500K readers, SEO) and CMC News (CoinMarketCap, credibility), ask which goal matters',
      '- If client complains about repetition: apologize briefly, say something COMPLETELY different',
      '- If client says yes/interested: move to proposal, ask for project name',
      '- NEVER use any phrase from "What Leon already said" above',
      '- No greeting (Hi/Hey), no sign-off, no "Makes sense", no "Got it"'
    ].join('\n')

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are Leon, BD at Coincu — crypto PR company in Vietnam. Be concise and natural.' },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.5
    }, { headers: { Authorization: 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' }})

    let s = r.data.choices[0].message.content.trim()
    s = s.replace(/^["'`]|["'`]$/g,'').replace(/^(Leon:|Reply:)/i,'').split('\n')[0].trim()
    log('AI: ' + s.slice(0,80))
    res.json({ suggestion: s })
  } catch(e) {
    log('AI error: ' + e.message + (e.response ? ' | ' + JSON.stringify(e.response.data) : ''))
    res.json({ suggestion: ruleBased() })
  }
})


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
