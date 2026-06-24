require('dotenv').config()
const express = require('express')
const path = require('path')
const axios = require('axios')
const app = express()
const PORT = process.env.PORT || 3002

app.use(express.json())
// static files served after API routes (see bottom)

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

// JWT Secret: Nên lưu trong file .env, nếu không có sẽ tự động random mỗi lần restart (an toàn hơn static token)
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex')

// Tạm thời mã hóa password cứng lúc khởi động để bảo vệ trên bộ nhớ.
// TODO: Tốt nhất nên lưu trực tiếp chuỗi hash (đã mã hóa) vào file .env thay vì plaintext.
const USERS = [
  { u: 'Leon',  hash: bcrypt.hashSync(process.env.LEON_PASSWORD  || 'coincu123', 10) },
  { u: 'admin', hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'coincu2026', 10) },
]

// Rate Limiting: Chống brute-force (tối đa 5 lần thử mỗi 15 phút từ 1 IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: false, message: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' }
})
const TG_API_ID   = parseInt(process.env.TG_API_ID   || '23444646')
const TG_API_HASH =          process.env.TG_API_HASH  || '83816a4a3a3006b19549b2ba782acae0'
const GROQ_KEY    =          process.env.GROQ_API_KEY || ''
const SB_URL      =          process.env.SUPABASE_URL  || 'https://rgtodxxuwdusaacipokt.supabase.co'
const SB_KEY      =          process.env.SUPABASE_KEY  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU'
const SBH         = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

const logs = []
function log(m) { const l='['+new Date().toLocaleTimeString('vi-VN')+'] '+m; console.log(l); logs.push(l); if(logs.length>200)logs.shift() }
log('🚀 Coincu CRM Chat v16 — 20260619_071242')

function requireAuth(req,res,next){
  const t=req.headers['x-auth-token']||req.query.token
  if(!t)return res.status(401).json({error:'Unauthorized: Missing token'})
  try {
    const decoded = jwt.verify(t, JWT_SECRET)
    req.user = decoded
    return next()
  } catch(err) {
    return res.status(401).json({error:'Unauthorized: Invalid or expired token'})
  }
}

// ── LOGIN ──
app.post('/api/login', loginLimiter, (req,res)=>{
  const {username,password}=req.body
  const user = USERS.find(v=>v.u===username)
  if(user && bcrypt.compareSync(password, user.hash)) {
    const token = jwt.sign({ username: user.u }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ok:true,token})
  } else {
    res.json({ok:false,message:'Sai username hoặc password'})
  }
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
  if (!_session || _session.length <= 10) return res.json({ connected: false })
  try {
    const client = await getClient()
    await withTimeout(client.getMe(), 5000, 'ping')
    res.json({ connected: true })
  } catch(e) {
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      _session = ''
      res.json({ connected: false, error: 'Session expired' })
    } else {
      res.json({ connected: true, warning: e.message })
    }
  }
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

// ── CHAT STATUS ──
app.get('/api/chat/status/:id', requireAuth, async (req,res) => {
  if (!_session) return res.json({ status: '' })
  try {
    const client = await getClient()
    const peer = await resolveEntity(client, req.params.id)
    if (!peer) return res.json({ status: '' })
    
    // Only fetch for User
    if (peer.className !== 'User') {
       return res.json({ status: '' })
    }

    const { Api } = require('telegram')
    // We can use getEntity to fetch user info
    const users = await client.invoke(new Api.users.GetUsers({
      id: [peer]
    }))
    const user = users[0]
    
    if (!user || !user.status) return res.json({ status: '' })

    const s = user.status
    const c = s.className
    let text = ''
    if (c === 'UserStatusOnline') text = 'online'
    else if (c === 'UserStatusRecently') text = 'last seen recently'
    else if (c === 'UserStatusLastWeek') text = 'last seen within a week'
    else if (c === 'UserStatusLastMonth') text = 'last seen within a month'
    else if (c === 'UserStatusOffline') {
      if (!s.wasOnline) text = 'last seen recently'
      else {
        const diff = Math.floor(Date.now()/1000) - s.wasOnline
        if (diff < 60) text = 'last seen just now'
        else if (diff < 3600) text = `last seen ${Math.floor(diff/60)} minutes ago`
        else if (diff < 86400) text = `last seen ${Math.floor(diff/3600)} hours ago`
        else text = `last seen ${Math.floor(diff/86400)} days ago`
      }
    } else {
      text = 'last seen recently' // fallback for UserStatusEmpty
    }
    
    res.json({ status: text })
  } catch(e) {
    log('chatStatus: '+e.message)
    res.json({ status: '' })
  }
})

// ── CHAT LIST ──
app.get('/api/chat/list', requireAuth, async (req,res) => {
  if (!_session) return res.json([])
  try {
    const client = await getClient()
    const limit = parseInt(req.query.limit) || 40
    const offsetDate = parseInt(req.query.offsetDate) || 0
    const offsetId = parseInt(req.query.offsetId) || 0
    const offsetPeerId = req.query.offsetPeer || null
    
    const opts = { limit }
    if (offsetDate > 0) opts.offsetDate = offsetDate
    if (offsetId > 0) opts.offsetId = offsetId
    if (offsetPeerId) opts.offsetPeer = await resolveEntity(client, offsetPeerId)
    
    const dialogs = await withTimeout(client.getDialogs(opts), 60000, 'getDialogs')
    const chats = dialogs.map(d => ({
      id: d.id.toString(),
      name: d.title || d.name || 'Unknown',
      lastMsg: d.message?.message?.slice(0,80) || '',
      unread: d.unreadCount || 0,
      date: d.message?.date,
      isUser: d.isUser,
      isGroup: d.isGroup || false,
      isChannel: d.isChannel || false,
      isForum: d.entity?.forum === true || false,
      isPinned: d.pinned || false,
      msgId: d.message?.id || 0,
      username: d.entity?.username || null,
      accessHash: d.entity?.accessHash?.toString() || null,
      memberCount: d.entity?.participantsCount || d.entity?.membersCount || null,
    }))
    res.json(chats)
  } catch(e) { 
    log('chatList: '+e.message); 
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      _session = ''
      return res.status(401).json({ error: 'AUTH_FAILED' })
    }
    res.json([]) 
  }
})

function formatStatus(status) {
  if (!status) return ''
  const c = status.className
  if (c === 'UserStatusOnline') return 'online'
  if (c === 'UserStatusRecently') return 'last seen recently'
  if (c === 'UserStatusLastWeek') return 'last seen within a week'
  if (c === 'UserStatusLastMonth') return 'last seen within a month'
  if (c === 'UserStatusOffline') {
    if (!status.wasOnline) return 'last seen recently'
    const diff = Math.floor(Date.now()/1000) - status.wasOnline
    if (diff < 60) return 'last seen just now'
    if (diff < 3600) return `last seen ${Math.floor(diff/60)} minutes ago`
    if (diff < 86400) return `last seen ${Math.floor(diff/3600)} hours ago`
    return `last seen ${Math.floor(diff/86400)} days ago`
  }
  return 'last seen recently'
}

// ── GLOBAL SEARCH ──
app.get('/api/telegram/search', requireAuth, async (req, res) => {
  if (!_session) return res.json([])
  const q = req.query.q
  if (!q) return res.json([])
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    
    let resultContacts = { chats: [], users: [] }
    try {
      resultContacts = await client.invoke(new Api.contacts.Search({
        q: q,
        limit: 10
      }))
    } catch(err) {
      log('contacts.Search error: ' + err.message)
    }
    
    let resultMessages = { messages: [], chats: [], users: [] }
    try {
      resultMessages = await client.invoke(new Api.messages.SearchGlobal({
        q: q,
        limit: 20,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0
      }))
    } catch(err) {
      log('messages.SearchGlobal error: ' + err.message)
    }
    
    const mapped = []
    const seenIds = new Set()

    const addEntity = (d, isMsg = false, msgText = '') => {
      if (!d) return
      const idStr = d.id.toString()
      if (seenIds.has(idStr)) return
      seenIds.add(idStr)
      
      mapped.push({
        id: idStr,
        name: d.title ? d.title : (d.firstName ? (d.firstName + (d.lastName ? ' ' + d.lastName : '')).trim() : (d.username || 'Unknown')),
        lastMsg: msgText || 'Found in global search',
        unread: 0,
        date: null,
        isUser: d.className === 'User',
        isGroup: !!d.participantsCount || d.className === 'Chat',
        isChannel: d.broadcast || false,
        username: d.username || null,
        isForum: d.forum || false,
      })
    }

    for (const d of (resultContacts.chats || [])) addEntity(d)
    for (const d of (resultContacts.users || [])) addEntity(d)
      
    const msgChats = new Map((resultMessages.chats || []).map(c => [c.id.toString(), c]))
    const msgUsers = new Map((resultMessages.users || []).map(u => [u.id.toString(), u]))

    for (const m of (resultMessages.messages || [])) {
       let peerId = m.peerId?.channelId || m.peerId?.chatId || m.peerId?.userId
       if (!peerId) continue
       peerId = peerId.toString()
       const peerEntity = msgChats.get(peerId) || msgUsers.get(peerId)
       if (peerEntity) {
         addEntity(peerEntity, true, m.message)
       }
    }
    
    res.json(mapped)
  } catch(e) {
    log('global search error: ' + e.message)
    res.json([])
  }
})

// ── CHAT MEMBERS ──
app.get('/api/chat/members/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json({error: 'No session'})
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.id)
    
    // Some channels throw CHAT_ADMIN_REQUIRED if you request participants.
    const participants = await client.getParticipants(entity, { limit: 200 })
    
    const members = participants.map(p => ({
      id: p.id.toString(),
      name: (p.firstName ? p.firstName + (p.lastName ? ' ' + p.lastName : '') : (p.title || 'Unknown')).trim(),
      username: p.username || null,
      isBot: p.bot || false,
      isPremium: p.premium || false,
      status: p.status ? formatStatus(p.status) : 'last seen recently'
    }))
    
    res.json({ ok: true, members })
  } catch(e) {
    if (e.message.includes('CHAT_ADMIN_REQUIRED')) {
      return res.status(403).json({ error: 'Unable to load members due to Telegram permission limits.' })
    }
    log('members error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── FULL PROFILE ──
app.get('/api/chat/profile/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json({error: 'No session'})
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    const entity = await resolveEntity(client, req.params.id)
    
    // Attempt to get full user or full chat
    let full = null
    try {
      if (entity.className === 'User') {
        full = await client.invoke(new Api.users.GetFullUser({ id: entity }))
      } else if (entity.className === 'Chat' || entity.className === 'Channel') {
        full = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id })) // For channels: channels.GetFullChannel
      }
    } catch(err) {
      // If messages.GetFullChat fails, try channels.GetFullChannel
      if (entity.className === 'Channel') {
        try {
          full = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }))
        } catch(e) { log('Full channel fetch error: ' + e.message) }
      } else {
        log('Full profile fetch error: ' + err.message)
      }
    }
    
    res.json({ ok: true, full })
  } catch(e) {
    log('profile error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── SHARED MEDIA ──
app.get('/api/chat/shared_media/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json({error: 'No session'})
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    const entity = await resolveEntity(client, req.params.id)
    
    const type = req.query.type || 'photos'
    let filter = new Api.InputMessagesFilterPhotoVideo()
    if (type === 'photos') filter = new Api.InputMessagesFilterPhotos()
    if (type === 'videos') filter = new Api.InputMessagesFilterVideo()
    if (type === 'files') filter = new Api.InputMessagesFilterDocument()
    if (type === 'links') filter = new Api.InputMessagesFilterUrl()
    if (type === 'gifs') filter = new Api.InputMessagesFilterGif()
    
    const msgs = await client.getMessages(entity, { filter, limit: 30 })
    
    const results = msgs.map(m => {
      const isPhoto = m.media?.className === 'MessageMediaPhoto'
      const isDoc   = m.media?.className === 'MessageMediaDocument'
      const isVideo = isDoc && m.media?.document?.mimeType?.startsWith('video/')
      return {
        id: m.id,
        text: m.message || '',
        date: m.date,
        hasMedia: !!m.media,
        isPhoto,
        isVideo,
        isDoc: isDoc && !isVideo,
        fileName: m.media?.document?.attributes?.find(a=>a.className==='DocumentAttributeFilename')?.fileName,
        fileSize: m.media?.document?.size
      }
    })
    
    res.json({ ok: true, media: results })
  } catch(e) {
    log('shared media error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── MEDIA DOWNLOAD ──
app.get('/api/chat/media/:chatId/:msgId', requireAuth, async (req, res) => {
  if (!_session) return res.status(500).json({error: 'Media backend not connected'})
  try {
    const client = await getClient()
    const entity = await resolveEntity(client, req.params.chatId)
    const msgId = parseInt(req.params.msgId)

    const messages = await client.getMessages(entity, { ids: [msgId] })
    if (!messages || messages.length === 0 || !messages[0]) {
      return res.status(404).json({error: 'Message not found'})
    }
    const message = messages[0]

    if (!message.media) {
      return res.status(404).json({error: 'No media found in message'})
    }

    const buffer = await client.downloadMedia(message, { workers: 1 })
    if (!buffer) {
      return res.status(500).json({error: 'Failed to download media buffer'})
    }

    res.set('Content-Type', 'image/jpeg') // Or application/octet-stream if unknown
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch(e) {
    log('media download error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})


// ── MESSAGES ──
app.get('/api/chat/messages/:id', requireAuth, async (req,res) => {
  if (!_session) return res.json([])
  const t0 = Date.now()
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.id, req.query.username), 8000, 'resolveEntity')
    const maxId = parseInt(req.query.maxId) || 0
    const opts = { limit: 40 }
    if (maxId > 0) opts.offsetId = maxId
    const msgs = await withTimeout(client.getMessages(entity, opts), 12000, 'getMessages')
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
  } catch(e) { 
    log('messages error: '+e.message+' ('+(Date.now()-t0)+'ms)'); 
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      _session = ''
      return res.status(401).json({ error: 'AUTH_FAILED' })
    }
    res.json([]) 
  }
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
  const { contactName, lastMessage, messages, stage, notes, instruction, chatId, topicId } = req.body
  const history = (messages||[]).slice(-40)
  const lastClientMsg = (lastMessage||'').trim()
  const leonLines = history.filter(m=>m.fromMe).map(m=>m.text).filter(Boolean)
  const leonSaid  = leonLines.join(' | ')
  const thread    = history.map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n')

  const normInstruction = instruction ? instruction.toLowerCase().normalize('NFC') : null;
  log('[AI Suggest Request Payload]: ' + JSON.stringify({
    rawCommand: instruction,
    normalizedCommand: normInstruction,
    contactName: contactName,
    chatId: chatId,
    topicId: topicId,
    messagesCount: history?.length || 0
  }, null, 2))

  log('AI suggest — last: "' + lastClientMsg + '" stage: ' + stage)

  // Local intent fallback for simple Vietnamese commands if AI fails
  function localFallback(cmd) {
    if (!cmd) return null;
    const norm = cmd.toLowerCase().normalize('NFC');
    
    if (norm.includes("bao nhiêu dự án") || norm.includes("mấy dự án")) {
      log('AI Suggest Fallback: Used local fallback for "bao nhiêu dự án" intent');
      return [
        { label: "Option 1", text: "How many projects are you currently working on?" },
        { label: "Option 2", text: "Are you currently handling one project or multiple projects?" },
        { label: "Option 3", text: "How many projects are you managing at the moment?" }
      ];
    }

    if (norm.includes("dự án web3") || norm.includes("dự web3") || norm.includes("nào khác")) {
      log('AI Suggest Fallback: Used local fallback for "other Web3 projects" intent');
      return [
        { label: "Option 1", text: "Are you currently supporting any other Web3 projects?" },
        { label: "Option 2", text: "Just curious, are you working with any other Web3 projects at the moment?" },
        { label: "Option 3", text: "Besides this, are you currently helping any other crypto/Web3 projects?" }
      ];
    }

    if (norm.includes("group chung") || norm.includes("hợp tác") || norm.includes("cơ hội")) {
      log('AI Suggest Fallback: Used local fallback for "shared group collaboration" intent');
      return [
        { label: "Option 1", text: "Hey, I noticed we're in the same group, so I wanted to reach out and see if there's any potential collaboration." },
        { label: "Option 2", text: "Hi, I saw we're both in the same community. Would be nice to connect and explore if there's any way to collaborate." },
        { label: "Option 3", text: "Hey, I noticed we share the same group here. Are you open to a quick chat about possible collaboration?" }
      ];
    }

    if (norm.includes("ý tưởng") || norm.includes("trước đi") || norm.includes("chia sẻ ý tưởng")) {
      log('AI Suggest Fallback: Used local fallback for "share idea first" intent');
      return [
        { label: "Option 1", text: "Sure, please share your idea first." },
        { label: "Option 2", text: "Can you share your idea first so I can understand it better?" },
        { label: "Option 3", text: "Please send me your idea first, then I'll see how we can align." }
      ];
    }

    if (norm.includes("example") || norm.includes("done") || norm.includes("đã làm") || norm.includes("case study")) {
      log('AI Suggest Fallback: Used local fallback for "share examples" intent');
      return [
        { label: "Option 1", text: "Could you share some examples of what you've done before?" },
        { label: "Option 2", text: "Can you send me a few examples of your previous work?" },
        { label: "Option 3", text: "Would you mind sharing some examples or case studies you've done?" }
      ];
    }

    if (norm.includes("link dự án") || norm.includes("cho xin link") || norm.includes("gửi link")) {
      log('AI Suggest Fallback: Used local fallback for "project link" intent');
      return [
        { label: "Option 1", text: "Could you share the link to your project?" },
        { label: "Option 2", text: "Do you mind sending over your project link so I can take a look?" },
        { label: "Option 3", text: "Please drop your project link here when you have a moment." }
      ];
    }

    if (norm.includes("commission") || norm.includes("hoa hồng") || norm.includes("giới thiệu")) {
      log('AI Suggest Fallback: Used local fallback for "commission" intent');
      return [
        { label: "Option 1", text: "We offer a 20% commission per closed deal if you refer clients to us." },
        { label: "Option 2", text: "Just so you know, we provide a 20% commission for any successful referrals." },
        { label: "Option 3", text: "If you introduce any clients, we offer a 20% referral fee per closed deal." }
      ];
    }
    
    // If no explicit keywords match, return null to allow proper API error handling
    return null;
  }

  if (!GROQ_KEY) return res.json({ ok: false, error: "AI API key not configured." })

  const SYSTEM_PROMPT = `You are Coincu's BD Sales Assistant.

${instruction ? `=== PRIORITY 1: USER INSTRUCTION (CRITICAL) ===
You MUST follow this exact instruction above all else. This is the direct instruction for WHAT TO SAY to the customer.
Instruction: "${instruction}"

CRITICAL RULES FOR INSTRUCTION:
- If instruction asks a question, your replies MUST ask that question naturally.
- If instruction asks to offer commission/referral, mention 20% commission per closed deal.
- If instruction asks to mention CMC, mention Coincu + CMC News softly.
- If instruction says "don't sell" or similar, ONLY qualify with one soft question, do not pitch.
- Preserve speaker direction: "bạn/your/anh/chị" means the CUSTOMER. "tôi/mình/I/me" means YOU (the sender).
- You are a translator and BD assistant. You MUST support ANY free-text instruction in ANY language (English, Vietnamese, or mixed "Vietglish"). Translate the core intent of the command into natural English Telegram replies.
- OUTPUT THE REPLY IN ENGLISH unless the conversation context is entirely in Vietnamese.
- Even if the command is not in the examples, you MUST process it and generate 2-3 options.
- DO NOT invent wrong context like podcasts, partnerships, rate cards, or budgets unless the instruction explicitly asks for it or it exists in chat.
- DO NOT reply to the instruction itself. Create a message intended for the customer.
- If intent confidence is low, ask a clarification internally or generate a safe direct question based on the command, DO NOT fall back to generic sales pitches.

VIETNAMESE INTENT EXAMPLES:
- "tôi thấy bạn trong group chung và muốn nhắn tìm cơ hội hợp tác" -> intent is "shared group outreach collaboration".
- "bạn đang làm bao nhiêu dự án" -> intent is "ask how many projects customer is working on".
- "cho tôi link dự án của bạn" -> intent is "ask customer to share their project link".
- "chia sẻ ý tưởng của bạn trước đi" -> intent is "ask customer to share their idea first".
- "bạn có thể đưa tôi example những gì bạn đã done không?" -> intent is "ask customer for examples of their past work".
- "bạn có hỗ trợ dự án web3 nào khác không" -> intent is "ask if customer supports other Web3 projects".
- "offer commission nếu họ giới thiệu khách" -> intent is "mention 20% commission per closed deal".
=========================================
` : ''}
=== PRIORITY 2: SCENARIO & BD KNOWLEDGE (Use ONLY to support the instruction, do not override it) ===
Identify customer type: Project, Agency, Broker, Founder, Marketing, BD, Investor, Service Provider.
Coincu.com is a crypto/Web3 international news website. Services: PR article, sponsored content, organic article, banner ads.
Coincu can support distribution to CoinMarketCap News (CMC News) which improves credibility.

BEHAVIOR RULES:
- Short, natural, casual-professional, Telegram-style messages (1-3 sentences max).
- NO email-style long paragraphs.
- Do not hard sell too early. Ask only ONE clear open question.

=== TASK: MULTIPLE SUGGESTIONS ===
Based on the instruction and context, generate exactly 2 to 3 distinct reply options.
Each option MUST be short, natural, Telegram-style, and copy/send ready.

OUTPUT FORMAT:
Return EXACTLY this JSON structure.
{
  "normalizedIntent": "Your internal translation/understanding of the user instruction (e.g. 'Ask the customer to share their project link'). If no instruction, summarize the BD goal.",
  "suggestions": [
    { "label": "Soft", "text": "The actual message text" },
    { "label": "Value", "text": "Another text" }
  ]
}
`

  try {
    const userPrompt = [
      '=== PRIORITY 3: CONVERSATION CONTEXT ===',
      `Chat ID: ${chatId || 'Unknown'}, Topic ID: ${topicId || 'None'}`,
      history.slice(-40).map(m=>(m.fromMe?'Leon':'Client')+': '+m.text).join('\n') || '(no messages yet)',
      '',
      'Client: ' + contactName,
      'CRM Stage: ' + (stage||'Contacted'),
      notes ? 'Notes: ' + notes : null,
      '',
      'Client just said: "' + lastClientMsg + '"',
      'Leon already said (do not repeat): ' + (leonSaid || '(nothing)'),
      '',
      'First, output "normalizedIntent" to confirm you understand the direction. Then generate 2 to 3 diverse, short, Telegram-style reply options in JSON format.'
    ].filter(Boolean).join('\n')

    const axios = require('axios')
    
    const makeGroqCall = async (modelName) => {
      return axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      }, { headers: { 'Authorization': 'Bearer ' + GROQ_KEY }});
    };

    let r;
    try {
      r = await makeGroqCall("llama-3.3-70b-versatile");
    } catch(e) {
      log("Groq 70b failed (" + (e.response?.data?.error?.message || e.message) + "). Failing over to 8b-instant...");
      r = await makeGroqCall("llama-3.1-8b-instant");
    }

    let rawText = r.data.choices[0].message.content;
    // Strip markdown formatting if the LLM wraps the JSON in ```json ... ```
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(rawText)
      if (parsed.normalizedIntent) {
        log('AI Intent: ' + parsed.normalizedIntent)
      }

      // Safety parsing: find ANY array in the parsed JSON object
      let safeSuggestions = null;
      
      // If the LLM returned an array directly
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'object' && parsed[0].text) {
          safeSuggestions = parsed;
        } else if (typeof parsed[0] === 'string') {
          safeSuggestions = parsed.map((val, i) => ({ label: `Option ${i + 1}`, text: val }));
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Look for any array inside the object (e.g., suggestions, replyOptions, messages, output, etc.)
        for (const key of Object.keys(parsed)) {
          const val = parsed[key];
          if (Array.isArray(val) && val.length > 0) {
            if (typeof val[0] === 'object' && val[0].text) {
              safeSuggestions = val;
              break;
            } else if (typeof val[0] === 'string') {
              safeSuggestions = val.map((v, i) => ({ label: `Option ${i + 1}`, text: v }));
              break;
            }
          }
        }
      }

      if (!safeSuggestions || !Array.isArray(safeSuggestions)) {
        // Collect string values from the flat object, excluding normalizedIntent
        const stringValues = Object.entries(parsed)
          .filter(([key, val]) => key !== 'normalizedIntent' && typeof val === 'string' && val.length > 3)
          .map(([_, val], i) => ({ label: `Option ${i + 1}`, text: val }));
        
        if (stringValues.length > 0) {
          safeSuggestions = stringValues;
          log('AI Safety Parse: Extracted ' + safeSuggestions.length + ' flat string suggestions.');
        } else {
          safeSuggestions = null;
        }
      }

      log('[AI Suggest Debug]', {
        rawCommand: instruction,
        normalizedCommand: normInstruction,
        detectedIntent: parsed.normalizedIntent || null,
        requestPayload: userPrompt,
        apiError: null,
        fallbackUsed: false,
        finalSuggestions: safeSuggestions
      });

      res.json({ 
        ok: true, 
        suggestions: safeSuggestions || null,
        error: !safeSuggestions ? (instruction ? "Failed to generate custom reply. Please try rephrasing your command." : "Failed to generate contextual replies. Please provide a custom instruction.") : null,
        source: "fresh",
        normalizedIntent: parsed.normalizedIntent || null,
        finalPromptPreview: userPrompt
      })
    } catch(err) {
      log('Groq JSON parse error: ' + err.message + ' | Raw: ' + rawText)
      if (instruction) {
        const fallback = localFallback(instruction);
        
        log('[AI Suggest Debug]', {
          rawCommand: instruction,
          normalizedCommand: normInstruction,
          detectedIntent: null,
          requestPayload: userPrompt,
          apiError: err.message,
          fallbackUsed: !!fallback,
          finalSuggestions: fallback || null
        });

        if (fallback) {
          res.json({ ok: true, suggestions: fallback, source: "local_fallback", fallbackUsed: true, apiError: err.message });
        } else {
          res.json({ ok: false, error: "Failed to generate custom reply. Please try rephrasing your command.", source: "fallback_error", apiError: err.message });
        }
      } else {
        res.json({ ok: false, error: "AI failed to generate contextual replies. Please try adding a custom instruction.", source: "fallback_error", apiError: err.message });
      }
    }
  } catch(e) {
    log('groq suggest error: ' + (e.response?.data?.error?.message || e.message))
    if (instruction) {
      const fallback = localFallback(instruction);

      log('[AI Suggest Debug]', {
        rawCommand: instruction,
        normalizedCommand: normInstruction,
        detectedIntent: null,
        requestPayload: userPrompt || null,
        apiError: e.response?.data?.error?.message || e.message,
        fallbackUsed: !!fallback,
        finalSuggestions: fallback || null
      });

      if (fallback) {
        res.json({ ok: true, suggestions: fallback, source: "local_fallback", fallbackUsed: true, apiError: e.message });
      } else {
        res.json({ ok: false, error: "Failed to generate custom reply. Please try rephrasing your command.", source: "fallback_error", apiError: e.message });
      }
    } else {
      res.json({ ok: false, error: "AI failed to generate contextual replies. Please try adding a custom instruction.", source: "fallback_error", apiError: e.message });
    }
  }
})


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


// ── EDIT MESSAGE ──
app.post('/api/chat/edit', requireAuth, async (req,res) => {
  if(!_session) return res.status(401).json({error:'Not connected'})
  const {chatId, msgId, text, username} = req.body
  if(!chatId||!msgId||!text) return res.status(400).json({error:'Missing fields'})
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolve')
    const {Api} = require('telegram/tl')
    await withTimeout(
      client.invoke(new Api.messages.EditMessage({
        peer: entity,
        id: parseInt(msgId),
        message: text,
        noWebpage: true,
      })),
      10000, 'editMessage'
    )
    log('Message edited: ' + msgId)
    res.json({ok:true})
  } catch(e) {
    log('edit error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})

app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))

// ── MARK CHAT AS READ ──
app.post('/api/chat/read', requireAuth, async (req,res) => {
  if(!_session) return res.status(401).json({error:'Not connected'})
  const { chatId, username, maxId } = req.body
  if(!chatId) return res.status(400).json({error:'Missing chatId'})
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolve')
    
    // Telegram markAsRead logic
    // Using simple client.markAsRead which handles most cases
    await withTimeout(client.markAsRead(entity, { maxId }), 5000, 'markAsRead')
    log('Marked as read: ' + chatId)
    res.json({ ok: true })
  } catch(e) {
    log('markRead error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})




// ── SSE REALTIME STREAM ──
let sseClients = []

app.get('/api/chat/stream', (req, res) => {
  // Use token from query because EventSource doesn't support custom headers easily
  const token = req.query.token
  if (!token) return res.status(401).end()
  try {
    const jwt = require('jsonwebtoken')
    jwt.verify(token, JWT_SECRET)
  } catch(e) {
    return res.status(401).end()
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders() // flush the headers to establish SSE

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

  sseClients.push(res)

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res)
  })
})

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`
  sseClients.forEach(client => client.write(payload))
}

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
    
    // Also listen for deleted messages
    let DeletedMessage
    try { DeletedMessage = require('telegram/events/DeletedMessage').DeletedMessage } catch {}

    lc.addEventHandler(async (ev) => {
      try { 
        if (ev.message) {
          const m = ev.message
          log('📨 ' + m.chatId)
          
          // Format message to match client.getMessages structure
          const msgObj = {
            id: m.id,
            chatId: m.chatId ? m.chatId.toString() : null,
            text: m.message || '',
            date: m.date,
            fromMe: m.out,
            isReply: !!m.replyTo,
            replyToMsgId: m.replyTo?.replyToMsgId,
            action: m.action ? true : false,
            // Try to resolve sender info if possible
            senderId: m.senderId ? m.senderId.toString() : null,
            topicId: (m.replyTo?.forumTopic ? m.replyTo.replyToMsgId : m.replyTo?.replyToTopId) || null
          }
          
          if (m.media) {
            msgObj.hasMedia = true
            msgObj.mediaType = m.media.className
          }

          broadcastSSE({ type: 'new_message', message: msgObj })
        }
      } catch(err) {
        log('SSE broadcast error: ' + err.message)
      }
    }, new NewMessage({}))
    
    if (DeletedMessage) {
      lc.addEventHandler(async (ev) => {
        try {
          if (ev.deletedIds && ev.deletedIds.length > 0) {
             broadcastSSE({ type: 'delete_messages', ids: ev.deletedIds, chatId: ev.chatId ? ev.chatId.toString() : null })
          }
        } catch(e) {}
      }, new DeletedMessage({}))
    }

    log('✅ TG listener active with SSE')
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
