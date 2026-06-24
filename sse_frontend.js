  const selRef = useRef(sel)
  useEffect(() => { selRef.current = sel }, [sel])

  // Real-time SSE Connection
  useEffect(() => {
    if (!token) return
    
    let sse = null
    let retryCount = 0
    let reconnectTimeout = null

    const connectSSE = () => {
      sse = new EventSource('/api/chat/stream?token=' + encodeURIComponent(token))
      
      sse.onopen = () => {
        retryCount = 0
        // When reconnecting, fetch chats again to catch up
        fetchChats()
        if (selRef.current) {
           loadMessages(selRef.current)
        }
      }

      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'new_message') {
            const msg = data.message
            
            // 1. Update chats list and unread count
            setChats(prev => {
              const newChats = [...prev]
              const idx = newChats.findIndex(c => c.id === msg.chatId)
              if (idx > -1) {
                const c = newChats[idx]
                // Only increment unread if not currently in that chat
                if (selRef.current?.id !== msg.chatId && !msg.fromMe) {
                  c.unread = (c.unread || 0) + 1
                }
                c.lastMessage = msg.hasMedia ? '[Media]' : msg.text
                c.lastMessageAt = msg.date
                c.date = msg.date
                
                // Move chat to top (below pinned chats)
                const updatedChat = newChats.splice(idx, 1)[0]
                const lastPinnedIdx = newChats.map(x=>x.pinned).lastIndexOf(true)
                if (updatedChat.pinned) {
                   // Keep it sorted by date inside pinned
                   const insertIdx = newChats.findIndex((x, i) => i <= lastPinnedIdx && x.date < msg.date)
                   newChats.splice(insertIdx === -1 ? lastPinnedIdx + 1 : insertIdx, 0, updatedChat)
                } else {
                   const insertIdx = newChats.findIndex((x, i) => i > lastPinnedIdx && x.date < msg.date)
                   newChats.splice(insertIdx === -1 ? newChats.length : insertIdx, 0, updatedChat)
                }
              }
              return newChats
            })

            // 2. Append to msgs if in active chat
            if (selRef.current?.id === msg.chatId) {
              setMsgs(prev => {
                if (prev.some(m => m.id === msg.id)) return prev
                const updated = [...prev, msg]
                return updated.sort((a,b) => a.date - b.date)
              })
              
              // Regenerate AI Reply if we are in the chat
              setAiSuggestions([])
              setAiText('')

              // Mark as read immediately if window has focus and message is incoming
              if (!msg.fromMe && document.hasFocus()) {
                fetch('/api/chat/read', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json', 'x-auth-token': token},
                  body: JSON.stringify({ chatId: msg.chatId })
                }).catch(err => console.error("Auto read error", err))
              }
            }
          }
          else if (data.type === 'delete_messages') {
             const { ids, chatId } = data
             if (selRef.current?.id === chatId) {
                setMsgs(prev => prev.filter(m => !ids.includes(m.id)))
             }
          }
        } catch (err) {
          console.error('SSE parse error:', err)
        }
      }

      sse.onerror = () => {
        sse.close()
        // Exponential backoff reconnect
        const delay = Math.min(10000, 1000 * Math.pow(2, retryCount++))
        reconnectTimeout = setTimeout(connectSSE, delay)
      }
    }

    connectSSE()

    return () => {
      clearTimeout(reconnectTimeout)
      if (sse) sse.close()
    }
  }, [token])
