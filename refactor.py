import os

filepath = '/Users/linh/Downloads/crmchat_latest/server.js'
with open(filepath, 'r') as f:
    lines = f.readlines()

# 1. Add attachTGListener and update getClient
# Find getClient
get_client_start = -1
for i, line in enumerate(lines):
    if line.startswith('async function getClient(accountId = DEFAULT_ACCOUNT_ID) {'):
        get_client_start = i
        break

# Find where acc.ready = true is set
acc_ready_idx = -1
for i in range(get_client_start, len(lines)):
    if 'acc.ready = true' in lines[i]:
        acc_ready_idx = i
        break

# Insert attachTGListener call
lines.insert(acc_ready_idx + 1, "    attachTGListener(acc.client, accountId)\n")


# 2. Replace SSE and startTGListener with account-scoped versions
sse_start = -1
sse_end = -1
for i, line in enumerate(lines):
    if line.startswith('// ── SSE REALTIME STREAM ──'):
        sse_start = i
    if line.startswith('setTimeout(startTGListener, 3000)'):
        sse_end = i
        break

new_sse_code = """// ── SSE REALTIME STREAM ──
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
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\\n\\n`)

  if (!sseClients.has(accountId)) sseClients.set(accountId, new Set())
  sseClients.get(accountId).add(res)

  req.on('close', () => {
    const clients = sseClients.get(accountId)
    if (clients) clients.delete(res)
  })
})

function broadcastSSE(accountId, data) {
  const payload = `data: ${JSON.stringify(data)}\\n\\n`
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
          
          const msgObj = {
            id: m.id,
            chatId: m.chatId ? m.chatId.toString() : null,
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
"""

lines = lines[:sse_start] + [new_sse_code] + lines[sse_end+1:]

with open(filepath, 'w') as f:
    f.writelines(lines)
