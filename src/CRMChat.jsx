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
  {id:'first',    cat:'Outreach',    label:'First Outreach',          text:"Hi [Name], I'm Leon from Coincu — we help Web3 projects get visibility through Coincu PR and CMC News. Is your team focused on any upcoming milestone?"},
  {id:'followup', cat:'Follow-up',   label:'Follow-up after Seen',    text:"Hey [Name], just checking in — did you get a chance to look at what I shared? Happy to answer any questions."},
  {id:'whatwesell',cat:'Pitch',      label:'Client asks what we sell', text:"Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your current focus more awareness, users, or credibility before a milestone?"},
  {id:'nobudget', cat:'Objection',   label:'No budget',               text:"Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?"},
  {id:'noconvert',cat:'Objection',   label:"Media doesn't convert",   text:"That's fair — it's more about the credibility layer that helps everything else convert better: ads, community, investor trust."},
  {id:'raising',  cat:'Context',     label:'Client raising funds',    text:"That's great timing — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?"},
  {id:'users',    cat:'Context',     label:'Focused on users/growth', text:"Got it. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?"},
  {id:'agency',   cat:'Context',     label:'Client is agency',        text:"Good to know — do you typically handle media/PR in-house or bring in partners? We work well with agencies on a referral or reseller model."},
  {id:'referral', cat:'Partnership', label:'Offer referral',          text:"By the way — if you know any Web3 projects who need PR or CMC News placement, we offer a referral commission on closed deals."},
  {id:'pitchpr',  cat:'Pitch',       label:'Pitch Coincu PR',         text:"Coincu PR gets your project in front of 500K+ monthly readers. Great for announcement visibility and SEO. Want the rate card?"},
  {id:'pitchcmc', cat:'Pitch',       label:'Pitch CMC News',          text:"CMC News puts your content directly on CoinMarketCap — strong for credibility before TGE. Interested?"},
  {id:'pitchbanner',cat:'Pitch',     label:'Pitch Banner Ads',        text:"We also run banner placements on Coincu — good for retargeting during a campaign window."},
  {id:'closing',  cat:'Closing',     label:'Closing',                 text:"Based on what you've shared, I think [service] would be the best fit. Want me to put together a quick proposal?"},
]

function StageBadge({stage}) {
  const s=STAGES[stage]||STAGES['New']
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.color}40`,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{stage}</span>
}

function Avatar({name,size=36}) {
  const initials=(name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  const colors=['#6366f1','#a855f7','#e879f9','#3b82f6','#22c55e','#f59e0b']
  const color=colors[(name||'').charCodeAt(0)%colors.length]||colors[0]
  return <div style={{width:size,height:size,borderRadius:'50%',background:color+'33',border:`2px solid ${color}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.38,fontWeight:700,color,flexShrink:0}}>{initials}</div>
}

function formatTime(ts) {
  if(!ts) return ''
  try {
    const d=typeof ts==='number'?new Date(ts*1000):new Date(ts)
    const diff=Date.now()-d
    if(diff<60000) return 'just now'
    if(diff<3600000) return Math.floor(diff/60000)+'m ago'
    if(diff<86400000) return d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})
    return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})
  } catch { return '' }
}

const inp = {background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,color:C.textPrimary,padding:'8px 12px',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box',fontFamily:'inherit'}

export default function CRMChat({token}) {
  const [chats,setChats]=useState([])
  const [selected,setSelected]=useState(null)
  const [messages,setMessages]=useState([])
  const [search,setSearch]=useState('')
  const [filterStage,setFilterStage]=useState('all')
  const [msgInput,setMsgInput]=useState('')
  const [sending,setSending]=useState(false)
  const [loadingChats,setLoadingChats]=useState(true)
  const [loadingMsgs,setLoadingMsgs]=useState(false)
  const [showTemplates,setShowTemplates]=useState(false)
  const [templateCat,setTemplateCat]=useState('all')
  const [aiText,setAiText]=useState('')
  const [aiLoading,setAiLoading]=useState(false)
  const [notes,setNotes]=useState({})
  const [noteInput,setNoteInput]=useState('')
  const [addingNote,setAddingNote]=useState(false)
  const [stages,setStages]=useState({})
  const [probs,setProbs]=useState({})
  const [deals,setDeals]=useState({})
  const [followUps,setFollowUps]=useState({})
  const endRef=useRef(null)

  const loadChats=useCallback(async()=>{
    setLoadingChats(true)
    try {
      const r=await fetch('/api/chat/list',{headers:{'x-auth-token':token}})
      const data=await r.json()
      setChats(data)
      if(data.length>0&&!selected) setSelected(data[0])
    } catch(e){console.error(e)}
    setLoadingChats(false)
  },[token])

  useEffect(()=>{loadChats()},[loadChats])

  useEffect(()=>{
    if(!selected) return
    setMessages([]); setAiText(''); setLoadingMsgs(true)
    fetch(`/api/chat/messages/${selected.id}`,{headers:{'x-auth-token':token}})
      .then(r=>r.json()).then(setMessages).catch(()=>setMessages([])).finally(()=>setLoadingMsgs(false))
  },[selected?.id])

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'})},[messages])

  async function sendMessage(){
    if(!msgInput.trim()||!selected) return
    setSending(true)
    try {
      await fetch('/api/chat/send',{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({chatId:selected.id,text:msgInput.trim()})})
      setMessages(p=>[...p,{text:msgInput.trim(),fromMe:true,date:Math.floor(Date.now()/1000)}])
      setMsgInput(''); setAiText('')
    } catch(e){alert('Gửi thất bại: '+e.message)}
    setSending(false)
  }

  async function handleAISuggest(){
    if(!selected) return
    setAiLoading(true)
    const lastClientMsg=[...messages].reverse().find(m=>!m.fromMe)?.text||''
    try {
      const r=await fetch('/api/ai/suggest',{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({
        contactName:selected.name, lastMessage:lastClientMsg,
        messages:messages.slice(-10), stage:stages[selected.id]||'Contacted',
        notes:(notes[selected.id]||[]).map(n=>n.content).join(' | ')
      })})
      const d=await r.json()
      setAiText(d.suggestion||'')
    } catch(e){console.error(e)}
    setAiLoading(false)
  }

  function addNote(){
    if(!noteInput.trim()||!selected) return
    const note={id:Date.now(),content:noteInput.trim(),createdAt:new Date().toLocaleDateString('vi-VN')}
    setNotes(p=>({...p,[selected.id]:[...(p[selected.id]||[]),note]}))
    setNoteInput(''); setAddingNote(false)
  }

  const filtered=chats.filter(c=>{
    const ms=!search||c.name.toLowerCase().includes(search.toLowerCase())
    const st=filterStage==='all'||(stages[c.id]||'Contacted')===filterStage
    return ms&&st
  })

  const chatStage=selected?stages[selected.id]||'Contacted':'New'
  const chatNotes=selected?notes[selected.id]||[]:[]
  const chatProb=selected?probs[selected.id]??50:50
  const chatDeal=selected?deals[selected.id]??0:0
  const chatFollowUp=selected?followUps[selected.id]||'':''
  const templateCats=['all',...new Set(TEMPLATES.map(t=>t.cat))]

  return (
    <div style={{display:'grid',gridTemplateColumns:'280px 1fr 320px',height:'100%',background:C.bg0,fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}}>

      {/* COL 1: LIST */}
      <div style={{background:C.bg1,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'12px 12px 6px'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search conversations..." style={{...inp,fontSize:12}}/>
        </div>
        <div style={{padding:'0 12px 8px'}}>
          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{...inp,fontSize:11,padding:'5px 8px'}}>
            <option value="all">All stages</option>
            {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{padding:'0 12px 6px',fontSize:11,color:C.textMuted}}>
          {loadingChats?'Loading Telegram...':`${filtered.length} conversations`}
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {filtered.map(chat=>{
            const isSel=selected?.id===chat.id
            return (
              <div key={chat.id} onClick={()=>setSelected(chat)}
                style={{padding:'12px 14px',cursor:'pointer',borderBottom:`1px solid ${C.border}`,background:isSel?C.bg3:'transparent',borderLeft:isSel?`3px solid ${C.accent}`:'3px solid transparent',transition:'background 0.1s'}}>
                <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                  <div style={{position:'relative',flexShrink:0}}>
                    <Avatar name={chat.name} size={36}/>
                    {chat.unread>0&&<span style={{position:'absolute',top:-2,right:-2,background:C.accent,color:'#fff',fontSize:9,padding:'1px 4px',borderRadius:99,fontWeight:700}}>{chat.unread}</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13,color:C.textPrimary,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{chat.name}</span>
                      <span style={{fontSize:10,color:C.textMuted,flexShrink:0,marginLeft:4}}>{formatTime(chat.date)}</span>
                    </div>
                    <div style={{fontSize:11,color:C.textMuted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:5}}>{chat.lastMsg}</div>
                    <StageBadge stage={stages[chat.id]||'Contacted'}/>
                  </div>
                </div>
              </div>
            )
          })}
          {!loadingChats&&filtered.length===0&&<div style={{padding:24,textAlign:'center',color:C.textMuted,fontSize:13}}>No conversations</div>}
        </div>
        <div style={{padding:12,borderTop:`1px solid ${C.border}`}}>
          <button onClick={loadChats} disabled={loadingChats} style={{width:'100%',padding:'7px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:12}}>
            {loadingChats?'Loading...':'↻ Refresh'}
          </button>
        </div>
      </div>

      {/* COL 2: CHAT WINDOW */}
      <div style={{display:'flex',flexDirection:'column',background:C.bg0,overflow:'hidden'}}>
        {!selected?(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:C.textMuted}}>
            <div style={{fontSize:40}}>💬</div>
            <div style={{fontSize:14}}>Select a conversation to start</div>
          </div>
        ):(
          <>
            <div style={{padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:12,background:C.bg1,flexShrink:0}}>
              <Avatar name={selected.name} size={40}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:C.textPrimary}}>{selected.name}</div>
                <div style={{fontSize:12,color:C.textSecondary}}>Telegram • {chatStage}</div>
              </div>
              <StageBadge stage={chatStage}/>
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'16px 24px',display:'flex',flexDirection:'column',gap:10}}>
              {loadingMsgs&&<div style={{textAlign:'center',color:C.textMuted,fontSize:13,marginTop:40}}>Loading messages...</div>}
              {!loadingMsgs&&messages.length===0&&<div style={{textAlign:'center',color:C.textMuted,fontSize:13,marginTop:40}}>No messages yet</div>}
              {messages.map((msg,i)=>(
                <div key={i} style={{display:'flex',flexDirection:msg.fromMe?'row-reverse':'row',alignItems:'flex-end',gap:8}}>
                  {!msg.fromMe&&<Avatar name={selected.name} size={26}/>}
                  <div style={{maxWidth:'72%'}}>
                    <div style={{padding:'10px 14px',borderRadius:msg.fromMe?'16px 16px 4px 16px':'16px 16px 16px 4px',background:msg.fromMe?`linear-gradient(135deg,${C.accentPurple},${C.accent})`:C.bg2,color:msg.fromMe?'#fff':C.textPrimary,fontSize:13,lineHeight:1.5,border:!msg.fromMe?`1px solid ${C.border}`:'none'}}>
                      {msg.text}
                    </div>
                    <div style={{fontSize:10,color:C.textMuted,marginTop:3,textAlign:msg.fromMe?'right':'left'}}>{formatTime(msg.date)}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef}/>
            </div>

            {/* AI suggest bar */}
            {aiText&&(
              <div style={{margin:'0 24px 8px',padding:'10px 14px',background:C.accentDim,border:`1px solid ${C.accent}44`,borderRadius:10,display:'flex',gap:10,alignItems:'flex-start',flexShrink:0}}>
                <span style={{fontSize:12,color:C.accent,fontWeight:700,flexShrink:0}}>✨ AI</span>
                <span style={{fontSize:13,color:C.textPrimary,flex:1,lineHeight:1.6}}>{aiText}</span>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>{setMsgInput(aiText);setAiText('')}} style={{fontSize:11,padding:'4px 10px',background:C.accent,color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>Use</button>
                  <button onClick={()=>setAiText('')} style={{fontSize:11,padding:'4px 8px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>✕</button>
                </div>
              </div>
            )}

            {/* Templates */}
            {showTemplates&&(
              <div style={{margin:'0 24px 8px',background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',maxHeight:220,flexShrink:0}}>
                <div style={{padding:'8px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:6,overflowX:'auto',flexShrink:0}}>
                  {templateCats.map(cat=>(
                    <button key={cat} onClick={()=>setTemplateCat(cat)} style={{fontSize:11,padding:'3px 10px',border:'none',borderRadius:99,cursor:'pointer',whiteSpace:'nowrap',fontWeight:500,background:templateCat===cat?C.accent:C.bg3,color:templateCat===cat?'#fff':C.textSecondary}}>
                      {cat==='all'?'All':cat}
                    </button>
                  ))}
                  <button onClick={()=>setShowTemplates(false)} style={{marginLeft:'auto',fontSize:11,padding:'3px 8px',background:'none',border:'none',color:C.textMuted,cursor:'pointer',flexShrink:0}}>✕</button>
                </div>
                <div style={{overflowY:'auto',maxHeight:170}}>
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
            <div style={{padding:'10px 24px 14px',borderTop:`1px solid ${C.border}`,background:C.bg1,flexShrink:0}}>
              <textarea value={msgInput} onChange={e=>setMsgInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}}
                placeholder="Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng)" rows={3}
                style={{...inp,resize:'none',marginBottom:8,lineHeight:1.5}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setShowTemplates(v=>!v)} style={{fontSize:12,padding:'7px 14px',border:`1px solid ${C.border}`,background:showTemplates?C.accentDim:C.bg3,color:showTemplates?C.accent:C.textSecondary,borderRadius:8,cursor:'pointer',fontWeight:500}}>📋 Templates</button>
                <button onClick={handleAISuggest} disabled={aiLoading} style={{fontSize:12,padding:'7px 14px',border:`1px solid ${C.accent}44`,background:C.accentDim,color:C.accent,borderRadius:8,cursor:'pointer',fontWeight:600,opacity:aiLoading?0.6:1}}>
                  {aiLoading?'⏳ Thinking...':'✨ AI Suggest'}
                </button>
                <div style={{flex:1}}/>
                <button onClick={sendMessage} disabled={!msgInput.trim()||sending}
                  style={{fontSize:13,padding:'7px 22px',border:'none',background:msgInput.trim()?`linear-gradient(135deg,${C.accentPurple},${C.accent})`:C.bg3,color:msgInput.trim()?'#fff':C.textMuted,borderRadius:8,cursor:msgInput.trim()?'pointer':'default',fontWeight:700,transition:'all 0.15s'}}>
                  {sending?'Sending...':'Send ↑'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* COL 3: PROFILE */}
      <div style={{background:C.bg1,borderLeft:`1px solid ${C.border}`,overflowY:'auto',flexShrink:0}}>
        {!selected?(
          <div style={{padding:32,textAlign:'center',color:C.textMuted,fontSize:13,marginTop:60}}>
            <div style={{fontSize:32,marginBottom:12}}>👤</div>
            Select a conversation
          </div>
        ):(
          <div>
            {/* Header */}
            <div style={{padding:'20px 16px 16px',borderBottom:`1px solid ${C.border}`,textAlign:'center'}}>
              <Avatar name={selected.name} size={60}/>
              <div style={{marginTop:12,fontWeight:700,fontSize:17,color:C.textPrimary}}>{selected.name}</div>
              <div style={{fontSize:12,color:C.textSecondary,marginBottom:10}}>Telegram</div>
              <StageBadge stage={chatStage}/>
            </div>

            {/* Deal */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Deal Info</div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Stage</div>
                <select value={chatStage} onChange={e=>setStages(p=>({...p,[selected.id]:e.target.value}))} style={{...inp,fontSize:12,padding:'6px 10px'}}>
                  {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4,display:'flex',justifyContent:'space-between'}}>
                  <span>Probability</span><span style={{color:C.accent,fontWeight:700}}>{chatProb}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={chatProb}
                  onChange={e=>setProbs(p=>({...p,[selected.id]:parseInt(e.target.value)}))} style={{width:'100%',accentColor:C.accent}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Expected Value (USD)</div>
                <input type="number" value={chatDeal} onChange={e=>setDeals(p=>({...p,[selected.id]:parseInt(e.target.value)||0}))} style={{...inp,fontSize:12,padding:'6px 10px'}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Next Follow-up</div>
                <input type="date" value={chatFollowUp} onChange={e=>setFollowUps(p=>({...p,[selected.id]:e.target.value}))} style={{...inp,fontSize:12,padding:'6px 10px'}}/>
              </div>
            </div>

            {/* Notes */}
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px'}}>Notes</div>
                <button onClick={()=>setAddingNote(v=>!v)} style={{fontSize:11,padding:'2px 8px',background:C.bg3,border:`1px solid ${C.border}`,color:C.textSecondary,borderRadius:5,cursor:'pointer'}}>+ Add</button>
              </div>
              {addingNote&&(
                <div style={{marginBottom:8}}>
                  <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Add a note..." rows={2}
                    style={{...inp,resize:'none',fontSize:12,marginBottom:6}}/>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={addNote} style={{fontSize:11,padding:'5px 12px',background:C.accent,color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>Save</button>
                    <button onClick={()=>setAddingNote(false)} style={{fontSize:11,padding:'5px 10px',background:C.bg3,color:C.textSecondary,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              )}
              {chatNotes.length===0&&!addingNote&&<div style={{fontSize:12,color:C.textMuted,fontStyle:'italic'}}>No notes yet</div>}
              {chatNotes.map(note=>(
                <div key={note.id} style={{padding:'8px 10px',background:C.bg2,borderRadius:7,border:`1px solid ${C.border}`,marginBottom:6}}>
                  <div style={{fontSize:12,color:C.textPrimary,lineHeight:1.5,marginBottom:3}}>{note.content}</div>
                  <div style={{fontSize:10,color:C.textMuted}}>{note.createdAt}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{padding:'14px 16px'}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Quick Actions</div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <button onClick={()=>setStages(p=>({...p,[selected.id]:'Negotiating'}))} style={{fontSize:12,padding:'8px 14px',background:C.bg3,color:C.textPrimary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left'}}>💬 Mark as Negotiating</button>
                <button onClick={()=>setFollowUps(p=>({...p,[selected.id]:new Date(Date.now()+172800000).toISOString().split('T')[0]}))} style={{fontSize:12,padding:'8px 14px',background:C.bg3,color:C.textPrimary,border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left'}}>📅 Follow-up in 2 days</button>
                <button onClick={()=>{setStages(p=>({...p,[selected.id]:'Closed Won'}));setProbs(p=>({...p,[selected.id]:100}))}} style={{fontSize:12,padding:'8px 14px',background:'rgba(34,197,94,0.12)',color:C.success,border:'1px solid rgba(34,197,94,0.3)',borderRadius:8,cursor:'pointer',textAlign:'left',fontWeight:600}}>✅ Mark as Closed Won</button>
                <button onClick={()=>{setStages(p=>({...p,[selected.id]:'Closed Lost'}));setProbs(p=>({...p,[selected.id]:0}))}} style={{fontSize:12,padding:'8px 14px',background:C.dangerDim,color:C.danger,border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,cursor:'pointer',textAlign:'left',fontWeight:600}}>✕ Mark as Lost</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
