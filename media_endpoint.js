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
