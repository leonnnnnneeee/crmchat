require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Fix JSON.stringify for BigInts (Telegram API returns many BigInts)
BigInt.prototype.toJSON = function() { return this.toString() }

const axios = require('axios')
const { TelegramClient, Api } = require('telegram')
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

app.use((req, res, next) => {
  req.accountId = req.headers['x-account-id'] || 'default'
  if (req.url.startsWith('/api/') && !req.url.includes('/api/chat/stream')) {
    log(`[API Request] ${req.method} ${req.url.split('?')[0]} - Account: ${req.accountId}`);
  }
  next()
})
// static files served after API routes (see bottom)

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

// JWT Secret: Dùng fallback cố định để tránh mất session khi server (Railway) restart
const JWT_SECRET = process.env.JWT_SECRET || 'crmchat_super_secret_jwt_key_2026_fallback'

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
  if(!t)return res.status(401).json({ok: false, code: 'TOKEN_EXPIRED', error:'Session expired'})
  try {
    const decoded = jwt.verify(t, JWT_SECRET)
    req.user = decoded
    return next()
  } catch(err) {
    return res.status(401).json({ok: false, code: 'TOKEN_EXPIRED', error:'Session expired'})
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
// ── REFRESH TOKEN ──
app.post('/api/auth/refresh', (req, res) => {
  const t = req.headers['x-auth-token'] || req.body.token;
  if (!t) return res.status(401).json({ok: false, code: 'NO_TOKEN', error: 'No token provided'});
  try {
    const decoded = jwt.verify(t, JWT_SECRET, { ignoreExpiration: true });
    const user = USERS.find(v => v.u === decoded.username);
    if (!user) return res.status(401).json({ok: false, code: 'INVALID_USER', error: 'User not found'});
    
    // Check if token is older than 7 days (7 * 24 * 60 * 60)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && (now - decoded.exp > 604800)) {
      return res.status(401).json({ok: false, code: 'TOKEN_TOO_OLD', error: 'Session expired too long ago. Please login again.'});
    }
    
    const newToken = jwt.sign({ username: user.u }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ok: true, token: newToken});
  } catch (err) {
    res.status(401).json({ok: false, code: 'INVALID_TOKEN', error: 'Invalid token'});
  }
});

// ── TELEGRAM SESSION (in-memory + env fallback) ──

function normalizePhone(p) {
  if (!p) return '';
  let cleaned = String(p).replace(/[\s\-\(\)]/g, '');
  if (!cleaned.startsWith('+') && cleaned.length > 5) cleaned = '+' + cleaned;
  return cleaned;
}
const _accounts = new Map() // accountId -> { session: string, client: TelegramClient, ready: boolean }
const DEFAULT_ACCOUNT_ID = 'default'
let _pendingClient = null

// Fallback env session logic
if (process.env.TG_SESSION) {
  _accounts.set(DEFAULT_ACCOUNT_ID, { session: process.env.TG_SESSION, client: null, ready: false })
}

// ── LOAD SESSION FROM SUPABASE ON STARTUP ──
async function loadSessionFromDB() {
  try {
    const r = await axios.get(SB_URL + '/rest/v1/sessions?key=ilike.crmchat_tg_session*', { headers: SBH })
    if (r.data && r.data.length > 0) {
      let loaded = 0
      for (const row of r.data) {
        if (row.value && row.value.length > 10) {
          const accId = row.key === 'crmchat_tg_session' ? DEFAULT_ACCOUNT_ID : row.key.replace('crmchat_tg_session_', '')
          try {
            const data = JSON.parse(row.value);
            _accounts.set(accId, {
              session: data.sessionString,
              client: null,
              ready: false,
              sessionStatus: 'disconnected',
              telegramUserId: data.telegramUserId,
              phone: data.phone,
              username: data.username,
              displayName: data.displayName
            })
          } catch(e) {
            // Fallback for old plain-string sessions
            _accounts.set(accId, { session: row.value, client: null, ready: false, sessionStatus: 'disconnected' })
          }
          loaded++
        }
      }
      log(`✅ Loaded ${loaded} sessions from Supabase`)
      warmupClients()
    }
  } catch(e) { log('loadSession: ' + e.message) }
}

async function saveSessionToDB(s, accountId = DEFAULT_ACCOUNT_ID) {
  try {
    const acc = _accounts.get(accountId) || { session: s };
    const h = { ...SBH, Prefer: 'resolution=merge-duplicates' }
    const key = accountId === DEFAULT_ACCOUNT_ID ? 'crmchat_tg_session' : `crmchat_tg_session_${accountId}`
    const payload = JSON.stringify({
      sessionString: s,
      telegramUserId: acc.telegramUserId,
      phone: acc.phone,
      username: acc.username,
      displayName: acc.displayName
    })
    await axios.post(SB_URL + '/rest/v1/sessions',
      { key, value: payload, updated_at: new Date().toISOString() },
      { headers: h }
    )
    log(`✅ Session saved to Supabase (${accountId})`)
  } catch(e) { log('saveSession: ' + e.message) }
}

loadSessionFromDB()

// Timeout wrapper — prevents any TG op from hanging forever
function withTimeout(promise, ms=15000, name='op') {
  return Promise.race([
    promise,
    new Promise((_,reject) => setTimeout(()=>reject(new Error(`${name} timeout after ${ms}ms`)), ms))
  ])
}

async function getClient(accountId = DEFAULT_ACCOUNT_ID) {
  const { TelegramClient } = require('telegram')
  const { StringSession } = require('telegram/sessions')

  const acc = _accounts.get(accountId)
  if (!acc || !acc.session) {
    const err = new Error(`Account ${accountId} not logged in`)
    err.code = 'ACCOUNT_SESSION_EXPIRED'
    throw err
  }

  if (acc.client && acc.ready) {
    try {
      // Quick ping to verify connection is alive
      await withTimeout(acc.client.getMe(), 3000, 'ping')
      return acc.client
    } catch {
      acc.ready = false
      acc.client = null
      acc.sessionStatus = 'disconnected'
    }
  }

  if (!acc.client) {
    acc.client = new TelegramClient(new StringSession(acc.session), TG_API_ID, TG_API_HASH, {
      connectionRetries: 3,
      retryDelay: 1000,
      autoReconnect: true,
      requestRetries: 2,
    })
  }

  try {
    await withTimeout(acc.client.connect(), 10000, 'connect')
    acc.ready = true
    attachTGListener(acc.client, accountId)
    acc.sessionStatus = 'connected'
    log(`TG client (re)connected for account ${accountId}`)
    return acc.client
  } catch (e) {
    if (e.message.includes('AUTH_KEY_UNREGISTERED') || e.message.includes('SESSION_REVOKED') || e.message.includes('expired')) {
      acc.sessionStatus = 'expired'
      acc.ready = false
      const err = new Error(`Account ${accountId} session expired`)
      err.code = 'ACCOUNT_SESSION_EXPIRED'
      throw err
    }
    throw e;
  }
}

// Keep clients alive with periodic ping every 2 minutes
setInterval(async () => {
  for (const [id, acc] of _accounts.entries()) {
    if (!acc.client || !acc.ready) continue
    try {
      await withTimeout(acc.client.getMe(), 5000, 'keepalive')
    } catch {
      acc.ready = false
      log(`TG client keepalive failed for ${id} — will reconnect on next request`)
    }
  }
}, 120000)

// Warm up clients on session load (so first request is fast)
async function warmupClients() {
  for (const [id, acc] of _accounts.entries()) {
    try { 
      await getClient(id); 
      log(`✅ TG client warmed up for ${id}`) 
    }
    catch(e) { 
      log(`warmup (${id}): ` + e.message)
      if (e.message.includes('AUTH_KEY_UNREGISTERED') || e.message.includes('SESSION_REVOKED') || e.message.includes('expired')) {
         acc.sessionStatus = 'expired'
      }
    }
  }
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
  if (!_accounts.get(req.accountId)?.session || _accounts.get(req.accountId).session.length <= 10) return res.json({ connected: false })
  try {
    const client = await getClient(req.accountId)
    await withTimeout(client.getMe(), 5000, 'ping')
    res.json({ connected: true })
  } catch(e) {
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      const acc = _accounts.get(req.accountId); if(acc) { acc.session = ''; acc.client = null; acc.ready = false; }
      res.json({ connected: false, error: 'Session expired' })
    } else {
      res.json({ connected: true, warning: e.message })
    }
  }
})

let _pendingClients = new Map()

// ── AUTH: send OTP ──
app.post('/api/tg/send-otp', requireAuth, async (req,res) => {
  const { phone, accountId = 'default' } = req.body
  if (!phone) return res.status(400).json({ error: 'Phone required' })
  try {
    const { TelegramClient } = require('telegram')
    const { StringSession } = require('telegram/sessions')
    const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 3 })
    await client.connect()
    const result = await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone)
    _pendingClients.set(accountId, { client, phoneCodeHash: result.phoneCodeHash, phone })
    log('OTP sent to ' + phone + ' for account ' + accountId)
    res.json({ ok: true, phoneCodeHash: result.phoneCodeHash })
  } catch(e) { log('sendOTP: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── AUTH: verify OTP ──
app.post('/api/tg/verify-otp', requireAuth, async (req,res) => {
  const { phone, code, phoneCodeHash, password, accountId = 'default' } = req.body
  const pending = _pendingClients.get(accountId)
  if (!pending) return res.status(400).json({ error: 'No pending session. Send OTP first.' })
  try {
    const { client, phoneCodeHash: storedHash } = pending
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
    const newSession = client.session.save()
    
    // Deduplicate logic
    const me = await client.getMe();
    const telegramUserId = me.id.toString();
    const userPhone = normalizePhone(me.phone || '');
    
    let canonicalAccountId = accountId;
    for (const [id, acc] of _accounts.entries()) {
      if (id !== accountId && acc.session) {
         const accPhone = normalizePhone(acc.phone || '');
         if ((acc.telegramUserId && acc.telegramUserId === telegramUserId) || (accPhone && userPhone && accPhone === userPhone)) {
            canonicalAccountId = id;
            break;
         }
      }
    }
    
    if (canonicalAccountId !== accountId) {
      log(`[Auth] Duplicate found for ${telegramUserId}, merging session into ${canonicalAccountId}`);
      _accounts.set(canonicalAccountId, { session: newSession, client: client, ready: true, telegramUserId, phone: userPhone });
      await saveSessionToDB(newSession, canonicalAccountId);
    } else {
      _accounts.set(accountId, { session: newSession, client: client, ready: true, telegramUserId, phone: userPhone });
      await saveSessionToDB(newSession, accountId);
    }
    
    _pendingClients.delete(accountId)
    log(`✅ TG authenticated, session saved to Supabase for ${canonicalAccountId}`)
    res.json({ ok: true, accountId: canonicalAccountId })
  } catch(e) { log('verifyOTP: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── CHAT STATUS ──
app.get('/api/chat/status/:id', requireAuth, async (req,res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({ status: '' })
  try {
    const client = await getClient(req.accountId)
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
  if (!_accounts.get(req.accountId)?.session) return res.json([])
  try {
    const client = await getClient(req.accountId)
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
      readOutboxMaxId: d.dialog?.readOutboxMaxId || 0,
      readInboxMaxId: d.dialog?.readInboxMaxId || 0,
    }))
    res.json(chats)
  } catch(e) { 
    log('chatList: '+e.message); 
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      const acc = _accounts.get(req.accountId); if(acc) { acc.session = ''; acc.client = null; acc.ready = false; }
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
  if (!_accounts.get(req.accountId)?.session) return res.json([])
  const q = req.query.q
  if (!q) return res.json([])
  try {
    const client = await getClient(req.accountId)
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
  if (!_accounts.get(req.accountId)?.session) return res.json({ok: false, error: 'TG_SESSION_EXPIRED'})
  try {
    const client = await getClient(req.accountId)
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
      const acc = _accounts.get(req.accountId); if(acc) { acc.session = ''; acc.client = null; acc.ready = false; }
      return res.json({ok: false, error: 'TG_SESSION_EXPIRED'})
    }
    if (e.message.includes('CHAT_ADMIN_REQUIRED')) {
      return res.status(403).json({ error: 'Unable to load members due to Telegram permission limits.' })
    }
    log('members error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── LEAVE / DELETE CHAT ──
app.post('/api/chat/leave', requireAuth, async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' });
  try {
    const client = await getClient(req.accountId);
    const { Api } = require('telegram/tl');
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'Missing chatId' });
    
    const peer = await resolveEntity(client, chatId);
    if (!peer) return res.status(404).json({ error: 'Chat not found' });
    
    if (peer.className === 'Channel') {
      await client.invoke(new Api.channels.LeaveChannel({ channel: peer }));
    } else if (peer.className === 'Chat') {
      await client.invoke(new Api.messages.DeleteChatUser({ chatId: peer.id, userId: new Api.InputUserSelf() }));
    } else {
      await client.invoke(new Api.messages.DeleteHistory({ peer: peer, maxId: 0, revoke: true }));
    }
    res.json({ ok: true });
  } catch(e) {
    log('leaveChat error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── RESOLVE ENTITY ──
app.get('/api/telegram/entities/resolve', requireAuth, async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({ok: false, error: 'No session'});
  try {
    const client = await getClient(req.accountId);
    const query = req.query.username || req.query.peerId;
    if (!query) return res.status(400).json({ok: false, error: 'Missing username or peerId'});

    const entity = await resolveEntity(client, query, req.query.username);
    if (!entity || typeof entity === 'string') {
       return res.status(404).json({ok: false, code: 'ENTITY_RESOLVE_FAILED', error: 'Could not resolve Telegram user'});
    }
    
    let type = 'unknown';
    if (entity.className === 'User') type = 'user';
    else if (entity.className === 'Channel') type = 'channel';
    else if (entity.className === 'Chat') type = 'chat';
    
    res.json({
      ok: true,
      type,
      userId: entity.id?.toString(),
      accessHash: entity.accessHash?.toString(),
      username: entity.username || null,
      firstName: entity.firstName || null,
      lastName: entity.lastName || null,
      title: entity.title || null
    });
  } catch(e) {
    res.status(500).json({ ok: false, code: 'ENTITY_RESOLVE_FAILED', error: e.message });
  }
});

// ── FULL PROFILE ──
app.get('/api/chat/profile/:id', requireAuth, async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({error: 'No session'})
  try {
    const client = await getClient(req.accountId)
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
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ ok: false, error: 'Not connected' });
  const { chatId } = req.query;
  if (!chatId) return res.status(400).json({ ok: false, error: 'Missing chatId' });
  
  try {
    const client = await getClient(req.accountId);
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

if (!global.mediaMessageCache) {
  global.mediaMessageCache = new Map();
}

const sharedMediaHandler = async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({error: 'No session'})
  try {
    const client = await getClient(req.accountId)
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
      const result = await withTimeout(client.invoke(searchReq), 15000, 'Search Media');
      msgs = result.messages || []
    } else {
      msgs = await withTimeout(client.getMessages(entity, params), 15000, 'GetMessages Media');
    }

    if (global.mediaMessageCache.size > 2000) global.mediaMessageCache.clear();
    msgs.forEach(m => {
      if (m.media) global.mediaMessageCache.set(`${chatIdStr}_${m.id}`, m);
    });

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
        const client = await getClient(req.accountId);
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
        
        if (global.mediaMessageCache.size > 2000) global.mediaMessageCache.clear();
        matched.forEach(m => {
          if (m.media) global.mediaMessageCache.set(`${req.params.id || req.query.chatId}_${m.id}`, m);
        });

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
  if (!_accounts.get(req.accountId)?.session) return res.status(500).json({error: 'Media backend not connected'})
  try {
    const client = await getClient(req.accountId)
    const { Api } = require('telegram/tl')
    
    const userIdStr = req.params.id;
    const username = req.query.username;
    const accessHashStr = req.query.accessHash;
    
    let entity = await resolveEntity(client, userIdStr, username);
    
    if (typeof entity === 'string' || typeof entity === 'number') {
      if (accessHashStr) {
        const numId = Number(userIdStr);
        let inputPeer;
        if (numId < 0) {
          const channelId = Math.abs(numId) - 1000000000000;
          if (channelId > 0) {
            inputPeer = new Api.InputChannel({ channelId: BigInt(channelId), accessHash: BigInt(accessHashStr) });
          } else {
            inputPeer = new Api.InputPeerChat({ chatId: BigInt(Math.abs(numId)) });
          }
        } else {
          inputPeer = new Api.InputUser({ userId: BigInt(userIdStr), accessHash: BigInt(accessHashStr) });
        }
        try {
          entity = await client.getEntity(inputPeer);
        } catch(e) { entity = inputPeer; }
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
  if (!_accounts.get(req.accountId)?.session) return res.status(500).json({error: 'Media backend not connected'})
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

    const client = await getClient(req.accountId)
    const entity = await resolveEntity(client, chatId)

    let message = global.mediaMessageCache ? global.mediaMessageCache.get(`${chatId}_${msgId}`) : null;
    if (!message) {
      const messages = await client.getMessages(entity, { ids: [msgId] })
      if (!messages || messages.length === 0 || !messages[0]) {
        return res.status(404).json({error: 'Message not found'})
      }
      message = messages[0]
    }

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

async function resolveFwdInfo(client, fwdFrom) {
  if (!fwdFrom) return null;
  
  let forwardedFromUserId = null;
  let forwardedFromChannelId = null;
  let forwardedFromChatId = null;
  let fromType = 'unknown';
  let forwardedFromPeerId = null;
  
  if (fwdFrom.fromId) {
    if (fwdFrom.fromId.userId) {
      forwardedFromUserId = fwdFrom.fromId.userId.toString();
      forwardedFromPeerId = forwardedFromUserId;
      fromType = 'user';
    } else if (fwdFrom.fromId.channelId) {
      forwardedFromChannelId = fwdFrom.fromId.channelId.toString();
      forwardedFromPeerId = '-100' + forwardedFromChannelId;
      fromType = 'channel';
    } else if (fwdFrom.fromId.chatId) {
      forwardedFromChatId = fwdFrom.fromId.chatId.toString();
      forwardedFromPeerId = '-' + forwardedFromChatId;
      fromType = 'chat';
    }
  } else if (fwdFrom.savedFromPeer) {
    if (fwdFrom.savedFromPeer.userId) {
      forwardedFromUserId = fwdFrom.savedFromPeer.userId.toString();
      forwardedFromPeerId = forwardedFromUserId;
      fromType = 'user';
    } else if (fwdFrom.savedFromPeer.channelId) {
      forwardedFromChannelId = fwdFrom.savedFromPeer.channelId.toString();
      forwardedFromPeerId = '-100' + forwardedFromChannelId;
      fromType = 'channel';
    } else if (fwdFrom.savedFromPeer.chatId) {
      forwardedFromChatId = fwdFrom.savedFromPeer.chatId.toString();
      forwardedFromPeerId = '-' + forwardedFromChatId;
      fromType = 'chat';
    }
  }

  let resolvedName = fwdFrom.fromName || null;
  let resolvedTitle = null;
  let forwardedFromAccessHash = null;
  let username = null;
  let fallbackUsed = true;
  
  if (forwardedFromPeerId) {
    try {
      const cacheKey = username || forwardedFromPeerId;
      let entity = _entityCache[cacheKey];
      if (!entity) {
        entity = await withTimeout(client.getEntity(fwdFrom.fromId || fwdFrom.savedFromPeer), 2000, 'FwdEntity');
        if (entity) _entityCache[cacheKey] = entity;
      }
      
      if (entity) {
        if (fromType === 'user') {
          resolvedName = entity.firstName ? `${entity.firstName} ${entity.lastName || ''}`.trim() : (entity.username || resolvedName);
        } else {
          resolvedTitle = entity.title || entity.username || null;
        }
        forwardedFromAccessHash = entity.accessHash ? entity.accessHash.toString() : null;
        username = entity.username || null;
        fallbackUsed = false;
      }
    } catch (err) {
      // Keep fallback
    }
  } else if (fwdFrom.fromName) {
    fallbackUsed = false;
  }
  
  return {
    isForwarded: true,
    forwardedFromId: forwardedFromPeerId, // legacy fallback for frontend
    forwardedFromPeerId,
    forwardedFromUserId,
    forwardedFromChannelId,
    forwardedFromChatId,
    forwardedFromAccessHash,
    forwardedFromType: fromType,
    forwardedFromName: resolvedName,
    forwardedFromTitle: resolvedTitle,
    username,
    postAuthor: fwdFrom.postAuthor || null,
    date: fwdFrom.date,
    fallbackUsed
  };
}

// ── MESSAGES ──
app.get('/api/chat/messages/:id', requireAuth, async (req,res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json([])
  const t0 = Date.now()
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.id, req.query.username), 8000, 'resolveEntity')
    const maxId = parseInt(req.query.maxId) || 0
    const minId = parseInt(req.query.minId) || 0
    const opts = { limit: 40 }
    if (maxId > 0) opts.offsetId = maxId
    if (minId > 0) opts.minId = minId
    
    let freshOutboxMaxId = parseInt(req.query.readOutboxMaxId) || 0;
    
    const msgsPromise = withTimeout(client.getMessages(entity, opts), 12000, 'getMessages');
    const peerDialogsPromise = withTimeout(client.invoke(new Api.messages.GetPeerDialogs({ peers: [entity] })), 2000, 'GetPeerDialogs').catch(e => {
      log('GetPeerDialogs error: ' + e.message);
      return null;
    });
    
    const [msgs, peerDialogs] = await Promise.all([msgsPromise, peerDialogsPromise]);
    
    if (peerDialogs && peerDialogs.dialogs && peerDialogs.dialogs.length > 0) {
      freshOutboxMaxId = peerDialogs.dialogs[0].readOutboxMaxId || freshOutboxMaxId;
    }
    const results = (await Promise.all(msgs.reverse()
      .map(async m => {
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
          entities: m.entities ? m.entities.map(e => ({
            className: e.className,
            offset: e.offset,
            length: e.length,
            url: e.url,
            language: e.language,
            userId: e.userId ? e.userId.toString() : null,
            customEmojiId: e.customEmojiId ? e.customEmojiId.toString() : null
          })) : [],
          fwdFrom: await resolveFwdInfo(client, m.fwdFrom),
          webPage: m.media?.className === 'MessageMediaWebPage' && m.media.webpage ? {
            className: m.media.webpage.className,
            url: m.media.webpage.url,
            displayUrl: m.media.webpage.displayUrl,
            type: m.media.webpage.type,
            siteName: m.media.webpage.siteName,
            title: m.media.webpage.title,
            description: m.media.webpage.description
          } : null,
          // Telegram API does not provide exact per-message read timestamps for basic messages
          messageId: m.id,
          isOutgoing: m.out,
          sentAt: m.date,
          readAt: null,
          seenAt: null,
          seenTimeAvailable: false,
          seenTimeUnavailableReason: 'Telegram API did not provide exact read timestamp',
          normalizedStatus: m.out ? (m.id <= freshOutboxMaxId ? 'seen' : 'sent') : null,
        }
      })))
      .filter(m => m.text || m.isPhoto || m.isVideo || m.isDoc)
    log('messages loaded: ' + results.length + ' msgs in ' + (Date.now()-t0) + 'ms')
    res.json(results)
  } catch(e) { 
    log('messages error: '+e.message+' ('+(Date.now()-t0)+'ms)'); 
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      const acc = _accounts.get(req.accountId); if(acc) { acc.session = ''; acc.client = null; acc.ready = false; }
      return res.status(401).json({ error: 'AUTH_FAILED' })
    }
    res.status(500).json({ error: e.message }) 
  }
})

// ── GET TOPIC MESSAGES ──
app.get('/api/chat/topics/:chatId/:topicId/messages', requireAuth, async (req,res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json([])
  const t0 = Date.now()
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
    const entity = await withTimeout(resolveEntity(client, req.params.chatId, req.query.username), 8000, 'resolveEntity')
    const maxId = parseInt(req.query.maxId) || 0
    const minId = parseInt(req.query.minId) || 0
    const opts = { limit: 40, replyTo: parseInt(req.params.topicId) }
    if (maxId > 0) opts.offsetId = maxId
    if (minId > 0) opts.minId = minId
    
    let freshOutboxMaxId = parseInt(req.query.readOutboxMaxId) || 0;
    
    const msgsPromise = withTimeout(client.getMessages(entity, opts), 12000, 'getMessages');
    const peerDialogsPromise = withTimeout(client.invoke(new Api.messages.GetPeerDialogs({ peers: [entity] })), 2000, 'GetPeerDialogs').catch(e => {
      log('GetPeerDialogs error: ' + e.message);
      return null;
    });
    
    const [msgs, peerDialogs] = await Promise.all([msgsPromise, peerDialogsPromise]);
    
    if (peerDialogs && peerDialogs.dialogs && peerDialogs.dialogs.length > 0) {
      freshOutboxMaxId = peerDialogs.dialogs[0].readOutboxMaxId || freshOutboxMaxId;
    }
    const results = (await Promise.all(msgs.reverse()
      .map(async m => {
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
          entities: m.entities ? m.entities.map(e => ({
            className: e.className,
            offset: e.offset,
            length: e.length,
            url: e.url,
            language: e.language,
            userId: e.userId ? e.userId.toString() : null,
            customEmojiId: e.customEmojiId ? e.customEmojiId.toString() : null
          })) : [],
          fwdFrom: await resolveFwdInfo(client, m.fwdFrom),
          webPage: m.media?.className === 'MessageMediaWebPage' && m.media.webpage ? {
            className: m.media.webpage.className,
            url: m.media.webpage.url,
            displayUrl: m.media.webpage.displayUrl,
            type: m.media.webpage.type,
            siteName: m.media.webpage.siteName,
            title: m.media.webpage.title,
            description: m.media.webpage.description
          } : null,
          messageId: m.id,
          isOutgoing: m.out,
          sentAt: m.date,
          readAt: null,
          seenAt: null,
          seenTimeAvailable: false,
          seenTimeUnavailableReason: 'Telegram API did not provide exact read timestamp',
          normalizedStatus: m.out ? (m.id <= freshOutboxMaxId ? 'seen' : 'sent') : null,
        }
      })))
      .filter(m => m.text || m.isPhoto || m.isVideo || m.isDoc)
    log('topic messages loaded: ' + results.length + ' msgs in ' + (Date.now()-t0) + 'ms')
    res.json(results)
  } catch(e) { 
    log('topic messages error: '+e.message+' ('+(Date.now()-t0)+'ms)'); 
    if (e.message.includes('AUTH_KEY') || e.message.includes('SESSION')) {
      const acc = _accounts.get(req.accountId); if(acc) { acc.session = ''; acc.client = null; acc.ready = false; }
      return res.status(401).json({ error: 'AUTH_FAILED' })
    }
    res.status(500).json({ error: e.message }) 
  }
})

// ── SEND MESSAGE ──
app.post('/api/chat/send', requireAuth, async (req,res) => {
  const { chatId, text } = req.body
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient(req.accountId)
    const entity = await withTimeout(resolveEntity(client, chatId, req.body.username), 8000, 'resolveEntity')
    const sent = await withTimeout(client.sendMessage(entity, { message: text }), 10000, 'sendMessage')
    log('Sent to '+chatId+': '+text.slice(0,40))
    res.json({ ok: true, messageId: sent.id, date: sent.date })
  } catch(e) { log('send: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── GET READ RECEIPTS ──
app.get('/api/chat/messages/:chatId/:msgId/read-receipts', requireAuth, async (req, res) => {
  const { chatId, msgId } = req.params;
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' });
  
  try {
    const client = await getClient(req.accountId);
    const entity = await withTimeout(resolveEntity(client, chatId), 8000, 'resolveEntity');
    const inputPeer = await client.getInputEntity(entity || chatId);
    
    if (inputPeer.className === 'InputPeerUser') {
      try {
        const result = await client.invoke(new Api.messages.GetOutboxReadDate({
          peer: inputPeer,
          msgId: parseInt(msgId)
        }));
        return res.json({ ok: true, type: 'private', date: result.date });
      } catch (e) {
        return res.json({ ok: false, error: e.message });
      }
    } else {
      try {
        const result = await client.invoke(new Api.messages.GetMessageReadParticipants({
          peer: inputPeer,
          msgId: parseInt(msgId)
        }));
        
        if (result && result.length > 0) {
          const userIds = result.map(p => p.userId);
          const users = await client.invoke(new Api.users.GetUsers({
            id: userIds
          }));
          
          const participants = result.map(p => {
            const user = users.find(u => String(u.id) === String(p.userId));
            return {
              userId: String(p.userId),
              date: p.date,
              firstName: user?.firstName || '',
              lastName: user?.lastName || '',
              username: user?.username || ''
            };
          });
          
          return res.json({ ok: true, type: 'group', participants });
        } else {
          return res.json({ ok: true, type: 'group', participants: [] });
        }
      } catch (e) {
        return res.json({ ok: false, error: e.message });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET TOPICS ──
app.get('/api/chat/topics/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const accountId = req.accountId;
  try {
    const { Api } = require('telegram/tl');
    const client = await getClient(accountId);
    const entity = await withTimeout(resolveEntity(client, id, req.query.username), 8000, 'resolveEntity');
    
    // Call GetForumTopics
    const result = await client.invoke(new Api.channels.GetForumTopics({
      channel: entity,
      offsetDate: 0,
      offsetId: 0,
      offsetTopic: 0,
      limit: 100
    }));

    if (!result || !result.topics) {
      return res.json([]);
    }

    const topics = result.topics.map(t => {
      const lastMsgObj = result.messages ? result.messages.find(m => m.id === t.topMessage) : null;
      let lastMsgText = '';
      if (lastMsgObj) {
        lastMsgText = lastMsgObj.message || (lastMsgObj.media ? '[Media]' : '');
      }
      
      return {
        id: t.id,
        title: t.title,
        date: t.date,
        unread: t.unreadCount || 0,
        lastMsg: lastMsgText
      };
    });

    res.json(topics);
  } catch (err) {
    console.error('Error fetching topics:', err.message);
    res.json([]);
  }
});

// ── SEND TOPIC MESSAGE ──
app.post('/api/chat/topics/:chatId/:topicId/send', requireAuth, async (req,res) => {
  const { chatId, topicId } = req.params
  const { text, username } = req.body
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' })
  try {
    const client = await getClient(req.accountId)
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolveEntity')
    await withTimeout(client.sendMessage(entity, { message: text, replyTo: parseInt(topicId) }), 10000, 'sendMessage')
    log('Sent to topic '+chatId+'/'+topicId+': '+text.slice(0,40))
    res.json({ ok: true })
  } catch(e) { log('send topic: '+e.message); res.status(500).json({ error: e.message }) }
})

// ── SEND MEDIA ──
app.post('/api/chat/send-media', requireAuth, upload.single('file'), async (req, res) => {
  const { chatId, topicId, caption, username } = req.body
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' })
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  
  try {
    const client = await getClient(req.accountId)
    const entity = await withTimeout(resolveEntity(client, chatId, username), 8000, 'resolveEntity')
    
    // GramJS can upload from file path
    const fileParams = {
      file: req.file.path,
      caption: caption || '',
    }
    if (topicId) fileParams.replyTo = parseInt(topicId)
    
    const sent = await withTimeout(client.sendFile(entity, fileParams), 30000, 'sendFile')
    
    // Cleanup temp file
    fs.unlinkSync(req.file.path)
    
    log(`Sent media to ${chatId}${topicId ? '/'+topicId : ''}`)
    res.json({ ok: true, messageId: sent.id, date: sent.date })
  } catch(e) { 
    log('send-media: '+e.message); 
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message }) 
  }
})

// ── DELETE MESSAGES ──
app.post('/api/chat/delete', requireAuth, async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({ok: false, error: 'No session'});
  try {
    const { chatId, msgIds, messageId, revoke } = req.body;
    let ids = msgIds || [];
    if (messageId) ids.push(messageId);
    
    if (!chatId || !ids.length) return res.json({ok: false, error: 'Missing parameters'});
    
    const client = await getClient(req.accountId);
    const entity = await resolveEntity(client, chatId);
    
    await client.deleteMessages(entity, ids, { revoke: revoke !== false });
    
    res.json({ ok: true });
  } catch(e) {
    log('delete messages error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
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
      const client = await getClient(req.accountId)
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

// ── AI RESEARCH PROJECT ──
// Placeholder for missing AI Reply route
app.post('/api/ai/reply', requireAuth, async (req, res) => {
  res.json({
    ok: false,
    error: "AI Reply feature is currently under construction on the backend.",
    code: "NOT_IMPLEMENTED"
  });
});

app.post('/api/ai/research-project', requireAuth, async (req, res) => {
  const { accountId, chatId, projectName, links, recentMessages } = req.body;
  if (!global.researchCache) global.researchCache = {};

  const safeLinks = links || [];
  const cacheKey = `${accountId}_${chatId}_${projectName}_${safeLinks[0] || 'no_link'}`;

  // Check cache (24 hours)
  if (global.researchCache[cacheKey] && (Date.now() - global.researchCache[cacheKey].timestamp) < 24 * 60 * 60 * 1000) {
    return res.json({ ok: true, research: global.researchCache[cacheKey].data, source: "cache", cached: true });
  }

  if (!GROQ_KEY) return res.json({ ok: false, error: "AI API key not configured." });

  try {
    const axios = require('axios');
    let scrapedData = "";
    
    // Scrape up to 2 links
    for (const link of safeLinks.slice(0, 2)) {
      try {
        const resp = await axios.get(link, { timeout: 3000 });
        const text = (resp.data || "").toString()
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]*>?/gm, ' ')
          .replace(/\s+/g, ' ')
          .substring(0, 3000);
        scrapedData += `\nSource: ${link}\nContent: ${text}\n`;
      } catch(e) {
        log(`[Research Scraping Failed] ${link}: ${e.message}`);
      }
    }

    const prompt = `You are an elite BD researcher for Coincu, a Web3 news media platform.
Research the project "${projectName}" based on the following context and scraped data.

Chat context: ${(recentMessages || []).map(m => m.text).join(' ')}
Links: ${safeLinks.join(', ')}
Scraped Data: ${scrapedData}

Based on this information, return a JSON object with the following fields:
{
  "projectName": "Name of the project (or 'Project name unclear')",
  "category": "e.g. Prediction market / DeFi",
  "shortDescription": "1-2 sentence summary of what they do",
  "productStage": "Current campaign or stage (e.g. DSWAP / STVL campaign, IDO soon, Mainnet)",
  "currentNeeds": "What they likely need (e.g. PR, User Acquisition, campaign awareness)",
  "marketingAngle": "Best Coincu angle (e.g. PR + CMC News visibility + referral partnership)",
  "sources": ["List of sources used"]
}`;

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    }, { headers: { 'Authorization': 'Bearer ' + GROQ_KEY }});

    const result = JSON.parse(r.data.choices[0].message.content);
    
    global.researchCache[cacheKey] = { timestamp: Date.now(), data: result };
    
    res.json({ ok: true, research: result, source: "web_and_chat", cached: false });
  } catch(e) {
    log(`[Project Research Error] ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── AI SUGGEST (Groq) ──
app.post('/api/ai/suggest', requireAuth, async (req,res) => {
  const { activeAccountId, generationId, contactName, lastMessage, messages, stage, notes, instruction, chatId, topicId, projectResearch } = req.body
  const history = (messages||[]).slice(-40)
  const lastClientMsg = (lastMessage||'').trim()
  const leonLines = history.filter(m=>m.fromMe).map(m=>m.text).filter(Boolean)
  const leonSaid  = leonLines.join(' | ')
  const combinedHistoryStr = history.map(m=>m.text).join('\n')

  const normInstruction = instruction ? instruction.toLowerCase().normalize('NFC') : null;
  log('[AI Suggest Request Payload]: ' + JSON.stringify({
    generationId,
    activeAccountId,
    rawCommand: instruction,
    normalizedCommand: normInstruction,
    contactName: contactName,
    chatId: chatId,
    topicId: topicId,
    messagesCount: history?.length || 0,
    hasResearch: !!projectResearch
  }, null, 2))

  log('AI suggest — last: "' + lastClientMsg + '" stage: ' + stage)

  function normalizeUserCommand(cmd, chatHistoryStr, researchStr) {
    const intent = {
      language: 'en',
      normalizedEnglishIntent: 'General response',
      replyGoal: 'General response',
      tone: 'neutral',
      salesLevel: 'normal',
      shouldMentionPR: false,
      shouldMentionCMC: false,
      shouldMentionReferral: false,
      shouldMentionCommission: false,
      shouldAskBudget: false,
      shouldAskTimeline: false,
      shouldNotSellYet: false,
      shouldAskPartnershipType: false,
      shouldUseProjectResearch: false,
      forbiddenMentions: 'Do not invent any project names, tokens, companies, or people that are not explicitly present in the current user command or the latest chat messages.'
    };

    if (!cmd) return intent;
    const norm = cmd.toLowerCase().normalize('NFC');
    
    // Check if Vietnamese
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(norm)) {
      intent.language = 'vi';
    }

    if (norm.includes("tôi thấy bạn nhắn trong group") || norm.includes("tìm kiếm partnership") || norm.includes("partnership")) {
      intent.replyGoal = 'soft outreach';
      intent.shouldAskPartnershipType = true;
      intent.shouldNotSellYet = true;
      intent.normalizedEnglishIntent = 'Soft outreach, mention saw their group message, ask what kind of partnership they are exploring, no sales.';
    }
    else if (norm.includes("đăng bài pr") || norm.includes("đi bài pr") || norm.includes("pr support")) {
      intent.shouldMentionPR = true;
      intent.normalizedEnglishIntent = 'PR article / media coverage.';
    }
    else if (norm.includes("push camp") || norm.includes("đẩy campaign")) {
      intent.replyGoal = 'amplify campaign';
      intent.normalizedEnglishIntent = 'Amplify campaign.';
    }
    else if (norm.includes("giới thiệu dịch vụ") || norm.includes("giới thiệu")) {
      intent.replyGoal = 'introduce Coincu services';
      intent.shouldMentionReferral = true;
      intent.normalizedEnglishIntent = 'Introduce Coincu to relevant partners/projects in their network.';
    }
    
    if (norm.includes("mối quan hệ") || norm.includes("network") || norm.includes("đối tác") || norm.includes("referral")) {
      intent.shouldMentionReferral = true;
    }
    if (norm.includes("hoa hồng") || norm.includes("commission")) {
      intent.shouldMentionCommission = true;
      intent.normalizedEnglishIntent += ' Offer referral commission.';
    }
    if (norm.includes("hỏi budget") || norm.includes("budget")) {
      intent.shouldAskBudget = true;
      intent.normalizedEnglishIntent += ' Ask budget.';
    }
    if (norm.includes("hỏi timeline") || norm.includes("timeline")) {
      intent.shouldAskTimeline = true;
      intent.normalizedEnglishIntent += ' Ask timeline.';
    }
    if (norm.includes("đừng sale vội") || norm.includes("don't sell yet") || norm.includes("no sale")) {
      intent.shouldNotSellYet = true;
      intent.normalizedEnglishIntent += ' Do not sell, ask soft qualifying question.';
    }
    if (norm.includes("mềm hơn") || norm.includes("softer")) {
      intent.tone = 'softer';
      intent.normalizedEnglishIntent += ' Softer tone.';
    }
    if (norm.includes("trực tiếp hơn") || norm.includes("direct")) {
      intent.tone = 'direct';
      intent.normalizedEnglishIntent += ' More direct tone.';
    }
    if (norm.includes("follow up") || norm.includes("follow-up")) {
      intent.replyGoal = 'follow-up message';
      intent.normalizedEnglishIntent = 'Follow-up message.';
    }
    if (norm.includes("cmc") || norm.includes("coinmarketcap")) {
      intent.shouldMentionCMC = true;
    }
    
    if (researchStr && (norm.includes("research") || norm.includes("dự án") || norm.includes("project"))) {
      intent.shouldUseProjectResearch = true;
    } else if (researchStr) {
       intent.shouldUseProjectResearch = true;
    }

    return intent;
  }

  function buildFallbackFromIntent(intent) {
    let parts = [];
    
    if (intent.replyGoal === 'follow-up message') {
      parts.push("Just following up on our previous conversation.");
    } else if (intent.replyGoal === 'soft outreach' || intent.shouldAskPartnershipType) {
      parts.push("I saw your message in the group. What kind of partnership are you exploring?");
    }
    
    if (intent.shouldMentionPR && intent.replyGoal === 'amplify campaign') {
      parts.push("Happy to support your campaign through PR and media coverage.");
    } else if (intent.shouldMentionPR) {
      parts.push("We can help amplify your reach with PR and media coverage.");
    } else if (intent.replyGoal === 'introduce Coincu services') {
      parts.push("Coincu can provide tailored media services to boost your visibility. If you have partners in your network looking for exposure, we'd love to connect.");
    }
    
    if (intent.shouldMentionCMC) {
      parts.push("We also distribute to CMC News for added credibility.");
    }
    
    if (intent.shouldMentionReferral && intent.shouldMentionCommission) {
      parts.push("If you have partners who need Coincu’s visibility, we can work on a commission-based referral.");
    } else if (intent.shouldMentionCommission) {
      parts.push("We offer a solid commission for any successful referrals you bring to Coincu.");
    } else if (intent.shouldMentionReferral && intent.replyGoal !== 'introduce Coincu services') {
      parts.push("If you know other projects looking for media exposure, I'd love to connect.");
    }
    
    if (intent.shouldAskBudget) {
      parts.push("What budget range are you considering for this?");
    } else if (intent.shouldAskTimeline) {
      parts.push("When are you planning to start?");
    } else if (intent.shouldNotSellYet && intent.replyGoal !== 'soft outreach') {
      parts.push("Got it. What’s your main focus right now?");
    }
    
    const text = parts.join(" ").trim();
    if (!text || text === "Just following up on our previous conversation.") {
      return null;
    }
    
    return [
      { label: "Direct", text: text },
      { label: "Soft", text: text.replace("Happy to support", "We can support").replace("If you have partners", "Also, if you can introduce us to partners") },
      { label: "Alt", text: text.replace("visibility", "exposure").replace("commission-based referral", "referral collaboration") }
    ];
  }


  if (!GROQ_KEY) return res.json({ ok: false, error: "AI API key not configured." })

  const intentSlots = normalizeUserCommand(instruction, combinedHistoryStr, projectResearch);

  const SYSTEM_PROMPT = `You are Coincu's BD Sales Assistant.

=== PRIORITY 1: USER COMMAND (CRITICAL) ===
You MUST follow the user instruction above all else. This is the direct instruction for WHAT TO SAY to the customer.
Instruction: "${instruction}"
Normalized Intent: "${intentSlots.normalizedEnglishIntent}"

CRITICAL RULES FOR INSTRUCTION (VIETNAMESE/MIXED LANGUAGE SUPPORT):
1. INTENT TRANSLATION: Understand the core intent of the instruction. Do not ignore referral/collaboration intents.
2. NATURAL ENGLISH: Write the final reply entirely in natural English.
3. NO LITERAL COPYING: NEVER copy Vietnamese words directly. Translate the intent.
4. NO INVENTED CONTEXT (ANTI-HALLUCINATION): ${intentSlots.forbiddenMentions}
5. SPEAKER DIRECTION: "tôi/mình" = You (Coincu). "bạn/anh/chị" = The Customer.

=== EXPLICIT INTENT SLOTS DETECTED ===
You must strictly fulfill these requirements in your output:
- Reply Goal: ${intentSlots.replyGoal}
- Tone: ${intentSlots.tone}
- Ask Partnership Type: ${intentSlots.shouldAskPartnershipType}
- Mention PR: ${intentSlots.shouldMentionPR}
- Mention CMC: ${intentSlots.shouldMentionCMC}
- Ask Referral/Network: ${intentSlots.shouldMentionReferral}
- Offer Commission: ${intentSlots.shouldMentionCommission}
- Ask Budget: ${intentSlots.shouldAskBudget}
- Ask Timeline: ${intentSlots.shouldAskTimeline}
- Do Not Sell Yet: ${intentSlots.shouldNotSellYet}

=== PRIORITY 2: PROJECT RESEARCH ===
If project research is provided, you MUST use its specific details (campaign name, category, specific needs) naturally in your reply. Do not just say "your project" or "prediction events" generically.

=== PRIORITY 3: LATEST MESSAGE ===
Ensure your reply makes sense as a direct response to the client's last message.

=== PRIORITY 4: FULL CHAT CONTEXT ===
Use the chat history to maintain context, but do not repeat what Leon (you) already said.

=== PRIORITY 5: COINCU BD SYSTEM PROMPT ===
Identify customer type: Project, Agency, Broker, Founder, Marketing, BD, Investor, Service Provider.
Coincu.com is a crypto/Web3 international news website. Services: PR article, sponsored content, organic article, banner ads.
Coincu can support distribution to CoinMarketCap News (CMC News) which improves credibility.

BEHAVIOR RULES (STRICT):
- Output exactly 2-3 short, natural Telegram-style replies.
- 1-2 SHORT SENTENCES MAX per reply.
- NOT hard-sell.
- One clear question max.
- If a referral/commission is requested, mention it softly (e.g. "if you have partners who need media exposure, we can work out a referral collaboration").
- Mention Coincu + CMC News only when relevant to the instruction or research.

OUTPUT FORMAT:
Return EXACTLY this JSON structure.
{
  "normalizedIntent": "Your internal translation of the user command (e.g. 'Offer PR support and softly ask for referrals').",
  "researchUsed": true/false,
  "suggestions": [
    { "label": "Direct", "text": "The actual message text" },
    { "label": "Soft", "text": "Another text" }
  ]
}
`

  try {
    const userPrompt = [
      (projectResearch && intentSlots.shouldUseProjectResearch) ? `=== PRIORITY 2: PROJECT RESEARCH ===\n${projectResearch}\n` : null,
      '=== PRIORITY 3 & 4: CONVERSATION CONTEXT ===',
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
      'Generate 2 to 3 diverse, short (1-2 sentences max), Telegram-style reply options in JSON format.'
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
           apiErrorStr = e2.response?.data?.error?.message || e2.message;
           if (e2.response?.status === 401 || e2.response?.status === 403) {
             return res.status(401).json({ ok: false, code: "AI_PROVIDER_AUTH_ERROR", error: "AI provider token is invalid or expired" });
           }
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
            
            // Validation 1: Vietnamese hallucination
            if (hasVietnameseLiteral(sug.text, instruction)) {
              failedReason = "DO NOT copy Vietnamese words into the final reply. Translate the intent to English only.";
              break;
            }
            // Validation 2: Context hallucination
            if (hasHallucination(sug.text, instruction, combinedHistory)) {
              failedReason = "DO NOT invent contexts like 'prediction event' or 'podcast' unless explicitly mentioned.";
              break;
            }
            // Validation 3: Length constraint
            const sentenceCount = sug.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
            if (sentenceCount > 3) {
              failedReason = "Replies must be strictly 1-2 short sentences max. Your reply was too long and salesy.";
              break;
            }
            // Validation 4: Strict Intent Fulfillment
            const textLower = sug.text.toLowerCase();
            if (intentSlots.shouldMentionCommission && !textLower.match(/commission|fee|referral|reward/)) {
              failedReason = "The user explicitly commanded you to offer a commission, but you did not mention it. Please include commission/referral fee.";
              break;
            }
            if (intentSlots.shouldMentionPR && !textLower.match(/pr\b|media|coverage|article/)) {
              failedReason = "The user explicitly commanded you to mention PR, but you did not. Please mention PR or media coverage.";
              break;
            }
            if (intentSlots.shouldMentionReferral && !textLower.match(/partner|network|project|intro|refer/)) {
              failedReason = "The user commanded you to ask for a referral/network introduction, but you didn't. Please ask them to introduce partners.";
              break;
            }
            if (intentSlots.shouldNotSellYet && textLower.match(/buy|offer|price|cost|buy|service/)) {
              failedReason = "The user explicitly commanded you NOT to sell yet, but your reply sounds salesy. Please ask a softer qualifying question.";
              break;
            }
          }

          if (failedReason && retryCount < maxRetries) {
            validationResult = 'failed_retry_' + retryCount;
            log(`[AI Suggest Validation Failed]: ${failedReason}. Retrying...`);
            currentPrompt += `\n\n[SYSTEM FEEDBACK]: Your previous response was invalid. ${failedReason} Fix it and return exactly 2-3 SHORT, natural options.`;
            retryCount++;
            continue; 
          }
          
          safeSuggestions = tempSuggestions;
          if (failedReason) validationResult = 'failed_forced_accept';
          
          log(`[AI Suggest Final] validationResult: ${validationResult}, researchUsed: ${!!parsed.researchUsed}`);
          log(`[AI Suggest Output]: ${JSON.stringify(safeSuggestions, null, 2)}`);
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

    const fallback = !safeSuggestions && instruction ? buildFallbackFromIntent(intentSlots) : null;

    log('[AI Suggest Debug]', {
      accountId: req.accountId,
      chatId: chatId,
      projectName: projectResearch ? "Used Research" : "No Research",
      rawCommand: instruction,
      aiApiStatus: safeSuggestions ? "success" : "failed",
      aiApiErrorCode: apiErrorStr || null,
      fallbackUsed: !!fallback,
      intentSlots: intentSlots,
      validationResult: validationResult,
      finalSuggestions: safeSuggestions || fallback || null
    });

    if (safeSuggestions) {
      res.json({ 
        ok: true, 
        suggestions: safeSuggestions,
        researchUsed: !!projectResearch,
        normalizedIntent: detectedIntent || null
      });
    } else if (fallback) {
      res.json({ ok: true, suggestions: fallback, aiWarning: "AI API failed, showing fallback suggestions", fallbackUsed: true, apiError: apiErrorStr })
    } else {
      res.json({ ok: false, code: "AI_API_FAILED", error: apiErrorStr || "Failed to generate suggestions" })
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
  } catch(e) { 
    if (e.response?.status === 401 || e.response?.status === 403) {
      return res.status(401).json({ ok: false, code: "AI_PROVIDER_AUTH_ERROR", error: "AI provider token is invalid or expired" });
    }
    res.json({ summary: 'Error: '+e.message }) 
  }
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
  } catch(e) { 
    if (e.response?.status === 401 || e.response?.status === 403) {
      return res.status(401).json({ ok: false, code: "AI_PROVIDER_AUTH_ERROR", error: "AI provider token is invalid or expired" });
    }
    res.json({ info: { error: e.message } }) 
  }
})

// ── TRANSLATE API ──
app.post('/api/translate', requireAuth, async (req,res) => {
  const { chatId, topicId, messageIds, messages, targetLanguage = 'vi', sourceLanguage = 'auto' } = req.body
  
  if (!GROQ_KEY) {
    return res.json({ ok: false, code: 'TRANSLATE_FAILED', error: 'Translation service is not configured.' })
  }
  
  try {
    const textsToTranslate = {}
    
    // If frontend passed the explicit texts (useful for local voice transcripts)
    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg && msg.id && msg.text && msg.text.trim().length > 0) {
          textsToTranslate[msg.id] = msg.text
        }
      }
    } 
    // Otherwise fallback to fetching from Telegram using messageIds
    else if (messageIds && messageIds.length) {
      const entity = _entityCache[chatId] || await client.getEntity(chatId)
      const tgMsgs = await client.getMessages(entity, { ids: messageIds.map(id => parseInt(id)) })
      for (const msg of tgMsgs) {
        if (!msg) continue
        const text = msg.message || '' // Telegram text or caption
        if (text.trim().length > 0) {
          textsToTranslate[msg.id] = text
        }
      }
    }
    
    if (Object.keys(textsToTranslate).length === 0) {
      return res.json({ ok: true, translations: [] })
    }
    
    const prompt = `Translate the following JSON object's values to ${targetLanguage}. 
Return ONLY a valid JSON object keeping the exact same keys, with translated values. 
Do not include any markdown formatting or extra text.
Original JSON:
${JSON.stringify(textsToTranslate)}`

    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 2000, temperature: 0.1
    }, { headers: { Authorization: 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' }})
    
    let raw = r.data.choices[0].message.content.trim().replace(/```json|```/g,'')
    const resultObj = JSON.parse(raw)
    const translations = []
    
    for (const [id, translatedText] of Object.entries(resultObj)) {
      translations.push({
        messageId: parseInt(id),
        sourceLanguage,
        targetLanguage,
        originalText: textsToTranslate[id],
        translatedText
      })
    }
    
    res.json({ ok: true, translations })
  } catch(e) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      return res.status(401).json({ ok: false, code: 'TRANSLATE_FAILED', error: 'Translation service token is invalid or expired' });
    }
    log('Translate Error: ' + e.message)
    res.json({ ok: false, code: 'TRANSLATE_FAILED', error: e.message })
  }
})

// ── EDIT MESSAGE ──
app.post('/api/chat/edit', requireAuth, async (req,res) => {
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({error:'Not connected'})
  const {chatId, msgId, text, username} = req.body
  if(!chatId||!msgId||!text) return res.status(400).json({error:'Missing fields'})
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
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
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' })
  const { chatId, messageId, username, topicId } = req.query
  if (!chatId || !messageId) return res.status(400).json({ error: 'Missing params' })
  
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
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
    
    let freshOutboxMaxId = 0;
    try {
      const peerDialogs = await client.invoke(new Api.messages.GetPeerDialogs({ peers: [entity] }));
      if (peerDialogs && peerDialogs.dialogs && peerDialogs.dialogs.length > 0) {
        freshOutboxMaxId = peerDialogs.dialogs[0].readOutboxMaxId || 0;
      }
    } catch (e) {
      log('GetPeerDialogs error: ' + e.message);
    }
    
    const results = await Promise.all(msgs.reverse()
      .map(async m => {
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
          entities: m.entities ? m.entities.map(e => ({
            className: e.className,
            offset: e.offset,
            length: e.length,
            url: e.url,
            language: e.language,
            userId: e.userId ? e.userId.toString() : null,
            customEmojiId: e.customEmojiId ? e.customEmojiId.toString() : null
          })) : [],
          fwdFrom: await resolveFwdInfo(client, m.fwdFrom),
          webPage: m.media?.className === 'MessageMediaWebPage' && m.media.webpage ? {
            className: m.media.webpage.className,
            url: m.media.webpage.url,
            displayUrl: m.media.webpage.displayUrl,
            type: m.media.webpage.type,
            siteName: m.media.webpage.siteName,
            title: m.media.webpage.title,
            description: m.media.webpage.description
          } : null,
          topicId: m.replyTo?.replyToMsgId || null,
          isPinned: !!m.pinned,
          normalizedStatus: m.out ? (m.id <= freshOutboxMaxId ? 'seen' : 'sent') : null,
        }
      }))
      
    res.json({ ok: true, messages: results, targetMessageId: messageId, source: "telegram_history" });
  } catch (e) {
    log('messages around error: ' + e.message)
    res.status(500).json({ error: e.message })
  }
})
// ── MULTI-ACCOUNT ENDPOINTS ──
app.get('/api/telegram/accounts', async (req, res) => {
  const rawAccounts = [];
  for (const [id, acc] of _accounts.entries()) {
    if (!acc.session) continue;
    
    let meData = {
      telegramUserId: acc.telegramUserId,
      displayName: acc.displayName,
      username: acc.username || '',
      phone: normalizePhone(acc.phone || '')
    };

    if (!acc.telegramUserId && acc.sessionStatus !== 'expired') {
      try {
        const client = await getClient(id);
        const me = await client.getMe();
        meData.telegramUserId = me.id.toString();
        const first = me.firstName || '';
        const last = me.lastName || '';
        meData.displayName = (first + (last ? ' ' + last : '')).trim() || me.username || normalizePhone(me.phone || '') || 'Telegram Account';
        meData.username = me.username || '';
        meData.phone = normalizePhone(me.phone || '');
        
        acc.telegramUserId = meData.telegramUserId;
        acc.displayName = meData.displayName;
        acc.username = meData.username;
        acc.phone = meData.phone;
        saveSessionToDB(acc.session, id);
      } catch (e) {
        log(`Failed to fetch getMe for ${id} in GET /accounts: ${e.message}`);
      }
    }

    if (!meData.displayName || meData.displayName.startsWith('Account default')) {
       meData.displayName = meData.username || meData.phone || 'Telegram Account';
    }

    rawAccounts.push({
      accountId: id,
      telegramUserId: meData.telegramUserId,
      displayName: meData.displayName,
      username: meData.username,
      phone: meData.phone, // Normalized
      isActive: id === req.accountId,
      sessionStatus: acc.sessionStatus || 'disconnected'
    });
  }

  log(`[Accounts Debug] rawAccounts count: ${rawAccounts.length}`);
  
  // Deduplicate using telegramUserId > normalizedPhone > accountId
  const dedupedMap = new Map();
  let hiddenInvalidAccounts = 0;
  
  for (const acc of rawAccounts) {
    const key = acc.telegramUserId || acc.phone || acc.accountId;
    log(`[Accounts Debug] raw accountId: ${acc.accountId}, userId: ${acc.telegramUserId}, phone: ${acc.phone}, displayName: ${acc.displayName}, key: ${key}`);
    
    if (dedupedMap.has(key)) {
      const existing = dedupedMap.get(key);
      log(`[Accounts Debug] Duplicate found! Merging ${acc.accountId} into canonical ${existing.accountId}`);
      // Merge: prefer connected session, keep isActive if any is active, keep phone/username
      if (acc.isActive) {
        existing.isActive = true;
        log(`[Accounts Debug] Migrating active checkmark to canonicalAccountId: ${existing.accountId}`);
      }
      if (acc.phone && !existing.phone) existing.phone = acc.phone;
      if (acc.username && !existing.username) existing.username = acc.username;
      if (acc.sessionStatus === 'connected') existing.sessionStatus = 'connected';
      
      // If the duplicate has a better display name, use it
      if (acc.displayName && acc.displayName !== 'Telegram Account' && existing.displayName === 'Telegram Account') {
         existing.displayName = acc.displayName;
      }
      hiddenInvalidAccounts++;
    } else {
      dedupedMap.set(key, { ...acc });
    }
  }

  const finalAccounts = Array.from(dedupedMap.values());
  log(`[Accounts Debug] dedupedAccounts count: ${finalAccounts.length}, hiddenInvalidAccounts count: ${hiddenInvalidAccounts}`);
  res.json(finalAccounts);
});

app.post('/api/telegram/accounts/add-session', async (req, res) => {
  const { sessionString, accountId } = req.body;
  if (!sessionString || !accountId) return res.status(400).json({ error: 'Session string and accountId required' });
  
  try {
    const { TelegramClient } = require('telegram');
    const { StringSession } = require('telegram/sessions');
    const client = new TelegramClient(new StringSession(sessionString), TG_API_ID, TG_API_HASH, { connectionRetries: 1 });
    await client.connect();
    const me = await client.getMe(); // Verify it works
    const telegramUserId = me.id.toString();
    const userPhone = normalizePhone(me.phone || '');
    
    let canonicalAccountId = accountId;
    for (const [id, acc] of _accounts.entries()) {
      if (id !== accountId && acc.session) {
         const accPhone = normalizePhone(acc.phone || '');
         if ((acc.telegramUserId && acc.telegramUserId === telegramUserId) || (accPhone && userPhone && accPhone === userPhone)) {
            canonicalAccountId = id;
            break;
         }
      }
    }

    if (canonicalAccountId !== accountId) {
      log(`[Auth] Duplicate imported session for ${telegramUserId}, merging into ${canonicalAccountId}`);
      _accounts.set(canonicalAccountId, { session: sessionString, client: client, ready: true, telegramUserId, phone: userPhone });
      await saveSessionToDB(sessionString, canonicalAccountId);
    } else {
      _accounts.set(accountId, { session: sessionString, client: client, ready: true, telegramUserId, phone: userPhone });
      await saveSessionToDB(sessionString, accountId);
    }
    
    log(`✅ Imported session for ${canonicalAccountId}`);
    res.json({ ok: true, accountId: canonicalAccountId });
  } catch (e) {
    log('add-session error: ' + e.message);
    res.status(500).json({ error: 'Invalid session string or connection failed: ' + e.message });
  }
});

app.post('/api/telegram/accounts/switch', (req, res) => {
  const { accountId } = req.body;
  if (!_accounts.has(accountId)) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true, message: 'Switched to ' + accountId });
});

app.post('/api/telegram/accounts/logout', async (req, res) => {
  const { accountId } = req.body;
  const acc = _accounts.get(accountId);
  if (acc) {
    acc.session = '';
    acc.ready = false;
    if (acc.client) {
      try { await acc.client.disconnect(); } catch (e) {}
    }
    _accounts.delete(accountId);
    // In Supabase we should theoretically delete the row, but replacing with empty is fine for now
    await saveSessionToDB('', accountId);
  }
  res.json({ ok: true });
});

app.get('/api/telegram/accounts/:accountId/status', (req, res) => {
  const acc = _accounts.get(req.params.accountId);
  res.json({ status: acc && acc.session && acc.ready ? 'connected' : 'disconnected' });
});

app.get('/api/telegram/accounts/:accountId/profile', requireAuth, async (req, res) => {
  const accountId = req.params.accountId;
  const acc = _accounts.get(accountId);
  if (!acc?.session) return res.status(404).json({ ok: false, error: 'Account not found or not connected' });
  
  try {
    const client = await getClient(accountId);
    const { Api } = require('telegram/tl');
    const me = await client.getMe();
    
    let full = null;
    try {
      full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    } catch (e) {
      log('GetFullUser for me error: ' + e.message);
    }
    
    const telegramUserId = me.id.toString();
    const displayName = (me.firstName || '') + (me.lastName ? ' ' + me.lastName : '');
    
    const responseData = {
      ok: true,
      accountId,
      telegramUserId,
      displayName: displayName.trim(),
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || '',
      sessionStatus: acc.sessionStatus || (acc.ready ? 'connected' : 'disconnected'),
      isActive: req.accountId === accountId,
      userStatus: me.status?.className || '',
      lastSeenAt: me.status?.wasOnline || null,
      displayStatus: me.status?.className || '',
      bio: full?.fullUser?.about || '',
      businessHours: full?.fullUser?.businessWorkHours || null,
      location: full?.fullUser?.businessLocation || null
    };
    
    res.json(responseData);
  } catch (e) {
    log('accounts profile error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get('/api/health', (req,res) => res.json({ ok: true, tgConnected: _accounts.has('default') && _accounts.get('default').session.length > 10 }))
app.get('/api/logs', requireAuth, (req,res) => res.json(logs))

// ── SEND REACTION ──
app.post(['/api/chat/react', '/api/telegram/messages/react'], requireAuth, async (req,res) => {
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({error:'Not connected'})
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
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
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
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({error:'Not connected'})
  const {chatId, username, topicId} = req.query
  if(!chatId) return res.status(400).json({error:'Missing chatId'})
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
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
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({error:'Not connected'})
  const { chatId, username, maxId } = req.body
  if(!chatId) return res.status(400).json({error:'Missing chatId'})
  try {
    const client = await withTimeout(getClient(req.accountId), 10000, 'getClient')
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
let sseClients = new Map() // accountId -> Set(res)

app.get('/api/chat/stream', (req, res) => {
  const token = req.query.token
  const accountId = req.query.accountId || DEFAULT_ACCOUNT_ID
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
  res.setHeader('X-Accel-Buffering', 'no') // Disable Nginx/Railway proxy buffering
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

  if (!sseClients.has(accountId)) sseClients.set(accountId, new Set())
  sseClients.get(accountId).add(res)

  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    const clients = sseClients.get(accountId)
    if (clients) clients.delete(res)
  })
})

function broadcastSSE(accountId, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`
  const clients = sseClients.get(accountId)
  if (clients) clients.forEach(client => client.write(payload))
}

function attachTGListener(client, accountId) {
  if (client._listenerAttached) return;
  client._listenerAttached = true;
  log(`Attaching TG listener for account ${accountId}`);

  let NewMessage
  try { NewMessage = require('telegram/events/NewMessage').NewMessage } catch {}
  if (!NewMessage) { try { NewMessage = require('telegram/events').NewMessage } catch {} }

  let DeletedMessage
  try { DeletedMessage = require('telegram/events/DeletedMessage').DeletedMessage } catch {}

  let Raw;
  try { Raw = require('telegram/events/Raw').Raw; } catch {}

  if (NewMessage) {
    client.addEventHandler(async (ev) => {
      try { 
        if (ev.message) {
          const m = ev.message
          
          let finalChatId = m.chatId ? m.chatId.toString() : null;
          if (m.peerId) {
            if (m.peerId.className === 'PeerChannel') finalChatId = '-100' + m.peerId.channelId.toString();
            else if (m.peerId.className === 'PeerChat') finalChatId = '-' + m.peerId.chatId.toString();
            else if (m.peerId.className === 'PeerUser') finalChatId = m.peerId.userId.toString();
          }
          
          const msgObj = {
            id: m.id,
            chatId: finalChatId,
            text: m.message || '',
            date: m.date,
            fromMe: m.out,
            isReply: !!m.replyTo,
            replyToMsgId: m.replyTo?.replyToMsgId,
            action: m.action ? true : false,
            senderId: m.senderId ? m.senderId.toString() : null,
            topicId: (m.replyTo?.forumTopic ? m.replyTo.replyToMsgId : m.replyTo?.replyToTopId) || null,
            messageId: m.id,
            isOutgoing: m.out,
            sentAt: m.date,
            normalizedStatus: m.out ? 'sent' : null
          }
          if (m.media) {
            msgObj.hasMedia = true
            msgObj.mediaType = m.media.className
          }
          broadcastSSE(accountId, { type: 'new_message', accountId, message: msgObj })
        }
      } catch(err) {
        log('SSE broadcast error: ' + err.message)
      }
    }, new NewMessage({}))
  }

  if (DeletedMessage) {
    client.addEventHandler(async (ev) => {
      try {
        if (ev.deletedIds && ev.deletedIds.length > 0) {
           broadcastSSE(accountId, { type: 'delete_messages', accountId, ids: ev.deletedIds, chatId: ev.chatId ? ev.chatId.toString() : null })
        }
      } catch(e) {}
    }, new DeletedMessage({}))
  }

  if (Raw) {
    client.addEventHandler(async (ev) => {
      try {
        if (ev.className === 'UpdateMessageReactions') {
          const peer = ev.peer;
          let chatId = null;
          if (peer.className === 'PeerUser') chatId = peer.userId.toString();
          else if (peer.className === 'PeerChat') chatId = peer.chatId.toString();
          else if (peer.className === 'PeerChannel') chatId = '-100' + peer.channelId.toString();
          
          const msgId = ev.msgId;
          const topMsgId = ev.topMsgId;
          
          if (chatId && msgId && ev.reactions) {
             const parsedReactions = parseReactions(ev.reactions.results);
             const parsedRecent = parseRecentReactions(ev.reactions.recentReactions);
             broadcastSSE(accountId, { 
               type: 'update_reactions', 
               accountId,
               chatId, 
               msgId, 
               topicId: topMsgId || null,
               reactions: parsedReactions,
               recentReactions: parsedRecent
             });
          }
        } else if (ev.className === 'UpdateReadHistoryOutbox' || ev.className === 'UpdateReadChannelOutbox') {
          const peer = ev.peer || ev;
          let chatId = null;
          if (ev.className === 'UpdateReadChannelOutbox') {
             chatId = '-100' + ev.channelId.toString();
          } else if (peer) {
             if (peer.className === 'PeerUser') chatId = peer.userId.toString();
             else if (peer.className === 'PeerChat') chatId = peer.chatId.toString();
             else if (peer.className === 'PeerChannel') chatId = '-100' + peer.channelId.toString();
          }
          if (chatId) {
             broadcastSSE(accountId, {
               type: 'read_outbox',
               accountId,
               chatId,
               maxId: ev.maxId
             });
          }
        }
      } catch(e) {}
    }, new Raw({}));
  }
}

// ── COMMON GROUPS ──
app.get('/api/chat/common_groups/:id', requireAuth, async (req, res) => {
  if (!_accounts.get(req.accountId)?.session) return res.json({error: 'No session'})
  try {
    const client = await getClient(req.accountId)
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
// Prevent /api requests from falling back to the React HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({
    ok: false,
    code: 'API_ROUTE_NOT_FOUND',
    error: `API route ${req.method} ${req.path} not found on the backend.`
  });
});

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
  if (!_accounts.get(req.accountId)?.session) return res.status(401).json({ error: 'Not connected' });
  const { documentId } = req.params;
  
  try {
    const client = await getClient(req.accountId);
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
