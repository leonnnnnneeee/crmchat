import { useState, useEffect, useRef, useCallback } from 'react'

const C = {
  bg0:'#0d0d12', bg1:'#15151e', bg2:'#1c1c28', bg3:'#242433',
  border:'#2a2a3d', textPrimary:'#f0f0f8', textSecondary:'#8888aa', textMuted:'#55556a',
  accent:'#e879f9', accentDim:'rgba(232,121,249,0.15)', accentPurple:'#a855f7',
  success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', dangerDim:'rgba(239,68,68,0.12)',
}

const STAGES = {
  'New':        {color:'#6366f1',bg:'rgba(99,102,241,0.15)'},
  'Contacted':  {color:'#3b82f6',bg:'rgba(59,130,246,0.15)'},
  'Interested': {color:'#f59e0b',bg:'rgba(245,158,11,0.15)'},
  'Negotiating':{color:'#e879f9',bg:'rgba(232,121,249,0.15)'},
  'Closed Won': {color:'#22c55e',bg:'rgba(34,197,94,0.15)'},
  'Closed Lost':{color:'#6b7280',bg:'rgba(107,114,128,0.15)'},
}

const TEMPLATES = [
  {id:'first',    cat:'Outreach',   label:'First Outreach',         text:"Hi [Name], I'm Leon from Coincu — we help Web3 projects get media visibility through Coincu PR and CMC News. Is your team focused on any upcoming milestone?"},
  {id:'followup', cat:'Follow-up',  label:'Follow-up after Seen',   text:"Hey [Name], just checking in — did you get a chance to look at what I shared? Happy to answer any questions."},
  {id:'whatwesell',cat:'Pitch',     label:'Client asks what we sell',text:"Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your current focus more awareness, users, or credibility before a milestone?"},
  {id:'nobudget', cat:'Objection',  label:'No budget',              text:"Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?"},
  {id:'noconvert',cat:'Objection',  label:"Media doesn't convert",  text:"That's fair — direct conversion isn't the main goal. It's more about the credibility layer that helps everything else convert better: ads, community, investor trust."},
  {id:'raising',  cat:'Context',    label:'Client raising funds',   text:"That's actually great timing — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?"},
  {id:'users',    cat:'Context',    label:'Focused on users/growth', text:"Got it. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?"},
  {id:'agency',   cat:'Context',    label:'Client is agency',       text:"Good to know — do you typically handle media/PR in-house or bring in partners? We work well with agencies on a referral or reseller model too."},
  {id:'referral', cat:'Partnership',label:'Offer referral',         text:"By the way — if you know any Web3 projects who need PR or CMC News placement, we offer a referral commission on closed deals."},
  {id:'pitchpr',  cat:'Pitch',      label:'Pitch Coincu PR',        text:"Coincu PR gets your project in front of 500K+ monthly readers — crypto investors, traders, enthusiasts. Great for announcement visibility and SEO. Want the rate card?"},
  {id:'pitchcmc', cat:'Pitch',      label:'Pitch CMC News',         text:"CMC News puts your content directly on CoinMarketCap — one of the highest-traffic crypto sites. Strong for credibility before TGE. Interested?"},
  {id:'pitchbanner',cat:'Pitch',    label:'Pitch Banner Ads',       text:"We also run banner placements on Coincu — good for retargeting during a campaign window. Worth a look if you're running something soon."},
  {id:'closing',  cat:'Closing',    label:'Closing',                text:"Based on what you've shared, I think [service] would be the best fit. Want me to put together a quick proposal? I can have it ready today."},
]

function aiSuggest(lead, lastMsg='') {
  const msg = lastMsg.toLowerCase()
  if (msg.includes('feedback') || msg.includes('users')) return "Got it, that makes sense. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?"
  if (msg.includes('sell') || msg.includes('offer') || msg.includes('what do you')) return "Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your focus more awareness, users, or credibility before a milestone?"
  if (msg.includes('budget') || msg.includes('expensive') || msg.includes('price')) return "Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?"
  if (msg.includes('raising') || msg.includes('round') || msg.includes('investor')) return "That's actually great timing — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?"
  if (msg.includes('busy') || msg.includes('later') || msg.includes('not now')) return "No worries at all. When would be a better time to revisit? I'll follow up then."
  const name = lead.name || lead.contactName || ''
  const project = lead.projectName || lead.sources || ''
  return `Thanks for the context. What's the main goal for ${project || name} right now — awareness, credibility, or users?`
}

function StageBadge({stage}) {
  const s = STAGES[stage] || STAGES['New']
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.color}40`,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{stage}</span>
}

function Avatar({name, size=36}) {
  const initials = (name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  const colors = ['#6366f1','#a855f7','#e879f9','#3b82f6','#22c55e','#f59e0b']
  const color = colors[(name||'').charCodeAt(0)%colors.length]||colors[0]
  return <div style={{width:size,height:size,borderRadius:'50%',background:color+'33',border:`2px solid ${color}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.38,fontWeight:700,color,flexShrink:0}}>{initials}</div>
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    const d = typeof ts === 'number' ? new Date(ts*1000) : new Date(ts)
    const now = new Date(), diff = now - d
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return Math.floor(diff/60000)+'m'
    if (diff < 86400000) return d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})
    return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
  } catch { return '' }
}

export default function CRMChat({token, leads: externalLeads=[], initialLeadId=null, onOpenLeadDetail}) {
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [leadData, setLeadData] = useState({}) // leadId -> enriched data
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('all')
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateCat, setTemplateCat] = useState('all')
  const [aiSuggestedText, setAiSuggestedText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [notes, setNotes] = useState({}) // chatId -> [notes]
  const [stage, setStage] = useState({}) // chatId -> stage
  const [probability, setProbability] = useState({}) // chatId -> number
  const [dealValue, setDealValue] = useState({}) // chatId -> number
  const [followUp, setFollowUp] = useState({}) // chatId -> date
  const messagesEndRef = useRef(null)

  // Load TG chats + match with leads
  const loadChats = useCallback(async () => {
    setLoadingChats(true)
    try {
      const r = await fetch('/api/chat/list', {headers:{'x-auth-token':token}})
      const tgChats = await r.json()
      // Merge with leads data
      const merged = tgChats.map(chat => {
        const lead = externalLeads.find(l =>
          l.telegram_username && chat.name &&
          (chat.name.toLowerCase().includes(l.telegram_username.toLowerCase()) ||
           l.telegram_username.toLowerCase().includes(chat.name.toLowerCase()))
        )
        return { ...chat, lead, stage: 'Contacted', projectName: lead?.name || chat.name }
      })
      setChats(merged)
      // Auto-select if initialLeadId
      if (initialLeadId) {
        const lead = externalLeads.find(l => l.id === initialLeadId)
        if (lead) {
          const match = merged.find(c => c.lead?.id === initialLeadId)
          if (match) selectChat(match)
        }
      }
    } catch(e) {
      console.error('Load chats error:', e)
      // Fallback: show leads as chats
      const fallback = externalLeads.map(l => ({
        id: l.telegram_username || l.id,
        name: l.name || l.telegram_username || 'Unknown',
        lastMsg: l.note || '',
        unread: 0,
        date: l.last_contacted,
        lead: l,
        projectName: l.name,
        stage: l.status || 'new'
      }))
      setChats(fallback)
    }
    setLoadingChats(false)
  }, [token, externalLeads, initialLeadId])

  useEffect(() => { loadChats() }, [loadChats])

  // Load messages for selected chat
  async function selectChat(chat) {
    setSelectedChat(chat)
    setMessages([])
    setAiSuggestedText('')
    setLoadingMsgs(true)
    try {
      const r = await fetch(`/api/chat/messages/${chat.id}`, {headers:{'x-auth-token':token}})
      const msgs = await r.json()
      setMessages(msgs)
    } catch(e) {
      console.error('Load messages error:', e)
      setMessages([])
    }
    setLoadingMsgs(false)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior:'smooth'})
  }, [messages])

  async function sendMessage() {
    if (!msgInput.trim() || !selectedChat) return
    setSending(true)
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-auth-token':token},
        body: JSON.stringify({chatId: selectedChat.id, text: msgInput.trim()})
      })
      setMessages(prev => [...prev, {
        text: msgInput.trim(), fromMe: true,
        date: Math.floor(Date.now()/1000)
      }])
      setMsgInput('')
      setAiSuggestedText('')
    } catch(e) {
      alert('Gửi thất bại: ' + e.message)
    }
    setSending(false)
  }

  function handleAISuggest() {
    if (!selectedChat) return
    setAiLoading(true)
    const lastClientMsg = [...messages].reverse().find(m => !m.fromMe)?.text || ''
    setTimeout(() => {
      setAiSuggestedText(aiSuggest(selectedChat, lastClientMsg))
      setAiLoading(false)
    }, 600)
  }

  function addNote() {
    if (!noteInput.trim() || !selectedChat) return
    const note = {id: Date.now(), content: noteInput.trim(), createdAt: new Date().toLocaleDateString('vi-VN')}
    setNotes(prev => ({...prev, [selectedChat.id]: [...(prev[selectedChat.id]||[]), note]}))
    setNoteInput('')
    setAddingNote(false)
  }

  const filteredChats = chats.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.projectName||'').toLowerCase().includes(search.toLowerCase())
    const chatStage = stage[c.id] || c.stage || 'Contacted'
    const matchStage = filterStage === 'all' || chatStage === filterStage
    return matchSearch && matchStage
  })

  const inp = {background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,color:C.textPrimary,padding:'8px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',fontFamily:'inherit'}
  const templateCats = ['all', ...new Set(TEMPLATES.map(t=>t.cat))]
  const chatStage = selectedChat ? (stage[selectedChat.id] || 'Contacted') : 'New'
  const chatNotes = selectedChat ? (notes[selectedChat.id] || []) : []
  const chatProbability = selectedChat ? (probability[selectedChat.id] ?? 50) : 50
  const chatDealValue = selectedChat ? (dealValue[selectedChat.id] ?? 0) : 0
  const chatFollowUp = selectedChat ? (followUp[selectedChat.id] || '') : ''

  return (
    <div style={{display:'grid',gridTemplateColumns:'280px 1fr 320px',height:'calc(100vh - 56px)',background:C.bg0,fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}}>

      {/* COL 1: LIST */}
      <div style={{background:C.bg1,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'12px 12px 8px'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inp,fontSize:12}}/>
        </div>
        <div style={{padding:'0 12px 10px'}}>
          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{...inp,fontSize:11,padding:'5px 8px'}}>
            <option value="all">All stages</option>
            {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{padding:'0 12px 6px',fontSize:11,color:C.textMuted}}>
          {loadingChats ? 'Loading...' : `${filteredChats.length} conversations`}
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {filteredChats.map(chat => {
            const isSelected = selectedChat?.id === chat.id
            const chatSt = stage[chat.id] || 'Contacted'
            return (
              <div key={chat.id} onClick={()=>selectChat(chat)}
                style={{padding:'12px 14px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,background:isSelected?C.bg3:'transparent',borderLeft:isSelected?`3px solid ${C.accent}`:'3px solid transparent',transition:'all 0.1s'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                  <Avatar name={chat.name} size={36}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13,color:C.textPrimary,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{chat.name}</span>
                      <span style={{fontSize:10,color:C.textMuted,flexShrink:0,marginLeft:6}}>{formatTime(chat.date)}</span>
                    </div>
                    {chat.unread > 0 && <span style={{fontSize:10,background:C.accent,color:'#fff',padding:'1px 6px',borderRadius:99,marginBottom:4,display:'inline-block'}}>{chat.unread} new</span>}
                    <div style={{fontSize:11,color:C.textMuted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:5}}>{chat.lastMsg}</div>
                    <StageBadge stage={chatSt}/>
                  </div>
                </div>
              </div>
            )
          })}
          {!loadingChats && filteredChats.length === 0 && (
            <div style={{padding:24,textAlign:'center',color:C.textMuted,fontSize:13}}>No conversations found</div>
          )}
        </div>
      </div>

      {/* COL 2: CHAT */}
      <div style={{display:'flex',flexDirection:'column',background:C.bg0,overflow:'hidden'}}>
        {!selectedChat ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:C.textMuted}}>
            <div style={{fontSize:32}}>💬</div>
            <div style={{fontSize:14}}>Select a conversation</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12,background:C.bg1}}>
              <Avatar name={selectedChat.name} size={40}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:C.textPrimary}}>{selectedChat.name}</div>
                <div style={{fontSize:12,color:C.textSecondary}}>{selectedChat.lead?.sources || 'Telegram'}</div>
              </div>
              <StageBadge stage={chatStage}/>
              <button onClick={loadChats} style={{fontSize:11,padding:'5px 10px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>↻ Refresh</button>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:10}}>
              {loadingMsgs && <div style={{textAlign:'center',color:C.textMuted,fontSize:13}}>Loading messages...</div>}
              {!loadingMsgs && messages.length === 0 && <div style={{textAlign:'center',color:C.textMuted,fontSize:13,marginTop:40}}>No messages yet</div>}
              {messages.map((msg,i) => (
                <div key={i} style={{display:'flex',flexDirection:msg.fromMe?'row-reverse':'row',alignItems:'flex-end',gap:8}}>
                  {!msg.fromMe && <Avatar name={selectedChat.name} size={28}/>}
                  <div style={{maxWidth:'72%'}}>
                    <div style={{padding:'10px 14px',borderRadius:msg.fromMe?'16px 16px 4px 16px':'16px 16px 16px 4px',background:msg.fromMe?`linear-gradient(135deg, ${C.accentPurple}, ${C.accent})`:C.bg2,color:msg.fromMe?'#fff':C.textPrimary,fontSize:13,lineHeight:1.5,border:!msg.fromMe?`1px solid ${C.border}`:'none'}}>
                      {msg.text}
                    </div>
                    <div style={{fontSize:10,color:C.textMuted,marginTop:3,textAlign:msg.fromMe?'right':'left'}}>{formatTime(msg.date)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef}/>
            </div>

            {/* AI Suggest bar */}
            {aiSuggestedText && (
              <div style={{margin:'0 24px 8px',padding:'10px 14px',background:C.accentDim,border:`1px solid ${C.accent}44`,borderRadius:10,display:'flex',gap:10,alignItems:'flex-start'}}>
                <span style={{fontSize:12,color:C.accent,fontWeight:600,flexShrink:0}}>✨ AI</span>
                <span style={{fontSize:13,color:C.textPrimary,flex:1,lineHeight:1.5}}>{aiSuggestedText}</span>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>{setMsgInput(aiSuggestedText);setAiSuggestedText('')}} style={{fontSize:11,padding:'4px 10px',background:C.accent,color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>Use</button>
                  <button onClick={()=>setAiSuggestedText('')} style={{fontSize:11,padding:'4px 8px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>✕</button>
                </div>
              </div>
            )}

            {/* Templates */}
            {showTemplates && (
              <div style={{margin:'0 24px 8px',background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',maxHeight:240}}>
                <div style={{padding:'8px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:6,overflowX:'auto'}}>
                  {templateCats.map(cat=>(
                    <button key={cat} onClick={()=>setTemplateCat(cat)} style={{fontSize:11,padding:'3px 10px',border:'none',borderRadius:99,cursor:'pointer',whiteSpace:'nowrap',fontWeight:500,background:templateCat===cat?C.accent:C.bg3,color:templateCat===cat?'#fff':C.textSecondary}}>
                      {cat==='all'?'All':cat}
                    </button>
                  ))}
                  <button onClick={()=>setShowTemplates(false)} style={{marginLeft:'auto',fontSize:11,padding:'3px 8px',background:'none',border:'none',color:C.textMuted,cursor:'pointer',flexShrink:0}}>✕</button>
                </div>
                <div style={{overflowY:'auto',maxHeight:190}}>
                  {TEMPLATES.filter(t=>templateCat==='all'||t.cat===templateCat).map(t=>(
                    <div key={t.id} onClick={()=>{setMsgInput(t.text);setShowTemplates(false)}}
                      style={{padding:'10px 14px',cursor:'pointer',borderBottom:`1px solid ${C.border}`}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{fontSize:12,fontWeight:600,color:C.textPrimary,marginBottom:2}}>{t.label}</div>
                      <div style={{fontSize:11,color:C.textSecondary,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{padding:'12px 24px 16px',borderTop:`1px solid ${C.border}`,background:C.bg1}}>
              <textarea value={msgInput} onChange={e=>setMsgInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}}
                placeholder="Type a message... (Enter to send)" rows={3}
                style={{...inp,resize:'none',marginBottom:10,lineHeight:1.5}}/>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>setShowTemplates(v=>!v)} style={{fontSize:12,padding:'7px 14px',border:`1px solid ${C.border}`,background:showTemplates?C.accentDim:C.bg3,color:showTemplates?C.accent:C.textSecondary,borderRadius:8,cursor:'pointer'}}>📋 Templates</button>
                <button onClick={handleAISuggest} disabled={aiLoading} style={{fontSize:12,padding:'7px 14px',border:`1px solid ${C.border}`,background:C.bg3,color:C.accent,borderRadius:8,cursor:'pointer',opacity:aiLoading?0.6:1}}>
                  {aiLoading?'⏳':'✨'} AI Suggest
                </button>
                <div style={{flex:1}}/>
                <button onClick={sendMessage} disabled={!msgInput.trim()||sending}
                  style={{fontSize:13,padding:'7px 20px',border:'none',background:msgInput.trim()?`linear-gradient(135deg,${C.accentPurple},${C.accent})`:C.bg3,color:msgInput.trim()?'#fff':C.textMuted,borderRadius:8,cursor:msgInput.trim()?'pointer':'default',fontWeight:600}}>
                  {sending?'Sending...':'Send ↑'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* COL 3: PROFILE */}
      <div style={{background:C.bg1,borderLeft:`1px solid ${C.border}`,overflowY:'auto'}}>
        {!selectedChat ? (
          <div style={{padding:24,textAlign:'center',color:C.textMuted,fontSize:13,marginTop:40}}>Select a conversation</div>
        ) : (
          <div>
            {/* Header */}
            <div style={{padding:'20px 16px',borderBottom:`1px solid ${C.border}`,textAlign:'center'}}>
              <Avatar name={selectedChat.name} size={56}/>
              <div style={{marginTop:10,fontWeight:700,fontSize:16,color:C.textPrimary}}>{selectedChat.name}</div>
              {selectedChat.lead && <div style={{fontSize:12,color:C.textSecondary,marginBottom:8}}>{selectedChat.lead.sources||''}</div>}
              <StageBadge stage={chatStage}/>
            </div>

            {/* Contact */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Contact</div>
              {selectedChat.lead?.telegram_username && <div style={{fontSize:12,color:'#229ED9',marginBottom:5}}>📱 @{selectedChat.lead.telegram_username}</div>}
              {selectedChat.lead?.lark_email && <div style={{fontSize:12,color:C.textSecondary,marginBottom:5}}>📧 {selectedChat.lead.lark_email}</div>}
              {selectedChat.lead?.website && <a href={selectedChat.lead.website} target="_blank" rel="noreferrer" style={{fontSize:12,color:C.accentPurple,display:'block',textDecoration:'none'}}>🌐 {selectedChat.lead.website.replace('https://','')}</a>}
              {!selectedChat.lead && <div style={{fontSize:12,color:C.textMuted,fontStyle:'italic'}}>Telegram contact — not in leads list</div>}
            </div>

            {/* Deal */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Deal</div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Stage</div>
                <select value={chatStage} onChange={e=>setStage(p=>({...p,[selectedChat.id]:e.target.value}))}
                  style={{...inp,fontSize:12,padding:'6px 10px'}}>
                  {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4,display:'flex',justifyContent:'space-between'}}>
                  <span>Probability</span><span style={{color:C.accent,fontWeight:600}}>{chatProbability}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={chatProbability}
                  onChange={e=>setProbability(p=>({...p,[selectedChat.id]:parseInt(e.target.value)}))}
                  style={{width:'100%',accentColor:C.accent}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Expected Value (USD)</div>
                <input type="number" value={chatDealValue} onChange={e=>setDealValue(p=>({...p,[selectedChat.id]:parseInt(e.target.value)||0}))}
                  style={{...inp,fontSize:12,padding:'6px 10px'}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Next Follow-up</div>
                <input type="date" value={chatFollowUp} onChange={e=>setFollowUp(p=>({...p,[selectedChat.id]:e.target.value}))}
                  style={{...inp,fontSize:12,padding:'6px 10px'}}/>
              </div>
            </div>

            {/* Notes */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px'}}>Notes</div>
                <button onClick={()=>setAddingNote(v=>!v)} style={{fontSize:11,padding:'2px 8px',background:C.bg3,border:`1px solid ${C.border}`,color:C.textSecondary,borderRadius:5,cursor:'pointer'}}>+ Add</button>
              </div>
              {addingNote && (
                <div style={{marginBottom:8}}>
                  <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Add a note..." rows={2}
                    style={{...inp,resize:'none',fontSize:12,marginBottom:6}}/>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={addNote} style={{fontSize:11,padding:'5px 12px',background:C.accent,color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>Save</button>
                    <button onClick={()=>setAddingNote(false)} style={{fontSize:11,padding:'5px 10px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}
              {chatNotes.length === 0 && !addingNote && <div style={{fontSize:12,color:C.textMuted,fontStyle:'italic'}}>No notes yet</div>}
              {chatNotes.map(note=>(
                <div key={note.id} style={{padding:'8px 10px',background:C.bg2,borderRadius:7,border:`1px solid ${C.border}`,marginBottom:6}}>
                  <div style={{fontSize:12,color:C.textPrimary,lineHeight:1.5,marginBottom:3}}>{note.content}</div>
                  <div style={{fontSize:10,color:C.textMuted}}>{note.createdAt}</div>
                </div>
              ))}
            </div>

            {/* Lead note from dashboard */}
            {selectedChat.lead?.note && (
              <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Sales Note</div>
                <div style={{fontSize:12,color:C.textSecondary,lineHeight:1.5,background:C.bg2,padding:'8px 10px',borderRadius:7,border:`1px solid ${C.border}`}}>{selectedChat.lead.note}</div>
              </div>
            )}

            {/* Actions */}
            <div style={{padding:'14px 16px'}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Actions</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {onOpenLeadDetail && selectedChat.lead && (
                  <button onClick={()=>onOpenLeadDetail(selectedChat.lead.id)}
                    style={{fontSize:12,padding:'8px 14px',background:C.bg3,color:C.textPrimary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontWeight:500}}>
                    🔍 View Lead Detail
                  </button>
                )}
                <button onClick={()=>setStage(p=>({...p,[selectedChat.id]:'Negotiating'}))}
                  style={{fontSize:12,padding:'8px 14px',background:C.bg3,color:C.textPrimary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left'}}>
                  💬 Mark as Negotiating
                </button>
                <button onClick={()=>setFollowUp(p=>({...p,[selectedChat.id]:new Date(Date.now()+86400000*2).toISOString().split('T')[0]}))}
                  style={{fontSize:12,padding:'8px 14px',background:C.bg3,color:C.textPrimary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left'}}>
                  📅 Follow-up in 2 days
                </button>
                <button onClick={()=>{setStage(p=>({...p,[selectedChat.id]:'Closed Won'}));setProbability(p=>({...p,[selectedChat.id]:100}))}}
                  style={{fontSize:12,padding:'8px 14px',background:'rgba(34,197,94,0.12)',color:C.success,border:'1px solid rgba(34,197,94,0.3)',borderRadius:8,cursor:'pointer',textAlign:'left',fontWeight:600}}>
                  ✅ Mark as Closed Won
                </button>
                <button onClick={()=>{setStage(p=>({...p,[selectedChat.id]:'Closed Lost'}));setProbability(p=>({...p,[selectedChat.id]:0}))}}
                  style={{fontSize:12,padding:'8px 14px',background:C.dangerDim,color:C.danger,border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,cursor:'pointer',textAlign:'left',fontWeight:600}}>
                  ✕ Mark as Lost
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
