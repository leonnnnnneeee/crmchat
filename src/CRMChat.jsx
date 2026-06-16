import { useState, useEffect, useRef, useCallback } from "react"

const TG = {
  bg:"#120929", panel:"#1a0533", surface:"#1e0a3c", elevated:"#2d1155",
  border:"#0d0618", blue:"#7c3aed", blueHover:"#6d2ed5", blueDim:"rgba(124,58,237,.15)",
  text:"#f0e6ff", textSec:"#9b7ec8", textMuted:"#6b4d94",
  green:"#4fae4e", red:"#e53935", msgOut:"#7c3aed", msgIn:"#1e0a3c",
  inputBg:"#2d1155",
}

const STAGES = {
  "New":        {color:"#9b7ec8",bg:"rgba(155,126,200,.15)"},
  "Contacted":  {color:"#5288c1",bg:"rgba(82,136,193,.15)"},
  "Interested": {color:"#e8a400",bg:"rgba(232,164,0,.15)"},
  "Negotiating":{color:"#a855f7",bg:"rgba(168,85,247,.2)"},
  "Closed Won": {color:"#4fae4e",bg:"rgba(79,174,78,.15)"},
  "Closed Lost":{color:"#6b7280",bg:"rgba(107,114,128,.15)"},
}

const TEMPLATES = [
  {id:"t1",  cat:"Outreach",    label:"First Outreach",           text:"Hi [Name], I'm Leon from Coincu — we help Web3 projects get visibility through Coincu PR and CMC News. Is your team focused on any upcoming milestone?"},
  {id:"t2",  cat:"Follow-up",   label:"Follow-up after Seen",     text:"Hey [Name], just checking in — did you get a chance to look at what I shared? Happy to answer any questions."},
  {id:"t3",  cat:"Pitch",       label:"Client asks what we sell",  text:"Good question — we mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your current focus more awareness, users, or credibility before a milestone?"},
  {id:"t4",  cat:"Objection",   label:"No budget",                 text:"Totally understand — budget timing is always a factor. Are you in a position to move this quarter, or should we plan for next?"},
  {id:"t5",  cat:"Objection",   label:"Media doesn't convert",     text:"Fair point — PR isn't about direct conversion. It's the credibility layer that makes your ads, community, and investor conversations land better."},
  {id:"t6",  cat:"Context",     label:"Client raising funds",      text:"Good timing actually — investors do check media presence. Would it make sense to have Coincu coverage ready before your round closes?"},
  {id:"t7",  cat:"Context",     label:"Focused on users/growth",   text:"That makes sense. Are you also thinking about visibility for the next public milestone, or is that further down the road?"},
  {id:"t8",  cat:"Context",     label:"Client is agency",          text:"We work well with agencies — either on referral or as a white-label partner. Would that kind of arrangement work for your clients?"},
  {id:"t9",  cat:"Partnership", label:"Offer referral",            text:"By the way — if you know any Web3 projects who need PR or CMC News, we offer a referral commission on closed deals."},
  {id:"t10", cat:"Pitch",       label:"Pitch Coincu PR",           text:"Coincu PR gets your project in front of 500K+ monthly readers. Great for announcement visibility and SEO. Want the rate card?"},
  {id:"t11", cat:"Pitch",       label:"Pitch CMC News",            text:"CMC News puts your content directly on CoinMarketCap — strong for credibility before TGE. Interested?"},
  {id:"t12", cat:"Pitch",       label:"Pitch Banner Ads",          text:"We also run banner placements on Coincu — good for retargeting during a campaign window."},
  {id:"t13", cat:"Closing",     label:"Closing",                   text:"Based on what we've discussed, I think a bundled Coincu PR + CMC News package makes the most sense. Want me to put together a quick proposal?"},
]

function Avatar({name,size=40}) {
  const colors=["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const color=colors[(name||"?").charCodeAt(0)%colors.length]
  const initials=(name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:600,color:"#fff",userSelect:"none",flexShrink:0}}>{initials}</div>
}

function StageBadge({stage}) {
  const s=STAGES[stage]||STAGES["New"]
  return <span style={{background:s.bg,color:s.color,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${s.color}33`}}>{stage}</span>
}

function fmtTime(ts) {
  if(!ts) return ""
  try {
    const d=typeof ts==="number"?new Date(ts*1000):new Date(ts)
    const now=new Date(), diff=now-d
    if(diff<60000) return "now"
    if(d.toDateString()===now.toDateString()) return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})
    const yd=new Date(now); yd.setDate(yd.getDate()-1)
    if(d.toDateString()===yd.toDateString()) return "Yesterday"
    return d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})
  } catch {return ""}
}

function fmtMsgTime(ts) {
  if(!ts) return ""
  try {
    const d=typeof ts==="number"?new Date(ts*1000):new Date(ts)
    return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})
  } catch {return ""}
}

const css = `
.crm-app{display:grid;grid-template-columns:56px 260px 1fr 290px;height:100%;background:${TG.bg};font-family:'Inter',system-ui,sans-serif;overflow:hidden}
.sidebar{background:${TG.panel};display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:6px;border-right:1px solid ${TG.border};flex-shrink:0}
.sicon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;color:${TG.textMuted};font-size:19px;transition:all .15s}
.sicon:hover{background:${TG.elevated};color:${TG.textSec}}
.sicon.active{background:#fff;color:${TG.blue}}
.left-col{background:${TG.panel};border-right:1px solid ${TG.border};display:flex;flex-direction:column;overflow:hidden}
.search-wrap{padding:10px 12px;position:relative}
.search-icon{position:absolute;left:22px;top:50%;transform:translateY(-50%);color:${TG.textMuted};font-size:14px;pointer-events:none}
.search-inp{width:100%;background:${TG.elevated};border:none;border-radius:20px;padding:8px 14px 8px 34px;color:${TG.text};font-size:13px;outline:none;font-family:inherit}
.search-inp::placeholder{color:${TG.textMuted}}
.contact-item{display:flex;gap:10px;padding:10px 14px;cursor:pointer;align-items:center;transition:background .1s;border-bottom:1px solid ${TG.border}}
.contact-item:hover,.contact-item.active{background:${TG.elevated}}
.contact-item.active{border-left:3px solid ${TG.blue}}
.mid-col{display:flex;flex-direction:column;background:${TG.bg};overflow:hidden}
.chat-header{height:58px;background:${TG.panel};border-bottom:1px solid ${TG.border};display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0}
.hbtn{width:34px;height:34px;background:${TG.elevated};border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${TG.textSec};font-size:16px;border:none;transition:background .1s}
.hbtn:hover{background:#3d1f6a;color:${TG.text}}
.msgs-area{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.msgs-area::-webkit-scrollbar{width:4px}
.msgs-area::-webkit-scrollbar-thumb{background:${TG.elevated};border-radius:2px}
.bubble{max-width:70%;padding:9px 13px 6px;line-height:1.5;position:relative;word-break:break-word}
.bubble.in{background:${TG.msgIn};color:${TG.text};border-radius:16px 16px 16px 4px;border:1px solid ${TG.elevated};font-size:14px}
.bubble.out{background:${TG.msgOut};color:#fff;border-radius:16px 16px 4px 16px;font-size:14px}
.bubble.pending{opacity:.7}
.bfoot{display:flex;justify-content:flex-end;align-items:center;gap:4px;margin-top:3px}
.btime{font-size:10px;color:rgba(255,255,255,.45)}
.btime.in-t{color:${TG.textMuted}}
.ai-bar{margin:0 16px 8px;padding:12px 14px;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.3);border-radius:12px;flex-shrink:0}
.ai-label{font-size:11px;font-weight:600;color:#c4a8e8;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.ai-text{font-size:13px;color:${TG.text};line-height:1.6}
.ai-btns{display:flex;gap:6px;margin-top:8px}
.ai-btn{font-size:12px;padding:5px 12px;border-radius:7px;border:none;cursor:pointer;font-weight:600;transition:all .15s}
.ai-btn.use{background:${TG.blue};color:#fff}
.ai-btn.use:hover{background:${TG.blueHover}}
.ai-btn.skip{background:${TG.elevated};color:${TG.textSec}}
.tmpl-panel{margin:0 16px 8px;background:${TG.panel};border:1px solid ${TG.border};border-radius:12px;overflow:hidden;max-height:210px;flex-shrink:0}
.tmpl-cats{padding:8px 12px;border-bottom:1px solid ${TG.border};display:flex;gap:6px;overflow-x:auto}
.tmpl-cats::-webkit-scrollbar{height:0}
.tcat{font-size:11px;padding:4px 10px;border:none;border-radius:99px;cursor:pointer;white-space:nowrap;font-weight:500;transition:all .15s}
.tmpl-list{overflow-y:auto;max-height:160px}
.tmpl-item{padding:10px 14px;cursor:pointer;border-bottom:1px solid ${TG.border};transition:background .1s}
.tmpl-item:hover{background:${TG.elevated}}
.input-area{padding:10px 14px 12px;background:${TG.panel};border-top:1px solid ${TG.border};flex-shrink:0}
.reactions{display:flex;gap:6px;margin-bottom:10px}
.react{font-size:17px;cursor:pointer;padding:2px 6px;border-radius:8px;background:${TG.elevated};transition:transform .1s;border:none}
.react:hover{transform:scale(1.25)}
.input-row{display:flex;gap:8px;align-items:flex-end}
.msg-inp{flex:1;background:${TG.elevated};border:1px solid #3d1f6a;border-radius:20px;padding:9px 16px;color:${TG.text};font-size:14px;outline:none;font-family:inherit;resize:none;max-height:100px;line-height:1.5}
.msg-inp::placeholder{color:${TG.textMuted}}
.ibtn{width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s;flex-shrink:0}
.ibtn.ghost{background:${TG.elevated};color:${TG.textSec}}
.ibtn.ghost:hover{background:#3d1f6a;color:${TG.text}}
.ibtn.send{background:${TG.blue};color:#fff}
.ibtn.send:hover{background:${TG.blueHover}}
.ibtn.active-tmpl{background:rgba(124,58,237,.25);color:#c4a8e8}
.right-col{background:${TG.panel};border-left:1px solid ${TG.border};overflow-y:auto;flex-shrink:0}
.right-col::-webkit-scrollbar{width:4px}
.right-col::-webkit-scrollbar-thumb{background:${TG.elevated};border-radius:2px}
.profile-top{padding:22px 16px 16px;text-align:center;border-bottom:1px solid ${TG.border}}
.pname{font-size:17px;font-weight:700;color:${TG.text};margin-top:12px}
.prole{font-size:12px;color:${TG.textSec};margin-top:3px}
.social-row{display:flex;justify-content:center;gap:8px;margin-top:12px}
.sbtn{width:34px;height:34px;border-radius:50%;background:${TG.elevated};display:flex;align-items:center;justify-content:center;cursor:pointer;color:${TG.textSec};font-size:16px;border:none;transition:background .1s}
.sbtn:hover{background:#3d1f6a;color:${TG.text}}
.r-section{padding:14px 16px;border-bottom:1px solid ${TG.border}}
.r-label{font-size:10px;font-weight:700;color:${TG.textMuted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
.r-inp{width:100%;background:${TG.elevated};border:1px solid #3d1f6a;border-radius:8px;padding:8px 10px;color:${TG.text};font-size:13px;outline:none;font-family:inherit;margin-bottom:8px}
.r-inp:focus{border-color:${TG.blue}}
.r-row{display:flex;align-items:center;gap:8px;font-size:13px;color:${TG.textSec};margin-bottom:6px}
.r-row i{color:${TG.blue};width:16px;font-size:15px}
.prob-bar{height:4px;background:${TG.elevated};border-radius:99px;overflow:hidden;margin-bottom:10px}
.prob-fill{height:100%;background:${TG.blue};border-radius:99px;transition:width .3s}
.note-item{padding:9px 10px;background:${TG.bg};border-radius:8px;border:1px solid ${TG.elevated};margin-bottom:6px}
.qbtn{width:100%;padding:9px 12px;border-radius:8px;font-size:12px;cursor:pointer;text-align:left;font-weight:500;transition:background .1s;margin-bottom:5px;font-family:inherit}
.qbtn.default{background:${TG.elevated};border:1px solid #3d1f6a;color:${TG.textSec}}
.qbtn.default:hover{background:#3d1f6a;color:${TG.text}}
.qbtn.won{background:rgba(79,174,78,.12);border:1px solid rgba(79,174,78,.3);color:${TG.green}}
.qbtn.lost{background:rgba(229,57,53,.1);border:1px solid rgba(229,57,53,.25);color:${TG.red}}
.date-sep{text-align:center;font-size:11px;color:${TG.textMuted};margin:6px 0}
.online{font-size:11px;color:${TG.green}}
.tag{background:rgba(124,58,237,.2);color:#c4a8e8;padding:3px 9px;border-radius:99px;font-size:11px;border:1px solid rgba(124,58,237,.25)}
`

export default function CRMChat({token}) {
  const [chats,setChats]=useState([])
  const [selected,setSelected]=useState(null)
  const [messages,setMessages]=useState([])
  const [search,setSearch]=useState("")
  const [msgInput,setMsgInput]=useState("")
  const [sending,setSending]=useState(false)
  const [loadingChats,setLoadingChats]=useState(true)
  const [loadingMsgs,setLoadingMsgs]=useState(false)
  const [showTmpl,setShowTmpl]=useState(false)
  const [tmplCat,setTmplCat]=useState("all")
  const [aiText,setAiText]=useState("")
  const [aiLoading,setAiLoading]=useState(false)
  const [showProfile,setShowProfile]=useState(true)
  const [stages,setStages]=useState({})
  const [probs,setProbs]=useState({})
  const [deals,setDeals]=useState({})
  const [followUps,setFollowUps]=useState({})
  const [notes,setNotes]=useState({})
  const [noteInput,setNoteInput]=useState("")
  const [addingNote,setAddingNote]=useState(false)
  const endRef=useRef(null)

  const loadChats=useCallback(async()=>{
    setLoadingChats(true)
    try {
      const r=await fetch("/api/chat/list",{headers:{"x-auth-token":token}})
      const d=await r.json()
      if(Array.isArray(d)){setChats(d);if(!selected&&d.length>0)setSelected(d[0])}
    } catch(e){console.error(e)}
    setLoadingChats(false)
  },[token])

  useEffect(()=>{loadChats()},[loadChats])

  useEffect(()=>{
    if(!selected)return
    setMessages([]);setAiText("");setLoadingMsgs(true)
    const qs=selected.username?`?username=${encodeURIComponent(selected.username)}`:""
    fetch(`/api/chat/messages/${selected.id}${qs}`,{headers:{"x-auth-token":token}})
      .then(r=>r.json()).then(d=>{if(Array.isArray(d))setMessages(d)})
      .catch(e=>console.error(e)).finally(()=>setLoadingMsgs(false))
  },[selected?.id,token])

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[messages])

  async function sendMsg(){
    const text=msgInput.trim()
    if(!text||!selected)return
    setSending(true)
    const opt={text,fromMe:true,date:Math.floor(Date.now()/1000),pending:true}
    setMessages(p=>[...p,opt]);setMsgInput("");setAiText("")
    try {
      await fetch("/api/chat/send",{method:"POST",headers:{"Content-Type":"application/json","x-auth-token":token},body:JSON.stringify({chatId:selected.id,text})})
      setMessages(p=>p.map(m=>m===opt?{...m,pending:false}:m))
    } catch(e){setMessages(p=>p.filter(m=>m!==opt));setMsgInput(text);alert("Failed: "+e.message)}
    setSending(false)
  }

  async function getAI(){
    if(!selected)return
    setAiLoading(true)
    const lastClient=[...messages].reverse().find(m=>!m.fromMe)?.text||""
    try {
      const r=await fetch("/api/ai/suggest",{method:"POST",headers:{"Content-Type":"application/json","x-auth-token":token},
        body:JSON.stringify({contactName:selected.name,lastMessage:lastClient,messages:messages.slice(-15),stage:stages[selected.id]||"Contacted",notes:(notes[selected.id]||[]).map(n=>n.content).join(" | ")})})
      const d=await r.json()
      if(d.suggestion)setAiText(d.suggestion)
    } catch(e){console.error(e)}
    setAiLoading(false)
  }

  function addNote(){
    if(!noteInput.trim()||!selected)return
    const n={id:Date.now(),content:noteInput.trim(),date:new Date().toLocaleDateString("vi-VN")}
    setNotes(p=>({...p,[selected.id]:[...(p[selected.id]||[]),n]}))
    setNoteInput("");setAddingNote(false)
  }

  const filtered=chats.filter(c=>!search||c.name?.toLowerCase().includes(search.toLowerCase()))
  const cStage=selected?stages[selected.id]||"Contacted":"New"
  const cProb=selected?probs[selected.id]??50:50
  const cDeal=selected?deals[selected.id]??0:0
  const cFollowUp=selected?followUps[selected.id]||"":""
  const cNotes=selected?notes[selected.id]||[]:[]
  const tmplCats=["all",...new Set(TEMPLATES.map(t=>t.cat))]

  return (<>
    <style>{css}</style>
    <div className="crm-app">

      {/* SIDEBAR */}
      <div className="sidebar">
        <div style={{width:36,height:36,background:TG.blue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15,marginBottom:8}}>⚡</div>
        {[["ti-layout-dashboard","Dashboard"],["ti-users","Leads"],["ti-message-2","Chat"],["ti-file-text","Reports"],["ti-settings","Settings"]].map(([icon,label],i)=>(
          <div key={icon} className={`sicon${i===2?" active":""}`} title={label}>
            <i className={`ti ${icon}`} aria-hidden="true"/>
          </div>
        ))}
        <div style={{flex:1}}/>
        <Avatar name="Leon" size={34}/>
      </div>

      {/* LEFT COL */}
      <div className="left-col">
        <div style={{padding:"14px 14px 4px",fontSize:15,fontWeight:700,color:TG.text}}>Messages</div>
        <div className="search-wrap">
          <i className="ti ti-search search-icon" aria-hidden="true"/>
          <input className="search-inp" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {loadingChats&&<div style={{padding:20,textAlign:"center",color:TG.textMuted,fontSize:13}}>Loading...</div>}
          {filtered.map(chat=>{
            const isSel=selected?.id===chat.id
            return (
              <div key={chat.id} className={`contact-item${isSel?" active":""}`} onClick={()=>setSelected(chat)}>
                <div style={{position:"relative"}}>
                  <Avatar name={chat.name} size={42}/>
                  {chat.unread>0&&<div style={{position:"absolute",bottom:-1,right:-1,background:TG.green,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:10,minWidth:17,textAlign:"center"}}>{chat.unread>99?"99+":chat.unread}</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                    <span style={{fontWeight:600,fontSize:13,color:TG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{chat.name}</span>
                    <span style={{fontSize:10,color:TG.textMuted,flexShrink:0,marginLeft:4}}>{fmtTime(chat.date)}</span>
                  </div>
                  <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{chat.lastMsg||"No messages"}</div>
                  <StageBadge stage={stages[chat.id]||"Contacted"}/>
                </div>
              </div>
            )
          })}
          {!loadingChats&&filtered.length===0&&<div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13}}>No chats found</div>}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${TG.border}`,display:"flex",gap:8}}>
          <button style={{flex:1,padding:"8px",background:TG.blue,border:"none",borderRadius:8,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Meeting</button>
          <button style={{flex:1,padding:"8px",background:TG.elevated,border:`1px solid #3d1f6a`,borderRadius:8,color:TG.textSec,fontSize:12,cursor:"pointer"}}>Schedule</button>
        </div>
      </div>

      {/* MID COL */}
      <div className="mid-col">
        {!selected?(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:TG.textSec}}>
            <div style={{width:80,height:80,background:TG.elevated,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
            <div style={{fontSize:16,fontWeight:500,color:TG.text}}>Select a conversation</div>
            <div style={{fontSize:13}}>Choose from your Telegram chats on the left</div>
          </div>
        ):<>
          {/* Header */}
          <div className="chat-header">
            <Avatar name={selected.name} size={36}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:TG.text}}>{selected.name}</div>
              <div className="online">online</div>
            </div>
            <StageBadge stage={cStage}/>
            <div style={{display:"flex",gap:6,marginLeft:8}}>
              <button className="hbtn" title="Call"><i className="ti ti-phone" aria-hidden="true"/></button>
              <button className="hbtn" title="Video"><i className="ti ti-video" aria-hidden="true"/></button>
              <button className="hbtn" onClick={()=>setShowProfile(v=>!v)} title="Toggle profile">
                <i className={`ti ti-layout-sidebar-right${showProfile?"-filled":""}`} aria-hidden="true"/>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="msgs-area">
            {loadingMsgs&&<div style={{textAlign:"center",color:TG.textMuted,fontSize:13,marginTop:40}}>Loading messages...</div>}
            {!loadingMsgs&&messages.length===0&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:TG.textSec,marginTop:60}}>
                <div style={{fontSize:36}}>👋</div>
                <div style={{fontSize:14}}>No messages yet</div>
                <div style={{fontSize:12,color:TG.textMuted}}>Use a template to start the conversation</div>
              </div>
            )}
            {messages.map((msg,i)=>{
              const prevMsg=messages[i-1]
              const showDate=i===0||(()=>{try{const a=typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date);const b=typeof prevMsg.date==="number"?new Date(prevMsg.date*1000):new Date(prevMsg.date);return a.toDateString()!==b.toDateString()}catch{return false}})()
              return (
                <div key={i}>
                  {showDate&&<div className="date-sep">{(()=>{try{const d=typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date);return d.toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"long"})}catch{return ""}})()}</div>}
                  <div style={{display:"flex",flexDirection:msg.fromMe?"row-reverse":"row",alignItems:"flex-end",gap:8,marginBottom:2}}>
                    {!msg.fromMe&&<Avatar name={selected.name} size={26}/>}
                    <div className={`bubble ${msg.fromMe?"out":"in"}${msg.pending?" pending":""}`}>
                      {msg.text}
                      <div className="bfoot">
                        <span className={`btime${msg.fromMe?"":" in-t"}`}>{fmtMsgTime(msg.date)}</span>
                        {msg.fromMe&&<span style={{fontSize:11,color:msg.pending?"rgba(255,255,255,.3)":"rgba(255,255,255,.55)"}}>{msg.pending?"⏳":"✓✓"}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef}/>
          </div>

          {/* AI suggest bar */}
          {aiText&&(
            <div className="ai-bar">
              <div className="ai-label"><span>✨</span> AI Suggest</div>
              <div className="ai-text">{aiText}</div>
              <div className="ai-btns">
                <button className="ai-btn use" onClick={()=>{setMsgInput(aiText);setAiText("")}}>Use this</button>
                <button className="ai-btn skip" onClick={getAI}>Regenerate</button>
                <button className="ai-btn skip" onClick={()=>setAiText("")} style={{marginLeft:"auto"}}>✕</button>
              </div>
            </div>
          )}

          {/* Templates */}
          {showTmpl&&(
            <div className="tmpl-panel">
              <div className="tmpl-cats">
                {tmplCats.map(cat=>(
                  <button key={cat} className="tcat" onClick={()=>setTmplCat(cat)}
                    style={{background:tmplCat===cat?TG.blue:TG.elevated,color:tmplCat===cat?"#fff":TG.textSec}}>
                    {cat==="all"?"All":cat}
                  </button>
                ))}
                <button className="tcat" onClick={()=>setShowTmpl(false)} style={{background:"none",color:TG.textMuted,marginLeft:"auto"}}>✕</button>
              </div>
              <div className="tmpl-list">
                {TEMPLATES.filter(t=>tmplCat==="all"||t.cat===tmplCat).map(t=>(
                  <div key={t.id} className="tmpl-item" onClick={()=>{setMsgInput(t.text);setShowTmpl(false)}}>
                    <div style={{fontSize:13,fontWeight:600,color:TG.text,marginBottom:2}}>{t.label}</div>
                    <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="input-area">
            <div className="reactions">
              {["👍","❤️","😂","😮","🔥","🎯","💪","✅"].map(e=>(
                <button key={e} className="react" onClick={()=>setMsgInput(p=>p+e)}>{e}</button>
              ))}
            </div>
            <div className="input-row">
              <button className="ibtn ghost" title="Attach"><i className="ti ti-paperclip" aria-hidden="true"/></button>
              <textarea className="msg-inp" placeholder="Type a message..."
                value={msgInput} onChange={e=>setMsgInput(e.target.value)} rows={1}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg()}}}/>
              <button className={`ibtn ghost${showTmpl?" active-tmpl":""}`} onClick={()=>setShowTmpl(v=>!v)} title="Templates">
                <i className="ti ti-template" aria-hidden="true"/>
              </button>
              <button className="ibtn ghost" onClick={getAI} disabled={aiLoading} title="AI Suggest"
                style={{background:aiLoading?"rgba(124,58,237,.2)":TG.elevated,color:aiLoading?"#c4a8e8":TG.textSec}}>
                <i className="ti ti-sparkles" aria-hidden="true"/>
              </button>
              <button className="ibtn send" onClick={sendMsg} disabled={!msgInput.trim()||sending} title="Send"
                style={{opacity:msgInput.trim()?1:.5}}>
                <i className="ti ti-send" aria-hidden="true"/>
              </button>
            </div>
          </div>
        </>}
      </div>

      {/* RIGHT COL */}
      {showProfile&&(
        <div className="right-col">
          {!selected?(
            <div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13,marginTop:60}}>Select a chat</div>
          ):(
            <>
              <div className="profile-top">
                <Avatar name={selected.name} size={68}/>
                <div className="pname">{selected.name}</div>
                <div className="prole">Telegram · {selected.isUser?"Personal":"Group/Channel"}</div>
                <div className="social-row">
                  <button className="sbtn" title="Telegram"><i className="ti ti-brand-telegram" aria-hidden="true"/></button>
                  <button className="sbtn" title="Email"><i className="ti ti-mail" aria-hidden="true"/></button>
                  <button className="sbtn" title="Website"><i className="ti ti-world" aria-hidden="true"/></button>
                  <button className="sbtn" title="Copy ID" onClick={()=>navigator.clipboard?.writeText(selected.id)}><i className="ti ti-copy" aria-hidden="true"/></button>
                </div>
              </div>

              <div className="r-section">
                <div className="r-label">Deal</div>
                <select className="r-inp" value={cStage} onChange={e=>setStages(p=>({...p,[selected.id]:e.target.value}))}>
                  {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:TG.textSec,marginBottom:4}}>
                  <span>Win probability</span>
                  <span style={{color:TG.blue,fontWeight:700}}>{cProb}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={cProb}
                  onChange={e=>setProbs(p=>({...p,[selected.id]:+e.target.value}))}
                  style={{width:"100%",accentColor:TG.blue,marginBottom:8}}/>
                <div className="prob-bar"><div className="prob-fill" style={{width:cProb+"%"}}/></div>
                <div className="r-row"><i className="ti ti-currency-dollar" aria-hidden="true"/>
                  <input type="number" value={cDeal} onChange={e=>setDeals(p=>({...p,[selected.id]:+e.target.value||0}))}
                    placeholder="Deal value USD" style={{background:"transparent",border:"none",color:TG.text,fontSize:13,outline:"none",width:"100%",fontFamily:"inherit"}}/>
                </div>
                <div className="r-row"><i className="ti ti-calendar" aria-hidden="true"/>
                  <input type="date" value={cFollowUp} onChange={e=>setFollowUps(p=>({...p,[selected.id]:e.target.value}))}
                    style={{background:"transparent",border:"none",color:TG.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
              </div>

              <div className="r-section">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div className="r-label" style={{marginBottom:0}}>Notes</div>
                  <button onClick={()=>setAddingNote(v=>!v)}
                    style={{fontSize:11,padding:"3px 9px",background:TG.blue,border:"none",borderRadius:6,color:"#fff",cursor:"pointer",fontWeight:600}}>
                    + Add
                  </button>
                </div>
                {addingNote&&(
                  <div style={{marginBottom:10}}>
                    <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Write a note..." rows={3}
                      style={{width:"100%",background:TG.elevated,border:`1px solid #3d1f6a`,borderRadius:8,padding:"8px 10px",color:TG.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",marginBottom:6,boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={addNote} style={{flex:1,padding:"7px",background:TG.blue,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13}}>Save</button>
                      <button onClick={()=>setAddingNote(false)} style={{padding:"7px 12px",background:TG.elevated,color:TG.textSec,border:`1px solid #3d1f6a`,borderRadius:7,cursor:"pointer",fontSize:13}}>Cancel</button>
                    </div>
                  </div>
                )}
                {cNotes.length===0&&!addingNote&&<div style={{fontSize:12,color:TG.textMuted,fontStyle:"italic"}}>No notes yet</div>}
                {cNotes.map(n=>(
                  <div key={n.id} className="note-item">
                    <div style={{fontSize:13,color:TG.text,lineHeight:1.5}}>{n.content}</div>
                    <div style={{fontSize:10,color:TG.textMuted,marginTop:4}}>{n.date}</div>
                  </div>
                ))}
              </div>

              <div className="r-section" style={{border:"none"}}>
                <div className="r-label">Quick Actions</div>
                <button className="qbtn default" onClick={()=>setStages(p=>({...p,[selected.id]:"Negotiating"}))}>🔥 Mark as Negotiating</button>
                <button className="qbtn default" onClick={()=>setFollowUps(p=>({...p,[selected.id]:new Date(Date.now()+172800000).toISOString().split("T")[0]}))}>📅 Follow-up in 2 days</button>
                <button className="qbtn won" onClick={()=>{setStages(p=>({...p,[selected.id]:"Closed Won"}));setProbs(p=>({...p,[selected.id]:100}))}}>✅ Closed Won</button>
                <button className="qbtn lost" onClick={()=>{setStages(p=>({...p,[selected.id]:"Closed Lost"}));setProbs(p=>({...p,[selected.id]:0}))}}>✕ Mark as Lost</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  </>)
}
