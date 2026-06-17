// v085208
// v035029
import { useState, useEffect, useRef, useCallback } from "react"

const TG = {
  bg:"#120929", panel:"#1a0533", surface:"#1e0a3c", elevated:"#2d1155",
  border:"#0d0618", blue:"#7c3aed", blueHover:"#6d2ed5", blueDim:"rgba(124,58,237,.15)",
  text:"#f0e6ff", textSec:"#9b7ec8", textMuted:"#6b4d94",
  green:"#4fae4e", red:"#e53935", msgOut:"#7c3aed", msgIn:"#1e0a3c",
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
  {id:"t3",  cat:"Pitch",       label:"What do you sell?",        text:"Good question — we mainly help Web3 projects get visibility through Coincu PR and CMC News. Is your current focus more awareness, users, or credibility before a milestone?"},
  {id:"t4",  cat:"Objection",   label:"No budget",                text:"Totally understand — budget timing is always a factor. Are you in a position to move this quarter, or should we plan for next?"},
  {id:"t5",  cat:"Objection",   label:"Media doesn't convert",    text:"Fair point — PR isn't about direct conversion. It's the credibility layer that makes your ads, community, and investor conversations land better."},
  {id:"t6",  cat:"Context",     label:"Client raising funds",     text:"Good timing actually — investors do check media presence. Would it make sense to have Coincu coverage ready before your round closes?"},
  {id:"t7",  cat:"Context",     label:"Focused on users/growth",  text:"That makes sense. Are you also thinking about visibility for the next public milestone, or is that further down the road?"},
  {id:"t8",  cat:"Context",     label:"Client is agency",         text:"We work well with agencies — either on referral or as a white-label partner. Would that kind of arrangement work for your clients?"},
  {id:"t9",  cat:"Partnership", label:"Offer referral",           text:"By the way — if you know any Web3 projects who need PR or CMC News, we offer a referral commission on closed deals."},
  {id:"t10", cat:"Pitch",       label:"Pitch Coincu PR",          text:"Coincu PR gets your project in front of 500K+ monthly readers. Great for announcement visibility and SEO. Want the rate card?"},
  {id:"t11", cat:"Pitch",       label:"Pitch CMC News",           text:"CMC News puts your content directly on CoinMarketCap — strong for credibility before TGE. Interested?"},
  {id:"t12", cat:"Pitch",       label:"Pitch Banner Ads",         text:"We also run banner placements on Coincu — good for retargeting during a campaign window."},
  {id:"t13", cat:"Closing",     label:"Closing",                  text:"Based on what we've discussed, I think a bundled Coincu PR + CMC News package makes the most sense. Want me to put together a quick proposal?"},
]

// ── Avatar — loads real TG photo, falls back to colored initials ──
const photoCache = {}

function Avatar({name, chatId, username, token: avatarToken, size=40}) {
  const colors=["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const colorIdx = (name||"?").charCodeAt(0) % colors.length
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  const [photoUrl, setPhotoUrl] = useState(photoCache[chatId] || null)
  const [failed, setFailed] = useState(false)

  useEffect(()=>{
    if (!chatId || !avatarToken || failed) return
    if (photoCache[chatId]) { setPhotoUrl(photoCache[chatId]); return }
    const qs = username ? `?username=${encodeURIComponent(username)}` : ""
    fetch(`/api/chat/photo/${chatId}${qs}`, {headers:{"x-auth-token":avatarToken}})
      .then(r => { if (!r.ok) throw new Error("no photo"); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        photoCache[chatId] = url
        setPhotoUrl(url)
      })
      .catch(() => setFailed(true))
  }, [chatId, token])

  if (photoUrl && !failed) {
    return (
      <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0}}>
        <img src={photoUrl} alt={name} width={size} height={size}
          style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
          onError={()=>setFailed(true)}/>
      </div>
    )
  }

  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:colors[colorIdx],display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:600,color:"#fff",userSelect:"none",flexShrink:0,letterSpacing:"-0.5px"}}>
      {initials}
    </div>
  )
}

function StageBadge({stage}) {
  const s=STAGES[stage]||STAGES["New"]
  return <span style={{background:s.bg,color:s.color,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${s.color}33`}}>{stage}</span>
}

function fmtTime(ts) {
  if(!ts) return ""
  try {
    const d=typeof ts==="number"?new Date(ts*1000):new Date(ts)
    const now=new Date(),diff=now-d
    if(diff<60000) return "now"
    if(d.toDateString()===now.toDateString()) return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
    const yd=new Date(now);yd.setDate(yd.getDate()-1)
    if(d.toDateString()===yd.toDateString()) return "Yesterday"
    return d.toLocaleDateString([],{day:"2-digit",month:"2-digit"})
  } catch{return ""}
}

function fmtMsgTime(ts) {
  if(!ts) return ""
  try {
    const d=typeof ts==="number"?new Date(ts*1000):new Date(ts)
    return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
  } catch{return ""}
}

function fmtDateSep(ts) {
  if(!ts) return ""
  try {
    const d=typeof ts==="number"?new Date(ts*1000):new Date(ts)
    const now=new Date()
    if(d.toDateString()===now.toDateString()) return "Today"
    const yd=new Date(now);yd.setDate(yd.getDate()-1)
    if(d.toDateString()===yd.toDateString()) return "Yesterday"
    return d.toLocaleDateString([],{weekday:"long",day:"numeric",month:"long"})
  } catch{return ""}
}

// ── Context Menu (right-click) ──
function ContextMenu({x,y,msg,onDelete,onCopy,onReply,onClose,onDeleteAll,onSelect}) {
  const ref=useRef(null)
  useEffect(()=>{
    function handler(e){if(ref.current&&!ref.current.contains(e.target))onClose()}
    document.addEventListener("mousedown",handler)
    return()=>document.removeEventListener("mousedown",handler)
  },[onClose])

  const menuW=200
  const menuH=220
  const adjX=x+menuW>window.innerWidth?x-menuW:x
  const adjY=y+menuH>window.innerHeight?y-menuH:y

  const Item = ({icon,label,action,danger,sep}) => sep ? (
    <div style={{height:1,background:"#2d1155",margin:"3px 0"}}/>
  ) : (
    <div onClick={()=>{action();onClose()}}
      style={{padding:"9px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,
        fontSize:13,color:danger?"#e53935":TG.text,transition:"background .1s"}}
      onMouseEnter={e=>e.currentTarget.style.background="#2d1155"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <span style={{fontSize:15}}>{icon}</span>
      {label}
    </div>
  )

  return (
    <div ref={ref} style={{
      position:"fixed",left:adjX,top:adjY,zIndex:9999,
      background:"#1a0533",border:"1px solid #3d1f6a",borderRadius:12,
      padding:"4px 0",minWidth:200,
      boxShadow:"0 8px 32px rgba(0,0,0,.7)",
    }}>
      <Item icon="↩️" label="Reply"        action={onReply}/>
      <Item icon="📋" label="Copy Text"     action={onCopy}/>
      <Item icon="☑️" label="Select Message" action={onSelect}/>
      <Item sep/>
      <Item icon="🗑" label="Delete Message"      action={onDelete} danger/>
      <Item icon="🗑" label="Delete All Messages"  action={onDeleteAll} danger/>
    </div>
  )
}

// ── AI Suggest floating panel ──
function AISuggestPanel({text,loading,onUse,onRegenerate,onClose}) {
  if(!text&&!loading) return null
  return (
    <div style={{
      margin:"0 16px 8px",padding:"12px 14px",
      background:"rgba(124,58,237,.12)",border:"1px solid rgba(124,58,237,.35)",
      borderRadius:12,flexShrink:0,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
        <span style={{fontSize:14}}>✨</span>
        <span style={{fontSize:12,fontWeight:700,color:"#c4a8e8"}}>AI Suggest</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{background:"none",border:"none",color:TG.textMuted,cursor:"pointer",fontSize:16,padding:"0 2px",lineHeight:1}}>✕</button>
      </div>
      {loading?(
        <div style={{display:"flex",gap:6,alignItems:"center",color:TG.textSec,fontSize:13}}>
          <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span>
          Reading conversation...
        </div>
      ):(
        <>
          <div style={{fontSize:14,color:TG.text,lineHeight:1.6,marginBottom:10}}>{text}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onUse} style={{flex:1,padding:"7px",background:TG.blue,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13}}>
              Use this ↑
            </button>
            <button onClick={onRegenerate} style={{padding:"7px 12px",background:"#2d1155",color:TG.textSec,border:"1px solid #3d1f6a",borderRadius:8,cursor:"pointer",fontSize:13}}>
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const STYLES = `
.crm-root{display:grid;grid-template-columns:56px 270px 1fr 295px;height:100%;background:${TG.bg};font-family:'Inter',system-ui,sans-serif;overflow:hidden;color:${TG.text}}
.sidebar{background:${TG.panel};display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:4px;border-right:1px solid ${TG.border}}
.si{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;color:${TG.textMuted};font-size:20px;transition:all .15s}
.si:hover{background:${TG.elevated};color:${TG.textSec}}
.si.on{background:#fff;color:${TG.blue}}
.lc{background:${TG.panel};border-right:1px solid ${TG.border};display:flex;flex-direction:column;overflow:hidden}
.sinp{width:100%;background:${TG.elevated};border:none;border-radius:20px;padding:8px 14px 8px 34px;color:${TG.text};font-size:13px;outline:none;font-family:inherit}
.sinp::placeholder{color:${TG.textMuted}}
.ci{display:flex;gap:10px;padding:10px 14px;cursor:pointer;align-items:center;transition:background .1s;border-bottom:1px solid ${TG.border};position:relative}
.ci:hover{background:${TG.elevated}}
.ci.sel{background:${TG.blue}22;border-left:3px solid ${TG.blue}}
.mc{display:flex;flex-direction:column;background:${TG.bg};overflow:hidden}
.chdr{height:58px;background:${TG.panel};border-bottom:1px solid ${TG.border};display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0}
.hb{width:34px;height:34px;background:${TG.elevated};border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${TG.textSec};font-size:16px;border:none;transition:all .15s}
.hb:hover{background:#3d1f6a;color:${TG.text}}
.hb.on{background:rgba(124,58,237,.25);color:#c4a8e8}
.msgs{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:3px}
.msgs::-webkit-scrollbar{width:4px}
.msgs::-webkit-scrollbar-thumb{background:${TG.elevated};border-radius:2px}
.bbl{display:inline-block;width:fit-content;max-width:72%;min-width:80px;padding:8px 12px 4px;line-height:1.55;font-size:14px;cursor:pointer;white-space:normal;word-break:break-word;overflow-wrap:break-word}
.bbl:hover{opacity:.92}
.bbl.in{background:${TG.msgIn};color:${TG.text};border-radius:14px 14px 14px 3px;border:1px solid ${TG.elevated}}
.bbl.out{background:${TG.msgOut};color:#fff;border-radius:14px 14px 3px 14px}
.bbl.del{opacity:.4;font-style:italic}
.bbl.rpl{border-left:3px solid rgba(124,58,237,.6);padding-left:10px}
.bfoot{display:flex;justify-content:flex-end;align-items:center;gap:3px;margin-top:3px;white-space:nowrap;flex-wrap:nowrap}
.bt{font-size:10px;color:rgba(255,255,255,.4)}
.bt.in{color:${TG.textMuted}}
.dsep{text-align:center;font-size:11px;color:${TG.textMuted};padding:8px 0;user-select:none}
.dsep span{background:${TG.elevated};padding:3px 12px;border-radius:99px}
.ia{padding:10px 14px 12px;background:${TG.panel};border-top:1px solid ${TG.border};flex-shrink:0}
.reacts{display:flex;gap:5px;margin-bottom:10px}
.re{font-size:18px;cursor:pointer;padding:2px 5px;border-radius:7px;background:${TG.elevated};border:none;transition:transform .1s}
.re:hover{transform:scale(1.25)}
.ir{display:flex;gap:8px;align-items:flex-end}
.mi{flex:1;background:${TG.elevated};border:1px solid #3d1f6a;border-radius:20px;padding:9px 16px;color:${TG.text};font-size:14px;outline:none;font-family:inherit;resize:none;max-height:100px;line-height:1.5;transition:border-color .15s}
.mi:focus{border-color:${TG.blue}}
.mi::placeholder{color:${TG.textMuted}}
.ib{width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .15s;flex-shrink:0}
.ib.g{background:${TG.elevated};color:${TG.textSec}}
.ib.g:hover{background:#3d1f6a;color:${TG.text}}
.ib.s{background:${TG.blue};color:#fff}
.ib.s:hover{background:${TG.blueHover}}
.ib.on{background:rgba(124,58,237,.25);color:#c4a8e8}
.ib:disabled{opacity:.4;cursor:default}
.tp{margin:0 16px 8px;background:${TG.panel};border:1px solid ${TG.border};border-radius:12px;overflow:hidden;max-height:210px;flex-shrink:0}
.tpcat{display:flex;gap:5px;padding:8px 10px;border-bottom:1px solid ${TG.border};overflow-x:auto}
.tpcat::-webkit-scrollbar{height:0}
.tc{font-size:11px;padding:4px 10px;border:none;border-radius:99px;cursor:pointer;white-space:nowrap;font-weight:500;font-family:inherit;transition:all .15s}
.tlist{overflow-y:auto;max-height:160px}
.ti{padding:10px 14px;cursor:pointer;border-bottom:1px solid ${TG.border};transition:background .1s}
.ti:hover{background:${TG.elevated}}
.rc{background:${TG.panel};border-left:1px solid ${TG.border};overflow-y:auto;flex-shrink:0}
.rc::-webkit-scrollbar{width:4px}
.rc::-webkit-scrollbar-thumb{background:${TG.elevated};border-radius:2px}
.rs{padding:14px 16px;border-bottom:1px solid ${TG.border}}
.rl{font-size:10px;font-weight:700;color:${TG.textMuted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
.ri{width:100%;background:${TG.elevated};border:1px solid #3d1f6a;border-radius:8px;padding:8px 10px;color:${TG.text};font-size:13px;outline:none;font-family:inherit;margin-bottom:8px}
.ri:focus{border-color:${TG.blue}}
.rr{display:flex;align-items:center;gap:8px;font-size:13px;color:${TG.textSec};margin-bottom:7px}
.rr i{color:${TG.blue};width:16px;font-size:15px}
.qb{width:100%;padding:9px 12px;border-radius:8px;font-size:12px;cursor:pointer;text-align:left;font-weight:500;transition:all .1s;margin-bottom:5px;font-family:inherit}
.qb.d{background:${TG.elevated};border:1px solid #3d1f6a;color:${TG.textSec}}
.qb.d:hover{background:#3d1f6a;color:${TG.text}}
.qb.w{background:rgba(79,174,78,.12);border:1px solid rgba(79,174,78,.3);color:${TG.green}}
.qb.l{background:rgba(229,57,53,.1);border:1px solid rgba(229,57,53,.25);color:${TG.red}}
.rpl-bar{background:#2d1155;border-left:3px solid ${TG.blue};padding:6px 10px;border-radius:0 8px 8px 0;margin-bottom:8px;font-size:12px;color:${TG.textSec};display:flex;align-items:center;gap:8px}
@keyframes spin{to{transform:rotate(360deg)}}
`

export default function CRMChat({token}) {
  _authToken = token  // set module-level token for Avatar
  const [chats,setChats]=useState([])
  const [sel,setSel]=useState(null)
  const [msgs,setMsgs]=useState([])
  const [search,setSearch]=useState("")
  const [input,setInput]=useState("")
  const [sending,setSending]=useState(false)
  const [loadChats,setLoadChats]=useState(true)
  const [loadMsgs,setLoadMsgs]=useState(false)
  const [showTmpl,setShowTmpl]=useState(false)
  const [tmplCat,setTmplCat]=useState("all")
  const [aiText,setAiText]=useState("")
  const [aiAnalysis,setAiAnalysis]=useState("")
  const [aiAlt,setAiAlt]=useState("")
  const [aiLoading,setAiLoading]=useState(false)
  const msgsRef = useRef([])
  useEffect(()=>{ msgsRef.current = msgs },[msgs])
  const [showProfile,setShowProfile]=useState(true)
  const [stages,setStages]=useState({})
  const [probs,setProbs]=useState({})
  const [deals,setDeals]=useState({})
  const [fups,setFups]=useState({})
  const [notes,setNotes]=useState({})
  const [noteInp,setNoteInp]=useState("")
  const [addNote,setAddNote]=useState(false)
  const [ctxMenu,setCtxMenu]=useState(null)
  const [selectedMsgs,setSelectedMsgs]=useState(new Set())
  const [selectMode,setSelectMode]=useState(false) // {x,y,msg,idx}
  const [replyTo,setReplyTo]=useState(null)
  const endRef=useRef(null)

  // Load chats
  const fetchChats=useCallback(async()=>{
    setLoadChats(true)
    try {
      const r=await fetch("/api/chat/list",{headers:{"x-auth-token":token}})
      const d=await r.json()
      if(Array.isArray(d)){setChats(d);if(!sel&&d.length>0)setSel(d[0])}
    }catch(e){console.error("chats:",e)}
    setLoadChats(false)
  },[token])

  useEffect(()=>{fetchChats()},[fetchChats])

  // Load messages when chat selected
  const initialLoadRef = useRef(false)
  useEffect(()=>{
    if(!sel) return
    initialLoadRef.current = false
    setMsgs([]); setAiText(""); setAiAnalysis(""); setAiAlt(""); setReplyTo(null)
    loadMessages(sel)
  },[sel?.id,token])


  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[msgs])

  // Send message — send then reload (no polling = no duplicates)
  const loadingRef = useRef(false)
  async function loadMessages(chat) {
    if(!chat) return
    if(loadingRef.current) return
    loadingRef.current = true
    setLoadMsgs(true)
    try {
      const qs = chat.username ? '?username='+encodeURIComponent(chat.username) : ''
      const r = await fetch('/api/chat/messages/'+chat.id+qs, {headers:{"x-auth-token":token}})
      const d = await r.json()
      if(Array.isArray(d)) {
        // Keep any pending optimistic messages that haven't been confirmed yet
        setMsgs(prev => {
          const pending = prev.filter(m => m.pending && m.id < 0)
          const serverIds = new Set(d.map(m=>m.id))
          // Only keep pending if not yet in server response
          const stillPending = pending.filter(m => !d.some(s=>s.text===m.text&&s.fromMe))
          return [...d, ...stillPending]
        })
      }
    } catch(e) { console.error("loadMsgs:",e) }
    loadingRef.current = false
    setLoadMsgs(false)
  }

  const sendingRef = useRef(false)
  async function send(){
    const text=input.trim(); if(!text||!sel||!text.length) return
    if(sendingRef.current) return
    // Clear input immediately so user sees it's been captured
    setInput("")
    sendingRef.current = true
    setSending(true); setReplyTo(null)
    // Show message instantly (optimistic)
    const tempMsg = {id: -Date.now(), text, fromMe:true, date:Math.floor(Date.now()/1000), pending:true}
    setMsgs(p=>[...p, tempMsg])
    try {
      await fetch("/api/chat/send",{
        method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
        body:JSON.stringify({chatId:sel.id, text})
      })
      // Reload in background after 1s — replace optimistic with real
      setTimeout(async()=>{
        loadingRef.current = false
        await loadMessages(sel)
      }, 1000)
    } catch(e) {
      setMsgs(p=>p.filter(m=>m.id!==tempMsg.id))
      setInput(text)
    }
    sendingRef.current = false
    setSending(false)
  }

  // AI Suggest — always reads latest msgs from ref
  async function getAI(){
    if(!sel) return
    setAiText(""); setAiLoading(true)

    // Use msgsRef to get absolute latest messages (not stale closure)
    const allMsgs = (msgsRef.current||[]).filter(m => m.text && !m.deleted && !m.pending)
    const lastClientMsg = [...allMsgs].reverse().find(m => !m.fromMe)?.text || ""

    try {
      const r = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: {"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify({
          contactName: sel.name,
          lastMessage: lastClientMsg,
          messages: allMsgs.slice(-20).map(m => ({text: m.text, fromMe: m.fromMe})),
          stage: stages[sel.id] || "Contacted",
          notes: (notes[sel.id]||[]).map(n=>n.content).join(" | ")
        })
      })
      const d = await r.json()
      if (d.suggestion) setAiText(d.suggestion)
    } catch(e) { console.error("AI:", e) }
    setAiLoading(false)
  }

  // Right-click context menu
  function handleCtx(e,msg,idx){
    e.preventDefault()
    setCtxMenu({x:e.clientX,y:e.clientY,msg,idx})
  }

  async function deleteMsg(idx){
    const msg = msgs[idx]
    if(!msg) return
    setMsgs(p=>p.map((m,i)=>i===idx?{...m,deleted:true,text:"This message was deleted"}:m))
    if(msg.id && msg.id > 0 && msg.fromMe) {
      try {
        await fetch("/api/chat/delete",{
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({chatId:sel.id, messageId:msg.id})
        })
      } catch(e) { console.error("Delete failed:", e) }
    }
  }

  async function deleteAllMsgs(){
    if(!sel || !window.confirm("Delete all your messages in this chat?")) return
    const myMsgs = msgs.filter(m=>m.fromMe && m.id && m.id>0)
    // Mark all as deleted in UI immediately
    setMsgs(p=>p.map(m=>m.fromMe?{...m,deleted:true,text:"This message was deleted"}:m))
    // Delete each on server
    for(const msg of myMsgs) {
      try {
        await fetch("/api/chat/delete",{
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({chatId:sel.id, messageId:msg.id})
        })
      } catch(e) { console.error("Delete failed:", e) }
    }
  }

  function copyMsg(text){
    navigator.clipboard?.writeText(text).catch(()=>{})
  }

  // Save note
  function saveNote(){
    if(!noteInp.trim()||!sel)return
    const n={id:Date.now(),content:noteInp.trim(),date:new Date().toLocaleDateString()}
    setNotes(p=>({...p,[sel.id]:[...(p[sel.id]||[]),n]}))
    setNoteInp("");setAddNote(false)
  }

  const filtered=chats.filter(c=>!search||c.name?.toLowerCase().includes(search.toLowerCase()))
  const cStage=sel?stages[sel.id]||"Contacted":"New"
  const cProb=sel?probs[sel.id]??50:50
  const cDeal=sel?deals[sel.id]??0:0
  const cFup=sel?fups[sel.id]||"":""
  const cNotes=sel?notes[sel.id]||[]:[]
  const tmplCats=["all",...new Set(TEMPLATES.map(t=>t.cat))]

  return (<>
    <style>{STYLES}</style>
    <div className="crm-root">

      {/* SIDEBAR */}
      <div className="sidebar">
        <div style={{width:36,height:36,background:TG.blue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15,marginBottom:10}}>⚡</div>
        {[["🏠","Dashboard"],["👥","Leads"],["💬","Chat"],["📊","Reports"],["📈","Analytics"]].map(([icon,label],i)=>(
          <div key={label} className={`si${i===2?" on":""}`} title={label} style={{fontSize:18}}>
            {icon}
          </div>
        ))}
        <div style={{flex:1}}/>
        <div className="si" title="Settings" style={{fontSize:18}}>⚙️</div>
        <div style={{marginTop:6,width:34,height:34,borderRadius:"50%",background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13}}>L</div>
      </div>

      {/* LEFT COL */}
      <div className="lc">
        <div style={{padding:"14px 14px 6px",fontSize:15,fontWeight:700,color:TG.text,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span>Messages</span>
          <button onClick={fetchChats} disabled={loadChats} style={{background:"none",border:"none",color:TG.textMuted,cursor:"pointer",fontSize:16}} title="Refresh">
            🔄
          </button>
        </div>
        <div style={{padding:"0 12px 8px",position:"relative"}}>
          <i className="ti ti-search" aria-hidden="true" style={{position:"absolute",left:22,top:"50%",transform:"translateY(-50%)",color:TG.textMuted,fontSize:14,pointerEvents:"none"}}/>
          <input className="sinp" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {loadChats&&<div style={{padding:20,textAlign:"center",color:TG.textMuted,fontSize:13}}>Loading Telegram...</div>}
          {filtered.map(chat=>{
            const isSel=sel?.id===chat.id
            return(
              <div key={chat.id} className={`ci${isSel?" sel":""}`} onClick={()=>setSel(chat)}>
                <div style={{position:"relative"}}>
                  <Avatar name={chat.name} chatId={chat.id} username={chat.username} size={44}/>
                  {chat.unread>0&&<div style={{position:"absolute",bottom:-1,right:-1,background:TG.green,color:"#fff",fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:10,minWidth:17,textAlign:"center"}}>{chat.unread>99?"99+":chat.unread}</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                    <span style={{fontWeight:600,fontSize:14,color:TG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{chat.name}</span>
                    <span style={{fontSize:10,color:TG.textMuted,flexShrink:0,marginLeft:4}}>{fmtTime(chat.date)}</span>
                  </div>
                  <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{chat.lastMsg||"No messages"}</div>
                  <StageBadge stage={stages[chat.id]||"Contacted"}/>
                </div>
              </div>
            )
          })}
          {!loadChats&&filtered.length===0&&<div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13}}>No chats found</div>}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${TG.border}`,display:"flex",gap:8}}>
          <button style={{flex:1,padding:"8px",background:TG.blue,border:"none",borderRadius:8,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>+ Meeting</button>
          <button style={{flex:1,padding:"8px",background:TG.elevated,border:"1px solid #3d1f6a",borderRadius:8,color:TG.textSec,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Schedule</button>
        </div>
      </div>

      {/* MID COL */}
      <div className="mc">
        {!sel?(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:TG.textSec}}>
            <div style={{width:80,height:80,background:TG.elevated,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
            <div style={{fontSize:16,fontWeight:500,color:TG.text}}>Select a conversation</div>
            <div style={{fontSize:13}}>Pick a chat from your Telegram on the left</div>
          </div>
        ):<>
          {/* Chat header */}
          <div className="chdr">
            <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={38}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:TG.text,lineHeight:1.2}}>{sel.name}</div>
              <div style={{fontSize:11,color:sel?.isUser?TG.green:TG.textSec}}>{sel?.isUser?"● online":sel?.memberCount?(sel.memberCount+" members"):(sel?.isGroup?"Group":sel?.isChannel?"Channel":"")}</div>
            </div>
            <StageBadge stage={cStage}/>
            <div style={{display:"flex",gap:6,marginLeft:8}}>
              <button className="hb" title="Call" style={{fontSize:16}}>📞</button>
              <button className="hb" title="Search in chat" style={{fontSize:16}}>🔍</button>
              <button onClick={()=>loadMessages(sel)} title="Refresh messages"
                style={{width:34,height:34,background:TG.elevated,borderRadius:8,border:"none",cursor:"pointer",fontSize:15}}>
                🔄
              </button>
              <button className={`hb${showProfile?" on":""}`} onClick={()=>setShowProfile(v=>!v)} title="Toggle info" style={{fontSize:16}}>
                ℹ️
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="msgs">
            {loadMsgs&&<div style={{textAlign:"center",color:TG.textMuted,fontSize:13,marginTop:40}}>Loading messages...</div>}
            {!loadMsgs&&msgs.length===0&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:TG.textSec,marginTop:60}}>
                <div style={{fontSize:36}}>👋</div>
                <div style={{fontSize:14}}>No messages yet</div>
                <div style={{fontSize:12,color:TG.textMuted}}>Start with a template or AI suggest</div>
              </div>
            )}
            {msgs.map((msg,i)=>{
              const prev=msgs[i-1]
              const showSep=i===0||(()=>{
                try{
                  const a=typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date)
                  const b=typeof prev.date==="number"?new Date(prev.date*1000):new Date(prev.date)
                  return a.toDateString()!==b.toDateString()
                }catch{return false}
              })()
              return(
                <div key={i}>
                  {showSep&&<div className="dsep"><span>{fmtDateSep(msg.date)}</span></div>}
                  <div style={{display:"flex",flexDirection:msg.fromMe?"row-reverse":"row",alignItems:"flex-end",gap:8,marginBottom:2,cursor:selectMode?"pointer":"default"}}
                    onClick={selectMode?()=>setSelectedMsgs(prev=>{const s=new Set(prev);s.has(i)?s.delete(i):s.add(i);return s}):undefined}>
                  {selectMode&&<div style={{width:20,height:20,borderRadius:"50%",border:"2px solid #7c3aed",background:selectedMsgs.has(i)?"#7c3aed":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"center",fontSize:12,color:"#fff",cursor:"pointer"}}>
                    {selectedMsgs.has(i)?"✓":""}
                  </div>}
                    {!msg.fromMe&&<Avatar name={sel.name} chatId={sel.id} username={sel.username} size={26}/>}
                    <div onContextMenu={e=>handleCtx(e,msg,i)}>
                      {msg.replyTo&&(
                        <div style={{background:"rgba(124,58,237,.15)",borderLeft:`3px solid ${TG.blue}`,padding:"4px 8px",borderRadius:"0 6px 6px 0",marginBottom:4,fontSize:11,color:TG.textSec,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          ↩ {msg.replyTo.fromMe?"You":sel.name}: {msg.replyTo.text}
                        </div>
                      )}
                      <div className={`bbl ${msg.fromMe?"out":"in"}${msg.deleted?" del":""}${msg.replyTo?" rpl":""}`}>
                        <span style={{display:"block",whiteSpace:"normal"}}>{msg.text}</span>
                        <div className="bfoot">
                          <span className={`bt${msg.fromMe?"":" in"}`}>{fmtMsgTime(msg.date)}</span>
                          {msg.fromMe&&<span style={{fontSize:10,color:msg.pending?"rgba(255,255,255,.3)":"rgba(255,255,255,.6)"}}>{msg.pending?"⏳":"✓✓"}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef}/>
          </div>

          {/* AI Suggest panel */}
          <AISuggestPanel
            text={aiText} analysis={aiAnalysis} alternative={aiAlt} loading={aiLoading}
            onUse={()=>{setInput(aiText);setAiText("");setAiAnalysis("");setAiAlt("")}}
            onUseAlt={()=>{setInput(aiAlt);setAiText("");setAiAnalysis("");setAiAlt("")}}
            onRegenerate={()=>getAI(false)}
            onClose={()=>{setAiText("");setAiAnalysis("");setAiAlt("");setAiLoading(false)}}
          />

          {/* Reply bar */}
          {replyTo&&(
            <div className="rpl-bar" style={{margin:"0 16px 6px",flexShrink:0}}>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                ↩ Replying to: {replyTo.text}
              </span>
              <button onClick={()=>setReplyTo(null)} style={{background:"none",border:"none",color:TG.textMuted,cursor:"pointer",fontSize:15,flexShrink:0}}>✕</button>
            </div>
          )}

          {/* Template picker */}
          {showTmpl&&(
            <div className="tp">
              <div className="tpcat">
                {tmplCats.map(cat=>(
                  <button key={cat} className="tc" onClick={()=>setTmplCat(cat)}
                    style={{background:tmplCat===cat?TG.blue:TG.elevated,color:tmplCat===cat?"#fff":TG.textSec}}>
                    {cat==="all"?"All":cat}
                  </button>
                ))}
                <button className="tc" onClick={()=>setShowTmpl(false)} style={{background:"none",color:TG.textMuted,marginLeft:"auto"}}>✕</button>
              </div>
              <div className="tlist">
                {TEMPLATES.filter(t=>tmplCat==="all"||t.cat===tmplCat).map(t=>(
                  <div key={t.id} className="ti" onClick={()=>{setInput(t.text);setShowTmpl(false)}}>
                    <div style={{fontSize:13,fontWeight:600,color:TG.text,marginBottom:2}}>{t.label}</div>
                    <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select mode action bar */}
          {selectMode&&(
            <div style={{padding:"10px 16px",background:"#1a0533",borderTop:"1px solid #0d0618",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <span style={{fontSize:13,color:"#c4a8e8",flex:1}}>{selectedMsgs.size} selected</span>
              <button onClick={()=>{
                const toDelete = [...selectedMsgs].map(i=>msgs[i]).filter(m=>m&&m.fromMe&&m.id>0)
                setMsgs(p=>p.map((m,i)=>selectedMsgs.has(i)?{...m,deleted:true,text:"This message was deleted"}:m))
                toDelete.forEach(m=>fetch("/api/chat/delete",{method:"POST",headers:{"Content-Type":"application/json","x-auth-token":token},body:JSON.stringify({chatId:sel.id,messageId:m.id})}))
                setSelectMode(false);setSelectedMsgs(new Set())
              }} style={{padding:"7px 14px",background:"rgba(229,57,53,.15)",color:"#e53935",border:"1px solid rgba(229,57,53,.3)",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>
                🗑 Delete
              </button>
              <button onClick={()=>{setSelectMode(false);setSelectedMsgs(new Set())}}
                style={{padding:"7px 14px",background:"#2d1155",color:"#9b7ec8",border:"1px solid #3d1f6a",borderRadius:8,cursor:"pointer",fontSize:13}}>
                Cancel
              </button>
            </div>
          )}
          {/* Input area */}
          <div className="ia">
            <div className="reacts">
              {["👍","❤️","😂","🔥","💪","✅","🙏","😎"].map(e=>(
                <button key={e} className="re" onClick={()=>setInput(p=>p+e)}>{e}</button>
              ))}
            </div>
            <div className="ir">
              <button className="ib g" title="Attach file" style={{fontSize:17}}>📎</button>
              <textarea className="mi" placeholder="Type a message..."
                value={input} onChange={e=>setInput(e.target.value)} rows={1}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}}/>
              <button className={`ib g${showTmpl?" on":""}`} onClick={()=>setShowTmpl(v=>!v)} title="Templates" style={{fontSize:17}}>
                📋
              </button>
              <button className="ib g" onClick={getAI} disabled={aiLoading} title="AI Suggest"
                style={{background:aiLoading?"rgba(124,58,237,.25)":TG.elevated,fontSize:17}}>
                {aiLoading?"⏳":"✨"}
              </button>
              <button className="ib s" onClick={send} disabled={!input.trim()||sending}
                style={{opacity:input.trim()&&!sending?1:.4,fontSize:17}} title="Send">
                ➤
              </button>
            </div>
          </div>
        </>}
      </div>

      {/* RIGHT COL */}
      {showProfile&&(
        <div className="rc">
          {!sel?(
            <div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13,marginTop:60}}>Select a chat</div>
          ):(
            <>
              <div style={{padding:"22px 16px 16px",textAlign:"center",borderBottom:`1px solid ${TG.border}`}}>
                <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={70}/>
                <div style={{fontWeight:700,fontSize:18,color:TG.text,marginTop:12}}>{sel.name}</div>
                <div style={{fontSize:12,color:TG.textSec,marginTop:3}}>Telegram · {sel.isUser?"Contact":"Group"}</div>
                <div style={{marginTop:10}}><StageBadge stage={cStage}/></div>
                <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:12}}>
                  {[["📱","Open in TG",null],["📧","Email",null],["🌐","Website",null],["📋","Copy ID",()=>navigator.clipboard?.writeText(sel.id)]].map(([icon,ttl,action])=>(
                    <button key={ttl} title={ttl} onClick={action||undefined} style={{width:34,height:34,borderRadius:"50%",background:TG.elevated,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16}}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rs">
                <div className="rl">Deal</div>
                <select className="ri" value={cStage} onChange={e=>setStages(p=>({...p,[sel.id]:e.target.value}))}>
                  {Object.keys(STAGES).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:TG.textSec,marginBottom:4}}>
                  <span>Win probability</span>
                  <span style={{color:TG.blue,fontWeight:700}}>{cProb}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={cProb}
                  onChange={e=>setProbs(p=>({...p,[sel.id]:+e.target.value}))}
                  style={{width:"100%",accentColor:TG.blue,marginBottom:6}}/>
                <div style={{height:4,background:TG.elevated,borderRadius:99,overflow:"hidden",marginBottom:10}}>
                  <div style={{height:"100%",width:cProb+"%",background:TG.blue,borderRadius:99,transition:"width .3s"}}/>
                </div>
                <div className="rr">
                  <span style={{fontSize:15}}>💵</span>
                  <input type="number" value={cDeal} onChange={e=>setDeals(p=>({...p,[sel.id]:+e.target.value||0}))}
                    placeholder="Deal value USD" style={{background:"transparent",border:"none",color:TG.text,fontSize:13,outline:"none",width:"100%",fontFamily:"inherit"}}/>
                </div>
                <div className="rr">
                  <span style={{fontSize:15}}>📅</span>
                  <input type="date" value={cFup} onChange={e=>setFups(p=>({...p,[sel.id]:e.target.value}))}
                    style={{background:"transparent",border:"none",color:TG.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
              </div>

              <div className="rs">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div className="rl" style={{marginBottom:0}}>Notes</div>
                  <button onClick={()=>setAddNote(v=>!v)} style={{fontSize:11,padding:"3px 9px",background:TG.blue,border:"none",borderRadius:6,color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}}>+ Add</button>
                </div>
                {addNote&&(
                  <div style={{marginBottom:10}}>
                    <textarea value={noteInp} onChange={e=>setNoteInp(e.target.value)} placeholder="Write a note..." rows={3}
                      style={{width:"100%",background:TG.elevated,border:"1px solid #3d1f6a",borderRadius:8,padding:"8px 10px",color:TG.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",marginBottom:6,boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={saveNote} style={{flex:1,padding:"7px",background:TG.blue,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}}>Save</button>
                      <button onClick={()=>setAddNote(false)} style={{padding:"7px 12px",background:TG.elevated,color:TG.textSec,border:"1px solid #3d1f6a",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Cancel</button>
                    </div>
                  </div>
                )}
                {cNotes.length===0&&!addNote&&<div style={{fontSize:12,color:TG.textMuted,fontStyle:"italic"}}>No notes yet</div>}
                {cNotes.map(n=>(
                  <div key={n.id} style={{padding:"9px 10px",background:TG.bg,borderRadius:8,border:`1px solid ${TG.elevated}`,marginBottom:6}}>
                    <div style={{fontSize:13,color:TG.text,lineHeight:1.5}}>{n.content}</div>
                    <div style={{fontSize:10,color:TG.textMuted,marginTop:4}}>{n.date}</div>
                  </div>
                ))}
              </div>

              <div className="rs" style={{border:"none"}}>
                <div className="rl">Quick Actions</div>
                <button className="qb d" onClick={()=>setStages(p=>({...p,[sel.id]:"Negotiating"}))}>🔥 Mark as Negotiating</button>
                <button className="qb d" onClick={()=>setFups(p=>({...p,[sel.id]:new Date(Date.now()+172800000).toISOString().split("T")[0]}))}>📅 Follow-up in 2 days</button>
                <button className="qb w" onClick={()=>{setStages(p=>({...p,[sel.id]:"Closed Won"}));setProbs(p=>({...p,[sel.id]:100}))}}>✅ Closed Won</button>
                <button className="qb l" onClick={()=>{setStages(p=>({...p,[sel.id]:"Closed Lost"}));setProbs(p=>({...p,[sel.id]:0}))}}>✕ Mark as Lost</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu&&(
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} msg={ctxMenu.msg}
          onDelete={()=>deleteMsg(ctxMenu.idx)}
          onCopy={()=>copyMsg(ctxMenu.msg.text)}
          onReply={()=>setReplyTo(ctxMenu.msg)}
          onDeleteAll={deleteAllMsgs}
          onSelect={()=>{setSelectMode(true);setSelectedMsgs(new Set([ctxMenu.idx]))}}
          onClose={()=>setCtxMenu(null)}
        />
      )}
    </div>
  </>)
}
