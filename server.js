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
Coincu is a crypto and Web3 media company. We provide content publication, PR, and CoinMarketCap News visibility services.
We have executed 130+ successful marketing campaigns for global crypto projects.

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
    const userPrompt = [
      'Conversation with ' + contactName + ':',
      thread,
      '',
      'Client last message: "' + lastClientMsg + '"',
      'What Leon already said in this chat (DO NOT use any of these phrases): ' + (leonSaid || 'nothing'),
      '',
      'Write ONE reply as Leon. Hard rules:',
      '1. Max 1 sentence only',
      '2. ONLY use prices from this list: Press release $240, Sponsored $390, Organic $520, Listicle $1650 (coincu.com) | CMC News Boost $1500 standalone',
      '3. NEVER say $855 or any price not in the list above',
      '4. CMC News Boost = $1500, there is no other CMC price',
      '5. Reply directly to: "' + lastClientMsg + '"',
      '6. No greeting, no sign-off, no long explanation'
    ].filter(Boolean).join('\n')

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a sales assistant. Follow the user instructions exactly. Never invent prices. Only use the exact prices given.' },
        { role: 'user',   content: userPrompt }
      ],
      max_tokens: 80,
      temperature: 0.35
    }, { headers: { Authorization: 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' }})

    let s = r.data.choices[0].message.content.trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(Leon:|Reply:|Sure,|Of course,|Great,|Absolutely,)/i, '')
      .split('\n')[0].trim()

    log('AI reply: "' + s.slice(0,80) + '"')
    res.json({ suggestion: s })
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
