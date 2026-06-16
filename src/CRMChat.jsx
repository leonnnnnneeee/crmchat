import { useState, useEffect, useRef, useCallback } from "react"

const TG = {
  bg:        "#17212b",
  panel:     "#1c2733",
  surface:   "#242f3d",
  elevated:  "#2b3a4a",
  border:    "#0d1821",
  blue:      "#2b5278",
  blueLight: "#5288c1",
  text:      "#ffffff",
  textSec:   "#708499",
  textMuted: "#4a5568",
  green:     "#4fae4e",
  red:       "#e53935",
  msgOut:    "#2b5278",
  msgIn:     "#182533",
  accent:    "#5288c1",
}

const STAGES = {
  "New":         { color:"#7c8da6", bg:"rgba(124,141,166,.15)" },
  "Contacted":   { color:"#5288c1", bg:"rgba(82,136,193,.15)"  },
  "Interested":  { color:"#e8a400", bg:"rgba(232,164,0,.15)"   },
  "Negotiating": { color:"#9c6fe4", bg:"rgba(156,111,228,.15)" },
  "Closed Won":  { color:"#4fae4e", bg:"rgba(79,174,78,.15)"   },
  "Closed Lost": { color:"#6b7280", bg:"rgba(107,114,128,.15)" },
}

const TEMPLATES = [
  { id:"t1",  cat:"Outreach",    label:"First Outreach",          text:"Hi [Name], I'm Leon from Coincu — we help Web3 projects get visibility through Coincu PR and CMC News. Is your team focused on any upcoming milestone?" },
  { id:"t2",  cat:"Follow-up",   label:"Follow-up after Seen",    text:"Hey [Name], just checking in — did you get a chance to look at what I shared? Happy to answer any questions." },
  { id:"t3",  cat:"Pitch",       label:"Client asks what we sell", text:"Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your current focus more awareness, users, or credibility before a milestone?" },
  { id:"t4",  cat:"Objection",   label:"No budget",               text:"Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?" },
  { id:"t5",  cat:"Objection",   label:"Media doesn't convert",   text:"That's fair — it's more about the credibility layer that helps everything else convert better: ads, community, investor trust." },
  { id:"t6",  cat:"Context",     label:"Client raising funds",    text:"That's great timing — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?" },
  { id:"t7",  cat:"Context",     label:"Focused on users/growth", text:"Got it. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?" },
  { id:"t8",  cat:"Context",     label:"Client is agency",        text:"Good to know — do you typically handle media/PR in-house or bring in partners? We work well with agencies on a referral or reseller model." },
  { id:"t9",  cat:"Partnership", label:"Offer referral",          text:"By the way — if you know any Web3 projects who need PR or CMC News, we offer a referral commission on closed deals." },
  { id:"t10", cat:"Pitch",       label:"Pitch Coincu PR",         text:"Coincu PR gets your project in front of 500K+ monthly readers. Great for announcement visibility and SEO. Want the rate card?" },
  { id:"t11", cat:"Pitch",       label:"Pitch CMC News",          text:"CMC News puts your content directly on CoinMarketCap — strong for credibility before TGE. Interested?" },
  { id:"t12", cat:"Pitch",       label:"Pitch Banner Ads",        text:"We also run banner placements on Coincu — good for retargeting during a campaign window." },
  { id:"t13", cat:"Closing",     label:"Closing",                 text:"Based on what you've shared, I think [service] would be the best fit. Want me to put together a quick proposal?" },
]

// ── HELPERS ──
function Avatar({ name, size=40, online=false }) {
  const colors = ["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const color = colors[(name||"?").charCodeAt(0) % colors.length]
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:600,color:"#fff",userSelect:"none"}}>
        {initials}
      </div>
      {online && <div style={{position:"absolute",bottom:1,right:1,width:10,height:10,background:TG.green,borderRadius:"50%",border:`2px solid ${TG.panel}`}}/>}
    </div>
  )
}

function StageBadge({ stage }) {
  const s = STAGES[stage] || STAGES["New"]
  return <span style={{background:s.bg,color:s.color,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{stage}</span>
}

function formatTime(ts) {
  if (!ts) return ""
  try {
    const d = typeof ts==="number" ? new Date(ts*1000) : new Date(ts)
    const now = new Date()
    const diff = now - d
    const isToday = d.toDateString()===now.toDateString()
    if (diff < 60000) return "now"
    if (isToday) return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1)
    if (d.toDateString()===yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})
  } catch { return "" }
}

function formatMsgTime(ts) {
  if (!ts) return ""
  try {
    const d = typeof ts==="number" ? new Date(ts*1000) : new Date(ts)
    return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})
  } catch { return "" }
}

const inp = {
  background:TG.surface, border:`1px solid ${TG.elevated}`,
  borderRadius:8, color:TG.text, padding:"10px 14px",
  fontSize:14, outline:"none", width:"100%",
  boxSizing:"border-box", fontFamily:"inherit",
}

// ── MAIN COMPONENT ──
export default function CRMChat({ token }) {
  const [chats,setChats]           = useState([])
  const [selected,setSelected]     = useState(null)
  const [messages,setMessages]     = useState([])
  const [search,setSearch]         = useState("")
  const [msgInput,setMsgInput]     = useState("")
  const [sending,setSending]       = useState(false)
  const [loadingChats,setLoadingChats] = useState(true)
  const [loadingMsgs,setLoadingMsgs]   = useState(false)
  const [showTemplates,setShowTemplates] = useState(false)
  const [showProfile,setShowProfile]     = useState(true)
  const [templateCat,setTemplateCat]     = useState("all")
  const [aiText,setAiText]         = useState("")
  const [aiLoading,setAiLoading]   = useState(false)
  // Per-chat CRM data
  const [stages,setStages]         = useState({})
  const [probs,setProbs]           = useState({})
  const [deals,setDeals]           = useState({})
  const [followUps,setFollowUps]   = useState({})
  const [notes,setNotes]           = useState({})
  const [noteInput,setNoteInput]   = useState("")
  const [addingNote,setAddingNote] = useState(false)
  const endRef = useRef(null)

  // Load chat list
  const loadChats = useCallback(async () => {
    setLoadingChats(true)
    try {
      const r = await fetch("/api/chat/list",{headers:{"x-auth-token":token}})
      const data = await r.json()
      if (Array.isArray(data)) {
        setChats(data)
        if (!selected && data.length > 0) setSelected(data[0])
      }
    } catch(e) { console.error("loadChats:",e) }
    setLoadingChats(false)
  },[token])

  useEffect(()=>{ loadChats() },[loadChats])

  // Load messages when chat selected
  useEffect(()=>{
    if (!selected) return
    setMessages([]); setAiText(""); setLoadingMsgs(true)
    fetch(`/api/chat/messages/${selected.id}`,{headers:{"x-auth-token":token}})
      .then(r=>r.json())
      .then(d=>{ if(Array.isArray(d)) setMessages(d) })
      .catch(e=>console.error("loadMsgs:",e))
      .finally(()=>setLoadingMsgs(false))
  },[selected?.id, token])

  // Scroll to bottom
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}) },[messages])

  async function sendMessage() {
    const text = msgInput.trim()
    if (!text || !selected) return
    setSending(true)
    const optimistic = {text, fromMe:true, date:Math.floor(Date.now()/1000), pending:true}
    setMessages(p=>[...p, optimistic])
    setMsgInput(""); setAiText("")
    try {
      await fetch("/api/chat/send",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify({chatId:selected.id, text})
      })
      // Mark as sent
      setMessages(p=>p.map(m=>m===optimistic?{...m,pending:false}:m))
    } catch(e) {
      setMessages(p=>p.filter(m=>m!==optimistic))
      setMsgInput(text)
      alert("Send failed: "+e.message)
    }
    setSending(false)
  }

  async function getAISuggest() {
    if (!selected) return
    setAiLoading(true)
    const lastClientMsg = [...messages].reverse().find(m=>!m.fromMe)?.text || ""
    try {
      const r = await fetch("/api/ai/suggest",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify({
          contactName: selected.name,
          lastMessage: lastClientMsg,
          messages: messages.slice(-12),
          stage: stages[selected.id] || "Contacted",
          notes: (notes[selected.id]||[]).map(n=>n.content).join(" | ")
        })
      })
      const d = await r.json()
      if (d.suggestion) setAiText(d.suggestion)
    } catch(e) { console.error("AI:",e) }
    setAiLoading(false)
  }

  function addNote() {
    if (!noteInput.trim() || !selected) return
    const note = {id:Date.now(), content:noteInput.trim(), date:new Date().toLocaleDateString("vi-VN")}
    setNotes(p=>({...p,[selected.id]:[...(p[selected.id]||[]),note]}))
    setNoteInput(""); setAddingNote(false)
  }

  const filtered = chats.filter(c=>!search || c.name?.toLowerCase().includes(search.toLowerCase()))
  const curStage  = selected ? (stages[selected.id]||"Contacted") : "New"
  const curProb   = selected ? (probs[selected.id]??50) : 50
  const curDeal   = selected ? (deals[selected.id]??0) : 0
  const curFollowUp = selected ? (followUps[selected.id]||"") : ""
  const curNotes  = selected ? (notes[selected.id]||[]) : []
  const templateCats = ["all",...new Set(TEMPLATES.map(t=>t.cat))]

  return (
    <div style={{display:"grid",gridTemplateColumns:`280px 1fr${showProfile?" 300px":""}`,height:"100%",background:TG.bg,overflow:"hidden"}}>

      {/* ── COL 1: CHAT LIST ── */}
      <div style={{background:TG.panel,borderRight:`1px solid ${TG.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Search */}
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${TG.border}`}}>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:TG.textMuted,fontSize:14}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search"
              style={{...inp,paddingLeft:36,background:TG.surface,borderRadius:20,fontSize:13,border:"none"}}/>
          </div>
        </div>

        {/* Chat list */}
        <div style={{flex:1,overflowY:"auto"}}>
          {loadingChats && (
            <div style={{padding:"20px 16px",color:TG.textSec,fontSize:13,textAlign:"center"}}>
              Loading chats...
            </div>
          )}
          {filtered.map(chat=>{
            const isSel = selected?.id===chat.id
            const chatStage = stages[chat.id]||"Contacted"
            return (
              <div key={chat.id} onClick={()=>setSelected(chat)}
                style={{
                  padding:"10px 16px",cursor:"pointer",display:"flex",gap:12,alignItems:"center",
                  background:isSel?TG.blue:"transparent",
                  borderBottom:`1px solid ${TG.border}`,
                  transition:"background .1s"
                }}
                onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=TG.surface}}
                onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent"}}>
                <div style={{position:"relative"}}>
                  <Avatar name={chat.name} size={46}/>
                  {chat.unread>0&&(
                    <div style={{position:"absolute",bottom:-2,right:-2,background:TG.green,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:10,minWidth:18,textAlign:"center"}}>
                      {chat.unread>99?"99+":chat.unread}
                    </div>
                  )}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
                    <span style={{fontWeight:600,fontSize:14,color:TG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{chat.name}</span>
                    <span style={{fontSize:11,color:isSel?"rgba(255,255,255,.7)":TG.textMuted,flexShrink:0,marginLeft:4}}>{formatTime(chat.date)}</span>
                  </div>
                  <div style={{fontSize:13,color:isSel?"rgba(255,255,255,.7)":TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>
                    {chat.lastMsg||"No messages"}
                  </div>
                  <StageBadge stage={chatStage}/>
                </div>
              </div>
            )
          })}
          {!loadingChats && filtered.length===0 && (
            <div style={{padding:32,textAlign:"center",color:TG.textSec,fontSize:13}}>No conversations</div>
          )}
        </div>

        {/* Refresh */}
        <div style={{padding:"8px 12px",borderTop:`1px solid ${TG.border}`}}>
          <button onClick={loadChats} disabled={loadingChats}
            style={{width:"100%",padding:"7px",background:TG.surface,border:"none",borderRadius:8,color:TG.textSec,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{fontSize:14}}>↻</span> {loadingChats?"Loading...":"Refresh"}
          </button>
        </div>
      </div>

      {/* ── COL 2: CHAT WINDOW ── */}
      <div style={{display:"flex",flexDirection:"column",background:TG.bg,overflow:"hidden"}}>
        {!selected ? (
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:TG.textSec}}>
            <div style={{width:80,height:80,background:TG.surface,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
            <div style={{fontSize:16,fontWeight:500}}>Select a chat to start messaging</div>
            <div style={{fontSize:13,color:TG.textMuted}}>Choose from your Telegram conversations on the left</div>
          </div>
        ) : (<>
          {/* Chat header */}
          <div style={{height:56,background:TG.panel,borderBottom:`1px solid ${TG.border}`,display:"flex",alignItems:"center",padding:"0 16px",gap:12,flexShrink:0}}>
            <Avatar name={selected.name} size={36} online={true}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:TG.text,lineHeight:1.2}}>{selected.name}</div>
              <div style={{fontSize:12,color:TG.green}}>online</div>
            </div>
            <StageBadge stage={curStage}/>
            <button onClick={()=>setShowProfile(v=>!v)}
              style={{padding:"6px 10px",background:showProfile?TG.blue:TG.surface,border:"none",borderRadius:8,color:TG.text,cursor:"pointer",fontSize:12,fontWeight:500}}>
              {showProfile?"Hide Info ›":"‹ Show Info"}
            </button>
          </div>

          {/* Messages area */}
          <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:2}}
            style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:4,
              backgroundImage:"radial-gradient(ellipse at 50% 50%, rgba(27,48,72,.3) 0%, transparent 70%)",
              backgroundSize:"cover"}}>
            {loadingMsgs && <div style={{textAlign:"center",color:TG.textSec,fontSize:13,marginTop:40}}>Loading messages...</div>}
            {!loadingMsgs && messages.length===0 && (
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:TG.textSec}}>
                <div style={{fontSize:40}}>👋</div>
                <div style={{fontSize:14}}>No messages yet</div>
                <div style={{fontSize:12,color:TG.textMuted}}>Use a template to start the conversation</div>
              </div>
            )}

            {/* Group messages by date */}
            {messages.map((msg,i)=>{
              const showDate = i===0 || formatTime(messages[i-1].date)!==formatTime(msg.date)&&(typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date)).toDateString()!==(typeof messages[i-1].date==="number"?new Date(messages[i-1].date*1000):new Date(messages[i-1].date)).toDateString()
              return (
                <div key={i}>
                  <div style={{display:"flex",justifyContent:msg.fromMe?"flex-end":"flex-start",marginBottom:2}}>
                    {!msg.fromMe&&<div style={{width:0}}/>}
                    <div style={{
                      maxWidth:"72%",padding:"8px 12px 6px",
                      borderRadius:msg.fromMe?"16px 16px 4px 16px":"16px 16px 16px 4px",
                      background:msg.fromMe?TG.msgOut:TG.msgIn,
                      position:"relative",
                    }}>
                      <div style={{fontSize:14,color:TG.text,lineHeight:1.5,wordBreak:"break-word"}}>{msg.text}</div>
                      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4,marginTop:4}}>
                        <span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>{formatMsgTime(msg.date)}</span>
                        {msg.fromMe&&<span style={{fontSize:11,color:msg.pending?"rgba(255,255,255,.3)":"rgba(255,255,255,.6)"}}>
                          {msg.pending?"🕐":"✓✓"}
                        </span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef}/>
          </div>

          {/* AI suggestion bar */}
          {aiText && (
            <div style={{margin:"0 16px 8px",padding:"10px 14px",background:"rgba(82,136,193,.15)",border:"1px solid rgba(82,136,193,.3)",borderRadius:12,display:"flex",gap:10,alignItems:"flex-start",flexShrink:0}}>
              <span style={{fontSize:18,flexShrink:0}}>✨</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:TG.blueLight,fontWeight:600,marginBottom:4}}>AI Suggestion</div>
                <div style={{fontSize:13,color:TG.text,lineHeight:1.6}}>{aiText}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>{setMsgInput(aiText);setAiText("")}}
                  style={{fontSize:12,padding:"5px 12px",background:TG.blueLight,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:600}}>
                  Use
                </button>
                <button onClick={()=>setAiText("")}
                  style={{fontSize:12,padding:"5px 8px",background:TG.surface,color:TG.textSec,border:`1px solid ${TG.elevated}`,borderRadius:6,cursor:"pointer"}}>
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Template picker */}
          {showTemplates && (
            <div style={{margin:"0 16px 8px",background:TG.panel,border:`1px solid ${TG.border}`,borderRadius:12,overflow:"hidden",maxHeight:220,flexShrink:0}}>
              <div style={{padding:"8px 12px",borderBottom:`1px solid ${TG.border}`,display:"flex",gap:6,overflowX:"auto"}}>
                {templateCats.map(cat=>(
                  <button key={cat} onClick={()=>setTemplateCat(cat)}
                    style={{fontSize:11,padding:"4px 10px",border:"none",borderRadius:99,cursor:"pointer",whiteSpace:"nowrap",fontWeight:500,
                      background:templateCat===cat?TG.blueLight:TG.surface,
                      color:templateCat===cat?"#fff":TG.textSec}}>
                    {cat==="all"?"All":cat}
                  </button>
                ))}
                <button onClick={()=>setShowTemplates(false)} style={{marginLeft:"auto",background:"none",border:"none",color:TG.textMuted,cursor:"pointer",fontSize:16,padding:"0 4px",flexShrink:0}}>✕</button>
              </div>
              <div style={{overflowY:"auto",maxHeight:165}}>
                {TEMPLATES.filter(t=>templateCat==="all"||t.cat===templateCat).map(t=>(
                  <div key={t.id} onClick={()=>{setMsgInput(t.text);setShowTemplates(false)}}
                    style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${TG.border}`}}
                    onMouseEnter={e=>e.currentTarget.style.background=TG.surface}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontSize:13,fontWeight:600,color:TG.text,marginBottom:2}}>{t.label}</div>
                    <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div style={{padding:"8px 16px 12px",background:TG.panel,borderTop:`1px solid ${TG.border}`,flexShrink:0}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              {/* Template + AI buttons */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button onClick={()=>setShowTemplates(v=>!v)}
                  title="Templates"
                  style={{width:38,height:38,background:showTemplates?TG.blueLight:TG.surface,border:"none",borderRadius:"50%",color:TG.text,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  📋
                </button>
              </div>

              {/* Textarea */}
              <div style={{flex:1,position:"relative"}}>
                <textarea value={msgInput} onChange={e=>setMsgInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}}
                  placeholder="Write a message..."
                  rows={msgInput.split("\n").length>3?4:Math.max(1,msgInput.split("\n").length)}
                  style={{...inp,resize:"none",lineHeight:1.5,padding:"10px 14px",maxHeight:120,borderRadius:20,border:"none",background:TG.surface}}/>
              </div>

              {/* AI + Send */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button onClick={getAISuggest} disabled={aiLoading}
                  title="AI Suggest"
                  style={{width:38,height:38,background:aiLoading?"rgba(82,136,193,.3)":TG.blueLight,border:"none",borderRadius:"50%",color:"#fff",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",opacity:aiLoading?.7:1}}>
                  {aiLoading?"⏳":"✨"}
                </button>
                <button onClick={sendMessage} disabled={!msgInput.trim()||sending}
                  style={{width:38,height:38,background:msgInput.trim()?"#229ED9":TG.surface,border:"none",borderRadius:"50%",color:"#fff",cursor:msgInput.trim()?"pointer":"default",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}}>
                  ➤
                </button>
              </div>
            </div>
          </div>
        </>)}
      </div>

      {/* ── COL 3: PROFILE PANEL ── */}
      {showProfile && (
        <div style={{background:TG.panel,borderLeft:`1px solid ${TG.border}`,overflowY:"auto",flexShrink:0}}>
          {!selected ? (
            <div style={{padding:32,textAlign:"center",color:TG.textSec,fontSize:13}}>Select a chat</div>
          ) : (
            <div>
              {/* Contact header */}
              <div style={{padding:"24px 16px 16px",textAlign:"center",borderBottom:`1px solid ${TG.border}`}}>
                <Avatar name={selected.name} size={72} online={true}/>
                <div style={{marginTop:12,fontWeight:700,fontSize:18,color:TG.text}}>{selected.name}</div>
                <div style={{fontSize:13,color:TG.green,marginTop:2}}>online</div>
                <div style={{marginTop:10}}><StageBadge stage={curStage}/></div>
              </div>

              {/* Deal info */}
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${TG.border}`}}>
                <div style={{fontSize:11,fontWeight:600,color:TG.textMuted,textTransform:"uppercase",letterSpacing:".8px",marginBottom:12}}>Deal</div>

                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:TG.textSec,marginBottom:6}}>Stage</div>
                  <select value={curStage} onChange={e=>setStages(p=>({...p,[selected.id]:e.target.value}))}
                    style={{...inp,fontSize:13,padding:"8px 10px",background:TG.surface,border:`1px solid ${TG.elevated}`}}>
                    {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:TG.textSec,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                    <span>Win probability</span>
                    <span style={{color:TG.blueLight,fontWeight:700}}>{curProb}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5} value={curProb}
                    onChange={e=>setProbs(p=>({...p,[selected.id]:+e.target.value}))}
                    style={{width:"100%",accentColor:TG.blueLight}}/>
                </div>

                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:TG.textSec,marginBottom:6}}>Deal value (USD)</div>
                  <input type="number" value={curDeal}
                    onChange={e=>setDeals(p=>({...p,[selected.id]:+e.target.value||0}))}
                    style={{...inp,fontSize:13,padding:"8px 10px",background:TG.surface,border:`1px solid ${TG.elevated}`}}/>
                </div>

                <div>
                  <div style={{fontSize:12,color:TG.textSec,marginBottom:6}}>Next follow-up</div>
                  <input type="date" value={curFollowUp}
                    onChange={e=>setFollowUps(p=>({...p,[selected.id]:e.target.value}))}
                    style={{...inp,fontSize:13,padding:"8px 10px",background:TG.surface,border:`1px solid ${TG.elevated}`}}/>
                </div>
              </div>

              {/* Notes */}
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${TG.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:TG.textMuted,textTransform:"uppercase",letterSpacing:".8px"}}>Notes</div>
                  <button onClick={()=>setAddingNote(v=>!v)}
                    style={{fontSize:12,padding:"3px 10px",background:TG.blueLight,border:"none",borderRadius:6,color:"#fff",cursor:"pointer",fontWeight:500}}>
                    + Add
                  </button>
                </div>
                {addingNote && (
                  <div style={{marginBottom:10}}>
                    <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                      placeholder="Write a note..." rows={3}
                      style={{...inp,resize:"none",fontSize:13,marginBottom:8,background:TG.surface,border:`1px solid ${TG.elevated}`}}/>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={addNote} style={{flex:1,padding:"7px",background:TG.blueLight,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13}}>Save</button>
                      <button onClick={()=>setAddingNote(false)} style={{padding:"7px 12px",background:TG.surface,color:TG.textSec,border:`1px solid ${TG.elevated}`,borderRadius:7,cursor:"pointer",fontSize:13}}>Cancel</button>
                    </div>
                  </div>
                )}
                {curNotes.length===0&&!addingNote&&<div style={{fontSize:13,color:TG.textMuted,fontStyle:"italic"}}>No notes yet</div>}
                {curNotes.map(note=>(
                  <div key={note.id} style={{padding:"8px 10px",background:TG.surface,borderRadius:8,border:`1px solid ${TG.elevated}`,marginBottom:6}}>
                    <div style={{fontSize:13,color:TG.text,lineHeight:1.5}}>{note.content}</div>
                    <div style={{fontSize:11,color:TG.textMuted,marginTop:4}}>{note.date}</div>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div style={{padding:"14px 16px"}}>
                <div style={{fontSize:11,fontWeight:600,color:TG.textMuted,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10}}>Quick Actions</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[
                    {label:"🔥 Mark Negotiating",  action:()=>setStages(p=>({...p,[selected.id]:"Negotiating"})), color:TG.surface},
                    {label:"📅 Follow-up +2 days",  action:()=>setFollowUps(p=>({...p,[selected.id]:new Date(Date.now()+172800000).toISOString().split("T")[0]})), color:TG.surface},
                    {label:"✅ Closed Won",         action:()=>{setStages(p=>({...p,[selected.id]:"Closed Won"}));setProbs(p=>({...p,[selected.id]:100}))}, color:"rgba(79,174,78,.2)", textColor:TG.green, border:"rgba(79,174,78,.3)"},
                    {label:"✕ Mark as Lost",        action:()=>{setStages(p=>({...p,[selected.id]:"Closed Lost"}));setProbs(p=>({...p,[selected.id]:0}))}, color:"rgba(229,57,53,.12)", textColor:TG.red, border:"rgba(229,57,53,.25)"},
                  ].map(({label,action,color,textColor,border})=>(
                    <button key={label} onClick={action}
                      style={{padding:"9px 14px",background:color,color:textColor||TG.text,border:`1px solid ${border||TG.elevated}`,borderRadius:9,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
