require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const os = require('os')
const axios = require('axios')
const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const multer = require('multer')
const upload = multer({ dest: os.tmpdir() })

const app = express()
const PORT = process.env.PORT || 3002

const MEDIA_CACHE_DIR = path.join(__dirname, '.media_cache')
if (!fs.existsSync(MEDIA_CACHE_DIR)) {
  fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true })
}

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
  if(!t)return res.status(401).json({ok: false, error:'TOKEN_EXPIRED'})
  try {
    const decoded = jwt.verify(t, JWT_SECRET)
    req.user = decoded
    return next()
  } catch(err) {
    return res.status(401).json({ok: false, error:'TOKEN_EXPIRED'})
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
  if (!_session) return res.json({ok: false, error: 'TG_SESSION_EXPIRED'})
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
      status: p.status ? formatStatus(p.status) : 'last seen recently',
      accessHash: p.accessHash ? p.accessHash.toString() : undefined
    }))
    
    res.json({ ok: true, members })
  } catch(e) {
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      _session = ''
      return res.json({ok: false, error: 'TG_SESSION_EXPIRED'})
    }
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

// ── ALLOWED REACTIONS ──
app.get('/api/telegram/available-reactions', requireAuth, async (req, res) => {
  if (!_session) return res.status(401).json({ ok: false, error: 'Not connected' });
  const { chatId } = req.query;
  if (!chatId) return res.status(400).json({ ok: false, error: 'Missing chatId' });
  
  try {
    const client = await getClient();
    const { Api } = require('telegram/tl');
    
    // Resolve input peer explicitly to know exact type (User, Chat, Channel)
    let inputPeer;
    try {
      inputPeer = await client.getInputEntity(chatId);
    } catch(e) {
      console.log(`[Reactions] getInputEntity failed for ${chatId}:`, e.message);
      return res.status(400).json({ ok: false, code: "PEER_MISSING", error: "Could not resolve Telegram peer" });
    }

    console.log(`[Reactions] Resolved peer type for ${chatId}:`, inputPeer.className);
    
    // If it's a user, all normal reactions are allowed
    if (inputPeer.className === 'InputPeerUser' || inputPeer.className === 'InputPeerSelf') {
      return res.json({ ok: true, source: 'telegram', chatId, allowAll: true, reactionsEnabled: true, reactions: [], fullChatFound: true });
    }
    
    let full = null;
    let methodUsed = '';
    try {
      if (inputPeer.className === 'InputPeerChat') {
        methodUsed = 'messages.GetFullChat';
        full = await client.invoke(new Api.messages.GetFullChat({ chatId: inputPeer.chatId }));
      } else if (inputPeer.className === 'InputPeerChannel') {
        methodUsed = 'channels.GetFullChannel';
        const channel = new Api.InputChannel({ channelId: inputPeer.channelId, accessHash: inputPeer.accessHash });
        full = await client.invoke(new Api.channels.GetFullChannel({ channel }));
      }
    } catch(e) {
      console.log(`[Reactions] ${methodUsed} failed for ${chatId}:`, e.message);
    }

    if (!full || !full.fullChat) {
      console.log(`[Reactions] fullChat missing for ${chatId}.`);
      return res.status(404).json({ ok: false, code: 'FULL_CHAT_MISSING', error: 'Could not fetch Telegram full chat info', fullChatFound: false });
    }

    const availableReactions = full.fullChat.availableReactions;
    // If the field is absent, all reactions are allowed.
    if (!availableReactions) {
      return res.json({ ok: true, source: 'telegram', chatId, allowAll: true, reactionsEnabled: true, reactions: [], fullChatFound: true });
    }

    if (availableReactions.className === 'ChatReactionsAll') {
      return res.json({ ok: true, source: 'telegram', chatId, allowAll: true, reactionsEnabled: true, reactions: [], fullChatFound: true });
    } else if (availableReactions.className === 'ChatReactionsNone') {
      return res.json({ ok: true, source: 'telegram', chatId, allowAll: false, reactionsEnabled: false, reactions: [], fullChatFound: true });
    } else if (availableReactions.className === 'ChatReactionsSome') {
      const emoticons = availableReactions.reactions.map(r => {
        if (r.className === 'ReactionCustomEmoji') {
          const docId = r.documentId ? r.documentId.toString() : '';
          return { type: 'custom', customEmojiId: docId, thumbnailUrl: `/api/telegram/custom-emoji/${docId}` };
        }
        return r.emoticon;
      }).filter(Boolean);
      return res.json({ ok: true, source: 'telegram', chatId, allowAll: false, reactionsEnabled: true, reactions: emoticons, fullChatFound: true });
    }
    
    return res.status(400).json({ ok: false, code: 'UNKNOWN_REACTIONS_FORMAT', error: 'Unknown availableReactions format', fullChatFound: true });
  } catch(e) {
    console.log(`[Reactions] Error fetching for ${chatId}:`, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
})

// ── SHARED MEDIA ──
const formatMediaResult = (m) => {
  const isPhoto = m.media?.className === 'MessageMediaPhoto'
  const isDoc   = m.media?.className === 'MessageMediaDocument'
  const isVideo = isDoc && m.media?.document?.mimeType?.startsWith('video/')
  const webpageUrl = m.media?.webpage?.url || m.media?.url
  const webpageTitle = m.media?.webpage?.title
  
  return {
    id: m.id,
    text: m.message || '',
    date: m.date,
    hasMedia: !!m.media,
    isPhoto,
    isVideo,
    isDoc: isDoc && !isVideo,
    fileName: m.media?.document?.attributes?.find(a=>a.className==='DocumentAttributeFilename')?.fileName,
    fileSize: m.media?.document?.size ? Number(m.media.document.size) : 0,
    webpageUrl,
    webpageTitle
  }
};

const matchesMediaFilter = (m, filterType) => {
  const isPhoto = m.media?.className === 'MessageMediaPhoto'
  const isDoc   = m.media?.className === 'MessageMediaDocument'
  const isVideo = isDoc && m.media?.document?.mimeType?.startsWith('video/')
  if (filterType === 'media') return isPhoto || isVideo
  if (filterType === 'photos') return isPhoto
  if (filterType === 'videos') return isVideo
  if (filterType === 'files') return isDoc && !isVideo
  if (filterType === 'links') return !!(m.media?.webpage?.url || m.media?.url)
  if (filterType === 'gifs') return m.media?.document?.mimeType === 'video/mp4' // simplistic
  return false
};
const sharedMediaHandler = async (req, res) => {
  if (!_session) return res.json({error: 'No session'})
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    
    const chatIdStr = req.params.id || req.query.chatId;
    if (!chatIdStr) return res.json({ok: false, error: 'Missing chatId'})
    
    const entity = await resolveEntity(client, chatIdStr)
    
    const type = req.query.type || 'photos'
    const limit = parseInt(req.query.limit) || 30
    const offsetId = parseInt(req.query.offsetId || req.query.cursor) || 0
    const fromUser = req.query.fromUser || req.query.userId
    const accessHash = req.query.accessHash
    const topicIdStr = req.query.topicId
    const topicId = topicIdStr ? parseInt(topicIdStr) : null
    
    let filter = new Api.InputMessagesFilterPhotoVideo()
    if (type === 'media') filter = new Api.InputMessagesFilterPhotoVideo()
    if (type === 'photos') filter = new Api.InputMessagesFilterPhotos()
    if (type === 'videos') filter = new Api.InputMessagesFilterVideo()
    if (type === 'files') filter = new Api.InputMessagesFilterDocument()
    if (type === 'links') filter = new Api.InputMessagesFilterUrl()
    if (type === 'gifs') filter = new Api.InputMessagesFilterGif()
    
    const params = { filter, limit }
    if (offsetId > 0) params.offsetId = offsetId
    if (fromUser) {
      try {
        if (accessHash && accessHash !== 'undefined') {
          params.fromUser = new Api.InputPeerUser({ userId: BigInt(fromUser), accessHash: BigInt(accessHash) })
        } else {
          params.fromUser = await resolveEntity(client, fromUser)
        }
      } catch (err) {
        log(`shared media: could not resolve fromUser ${fromUser}`)
        return res.json({ ok: false, error: 'SENDER_NOT_FOUND', message: 'Could not resolve sender for group media' })
      }
    }
    


    let msgs;
    if (topicId) {
      log(`[Shared Media Debug] Topic specific search: topicId=${topicId} filter=${filter.className}`)
      const searchReq = new Api.messages.Search({
        peer: entity,
        q: "",
        filter,
        limit,
        offsetId,
        fromId: params.fromUser,
        topMsgId: topicId,
        hash: BigInt(0)
      })
      const result = await client.invoke(searchReq)
      msgs = result.messages || []
    } else {
      msgs = await client.getMessages(entity, params)
    }

    const results = msgs.map(formatMediaResult)
    const nextOffsetId = results.length > 0 ? results[results.length - 1].id : null
    const hasMore = results.length === limit

    log(`[Shared Media Debug] chatId=${chatIdStr} userId=${fromUser} topicId=${topicId} mediaType=${type} offsetId=${offsetId} loadedCount=${results.length} hasMore=${hasMore} source=telegram_history`)
    
    res.json({ ok: true, items: results, hasMore, nextCursor: nextOffsetId, source: 'telegram_history' })

  } catch(e) {
    if (req.query.fromUser || req.query.userId || req.query.topicId) {
      log(`shared media: ${e.errorMessage || e.message} caught. Falling back to manual history scan...`)
      try {
        let currentOffsetId = parseInt(req.query.offsetId || req.query.cursor) || 0;
        let matched = [];
        let fetchedMsgs;
        let attempts = 0;
        const limit = parseInt(req.query.limit) || 30;
        const type = req.query.type || 'photos';
        const fromUser = req.query.fromUser || req.query.userId;
        const topicIdStr = req.query.topicId;
        const topicId = topicIdStr ? parseInt(topicIdStr) : null;
        
        // Use the outer client variable
        const client = await getClient();
        const entity = await resolveEntity(client, req.params.id || req.query.chatId);
        
        while (matched.length < limit && attempts < 5) {
            const fetchParams = { limit: 100, offsetId: currentOffsetId };
            if (topicId) fetchParams.replyTo = topicId;
            
            fetchedMsgs = await client.getMessages(entity, fetchParams);
            if (!fetchedMsgs || fetchedMsgs.length === 0) break;
            
            for (const m of fetchedMsgs) {
                let matchSender = true;
                if (fromUser) {
                  const sId = m.senderId ? m.senderId.toString() : (m.fromId?.userId ? m.fromId.userId.toString() : '');
                  matchSender = sId === fromUser.toString();
                }
                
                if (matchSender && matchesMediaFilter(m, type)) {
                    matched.push(m);
                }
            }
            currentOffsetId = fetchedMsgs[fetchedMsgs.length - 1].id;
            attempts++;
        }
        
        const results = matched.map(formatMediaResult).slice(0, limit);
        const hasMore = fetchedMsgs && fetchedMsgs.length === 100;
        const nextCursor = results.length > 0 ? results[results.length - 1].id : currentOffsetId;
        
        log(`[Shared Media Debug] fallback manual scan: chatId=${req.params.id || req.query.chatId} topicId=${topicId} userId=${fromUser} mediaType=${type} returnedCount=${results.length} hasMore=${hasMore}`)
        
        res.json({ ok: true, items: results, hasMore, nextCursor, source: 'loaded_messages' });
      } catch (innerErr) {
        log('shared media fallback error: ' + innerErr.message)
        res.json({ ok: false, error: innerErr.message, code: innerErr.errorMessage || innerErr.code || 'API_ERROR' })
      }
    } else {
      log('shared media error: ' + e.message)
      res.json({ ok: false, error: e.message, code: e.errorMessage || e.code || 'API_ERROR' })
    }
  }
};

app.get('/api/chat/shared_media/:id', requireAuth, sharedMediaHandler);
app.get('/api/telegram/shared-media', requireAuth, sharedMediaHandler);


// ── PROFILE PHOTO DOWNLOAD ──
app.get('/api/chat/photo/:id', requireAuth, async (req, res) => {
  if (!_session) return res.status(500).json({error: 'Media backend not connected'})
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    
    const userIdStr = req.params.id;
    const username = req.query.username;
    const accessHashStr = req.query.accessHash;
    
    let entity = await resolveEntity(client, userIdStr, username);
    
    if (typeof entity === 'string' || typeof entity === 'number') {
      if (accessHashStr) {
        entity = new Api.InputUser({
          userId: BigInt(userIdStr),
          accessHash: BigInt(accessHashStr)
        });
      } else if (username) {
        try {
          entity = await client.getEntity(username);
        } catch(e) {}
      }
    }

    const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
    if (!buffer || buffer.length === 0) {
      log(`[Avatar Debug] userId=${userIdStr} username=${username} status=no_photo`)
      return res.status(404).json({error: 'No photo found'})
    }
    
    log(`[Avatar Debug] userId=${userIdStr} username=${username} status=success size=${buffer.length}`)
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch(e) {
    log(`[Avatar Debug] userId=${req.params.id} error="${e.message}"`)
    res.status(500).json({error: e.message})
  }
})

// ── MEDIA DOWNLOAD ──
app.get(['/api/chat/media/:chatId/:msgId', '/api/telegram/media/audio'], requireAuth, async (req, res) => {
  if (!_session) return res.status(500).json({error: 'Media backend not connected'})
  try {
    const msgId = parseInt(req.query.messageId || req.params.msgId)
    const chatId = req.query.chatId || req.params.chatId
    const fileId = req.query.fileId || ''
    const thumbStr = req.query.thumb
    const isThumb = thumbStr !== undefined
    const thumbParam = isThumb ? parseInt(thumbStr) : undefined
    
    // Check cache first
    const cachePath = path.join(MEDIA_CACHE_DIR, `${chatId}_${msgId}_${fileId}${isThumb ? '_thumb_' + thumbStr : ''}`)
    if (fs.existsSync(cachePath)) {
      log(`[Media Cache Hit] chatId=${chatId} msgId=${msgId} thumb=${thumbStr}`)
      if (req.path.includes('/audio')) {
        res.set('Content-Type', 'audio/ogg')
      } else {
        res.set('Content-Type', 'image/jpeg') 
      }
      res.set('Cache-Control', 'public, max-age=31536000')
      return res.sendFile(cachePath)
    }

    const client = await getClient()
    const entity = await resolveEntity(client, chatId)

    const messages = await client.getMessages(entity, { ids: [msgId] })
    if (!messages || messages.length === 0 || !messages[0]) {
      return res.status(404).json({error: 'Message not found'})
    }
    const message = messages[0]

    if (!message.media) {
      return res.status(404).json({error: 'No media found in message'})
    }

    log(`[Media Cache Miss] Downloading chatId=${chatId} msgId=${msgId} thumb=${thumbStr}`)
    const buffer = await client.downloadMedia(message, { workers: 1, thumb: thumbParam })
    if (!buffer) {
      return res.status(500).json({error: 'Failed to download media buffer'})
    }

    // Write to cache
    fs.writeFileSync(cachePath, buffer)

    if (req.path.includes('/audio')) {
      res.set('Content-Type', 'audio/ogg')
    } else {
      res.set('Content-Type', 'image/jpeg')
    }
    res.set('Cache-Control', 'public, max-age=31536000')

    res.send(buffer)
  } catch(e) {
    log('media download error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})


function parseReactions(results) {
  if (!results) return [];
  return results.map(r => {
    const isCustom = r.reaction?.className === 'ReactionCustomEmoji';
    
    let emojiStr = '';
    if (typeof r.reaction === 'string') emojiStr = r.reaction;
    else if (r.reaction?.emoticon) emojiStr = r.reaction.emoticon;
    else if (r.reaction?.className === 'ReactionEmoji') emojiStr = r.reaction.emoticon;

    if (isCustom) {
      const documentId = r.reaction.documentId ? r.reaction.documentId.toString() : '';
      return {
        type: 'custom',
        customEmojiId: documentId,
        thumbnailUrl: `/api/telegram/custom-emoji/${documentId}`,
        count: r.count || 0,
        chosen: typeof r.chosenOrder === 'number' || r.chosen === true
      };
    }

    const emojiMap = { 'Like': '👍', 'Laugh': '😂', 'Heart': '❤️', 'Fire': '🔥', 'Pray': '🙏', 'Smile': '🥰', 'Dislike': '👎', 'Cool': '😎' };
    const finalEmoji = emojiMap[emojiStr] || emojiStr || '';
    if (!finalEmoji) return null;
    
    return {
      type: 'emoji',
      emoticon: finalEmoji,
      count: r.count || 0,
      chosen: typeof r.chosenOrder === 'number' || r.chosen === true
    };
  }).filter(Boolean);
}

function parseRecentReactions(recentReactions) {
  if (!recentReactions) return [];
  return recentReactions.map(rr => {
    const isCustom = rr.reaction?.className === 'ReactionCustomEmoji';
    
    let emojiStr = '';
    if (typeof rr.reaction === 'string') emojiStr = rr.reaction;
    else if (rr.reaction?.emoticon) emojiStr = rr.reaction.emoticon;
    else if (rr.reaction?.className === 'ReactionEmoji') emojiStr = rr.reaction.emoticon;

    if (isCustom) {
      const documentId = rr.reaction.documentId ? rr.reaction.documentId.toString() : '';
      return {
        peerId: rr.peerId?.userId?.toString() || rr.peerId?.channelId?.toString() || null,
        type: 'custom',
        customEmojiId: documentId,
        thumbnailUrl: `/api/telegram/custom-emoji/${documentId}`
      };
    }

    const emojiMap = { 'Like': '👍', 'Laugh': '😂', 'Heart': '❤️', 'Fire': '🔥', 'Pray': '🙏', 'Smile': '🥰', 'Dislike': '👎', 'Cool': '😎' };
    const finalEmoji = emojiMap[emojiStr] || emojiStr || '';
    if (!finalEmoji) return null;
    
    return {
      peerId: rr.peerId?.userId?.toString() || rr.peerId?.channelId?.toString() || null,
      type: 'emoji',
      emoticon: finalEmoji
    };
  }).filter(Boolean);
}

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
          senderUsername: m.sender?.username || null,
          senderAccessHash: m.sender?.accessHash ? m.sender.accessHash.toString() : null,
          reactions: parseReactions(m.reactions?.results) || [],
          recentReactions: parseRecentReactions(m.reactions?.recentReactions) || [],
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
    res.status(500).json({ error: e.message }) 
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

// ── SEND TOPIC MESSAGE ──
app.post('/api/chat/topics/:chatId/:topicId/send', requireAuth, async (req,res) => {
  const { chatId, topicId } = req.params
  const { text, username } = req.body
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient()
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolveEntity')
    await withTimeout(client.sendMessage(entity, { message: text, replyTo: parseInt(topicId) }), 10000, 'sendMessage')
    log('Sent to topic '+chatId+'/'+topicId+': '+text.slice(0,40))
    res.json({ ok: true })
  } catch(e) { log('send topic: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── SEND MEDIA ──
app.post('/api/chat/send-media', requireAuth, upload.single('file'), async (req, res) => {
  const { chatId, topicId, caption, username } = req.body
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  
  try {
    const client = await getClient()
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolveEntity')
    
    // GramJS can upload from file path
    const fileParams = {
      file: req.file.path,
      caption: caption || '',
    }
    if (topicId) fileParams.replyTo = parseInt(topicId)
    
    await withTimeout(client.sendFile(entity, fileParams), 30000, 'sendFile')
    
    // Cleanup temp file
    fs.unlinkSync(req.file.path)
    
    log(`Sent media to ${chatId}${topicId ? '/'+topicId : ''}`)
    res.json({ ok: true })
  } catch(e) { 
    log('send-media: '+e.message); 
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message }) 
  }
})

// ── AI VOICE TRANSCRIPTION (Groq Whisper) ──
app.post('/api/ai/transcribe-voice', requireAuth, async (req,res) => {
  const { chatId, messageId, fileId } = req.body
  if (!chatId || !messageId) return res.status(400).json({ error: 'Missing chatId or messageId' })

  try {
    const cachePath = path.join(MEDIA_CACHE_DIR, `${chatId}_${messageId}_${fileId || ''}`)
    let buffer;
    if (fs.existsSync(cachePath)) {
      buffer = fs.readFileSync(cachePath)
    } else {
      const client = await getClient()
      const entity = await resolveEntity(client, chatId)
      const messages = await client.getMessages(entity, { ids: [parseInt(messageId)] })
      if (!messages || messages.length === 0 || !messages[0]) {
        return res.status(404).json({error: 'Message not found'})
      }
      const message = messages[0]
      if (!message.media) return res.status(404).json({error: 'No media found'})
      buffer = await client.downloadMedia(message, { workers: 1 })
      if (!buffer) return res.status(500).json({error: 'Failed to download media'})
      fs.writeFileSync(cachePath, buffer)
    }

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', buffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');

    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: 'Bearer ' + GROQ_KEY }
    })
    
    res.json({ ok: true, text: response.data.text, language: response.data.language })
  } catch(e) {
    log('transcribe error: ' + (e.response?.data?.error?.message || e.message))
    res.status(500).json({ error: e.response?.data?.error?.message || e.message })
  }
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

CRITICAL RULES FOR INSTRUCTION (VIETNAMESE/MIXED LANGUAGE SUPPORT):
1. STEP 1 - INTENT TRANSLATION: Understand the core intent of the instruction.
2. STEP 2 - NATURAL ENGLISH: Write the final reply entirely in natural English.
3. ABSOLUTE BAN ON LITERAL COPYING: NEVER copy Vietnamese words directly into the English reply. For example, if instruction says "hướng chúng ta có thể collaborate với bạn", do NOT output "collaborate với bạn". Translate the full intent to "how we can collaborate".
4. NO INVENTED CONTEXT: DO NOT invent concepts like "prediction event", "podcast", "rate card", "budget", "CMC", or "marketing campaign" unless they are EXPLICITLY mentioned in the instruction or the chat history.
5. PRESERVE SPEAKER DIRECTION: "tôi/mình" = You (the Coincu sender). "bạn/anh/chị" = The Customer.
6. If the intent is just to ask a question (e.g. "chia sẻ ý tưởng trước đi"), just ask the question naturally. Do not wrap it in a sales pitch.

VIETNAMESE INTENT EXAMPLES:
- "bạn đang làm bao nhiêu dự án" -> intent is "ask how many projects customer is working on".
- "cho tôi link dự án của bạn" -> intent is "ask customer to share their project link".
- "chia sẻ ý tưởng của bạn trước đi" -> intent is "ask customer to share their idea first".
- "bạn có thể đưa tôi example những gì bạn đã done không?" -> intent is "ask customer for examples of their past work".
- "khi đó tôi sẽ biết được hướng chúng ta có thể collaborate với bạn" -> intent is "ask for details to see how we can collaborate".
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

=== HANDLING VOICE TRANSCRIPTS ===
If you see "[Voice Transcript]: <text>" or "[Voice Message]" in the history:
1. Auto-detect the language of the transcript.
2. If it is NOT English, translate/understand its meaning in English before drafting the reply.
3. Your generated replies MUST respond directly to the meaning/content of the transcript (unless the USER INSTRUCTION overrides it).
4. DO NOT generate replies based on the literal placeholder words "Voice" or "Voice Message".
5. If the text says "(Transcript not available)", inform the user to transcribe it first or reply with a generic response.

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
    
    const makeGroqCall = async (modelName, promptText) => {
      return axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: promptText }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      }, { headers: { 'Authorization': 'Bearer ' + GROQ_KEY }});
    };

    let safeSuggestions = null;
    let detectedIntent = null;
    let apiErrorStr = null;
    let validationResult = 'success';
    
    const hasVietnameseLiteral = (text, instructionStr) => {
      if (!instructionStr) return false;
      const ignoreWords = ['bạn', 'có', 'không', 'tôi', 'làm', 'và', 'để', 'nhưng', 'của', 'là', 'cho', 'với', 'những', 'gì', 'đã'];
      const instWords = instructionStr.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !ignoreWords.includes(w));
      const textLower = text.toLowerCase();
      // If 2 or more non-trivial Vietnamese words from the instruction appear sequentially in the English text, flag it.
      for (let i = 0; i < instWords.length - 1; i++) {
        if (textLower.includes(instWords[i] + ' ' + instWords[i+1])) return true;
      }
      return false;
    };

    const hasHallucination = (text, instructionStr, chatHistoryStr) => {
      const blacklist = ['prediction event', 'podcast', 'rate card', 'budget', 'marketing campaign', 'cmc', 'commission'];
      const combinedContext = ((instructionStr||'') + ' ' + (chatHistoryStr||'')).toLowerCase();
      const textLower = text.toLowerCase();
      
      for (const bad of blacklist) {
        if (textLower.includes(bad) && !combinedContext.includes(bad)) return true;
      }
      return false;
    };

    let retryCount = 0;
    const maxRetries = 2;
    let currentPrompt = userPrompt;

    while (retryCount <= maxRetries) {
      let r;
      try {
        r = await makeGroqCall("llama-3.3-70b-versatile", currentPrompt);
      } catch(e) {
        log("Groq 70b failed (" + (e.response?.data?.error?.message || e.message) + "). Failing over to 8b-instant...");
        try {
           r = await makeGroqCall("llama-3.1-8b-instant", currentPrompt);
        } catch(e2) {
           apiErrorStr = e2.message;
           break; // Both failed, break out of retry loop
        }
      }

      let rawText = r?.data?.choices?.[0]?.message?.content;
      if (!rawText) {
        apiErrorStr = "Empty response from Groq";
        break;
      }
      
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

      try {
        const parsed = JSON.parse(rawText);
        detectedIntent = parsed.normalizedIntent || detectedIntent;
        
        let tempSuggestions = null;
        if (Array.isArray(parsed) && parsed.length > 0) {
          tempSuggestions = typeof parsed[0] === 'string' ? parsed.map((val, i) => ({ label: `Option ${i + 1}`, text: val })) : parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
          for (const key of Object.keys(parsed)) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              tempSuggestions = typeof parsed[key][0] === 'string' ? parsed[key].map((val, i) => ({ label: `Option ${i + 1}`, text: val })) : parsed[key];
              break;
            }
          }
          if (!tempSuggestions) {
            const stringValues = Object.entries(parsed).filter(([key, val]) => key !== 'normalizedIntent' && typeof val === 'string' && val.length > 3).map(([_, val], i) => ({ label: `Option ${i + 1}`, text: val }));
            if (stringValues.length > 0) tempSuggestions = stringValues;
          }
        }

        if (tempSuggestions && tempSuggestions.length > 0) {
          const combinedHistory = history.slice(-40).map(m=>m.text).join(' ');
          let failedReason = null;
          
          for (const sug of tempSuggestions) {
            if (!sug.text) continue;
            if (hasVietnameseLiteral(sug.text, instruction)) {
              failedReason = "DO NOT copy Vietnamese words into the final reply. Translate the intent to English only.";
              break;
            }
            if (hasHallucination(sug.text, instruction, combinedHistory)) {
              failedReason = "DO NOT invent contexts like 'prediction event' or 'podcast' unless explicitly mentioned.";
              break;
            }
          }

          if (failedReason && retryCount < maxRetries) {
            validationResult = 'failed_retry_' + retryCount;
            log(`[AI Suggest Validation Failed]: ${failedReason}. Retrying...`);
            currentPrompt += `\n\n[SYSTEM FEEDBACK]: Your previous response was invalid. ${failedReason} Fix it and return valid English options.`;
            retryCount++;
            continue; 
          }
          
          safeSuggestions = tempSuggestions;
          if (failedReason) validationResult = 'failed_forced_accept';
          break;
        } else {
          throw new Error("No suggestions found in JSON");
        }
      } catch(err) {
        log('Groq JSON parse error: ' + err.message + ' | Raw: ' + rawText);
        if (retryCount < maxRetries) {
           currentPrompt += `\n\n[SYSTEM FEEDBACK]: Your previous response was not valid JSON. Please return strictly valid JSON.`;
           retryCount++;
           continue;
        } else {
           apiErrorStr = "JSON parse error after retries: " + err.message;
           break;
        }
      }
    }

    const fallback = !safeSuggestions && instruction ? localFallback(instruction) : null;

    log('[AI Suggest Debug]', {
      rawCommand: instruction,
      normalizedCommand: normInstruction,
      detectedIntent: detectedIntent,
      chatContextUsed: !!history.length,
      finalEnglishOptions: safeSuggestions || fallback || null,
      validationResult: validationResult,
      fallbackUsed: !!fallback,
      apiError: apiErrorStr
    });

    if (safeSuggestions) {
      res.json({ 
        ok: true, 
        suggestions: safeSuggestions,
        source: "fresh",
        normalizedIntent: detectedIntent,
        finalPromptPreview: currentPrompt
      })
    } else if (fallback) {
      res.json({
        ok: true,
        suggestions: fallback,
        source: "local_fallback",
        error: "API failed, used local fallback"
      })
    } else {
      res.json({
        ok: false,
        error: apiErrorStr || (instruction ? "Failed to generate custom reply. Please try rephrasing your command." : "Failed to generate contextual replies. Please provide a custom instruction.")
      })
    }
  } catch(e) {
    log('AI Suggest Error: ' + e.message)
    res.json({ ok: false, error: e.message })
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

// ── GET MESSAGES AROUND TARGET ──
app.get('/api/telegram/messages/around', requireAuth, async (req, res) => {
  if (!_session) return res.status(401).json({ error: 'Not connected' })
  const { chatId, messageId, username, topicId } = req.query
  if (!chatId || !messageId) return res.status(400).json({ error: 'Missing params' })
  
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolveEntity')
    
    // limitBefore = 30, limitAfter = 30 -> total 60
    const limit = 60;
    const addOffset = -30; // Negative offset to get messages after the messageId
    
    const opts = {
      offsetId: parseInt(messageId),
      addOffset: addOffset,
      limit: limit
    };
    
    // If it's a topic message and entity is a Forum
    if (topicId) {
      opts.replyToMsgId = parseInt(topicId);
    }
    
    const msgs = await withTimeout(client.getMessages(entity, opts), 12000, 'getMessagesAround');
    
    if (!msgs || msgs.length === 0) {
      return res.status(404).json({ ok: false, code: "PINNED_MESSAGE_UNAVAILABLE", error: "Pinned message is unavailable or deleted" });
    }
    
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
          senderUsername: m.sender?.username || null,
          senderAccessHash: m.sender?.accessHash ? m.sender.accessHash.toString() : null,
          reactions: parseReactions(m.reactions?.results) || [],
          recentReactions: parseRecentReactions(m.reactions?.recentReactions) || [],
          topicId: m.replyTo?.replyToMsgId || null,
          isPinned: !!m.pinned
        }
      })
      
    res.json({ ok: true, messages: results, targetMessageId: messageId, source: "telegram_history" });
  } catch (e) {
    log('messages around error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))

// ── SEND REACTION ──
app.post(['/api/chat/react', '/api/telegram/messages/react'], requireAuth, async (req,res) => {
  if(!_session) return res.status(401).json({error:'Not connected'})
  const {chatId, messageId, emoji, username, topicId} = req.body
  
  const missing = [];
  if (!chatId) missing.push("chatId");
  if (!messageId) missing.push("messageId");
  if (emoji === undefined) missing.push("emoji"); // emoji can be null, but must be defined in payload
  
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, code: "MISSING_FIELDS", missing });
  }
  
  // Backend validation against allowedReactions (if we can fetch it synchronously here)
  // Actually, to avoid slowing down the reaction, we just try to send it and handle REACTION_INVALID gracefully.

  
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolve')
    const {Api} = require('telegram/tl')
    
    let reactionArr = [];
    const parseEmojiParam = (e) => {
      if (typeof e === 'object' && e !== null) {
        if (e.type === 'custom') return new Api.ReactionCustomEmoji({ documentId: BigInt(e.customEmojiId) });
      } else if (typeof e === 'string') {
        return new Api.ReactionEmoji({ emoticon: e });
      }
      return null;
    };

    if (Array.isArray(emoji)) {
      reactionArr = emoji.map(parseEmojiParam).filter(Boolean);
    } else if (emoji) {
      const parsed = parseEmojiParam(emoji);
      if (parsed) reactionArr = [parsed];
    }
    
    log(`[Reaction] Debug: chatId=${chatId}, messageId=${messageId}, resolvedPeer=${entity?.className}, peerId=${entity?.id || entity?.channelId || entity?.userId}`);
    log(`[Reaction] Request to Telegram: messageId=${messageId}, emoji payload=${JSON.stringify(emoji)}, api_payload=${JSON.stringify(reactionArr)}`);
    
    const tgRes = await withTimeout(
      client.invoke(new Api.messages.SendReaction({
        peer: entity,
        msgId: parseInt(messageId),
        reaction: reactionArr,
        addToRecent: true
      })),
      10000, 'sendReaction'
    )
    log(`Reaction sent: ${messageId} ${JSON.stringify(emoji)}. Response: ${JSON.stringify(tgRes, null, 2)}`)
    res.json({ok:true, tgRes})
  } catch(e) {
    if (e.message.includes('MESSAGE_NOT_MODIFIED')) {
      log(`Reaction not modified: ${messageId} ${JSON.stringify(emoji)}`);
      return res.json({ok: true, unchanged: true});
    }
    if (e.message.includes('REACTION_INVALID')) {
      log(`Reaction invalid: ${messageId} ${JSON.stringify(emoji)}`);
      return res.status(400).json({ok: false, code: 'REACTION_INVALID', error: e.message});
    }
    log('react error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})

// ── GET PINNED MESSAGE ──
app.get('/api/telegram/messages/pinned', requireAuth, async (req,res) => {
  if(!_session) return res.status(401).json({error:'Not connected'})
  const {chatId, username, topicId} = req.query
  if(!chatId) return res.status(400).json({error:'Missing chatId'})
  try {
    const client = await withTimeout(getClient(), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolve')
    const {Api} = require('telegram/tl')
    
    // Telegram search with pinned filter
    const result = await client.invoke(new Api.messages.Search({
      peer: entity,
      q: '',
      filter: new Api.InputMessagesFilterPinned(),
      minDate: 0,
      maxDate: 0,
      offsetId: 0,
      addOffset: 0,
      limit: 1,
      maxId: 0,
      minId: 0,
      hash: 0n,
      topMsgId: topicId ? parseInt(topicId) : undefined
    }))
    
    if (result.messages && result.messages.length > 0) {
      const m = result.messages[0]
      const isPhoto = m.media?.className === 'MessageMediaPhoto'
      const isDoc = m.media?.className === 'MessageMediaDocument'
      const isVideo = isDoc && m.media.document?.attributes?.some?.(a=>a.className==='DocumentAttributeVideo')
      const isAudio = isDoc && (m.media.document?.mimeType?.startsWith('audio/') || m.media.document?.attributes?.some?.(a=>a.className==='DocumentAttributeAudio'))
      
      let text = m.message || ''
      if (!text) {
        if (isPhoto) text = '📷 Photo'
        else if (isVideo) text = '🎥 Video'
        else if (isAudio) text = '🎤 Voice Message'
        else if (isDoc) text = '📎 Document'
      }
      
      res.json({ok: true, pinnedMessage: {
        id: m.id,
        text,
        date: m.date
      }})
    } else {
      res.json({ok: true, pinnedMessage: null})
    }
  } catch(e) {
    log('pinned error: ' + e.message)
    res.status(500).json({error: e.message})
  }
})


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
    
    // Listen for raw reaction updates
    let Raw;
    try { Raw = require('telegram/events/Raw').Raw; } catch {}
    if (Raw) {
      lc.addEventHandler(async (ev) => {
        try {
          if (ev.className === 'UpdateMessageReactions') {
            const peer = ev.peer;
            let chatId = null;
            if (peer.className === 'PeerUser') chatId = peer.userId.toString();
            else if (peer.className === 'PeerChat') chatId = peer.chatId.toString();
            else if (peer.className === 'PeerChannel') chatId = '-100' + peer.channelId.toString();
            
            const msgId = ev.msgId;
            const topMsgId = ev.topMsgId; // this is essentially the topicId
            const reactionsObj = ev.reactions;
            
            if (chatId && msgId && reactionsObj) {
               const parsedReactions = parseReactions(reactionsObj.results);
               const parsedRecent = parseRecentReactions(reactionsObj.recentReactions);
               
               broadcastSSE({ 
                 type: 'update_reactions', 
                 chatId, 
                 msgId, 
                 topicId: topMsgId || null,
                 reactions: parsedReactions,
                 recentReactions: parsedRecent
               });
            }
          }
        } catch(e) {
          log('Reaction SSE broadcast error: ' + e.message);
        }
      }, new Raw({}));
    }

    log('✅ TG listener active with SSE')
  } catch(e) { log('TG listener: ' + e.message) }
}

// Start listener after session is loaded
setTimeout(startTGListener, 3000)

// ── COMMON GROUPS ──
app.get('/api/chat/common_groups/:id', requireAuth, async (req, res) => {
  if (!_session) return res.json({error: 'No session'})
  try {
    const client = await getClient()
    const { Api } = require('telegram/tl')
    
    const userIdStr = req.params.id;
    const username = req.query.username;
    const accessHashStr = req.query.accessHash;
    
    let entity = await resolveEntity(client, userIdStr, username);
    
    // If resolveEntity returns a string (unresolved), try to manually construct InputUser
    if (typeof entity === 'string' || typeof entity === 'number') {
      if (accessHashStr) {
        entity = new Api.InputUser({
          userId: BigInt(userIdStr),
          accessHash: BigInt(accessHashStr)
        });
      } else if (username) {
        try {
          entity = await client.getEntity(username);
        } catch(e) {
           throw new Error("Could not resolve user entity for common groups");
        }
      } else {
        throw new Error("Could not resolve user entity. Missing accessHash.");
      }
    }
    
    const result = await client.invoke(new Api.messages.GetCommonChats({
      userId: entity,
      maxId: 0,
      limit: 100
    }))
    
    if (!result || !result.chats) {
      log(`[Common Groups Debug] userId=${userIdStr} username=${username} accessHash=${accessHashStr} loadedCount=0 API=success (No chats returned)`);
      return res.json({ ok: true, groups: [] })
    }
    
    const groups = result.chats.map(c => ({
      id: c.id ? c.id.toString() : '',
      title: c.title || 'Unknown Group',
      participantsCount: c.participantsCount || 0,
      isGroup: true,
      username: c.username,
      accessHash: c.accessHash ? c.accessHash.toString() : undefined
    }))
    
    log(`[Common Groups Debug] userId=${userIdStr} username=${username} accessHash=${accessHashStr} loadedCount=${groups.length} API=success`);
    
    res.json({ ok: true, groups })
  } catch(e) {
    log(`[Common Groups Debug] userId=${req.params.id} API=error fallbackReason="${e.message}"`)
    // Do not return { ok: true, groups: [] } on error, as it gives false positives!
    res.status(500).json({ error: e.message })
  }
})

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

// ── CUSTOM EMOJI MEDIA ──
app.get('/api/telegram/custom-emoji/:documentId', requireAuth, async (req, res) => {
  if (!_session) return res.status(401).json({ error: 'Not connected' });
  const { documentId } = req.params;
  
  try {
    const client = await getClient();
    const { Api } = require('telegram/tl');
    const { Buffer } = require('buffer');

    // Basic memory cache could go here, but for simplicity we stream it
    const result = await client.invoke(new Api.messages.GetCustomEmojiDocuments({
      documentId: [BigInt(documentId)]
    }));

    if (!result || !result.length) {
      return res.status(404).send('Not found');
    }

    const document = result[0];
    const buffer = await client.downloadMedia(document, { workers: 1 });
    
    if (!buffer) {
      return res.status(404).send('Could not download media');
    }

    // Custom emojis are typically WEBP or TGS. Let's try to detect format from mime
    res.set('Content-Type', document.mimeType || 'image/webp');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(buffer);
  } catch (e) {
    console.log('[Reactions] Failed to fetch custom emoji:', documentId, e.message);
    res.status(500).json({ error: e.message });
  }
});
