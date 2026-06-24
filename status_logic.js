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
