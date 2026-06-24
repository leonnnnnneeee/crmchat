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
