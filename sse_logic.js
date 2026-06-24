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
            senderId: m.senderId ? m.senderId.toString() : null
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
