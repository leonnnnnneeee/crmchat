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
log('🚀 Coincu CRM Chat v15 — 20260619_031810')

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
    warmupClient()
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

// Persistent client — reconnect only when needed
let _client = null

// Timeout wrapper — prevents any TG op from hanging forever
function withTimeout(promise, ms=15000, name='op') {
  return Promise.race([
    promise,
    new Promise((_,reject) => setTimeout(()=>reject(new Error(`${name} timeout after ${ms}ms`)), ms))
  ])
}

let _clientReady = false

async function getClient() {
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')

  if (_client && _clientReady) {
    try {
      // Quick ping to verify connection is alive
      await withTimeout(_client.getMe(), 3000, 'ping')
      return _client
    } catch {
      _clientReady = false
      _client = null
    }
  }

  if (!_client) {
    _client = new TelegramClient(new StringSession(_session), TG_API_ID, TG_API_HASH, {
      connectionRetries: 3,
      retryDelay: 1000,
      autoReconnect: true,
      requestRetries: 2,
    })
  }

  await withTimeout(_client.connect(), 10000, 'connect')
  _clientReady = true
  log('TG client (re)connected')
  return _client
}

// Keep client alive with periodic ping every 2 minutes
setInterval(async () => {
  if (!_client || !_clientReady) return
  try {
    await withTimeout(_client.getMe(), 5000, 'keepalive')
  } catch {
    _clientReady = false
    log('TG client keepalive failed — will reconnect on next request')
  }
}, 120000)

// Warm up client on session load (so first request is fast)
async function warmupClient() {
  if (!_session || _session.length < 10) return
  try { await getClient(); log('✅ TG client warmed up') }
  catch(e) { log('warmup: ' + e.message) }
}

// Entity cache to avoid repeated TG lookups
const _entityCache = {}

async function resolveEntity(client, idStr, username) {
  const cacheKey = username || idStr
  if (_entityCache[cacheKey]) return _entityCache[cacheKey]

  let entity
  if (username) {
    try { entity = await client.getEntity(username) } catch {}
  }
  if (!entity) {
    const num = Number(idStr)
    if (num < 0) {
      try {
        const { Api } = require('telegram/tl')
        const channelId = Math.abs(num) - 1000000000000
        if (channelId > 0) {
          entity = await client.getEntity(new Api.PeerChannel({ channelId: BigInt(channelId) }))
        } else {
          entity = await client.getEntity(new Api.PeerChat({ chatId: BigInt(Math.abs(num)) }))
        }
      } catch {}
    }
    if (!entity) {
      try { entity = await client.getEntity(BigInt(idStr)) } catch {}
    }
    if (!entity) {
      try { entity = await client.getEntity(num) } catch {}
    }
  }
  if (entity) _entityCache[cacheKey] = entity
  return entity || idStr
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
    const dialogs = await withTimeout(client.getDialogs({ limit: 40 }), 15000, 'getDialogs')
    const chats = dialogs.map(d => ({
      id: d.id.toString(),
      name: d.title || d.name || 'Unknown',
      lastMsg: d.message?.message?.slice(0,80) || '',
      unread: d.unreadCount || 0,
      date: d.message?.date,
      isUser: d.isUser,
      isGroup: d.isGroup || false,
      isChannel: d.isChannel || false,
      username: d.entity?.username || null,
      accessHash: d.entity?.accessHash?.toString() || null,
      memberCount: d.entity?.participantsCount || d.entity?.membersCount || null,
    }))
    res.json(chats)
  } catch(e) { log('chatList: '+e.message); res.json([]) }
})

// ── MESSAGES ──
app.get('/api/chat/messages/:id', requireAuth, async (req,res) => {
  if (!_session) return res.json([])
  const t0 = Date.now()
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.id, req.query.username), 8000, 'resolveEntity')
    const msgs = await withTimeout(client.getMessages(entity, { limit: 40 }), 12000, 'getMessages')
    const results = msgs.reverse()
      .map(m => {
        const isPhoto = m.media?.className === 'MessageMediaPhoto'
        const isDoc   = m.media?.className === 'MessageMediaDocument'
        const isVideo = isDoc && m.media?.document?.mimeType?.startsWith('video/')
        const isAudio = isDoc && (m.media?.document?.mimeType?.startsWith('audio/') || m.media?.document?.attributes?.some?.(a=>a.className==='DocumentAttributeAudio'))
        return {
          id: m.id,
          text: m.message || (isPhoto ? '' : isAudio ? '🎤 Voice' : isVideo ? '🎥 Video' : isDoc ? '📎 Document' : ''),
          fromMe: m.out,
          date: m.date,
          hasMedia: !!m.media,
          isPhoto,
          isVideo,
          isAudio,
          isDoc: isDoc && !isVideo && !isAudio,
          senderId: m.senderId?.toString() || null,
          senderName: m.sender?.firstName
            ? (m.sender.firstName + (m.sender.lastName ? ' ' + m.sender.lastName : ''))
            : (m.sender?.username || null),
        }
      })
      .filter(m => m.text || m.isPhoto || m.isVideo || m.isDoc)
    log('messages loaded: ' + results.length + ' msgs in ' + (Date.now()-t0) + 'ms')
    res.json(results)
  } catch(e) { log('messages error: '+e.message+' ('+(Date.now()-t0)+'ms)'); res.json([]) }
})

// ── SEND MESSAGE ──
app.post('/api/chat/send', requireAuth, async (req,res) => {
  const { chatId, text } = req.body
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient()
    const entity = await withTimeout(resolveEntity(client, chatId, req.body.username), 8000, 'resolveEntity')
    await withTimeout(client.sendMessage(entity, { message: text }), 10000, 'sendMessage')
    log('Sent to '+chatId+': '+text.slice(0,40))
    res.json({ ok: true })
  } catch(e) { log('send: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── AI SUGGEST (Groq) ──
app.post('/api/ai/suggest', requireAuth, async (req,res) => {
  const { contactName, lastMessage, messages, stage, notes } = req.body
  const history = (messages||[]).slice(-20)
  const lastClientMsg = (lastMessage||'').trim()
  const leonLines = history.filter(m=>m.fromMe).map(m=>m.text).filter(Boolean)
  const leonSaid  = leonLines.join(' | ')
  const thread    = history.map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')

  log('AI suggest — last: "' + lastClientMsg + '" stage: ' + stage)

  // Rule-based fallback (when no Groq key or Groq fails)
  function ruleBased() {
    const m = lastClientMsg.toLowerCase()
    const recentCtx = history.filter(m=>!m.fromMe).slice(-3).map(m=>(m.text||'').toLowerCase()).join(' ')
    const ctx = m + ' ' + recentCtx

    if (/^(cmc|cmc news|coinmarketcap)$/.test(m.trim()))
      return "CMC News puts your content directly on CoinMarketCap — reaches millions of crypto users and gives strong credibility. Starts at $800. Want me to send the rate card?"
    if (/^(pr|coincu pr|coincu)$/.test(m.trim()))
      return "Coincu PR is a featured article on coincu.com — 500K+ monthly readers, great for SEO and announcement visibility. Starts at $300. Want the rate card?"
    if (/^(both|all|all of them|bundle|package|everything)$/.test(m.trim()))
      return "Coincu PR + CMC News bundle starts around $950 — covers SEO visibility and CoinMarketCap credibility. Want me to put together a proposal?"
    if (/^(yes|ok|okay|sure|yep|yeah|great|perfect|sounds good|go ahead|let'?s go|interested)$/.test(m.trim()))
      return "Perfect — can you share your project name and website? I'll put together a tailored proposal and have it ready today."
    if (/^(no|nope|not now|later|busy)$/.test(m.trim()))
      return "No worries — when would be a better time? I'll follow up then."
    if (/same thing|repeat|always say|generic/.test(ctx))
      return "Fair point — CMC News = content on CoinMarketCap (credibility, top crypto site). Coincu PR = article on coincu.com (500K readers/month, SEO). Which fits your goal better?"
    if (/tell me more|what is it|explain|how does|what do you|more detail/.test(ctx))
      return "Coincu PR = featured article on coincu.com, 500K crypto readers/month, strong for SEO. CMC News = content on CoinMarketCap — top crypto site globally, stronger credibility signal. Which matters more for you?"
    if (/discount|cheaper|lower price|negotiate|deal/.test(ctx))
      return "Understood — is your priority CoinMarketCap visibility, SEO, or just getting the announcement out? I can suggest the most cost-efficient option for your budget."
    if (/both|bundle|all|package/.test(ctx))
      return "Coincu PR + CMC News bundle starts around $950 — covers both visibility and credibility. Want me to send a full proposal?"
    if (/price|cost|how much|rate|budget/.test(ctx))
      return "CMC News from $800, Coincu PR from $300, bundle $950. Want me to send the full rate card with all options?"
    if (/raising|investor|round|funding|vc/.test(ctx))
      return "Good timing — investors check media presence. CMC News on CoinMarketCap is the strongest signal before a raise. Want details?"
    if (/tge|launch|listing|mainnet|token/.test(ctx))
      return "CMC News right before a TGE is one of the best moves — content on CoinMarketCap when people are researching the token. Want me to walk you through it?"
    if (/how.*start|next step|what.*do|proceed|move forward/.test(ctx))
      return "Simple — just share your project name, website, and article (or key talking points). I'll handle the rest and have everything live within the agreed timeline."
    if (lastClientMsg.length > 2)
      return "Got it — to recommend the right fit, is the main goal awareness, credibility, or SEO?"
    return "What's the main goal right now — awareness, credibility, or user growth?"
  }

  if (!GROQ_KEY) return res.json({ suggestion: ruleBased() })

  const SYSTEM_PROMPT = `You are Coincu's professional BD Sales Assistant.

Read all information below carefully before answering. Use ONLY this knowledge base — do not invent prices, services, or guarantees.

---
COMPANY
---
Coincu is a crypto-focused media outlet (coincu.com) that has collaborated with top-tier news platforms. We provide content publication, PR, and CoinMarketCap News visibility services.
We have executed 130+ successful marketing campaigns for global crypto projects.
When explaining what Coincu is or how Coincu PR works, use EXACTLY this description: "We're a crypto-focused media outlet — coincu.com — and have collaborated with top-tier news platforms." Do not say "network of news outlets" or "we handle writing and distribution".

---
SERVICES & RATE CARD (LATEST)
---

COINCU.COM
- Press release: $240 single | $590 (3) | $890 (5) | $1,550 (10) | TAT: 24-48hrs
- Sponsored article: $390 single | $1,020 (3) | $1,540 (5) | $2,700 (10) | TAT: 24-48hrs
- Organic coverage/review: $520 single | $1,380 (3) | $2,080 (5) | $3,650 (10) | TAT: 24-48hrs
- Listicle: $1,650 single | $4,380 (3) | $6,600 (5) | $11,600 (10) | TAT: 24-48hrs
- Add to existing listicle: $1,000–$1,500

BITCOININFONEWS.COM
- Press release: $110 single | $270 (3) | $400 (5) | $700 (10) | TAT: 24-48hrs
- Sponsored article: $180 single | $460 (3) | $670 (5) | $1,210 (10) | TAT: 24-48hrs
- Organic coverage/review: $230 single | $620 (3) | $940 (5) | $1,640 (10) | TAT: 24-48hrs
- Listicle: $740 single | $1,970 (3) | $2,970 (5) | $5,220 (10) | TAT: 24-48hrs

KANALCOIN.COM
- Press release: $170 single | $410 (3) | $620 (5) | $1,080 (10) | TAT: 24-48hrs
- Sponsored article: $270 single | $710 (3) | $1,080 (5) | $1,890 (10) | TAT: 24-48hrs
- Organic coverage/review: $360 single | $970 (3) | $1,460 (5) | $2,550 (10) | TAT: 24-48hrs
- Listicle: $1,150 single | $3,060 (3) | $4,620 (5) | $8,120 (10) | TAT: 24-48hrs

---
CMC TOP NEWS BOOST
---
- Service: Your article appears in the News section of a relevant CoinMarketCap token page
- Eligibility: Content must be relevant to the selected token/project
- Placement: Top of the News feed on the token's CoinMarketCap page
- This increases visibility to users already researching that token
- Do NOT guarantee permanent placement or top position
- Do NOT claim Coincu controls CoinMarketCap
- Mention as "subject to content and page eligibility"

Successful CMC News Boost cases:
- Tether (USDT): Coincu article appeared in Tether News section on CoinMarketCap
- OKB: Coincu article appeared in OKB News section on CoinMarketCap
- Remittix (RTX): Multiple Coincu articles appeared in Remittix News section
- Hyperliquid (HYPE): Coincu article appeared in Hyperliquid News section
- BlockDAG (BDAG): Coincu article appeared in BlockDAG News section

---
CORE VALUE
---
Coincu services can help projects:
- Gain visibility on coincu.com (500K+ monthly readers)
- Get exposure via CoinMarketCap News section on relevant token pages
- Build credibility for investors, users, exchanges, partners
- Support launches, fundraising, listings, product updates, partnerships
- Improve SEO with long-term media presence

DO NOT guarantee: token price, investor conversion, exchange listing, specific traffic, specific rankings.
Use wording like: "can help improve visibility", "can strengthen credibility", "can support your campaign".

---
CONVERSATION RULES
---
- Short, clear, Telegram-style messages (1-3 sentences max)
- Ask only ONE question at a time
- Reply in the SAME language as the client (Vietnamese or English)
- Never repeat what you already said in this conversation
- End with one clear next step
- Do not say "As an AI", "Based on the knowledge base", "According to my database"
- Speak as a member of the Coincu team
- If info is missing, say: "Let me confirm this with our team."

---
OBJECTION HANDLING
---
- Price too high: Don't immediately discount. Ask about priority — CMC visibility, SEO, or just announcement?
- Not ready: Ask what milestone they're waiting for — launch, funding, listing, product release?
- What do you sell: "We help crypto projects publish PR and branded content on Coincu, with additional visibility on relevant CoinMarketCap News pages where eligible."
- Guarantee results?: "We guarantee the agreed publication deliverables, but not token performance, traffic, or market results."
- Discount request: Ask about budget range first, then suggest most cost-efficient option or bulk package.

---
AGENCIES / PARTNERS
---
If client is an agency, VC, launchpad, or has multiple projects: mention bulk pricing and referral/partner model.`

  try {
    // === SMARTER CONTEXT-AWARE PROMPT ===
    // Build full conversation with role labels
    const fullThread = history.map(m => {
      const who = m.fromMe ? 'Leon' : contactName
      return who + ': ' + m.text
    }).join('\n')

    // Detect intent from last message
    const m = lastClientMsg.toLowerCase()
    const intent = /price|cost|how much|rate/.test(m) ? 'pricing' :
                   /tell me more|what is|explain|how does/.test(m) ? 'educate' :
                   /discount|cheaper|budget/.test(m) ? 'objection-price' :
                   /busy|later|not now|not interested/.test(m) ? 'objection-timing' :
                   /yes|ok|sure|interested|sounds good|let.s go/.test(m) ? 'positive' :
                   /both|bundle|all/.test(m) ? 'bundle' :
                   /agency|manage|multiple|clients/.test(m) ? 'agency' :
                   /tge|launch|listing|raising|investor/.test(m) ? 'milestone' : 'general'

    const stageContext = {
      'Contacted': 'Early stage — focus on understanding their needs, do not push hard',
      'Qualified': 'They showed interest — recommend the right service and move toward proposal',
      'Negotiating': 'Price/terms discussion — stay firm but flexible, push toward closing',
      'Closed Won': 'Won deal — focus on onboarding and upsell',
      'Closed Lost': 'Lost deal — try to understand why and leave door open'
    }[stage] || 'Unknown stage'

    const userPrompt = [
      '=== FULL CONVERSATION ===',
      fullThread || '(no messages yet)',
      '',
      '=== CONTEXT ===',
      'Client: ' + contactName,
      'CRM Stage: ' + (stage||'Contacted') + ' — ' + stageContext,
      notes ? 'Internal notes: ' + notes : null,
      'Detected intent: ' + intent,
      '',
      '=== WHAT LEON ALREADY SAID (never repeat) ===',
      leonLines.length ? leonLines.map((l,i)=>(i+1)+'. "'+l+'"').join('\n') : '(nothing yet)',
      '',
      '=== YOUR TASK ===',
      'Client just said: "' + lastClientMsg + '"',
      '',
      'Write EXACTLY 2 different reply options for Leon.',
      'OPTION_1: [Best reply — direct, addresses their intent]',
      'OPTION_2: [Alternative — different angle, tone, or approach]',
      '',
      'Strict rules:',
      '- Each option max 2 sentences',
      '- Use ONLY these prices: PR $240, Sponsored $390, Organic $520, Listicle $1650, CMC Boost $1500',
      '- Bulk: 15% partner, 25% (10+/mo), 35% (20+/mo), 50% (30+/mo)',
      '- NEVER use any sentence from "What Leon already said"',
      '- No greeting (Hi/Hey), no sign-off',
      '- English, natural Telegram style',
      '- Intent "' + intent + '" should guide the response direction'
    ].filter(Boolean).join('\n')

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt }
      ],
      max_tokens: 250,
      temperature: 0.55
    }, { headers: { Authorization: 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' }})

    const raw = r.data.choices[0].message.content.trim()

    function cleanReply(t) {
      return (t||'').trim()
        .replace(/^["'`]|["'`]$/g,'')
        .replace(/^(OPTION_\d+:|Option \d+:|Leon:|Reply:)\s*/i,'')
        .split('\n')[0].trim()
    }

    const opt1 = raw.match(/OPTION_1:([\s\S]+?)(?=OPTION_2:|$)/i)
    const opt2 = raw.match(/OPTION_2:([\s\S]+?)$/i)

    const suggestion  = cleanReply(opt1?.[1]) || cleanReply(raw.split('\n')[0])
    const alternative = cleanReply(opt2?.[1]) || null
    const analysis    = 'Intent: ' + intent + ' | Stage: ' + (stage||'Contacted')

    log('AI [' + intent + ']: "' + suggestion.slice(0,60) + '"')
    if(alternative) log('AI alt: "' + alternative.slice(0,60) + '"')
    res.json({ suggestion, alternative, analysis })
  } catch(e) {
    log('AI error: ' + e.message)
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


// ── DELETE MESSAGE ──
app.post('/api/chat/delete', requireAuth, async (req, res) => {
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  const { chatId, messageId } = req.body
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, chatId)
    const { Api } = require('telegram/tl')
    await client.invoke(new Api.messages.DeleteMessages({
      id: [parseInt(messageId)],
      revoke: true  // delete for everyone like Telegram
    }))
    res.json({ ok: true })
  } catch(e) {
    log('delete msg: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})


// ── PROFILE PHOTO (cached) ──
const photoCache = {}
app.get('/api/chat/photo/:id', requireAuth, async (req, res) => {
  if (!_session) return res.status(404).send()
  const cacheKey = req.params.id
  if (photoCache[cacheKey]) {
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(photoCache[cacheKey])
  }
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')
  const pc = new TelegramClient(new StringSession(_session), TG_API_ID, TG_API_HASH, { connectionRetries: 2 })
  try {
    await pc.connect()
    const entity = await resolveEntity(pc, req.params.id, req.query.username)
    const buffer = await withTimeout(pc.downloadProfilePhoto(entity, { isBig: false }), 10000, 'downloadProfilePhoto')
    await pc.disconnect()
    if (buffer && buffer.length > 0) {
      const buf = Buffer.from(buffer)
      photoCache[cacheKey] = buf
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.send(buf)
    } else res.status(404).send()
  } catch(e) {
    try { await pc.disconnect() } catch {}
    res.status(404).send()
  }
})

// ── MULTI-ACCOUNT: list sessions ──
const sessions = {}  // { name: sessionString }
app.get('/api/accounts', requireAuth, (req, res) => {
  const list = Object.keys(sessions).map(name => ({ name, active: sessions[name] === _session }))
  list.unshift({ name: 'Main', active: _session === (process.env.TG_SESSION || _session) })
  res.json(list)
})

// ── MULTI-ACCOUNT: switch account ──
app.post('/api/accounts/switch', requireAuth, (req, res) => {
  const { name } = req.body
  if (sessions[name]) {
    _session = sessions[name]
    _client = null  // force reconnect
    log('Switched to account: ' + name)
    res.json({ ok: true })
  } else res.status(404).json({ error: 'Account not found' })
})

// ── MULTI-ACCOUNT: add new account (starts OTP flow for new session) ──
app.post('/api/accounts/add', requireAuth, async (req, res) => {
  const { phone, name } = req.body
  if (!phone || !name) return res.status(400).json({ error: 'phone and name required' })
  try {
    const { TelegramClient } = require('telegram')
    const { StringSession } = require('telegram/sessions')
    const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    const result = await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone)
    _pendingClient = { client, phoneCodeHash: result.phoneCodeHash, phone, accountName: name }
    res.json({ ok: true, phoneCodeHash: result.phoneCodeHash })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

// ── MULTI-ACCOUNT: verify OTP and save new account ──
app.post('/api/accounts/verify', requireAuth, async (req, res) => {
  const { phone, code, phoneCodeHash, password } = req.body
  if (!_pendingClient) return res.status(400).json({ error: 'No pending session' })
  try {
    const { client, accountName } = _pendingClient
    try {
      await client.invoke(new (require('telegram/tl').Api.auth.SignIn)({
        phoneNumber: phone, phoneCodeHash, phoneCode: code
      }))
    } catch(e) {
      if (e.message.includes('SESSION_PASSWORD_NEEDED') && password) {
        const { computeCheck } = require('telegram/Password')
        const pwd = await client.invoke(new (require('telegram/tl').Api.account.GetPassword)())
        const check = await computeCheck(pwd, password)
        await client.invoke(new (require('telegram/tl').Api.auth.CheckPassword)({ password: check }))
      } else throw e
    }
    const sessionStr = client.session.save()
    sessions[accountName] = sessionStr
    _pendingClient = null
    log('New account added: ' + accountName)
    res.json({ ok: true, name: accountName })
  } catch(e) { res.status(500).json({ error: e.message }) }
})


// ── FORUM TOPICS (for supergroups with topics enabled) ──
app.get('/api/chat/topics/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json([])
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const { Api } = require('telegram/tl')
    log('Loading topics for: ' + req.params.id)
    const result = await client.invoke(new Api.channels.GetForumTopics({
      channel: entity,
      offsetDate: 0,
      offsetId: 0,
      offsetTopic: 0,
      limit: 100
    }))
    log('Topics result: ' + JSON.stringify(result?.topics?.length || 0) + ' topics')
    const topics = (result.topics || []).map(t => ({
      id: t.id,
      title: t.title,
      unread: t.unreadCount || 0,
      unreadMentions: t.unreadMentionsCount || 0,
      topMessage: t.topMessage,
      lastMsg: result.messages?.find(m => m.id === t.topMessage)?.message?.slice(0,80) || '',
      date: result.messages?.find(m => m.id === t.topMessage)?.date || null,
      iconEmoji: t.iconEmojiId ? '📌' : null,
      isClosed: t.closed || false,
    }))
    res.json(topics)
  } catch(e) {
    log('topics error for ' + req.params.id + ': ' + e.message)
    res.json([])
  }
})

// ── TOPIC MESSAGES ──
app.get('/api/chat/topics/:id/:topicId/messages', requireAuth, async (req, res) => {
  if (!_session) return res.json([])
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    const { Api } = require('telegram/tl')
    const result = await client.invoke(new Api.messages.GetReplies({
      peer: entity,
      msgId: parseInt(req.params.topicId),
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      limit: 80,
      maxId: 0,
      minId: 0,
      hash: BigInt(0)
    }))
    const msgs = (result.messages || [])
      .reverse()
      .map(m => ({ id: m.id, text: m.message, fromMe: m.out, date: m.date }))
      .filter(m => m.text)
    res.json(msgs)
  } catch(e) {
    log('topic messages: ' + e.message)
    res.json([])
  }
})

// ── SEND TO TOPIC ──
app.post('/api/chat/topics/:id/:topicId/send', requireAuth, async (req, res) => {
  const { text } = req.body
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id, req.query.username)
    await client.sendMessage(entity, {
      message: text,
      replyTo: parseInt(req.params.topicId)
    })
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})



// ── SEND FILE / IMAGE ──
app.post('/api/chat/send-file', requireAuth, (req, res) => {
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const boundary = req.headers['content-type']?.split('boundary=')[1]
      if (!boundary) return res.status(400).json({ error: 'No boundary' })
      const body = Buffer.concat(chunks)
      const bodyStr = body.toString('binary')

      // Parse multipart manually
      const parts = bodyStr.split('--' + boundary)
      let chatId = '', username = '', fileBuffer = null, fileName = 'file', fileMime = 'application/octet-stream'

      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/)
          const fileMatch = part.match(/filename="([^"]+)"/)
          const mimeMatch = part.match(/Content-Type: ([^\r\n]+)/)
          const headerEnd = part.indexOf('\r\n\r\n')
          if (headerEnd === -1) continue
          const value = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'))

          if (fileMatch) {
            fileName = fileMatch[1]
            fileMime = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream'
            fileBuffer = Buffer.from(value, 'binary')
          } else if (nameMatch?.[1] === 'chatId') chatId = value.trim()
          else if (nameMatch?.[1] === 'username') username = value.trim()
        }
      }

      if (!fileBuffer || !chatId) return res.status(400).json({ error: 'Missing file or chatId' })
      const client = await getClient()
      const entity = await resolveEntity(client, chatId, username || undefined)
      await client.sendFile(entity, {
        file: fileBuffer,
        caption: fileName,
        forceDocument: !fileMime.startsWith('image/')
      })
      log('File sent: ' + fileName + ' to ' + chatId)
      res.json({ ok: true })
    } catch(e) {
      log('send-file: ' + e.message)
      res.status(500).json({ error: e.message })
    }
  })
})


// ── DOWNLOAD MEDIA from TG message ──
const mediaCache = {}
app.get('/api/chat/media/:chatId/:msgId', (req, res, next) => {
  // Allow auth via query param for img src tags
  const t = req.headers['x-auth-token'] || req.query.token || req.query.t
  if (t !== VALID_TOKEN) return res.status(401).send()
  next()
}, async (req, res) => {
  const key = req.params.chatId + '_' + req.params.msgId
  if (mediaCache[key]) {
    res.setHeader('Content-Type', mediaCache[key].mime)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(mediaCache[key].buf)
  }
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.chatId), 8000, 'resolve')
    const msgs = await withTimeout(
      client.getMessages(entity, { ids: [parseInt(req.params.msgId)] }),
      10000, 'getMessages'
    )
    const msg = msgs && msgs[0]
    if (!msg || !msg.media) return res.status(404).send()

    // Download photo — try multiple methods
    let buffer = null
    const methods = [
      () => client.downloadMedia(msg, { thumb: -1 }),
      () => client.downloadMedia(msg, {}),
      () => client.downloadMedia(msg.media, {}),
    ]
    for (const method of methods) {
      try {
        buffer = await withTimeout(method(), 20000, 'download')
        if (buffer && buffer.length > 0) break
      } catch(e) { log('download attempt failed: ' + e.message) }
    }

    if (!buffer || !buffer.length) {
      log('media: all download methods failed for msg ' + req.params.msgId)
      return res.status(404).send()
    }

    const buf = Buffer.from(buffer)
    let mime = 'image/jpeg'
    if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png'
    else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif'

    mediaCache[key] = { buf, mime }
    log('media ok: ' + req.params.msgId + ' ' + buf.length + ' bytes')
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buf)
  } catch(e) {
    log('media error ' + req.params.msgId + ': ' + e.message)
    res.status(404).send()
  }
})


// ── USER ONLINE STATUS ──
app.get('/api/chat/status/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json({ status: 'unknown' })
  try {
    const client = await withTimeout(getClient(), 8000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.id, req.query.username), 6000, 'resolve')

    // getEntity returns user with status field directly
    const user = await withTimeout(client.getEntity(entity), 5000, 'getEntity')
    const status = user?.status
    log('User status for ' + req.params.id + ': ' + JSON.stringify(status))

    if (!status) return res.json({ status: 'recently' })

    const cn = status.className || status._ || ''
    if (cn.includes('Online')) return res.json({ status: 'online' })
    if (cn.includes('Recently')) return res.json({ status: 'recently' })
    if (cn.includes('LastWeek')) return res.json({ status: 'last week' })
    if (cn.includes('LastMonth')) return res.json({ status: 'last month' })
    if (cn.includes('Offline')) {
      const was = status.wasOnline
      if (was) {
        const diff = Math.floor(Date.now()/1000) - was
        if (diff < 60)   return res.json({ status: 'just now' })
        if (diff < 3600) return res.json({ status: Math.floor(diff/60) + 'm ago' })
        if (diff < 86400)return res.json({ status: Math.floor(diff/3600) + 'h ago' })
      }
      return res.json({ status: 'offline' })
    }
    // Default — privacy hidden
    return res.json({ status: 'recently' })
  } catch(e) {
    log('status error: ' + e.message)
    res.json({ status: 'unknown' })
  }
})


// ── AI SUMMARIZE ──
app.post('/api/ai/summarize', requireAuth, async (req,res) => {
  const { messages, contactName } = req.body
  if (!messages?.length) return res.json({ summary: 'No messages to summarize.' })
  try {
    const thread = messages.slice(-30).map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role:'system', content:'You are a concise sales analyst. Summarize Telegram sales conversations.' },
        { role:'user', content:'Summarize this conversation with '+contactName+' in 3-5 bullet points:\n'+thread }
      ],
      max_tokens: 200, temperature: 0.3
    }, { headers: { Authorization:'Bearer '+GROQ_KEY, 'Content-Type':'application/json' }})
    res.json({ summary: r.data.choices[0].message.content.trim() })
  } catch(e) { res.json({ summary: 'Error: '+e.message }) }
})

// ── AI EXTRACT LEAD INFO ──
app.post('/api/ai/extract', requireAuth, async (req,res) => {
  const { messages, contactName } = req.body
  if (!messages?.length) return res.json({ info: {} })
  try {
    const thread = messages.slice(-40).map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role:'system', content:'Extract lead info from sales chat. Return ONLY JSON, no markdown.' },
        { role:'user', content:'Extract from this conversation:\n'+thread+'\n\nReturn JSON with: company, project_type, stage, pain_points, budget_hint, timeline, services_interested, next_action' }
      ],
      max_tokens: 300, temperature: 0.1
    }, { headers: { Authorization:'Bearer '+GROQ_KEY, 'Content-Type':'application/json' }})
    let raw = r.data.choices[0].message.content.trim().replace(/```json|```/g,'')
    try { res.json({ info: JSON.parse(raw) }) }
    catch { res.json({ info: { raw } }) }
  } catch(e) { res.json({ info: { error: e.message } }) }
})

app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))




// Start Telegram event listener for incoming messages
async function startTGListener() {
  let NewMessage
  try { NewMessage = require('telegram/events/NewMessage').NewMessage } catch {}
  if (!NewMessage) { try { NewMessage = require('telegram/events').NewMessage } catch {} }
  if (!NewMessage) { log('TG listener: NewMessage not found, skipping'); return }
  try {
    const { TelegramClient } = require('telegram')
    const { StringSession } = require('telegram/sessions')
    const lc = new TelegramClient(new StringSession(_session), TG_API_ID, TG_API_HASH, { connectionRetries: 2 })
    await lc.connect()
    lc.addEventHandler(async (ev) => {
      try { if (ev.message?.message) log('📨 ' + ev.message.chatId) } catch {}
    }, new NewMessage({}))
    log('✅ TG listener active')
  } catch(e) { log('TG listener: ' + e.message) }
}

// Start listener after session is loaded
setTimeout(startTGListener, 3000)

// ── STATIC FILES — must be LAST, after all API routes ──
app.use(express.static(require('path').join(__dirname, 'dist')))
app.get('*', (req,res) => res.sendFile(require('path').join(__dirname,'dist','index.html')))

// Prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason) => {
  log('Unhandled rejection: ' + (reason?.message || reason))
})
process.on('uncaughtException', (err) => {
  log('Uncaught exception: ' + err.message)
  // Don't exit — keep server running
})

app.listen(PORT, () => log('Listening on port ' + PORT))
