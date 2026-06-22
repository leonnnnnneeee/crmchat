// v-edit2-083448
// v035029
import { useState, useEffect, useRef, useCallback, useMemo } from "react"

const TG = {
  bg:"#120929", panel:"#1a0533", surface:"#1e0a3c", elevated:"#2d1155",
  border:"#0d0618", blue:"#7c3aed", blueHover:"#6d2ed5", blueDim:"rgba(124,58,237,.15)", blueLight:"#5288c1",
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
const linkCache = {}
let _authToken = ''

function Avatar({name, chatId, username, size=40}) {
  const colors=["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const colorIdx = (name||"?").charCodeAt(0) % colors.length
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  const [photoUrl, setPhotoUrl] = useState(photoCache[chatId] || null)
  const [failed, setFailed] = useState(false)

  useEffect(()=>{
    if (!chatId || !_authToken || failed) return
    if (photoCache[chatId]) { setPhotoUrl(photoCache[chatId]); return }
    const qs = username ? `?username=${encodeURIComponent(username)}` : ""
    fetch(`/api/chat/photo/${chatId}${qs}`, {headers:{"x-auth-token":_authToken}})
      .then(r => { if (!r.ok) throw new Error("no photo"); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        photoCache[chatId] = url
        setPhotoUrl(url)
      })
      .catch(() => setFailed(true))
  }, [chatId])

  if (photoUrl && !failed) {
    return (
      <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:colors[colorIdx]}}>
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
  return <span style={{background:s.bg,color:s.color,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${s.color}33`,flexShrink:0}}>{stage}</span>
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


// ── Chat List Context Menu ──
function ChatContextMenu({x,y,chat,onClose,
  onPin,onMute,onMarkRead,onMarkUnread,onArchive,onUnarchive,
  onPreview,onSetFolder,onLeave,
  isPinned,isMuted,isArchived,isRead,currentFolder}) {
  const ref    = useRef(null)
  const [showFolderSub,setShowFolderSub] = useState(false)

  useEffect(()=>{
    const h = e => { if(ref.current && !ref.current.contains(e.target)) onClose() }
    const k = e => { if(e.key==='Escape') onClose() }
    document.addEventListener('mousedown',h)
    document.addEventListener('keydown',k)
    return()=>{ document.removeEventListener('mousedown',h); document.removeEventListener('keydown',k) }
  },[onClose])

  const W=230, H=400
  const ax = x+W > window.innerWidth  ? x-W : x
  const ay = y+H > window.innerHeight ? y-H : y

  const Item = ({icon,label,action,danger,sep,right})=> sep
    ? <div style={{height:1,background:'#2d1155',margin:'3px 8px'}}/>
    : <div
        onClick={e=>{e.stopPropagation(); if(action){action(); if(!right) onClose()} }}
        style={{padding:'9px 14px',cursor:'pointer',display:'flex',alignItems:'center',
          gap:10,fontSize:13,color:danger?'#e53935':'#f0e6ff',
          borderRadius:6,margin:'1px 4px',userSelect:'none',position:'relative'}}
        onMouseEnter={e=>e.currentTarget.style.background='#2d1155'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <span style={{fontSize:16,width:20,textAlign:'center',flexShrink:0}}>{icon}</span>
        <span style={{flex:1}}>{label}</span>
        {right&&<span style={{fontSize:11,color:'#6b7280'}}>›</span>}
      </div>

  const FOLDERS = ['All','Clients','Leads','Campaigns','AI Tools','Archived']

  return (
    <div ref={ref} style={{
      position:'fixed',left:ax,top:ay,zIndex:9999,
      background:'#1a0533',border:'1px solid #3d1f6a',borderRadius:12,
      padding:'4px 0',minWidth:230,
      boxShadow:'0 8px 32px rgba(0,0,0,.75)',
    }} onClick={e=>e.stopPropagation()}>

      {/* Chat info header */}
      <div style={{padding:'8px 14px 6px',borderBottom:'1px solid #2d1155',marginBottom:2}}>
        <div style={{fontSize:12,fontWeight:700,color:'#f0e6ff',overflow:'hidden',
          textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {chat?.name||'Chat'}
        </div>
        <div style={{fontSize:11,color:'#6b4d94',marginTop:1}}>
          {chat?.isUser?'Private':chat?.isChannel?'Channel':'Group'}
          {chat?.memberCount?` · ${chat.memberCount} members`:''}
          {currentFolder&&currentFolder!=='All'?` · 📁 ${currentFolder}`:''}
        </div>
      </div>

      <Item icon='🪟' label='Open in new tab'
        action={()=>window.open(`${window.location.origin}${window.location.pathname}?chat=${chat?.id}`,'_blank')}/>
      <Item icon='👁️' label='Preview chat'  action={onPreview}/>
      <Item sep/>
      <Item icon={isPinned?'📌':'📌'} label={isPinned?'Unpin':'Pin to top'} action={onPin}/>
      <Item icon={isMuted?'🔔':'🔕'}  label={isMuted?'Unmute':'Mute'}       action={onMute}/>
      <Item sep/>
      {isRead
        ? <Item icon='✉️' label='Mark as unread' action={onMarkUnread}/>
        : <Item icon='✅' label='Mark as read'   action={onMarkRead}/>
      }
      {isArchived
        ? <Item icon='📤' label='Unarchive'  action={onUnarchive}/>
        : <Item icon='📁' label='Archive'    action={onArchive}/>
      }

      {/* Add to Folder with submenu */}
      <div style={{position:'relative'}}
        onMouseEnter={()=>setShowFolderSub(true)}
        onMouseLeave={()=>setShowFolderSub(false)}>
        <Item icon='🗂️' label='Add to folder' action={()=>setShowFolderSub(p=>!p)} right/>
        {showFolderSub&&(
          <div style={{
            position:'absolute',left:'100%',top:0,
            background:'#1a0533',border:'1px solid #3d1f6a',borderRadius:10,
            padding:'4px 0',minWidth:160,zIndex:10000,
            boxShadow:'0 8px 24px rgba(0,0,0,.7)',
          }}>
            {FOLDERS.map(f=>(
              <div key={f} onClick={e=>{e.stopPropagation();onSetFolder(f);onClose()}}
                style={{padding:'9px 14px',cursor:'pointer',fontSize:13,
                  color:currentFolder===f?'#a78bfa':'#f0e6ff',
                  display:'flex',alignItems:'center',gap:8,
                  borderRadius:6,margin:'1px 4px',
                  background:currentFolder===f?'rgba(124,58,237,.2)':'transparent'}}
                onMouseEnter={e=>e.currentTarget.style.background='#2d1155'}
                onMouseLeave={e=>e.currentTarget.style.background=currentFolder===f?'rgba(124,58,237,.2)':'transparent'}>
                {currentFolder===f&&<span style={{fontSize:10}}>✓</span>}
                {f}
              </div>
            ))}
          </div>
        )}
      </div>

      <Item sep/>
      <Item icon='🚪' label={chat?.isUser?'Delete chat':'Leave group'}
        action={onLeave} danger/>
    </div>
  )
}


// ── Message Context Menu ──
function ContextMenu({x,y,msg,onDelete,onCopy,onReply,onClose,onDeleteAll,onSelect,onForward,onReact,onPin,onInfo,onEdit}) {
  const ref = useRef(null)
  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) onClose() }
    const k = e => { if(e.key==='Escape') onClose() }
    document.addEventListener('mousedown',h)
    document.addEventListener('keydown',k)
    return()=>{ document.removeEventListener('mousedown',h); document.removeEventListener('keydown',k) }
  },[onClose])

  const W=200, H=380
  const ax = x+W>window.innerWidth  ? x-W : x
  const ay = y+H>window.innerHeight ? y-H : y

  const Item=({icon,label,action,danger,sep})=>sep
    ? <div style={{height:1,background:'#2d1155',margin:'3px 8px'}}/>
    : <div onClick={()=>{action?.();onClose()}}
        style={{padding:'9px 14px',cursor:'pointer',display:'flex',alignItems:'center',
          gap:10,fontSize:13,color:danger?'#e53935':'#f0e6ff',borderRadius:6,margin:'1px 4px'}}
        onMouseEnter={e=>e.currentTarget.style.background='#2d1155'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <span style={{fontSize:15,width:20,textAlign:'center'}}>{icon}</span>{label}
      </div>

  return (
    <div ref={ref} style={{
      position:'fixed',left:ax,top:ay,zIndex:9999,
      background:'#1a0533',border:'1px solid #3d1f6a',borderRadius:12,
      padding:'4px 0',minWidth:200,
      boxShadow:'0 8px 32px rgba(0,0,0,.7)',
    }}>
      {/* Quick reactions */}
      <div style={{display:'flex',gap:2,padding:'6px 10px',borderBottom:'1px solid #2d1155',flexWrap:'wrap'}}>
        {['👍','❤️','😂','🔥','💪','✅','🙏','😎'].map(e=>(
          <span key={e} onClick={()=>{onReact?.(e);onClose()}}
            style={{fontSize:18,cursor:'pointer',padding:'2px 5px',borderRadius:6,transition:'background .1s'}}
            onMouseEnter={ev=>ev.target.style.background='#2d1155'}
            onMouseLeave={ev=>ev.target.style.background='transparent'}>
            {e}
          </span>
        ))}
      </div>
      <Item icon='↩️' label='Reply'          action={onReply}/>
      <Item icon='📋' label='Copy text'      action={onCopy}/>
      <Item icon='↪️' label='Forward'        action={onForward}/>
      {msg?.fromMe && <Item icon='✏️' label='Edit message'  action={onEdit}/>}
      <Item icon='📌' label='Pin message'    action={onPin}/>
      <Item icon='ℹ️' label='Message info'   action={onInfo}/>
      <Item sep/>
      <Item icon='☑️' label='Select'         action={onSelect}/>
      {msg?.fromMe && <Item icon='🗑️' label='Delete'   action={onDelete} danger/>}
      {msg?.fromMe && <Item icon='🗑️' label='Delete all' action={onDeleteAll} danger/>}
    </div>
  )
}



// ── AI Suggest Panel ──
function AISuggestPanel({text,analysis,alternative,messages,loading,onUse,onUseAlt,onUseAll,onRegenerate,onClose,hasResearch}) {
  const [editIdx,setEditIdx] = useState(null)
  const [edited,setEdited]   = useState({})

  if(!text && !loading) return null

  const msgs = (messages && messages.length > 0) ? messages : [
    ...(text ? [{text}] : []),
    ...(alternative ? [{text:alternative}] : [])
  ]
  const getMsg = i => edited[i] !== undefined ? edited[i] : (msgs[i]?.text || '')

  return (
    <div style={{margin:"0 16px 8px",background:"rgba(124,58,237,.08)",
      border:"1px solid rgba(124,58,237,.25)",borderRadius:12,overflow:"hidden",flexShrink:0}}>
      {/* Header */}
      <div style={{padding:"6px 12px",background:"rgba(124,58,237,.12)",
        display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid rgba(124,58,237,.15)"}}>
        <span style={{fontSize:13}}>✨</span>
        <span style={{fontSize:12,fontWeight:700,color:"#c4a8e8"}}>AI Reply</span>
        {hasResearch&&<span style={{fontSize:10,background:"#3d1f6a",color:"#a78bfa",
          padding:"1px 7px",borderRadius:20,fontWeight:600}}>🔍 Project research</span>}
        {analysis&&<span style={{fontSize:11,color:"#7c6a9a",flex:1,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{analysis}</span>}
        <button onClick={onClose}
          style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,flexShrink:0}}>✕</button>
      </div>

      {loading ? (
        <div style={{padding:"12px 14px",display:"flex",gap:8,alignItems:"center",color:"#9b7ec8",fontSize:13}}>
          <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span>
          Analyzing{hasResearch?' & researching project':''}...
        </div>
      ) : (
        <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
          {msgs.map((msg,i) => (
            <div key={i} style={{background:"rgba(124,58,237,.1)",borderRadius:10,
              border:"1px solid rgba(124,58,237,.2)",overflow:"hidden"}}>
              <div style={{padding:"3px 10px 0",display:"flex",alignItems:"center",
                justifyContent:"space-between"}}>
                <span style={{fontSize:10,color:"#7c3aed",fontWeight:700,letterSpacing:.5}}>
                  MSG {i+1}
                </span>
                <button onClick={()=>setEditIdx(editIdx===i?null:i)}
                  style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:11}}>
                  {editIdx===i?'done':'edit'}
                </button>
              </div>
              {editIdx===i ? (
                <textarea value={getMsg(i)}
                  onChange={e=>setEdited(p=>({...p,[i]:e.target.value}))}
                  style={{width:"100%",background:"transparent",border:"none",
                    padding:"4px 10px 8px",color:"#f0e6ff",fontSize:13,
                    lineHeight:1.5,resize:"none",outline:"none",
                    fontFamily:"inherit",boxSizing:"border-box",minHeight:60}}
                  autoFocus/>
              ) : (
                <div style={{padding:"4px 10px 8px",fontSize:13,color:"#f0e6ff",
                  lineHeight:1.5,whiteSpace:"pre-wrap"}}>{getMsg(i)}</div>
              )}
              <div style={{padding:"0 8px 6px",display:"flex",gap:6}}>
                <button onClick={()=>onUse(getMsg(i))}
                  style={{flex:1,padding:"5px",background:"#7c3aed",color:"#fff",
                    border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:600}}>
                  Use ↑
                </button>
                <button onClick={()=>navigator.clipboard?.writeText(getMsg(i))}
                  style={{padding:"5px 10px",background:"transparent",color:"#9b7ec8",
                    border:"1px solid rgba(124,58,237,.3)",borderRadius:7,cursor:"pointer",fontSize:12}}>
                  Copy
                </button>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:6,marginTop:2}}>
            {msgs.length>1&&onUseAll&&(
              <button onClick={()=>onUseAll(msgs.map((_,i)=>getMsg(i)))}
                style={{flex:1,padding:"6px",background:"rgba(124,58,237,.2)",color:"#c4a8e8",
                  border:"1px solid rgba(124,58,237,.35)",borderRadius:8,cursor:"pointer",
                  fontSize:12,fontWeight:600}}>
                📨 Send all in sequence
              </button>
            )}
            <button onClick={onRegenerate}
              style={{padding:"6px 12px",background:"transparent",color:"#6b7280",
                border:"1px solid #374151",borderRadius:8,cursor:"pointer",fontSize:11}}>
              ↻ Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Link Preview ──
function LinkPreview({url}) {
  const [meta,setMeta] = useState(null)
  const [failed,setFailed] = useState(false)
  useEffect(()=>{
    if(meta||failed||!url) return
    if(linkCache[url]) { setMeta(linkCache[url]); return }
    fetch('https://api.allorigins.win/get?url='+encodeURIComponent(url))
      .then(r=>r.json())
      .then(d=>{
        const h = d.contents||''
        const title = h.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/)?.[1]
                   || h.match(/<title>([^<]+)<\/title>/)?.[1] || ''
        const desc  = h.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/)?.[1] || ''
        const img   = h.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1] || ''
        const domain = (() => { try { return new URL(url).hostname.replace('www.','') } catch { return url } })()
        const result = {title,desc,img,domain}
        linkCache[url] = result
        setMeta(result)
      })
      .catch(()=>setFailed(true))
  },[url])
  if(!meta||failed) return null
  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{display:"block",textDecoration:"none",marginTop:6}}>
      <div style={{background:"rgba(0,0,0,.2)",borderRadius:8,overflow:"hidden",
        border:"1px solid rgba(255,255,255,.08)"}}>
        {meta.img&&<img src={meta.img} alt="" style={{width:"100%",maxHeight:120,objectFit:"cover",display:"block"}}
          onError={e=>e.target.style.display="none"}/>}
        <div style={{padding:"6px 10px"}}>
          <div style={{fontSize:11,color:"#a78bfa",marginBottom:2}}>{meta.domain}</div>
          {meta.title&&<div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:2,lineHeight:1.3}}>{meta.title.slice(0,80)}</div>}
          {meta.desc&&<div style={{fontSize:12,color:"rgba(255,255,255,.6)",lineHeight:1.4}}>{meta.desc.slice(0,100)}</div>}
        </div>
      </div>
    </a>
  )
}

// ── ChatPhoto — lazy load with fetch & blob ──
const blobCache = new Map()

function ChatPhoto({msg, chatId, authToken, onImageClick}) {
  const msgId = msg.id
  const [retryCnt, setRetryCnt] = useState(0)
  const [status, setStatus] = useState(blobCache.has(msgId) ? 'loaded' : 'loading')
  const [imgSrc, setImgSrc] = useState(msg.photoUrl || msg.mediaUrl || blobCache.get(msgId) || '')

  useEffect(() => {
    if (imgSrc && status === 'loaded') return
    
    let isMounted = true
    let objectUrl = ''

    const fetchMedia = async () => {
      setStatus('loading')
      try {
        const url = `/api/chat/media/${chatId}/${msgId}?t=${authToken}&r=${retryCnt}`
        console.log(`[ChatPhoto] Fetching media for msgId=${msgId}, url=${url}`)
        const res = await fetch(url)
        
        if (!isMounted) return
        
        if (!res.ok) {
          console.error(`[ChatPhoto] Failed to fetch msgId=${msgId}, status=${res.status} ${res.statusText}`)
          setStatus('error')
          return
        }

        const blob = await res.blob()
        if (blob.size === 0) {
          console.error(`[ChatPhoto] Empty blob returned for msgId=${msgId}`)
          setStatus('error')
          return
        }
        
        objectUrl = URL.createObjectURL(blob)
        blobCache.set(msgId, objectUrl)
        
        if (isMounted) {
          setImgSrc(objectUrl)
          setStatus('loaded')
          console.log(`[ChatPhoto] Successfully loaded media for msgId=${msgId}, blob size=${blob.size}`)
        }
      } catch (err) {
        if (isMounted) {
          console.error(`[ChatPhoto] Network/CORS error for msgId=${msgId}:`, err)
          setStatus('error')
        }
      }
    }

    fetchMedia()

    return () => {
      isMounted = false
    }
  }, [msgId, chatId, authToken, retryCnt])

  return (
    <div style={{position:'relative',marginBottom:4,minHeight:status==='loaded'?0:80,background:status==='loading'?'rgba(124,58,237,.1)':'transparent',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',maxWidth:520}}>
      {status==='loading' && (
        <div style={{position:'absolute',color:'#7c3aed',fontSize:20,zIndex:1}}>⏳</div>
      )}
      {status==='loaded' && imgSrc && (
        <img
          src={imgSrc}
          alt="photo"
          style={{maxWidth:'100%',maxHeight:320,borderRadius:8,display:'block',cursor:'pointer',objectFit:'contain'}}
          onClick={()=>onImageClick && onImageClick(imgSrc)}
          loading="lazy"
        />
      )}
      {status==='error' && (
        <div style={{padding:'8px 12px',color:'#9b7ec8',fontSize:12,cursor:'pointer',textAlign:'center',background:'rgba(124,58,237,.1)',borderRadius:8,width:'100%'}} 
             onClick={()=>setRetryCnt(c=>c+1)}>
          📷 Tap to retry
        </div>
      )}
    </div>
  )
}

function SharedMediaModal({ type, msgs, data, onClose, token, setLightbox }) {
  const isSelfProfile = data?.id?.toString() === data?.chatId?.toString();

  const filtered = useMemo(() => {
    if (!msgs || !Array.isArray(msgs)) return [];
    return msgs.filter(m => {
      if (!isSelfProfile && m.senderId && m.senderId.toString() !== data?.id?.toString()) return false;
      if (type === 'photos' && m.isPhoto) return true;
      if (type === 'videos' && m.isVideo) return true;
      if (type === 'files' && m.isDoc) return true;
      if (type === 'links' && m.text && /(https?:\/\/[^\s]+)/.test(m.text)) return true;
      return false;
    });
  }, [msgs, type, isSelfProfile, data?.id]);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:10000,display:'flex',flexDirection:'column'}}
         onClick={(e) => { if(e.target===e.currentTarget) onClose() }}>
      
      {/* Header */}
      <div style={{background:'#1a103c',padding:'16px 24px',display:'flex',alignItems:'center',gap:16,borderBottom:'1px solid rgba(124,58,237,.3)'}}>
        <button onClick={onClose} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:24}}>←</button>
        <div style={{fontSize:18,fontWeight:600,color:'#fff',textTransform:'capitalize'}}>Shared {type}</div>
        <div style={{marginLeft:'auto',color:'#9b7ec8',fontSize:14}}>{filtered.length} items</div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflowY:'auto',padding:24,display:type==='photos'||type==='videos'?'grid':'flex',flexDirection:'column',gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))',gap:8}}>
        {filtered.length === 0 && (
          <div style={{color:'#9b7ec8',textAlign:'center',marginTop:40}}>No {type} found.</div>
        )}
        
        {filtered.map(m => {
          if (type === 'photos') {
            return <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',cursor:'pointer'}}>
              <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={(src)=>setLightbox(src)}/>
            </div>
          }
          if (type === 'videos') {
            return <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
              <video style={{width:'100%',height:'100%',objectFit:'cover'}} src={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`}/>
              <div style={{position:'absolute',fontSize:24,color:'white',pointerEvents:'none'}}>▶</div>
            </div>
          }
          if (type === 'files') {
            return <div key={m.id} style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
              <div style={{fontSize:24}}>📄</div>
              <div style={{flex:1}}>
                <div style={{color:'#fff',fontSize:14,fontWeight:600}}>Document</div>
                <div style={{color:'#9b7ec8',fontSize:12}}>{new Date(m.date*1000).toLocaleString()}</div>
              </div>
              <a href={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`} download target="_blank" style={{color:'#7c3aed',textDecoration:'none',fontSize:14}}>Download</a>
            </div>
          }
          if (type === 'links') {
            const matches = m.text.match(/(https?:\/\/[^\s]+)/g) || []
            return matches.map((link, idx) => (
              <a key={`${m.id}-${idx}`} href={link} target="_blank" rel="noreferrer" style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12,textDecoration:'none',cursor:'pointer'}}>
                <div style={{fontSize:24}}>🔗</div>
                <div style={{flex:1,overflow:'hidden'}}>
                  <div style={{color:'#fff',fontSize:14,fontWeight:600,textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{link}</div>
                  <div style={{color:'#9b7ec8',fontSize:12}}>{new Date(m.date*1000).toLocaleString()}</div>
                </div>
              </a>
            ))
          }
          return null
        })}
      </div>
    </div>
  )
}

function UserProfileModal({ data, onClose, token, chats, setSel, inputRef, msgs, onOpenMedia }) {
  const [status, setStatus] = useState(null)
  const [showMore, setShowMore] = useState(false)
  
  const isGroupProfile = data?.isGroup;
  
  const counts = useMemo(() => {
    let photos = 0, videos = 0, files = 0, links = 0, gifs = 0;
    console.log("CALC MEDIA", { msgsLength: msgs?.length, isGroupProfile, data, sampleMsg: msgs?.[0] });
    if (msgs && Array.isArray(msgs)) {
      msgs.forEach(m => {
        // In a DM, or when viewing a Group's profile, we count everything in the chat
        const isSelfProfile = data?.id?.toString() === data?.chatId?.toString();
        // If viewing a user's profile from inside a group, filter by their messages
        if (!isSelfProfile && m.senderId && m.senderId.toString() !== data?.id?.toString()) return;

        if (m.isPhoto) photos++;
        if (m.isVideo) videos++;
        if (m.isDoc) files++;
        if (m.text && /(https?:\/\/[^\s]+)/.test(m.text)) links++;
      })
    }
    return { photos, videos, files, links, gifs, groups: 0 };
  }, [msgs, data?.id, data?.chatId]);

  useEffect(() => {
    if (!data?.id) return
    let isMounted = true
    fetch(`/api/chat/status/${data.id}`, { headers: {'x-auth-token': token} })
      .then(r => r.json())
      .then(d => { if(isMounted) setStatus(d.status) })
      .catch(e => { if(isMounted) setStatus('User info not available') })
    return () => { isMounted = false }
  }, [data?.id, token])

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!data) return null

  const handleMessage = () => {
    const existing = chats.find(c => c.isUser && c.id === data.id)
    if (existing) {
      setSel(existing)
      onClose()
      setTimeout(() => inputRef?.current?.focus(), 100)
    } else {
      alert('Cannot open DM, user info missing / backend API pending')
      // TODO: Call backend to create/resolve DM by ID when API is added
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}
         onClick={(e) => { if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'#1a103c',width:380,borderRadius:12,overflow:'hidden',boxShadow:'0 10px 40px rgba(0,0,0,.5)',border:'1px solid rgba(124,58,237,.3)',color:'#fff'}}>
        
        {/* Header (Telegram-like solid block or gradient) */}
        <div style={{position:'relative', padding:'24px 24px 16px', background:'linear-gradient(180deg, rgba(124,58,237,.2) 0%, #1a103c 100%)', display:'flex', flexDirection:'column', alignItems:'center'}}>
          <div style={{position:'absolute', top:12, right:12}}>
            <button onClick={onClose} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:24}}>&times;</button>
          </div>
          <Avatar name={data.name||'User'} chatId={data.id} username={data.username} size={90}/>
          <div style={{fontSize:22,fontWeight:700,marginTop:12,textAlign:'center'}}>{data.name||'Unknown User'}</div>
          <div style={{fontSize:14,color:status==='online'?'#4caf50':'#9b7ec8',marginTop:4}}>
            {status ? status : 'Loading status...'}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div style={{display:'flex', justifyContent:'space-around', padding:'12px 24px', borderBottom:'1px solid rgba(124,58,237,.2)'}}>
          <div onClick={handleMessage} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#e0d4f5', gap:4}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>💬</div>
            <span style={{fontSize:12}}>Message</span>
          </div>
          <div onClick={()=>alert('Mute feature coming soon')} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#e0d4f5', gap:4}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔕</div>
            <span style={{fontSize:12}}>Mute</span>
          </div>
          <div onClick={()=>alert('Call feature coming soon')} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#e0d4f5', gap:4}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>📞</div>
            <span style={{fontSize:12}}>Call</span>
          </div>
          <div style={{position:'relative'}}>
            <div onClick={()=>setShowMore(!showMore)} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#e0d4f5', gap:4}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⋯</div>
              <span style={{fontSize:12}}>More</span>
            </div>
            {showMore && (
              <div style={{position:'absolute',top:'100%',right:0,marginTop:8,background:'#2a1b54',borderRadius:8,padding:8,minWidth:160,boxShadow:'0 4px 12px rgba(0,0,0,.5)',zIndex:10}}>
                <div onClick={()=>{navigator.clipboard.writeText(data.id);setShowMore(false);alert('ID Copied')}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy User ID</div>
                {data.username && <div onClick={()=>{navigator.clipboard.writeText('@'+data.username);setShowMore(false);alert('Username Copied')}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy Username</div>}
                <div onClick={()=>{alert('Add to contacts pending');setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Add to Contacts</div>
                <div onClick={()=>{alert('CRM Note feature pending');setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Add CRM Note</div>
              </div>
            )}
          </div>
        </div>

        {/* Info Body */}
        <div style={{padding:'16px 24px 24px', display:'flex', flexDirection:'column', gap:16}}>
          {data.phone && (
            <div>
              <div style={{fontSize:16, color:'#fff'}}>{data.phone}</div>
              <div style={{fontSize:13, color:'#9b7ec8'}}>Phone</div>
            </div>
          )}
          {data.username && (
            <div>
              <div style={{fontSize:16, color:'#fff'}}>@{data.username}</div>
              <div style={{fontSize:13, color:'#9b7ec8'}}>Username</div>
            </div>
          )}
          {(data.bio || data.about) && (
            <div>
              <div style={{fontSize:15, color:'#fff', lineHeight:1.4}}>{data.bio || data.about}</div>
              <div style={{fontSize:13, color:'#9b7ec8'}}>Bio</div>
            </div>
          )}
          
          {/* Separator */}
          <div style={{height: 8, background: '#0d0618', width: 'calc(100% + 48px)', margin: '16px -24px 8px'}} />
          
          {/* Shared Media */}
          <div style={{width: 'calc(100% + 48px)', margin: '0 -24px', paddingBottom: 8}}>
            {counts.photos > 0 && (
              <div onClick={()=>onOpenMedia('photos')} style={{display:'flex', alignItems:'center', padding:'12px 24px', cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg style={{width:24, height:24, fill:'none', stroke:'#9b7ec8', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', marginRight:24}} viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span style={{fontSize:15, color:'#e0d4f5'}}>{counts.photos} photo{counts.photos!==1?'s':''}</span>
              </div>
            )}
            {counts.videos > 0 && (
              <div onClick={()=>onOpenMedia('videos')} style={{display:'flex', alignItems:'center', padding:'12px 24px', cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg style={{width:24, height:24, fill:'none', stroke:'#9b7ec8', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', marginRight:24}} viewBox="0 0 24 24">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <span style={{fontSize:15, color:'#e0d4f5'}}>{counts.videos} video{counts.videos!==1?'s':''}</span>
              </div>
            )}
            {counts.files > 0 && (
              <div onClick={()=>onOpenMedia('files')} style={{display:'flex', alignItems:'center', padding:'12px 24px', cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg style={{width:24, height:24, fill:'none', stroke:'#9b7ec8', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', marginRight:24}} viewBox="0 0 24 24">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
                <span style={{fontSize:15, color:'#e0d4f5'}}>{counts.files} file{counts.files!==1?'s':''}</span>
              </div>
            )}
            {counts.links > 0 && (
              <div onClick={()=>onOpenMedia('links')} style={{display:'flex', alignItems:'center', padding:'12px 24px', cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg style={{width:24, height:24, fill:'none', stroke:'#9b7ec8', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', marginRight:24}} viewBox="0 0 24 24">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <span style={{fontSize:15, color:'#e0d4f5'}}>{counts.links} shared link{counts.links!==1?'s':''}</span>
              </div>
            )}
            {!isGroupProfile && (
              <div onClick={()=>alert('TODO: Open Groups List')} style={{display:'flex', alignItems:'center', padding:'12px 24px', cursor:'pointer', opacity:0.5}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg style={{width:24, height:24, fill:'none', stroke:'#9b7ec8', strokeWidth:1.5, strokeLinecap:'round', strokeLinejoin:'round', marginRight:24}} viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span style={{fontSize:15, color:'#e0d4f5'}}>groups in common</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;

function renderMessageText(text, searchStr) {
  if (!text) return '';
  
  const parts = [];
  let lastIndex = 0;
  
  text.replace(URL_REGEX, (match, p1, offset) => {
    let url = match;
    let trailing = '';
    while (/[.,?!;'"]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    
    const isEmail = text.slice(0, offset).match(/\S+@$/);
    if (isEmail) return match; 
    
    if (offset > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, offset) });
    }
    
    let href = url;
    if (!href.match(/^https?:\/\//i)) {
      href = 'https://' + href;
    }
    
    parts.push({ type: 'link', content: url, href });
    
    if (trailing) {
      parts.push({ type: 'text', content: trailing });
    }
    
    lastIndex = offset + match.length;
    return match;
  });
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  const renderPart = (part, idx) => {
    if (part.type === 'link') {
      return (
        <a key={idx} href={part.href} target="_blank" rel="noopener noreferrer" 
           onClick={e => e.stopPropagation()}
           className="msg-link">
          {part.content}
        </a>
      );
    }
    
    if (searchStr && part.content.toLowerCase().includes(searchStr.toLowerCase())) {
      const searchParts = part.content.split(new RegExp(`(${searchStr})`, 'gi'));
      return (
        <span key={idx}>
          {searchParts.map((sp, i) => 
            sp.toLowerCase() === searchStr.toLowerCase() 
              ? <mark key={i} style={{background:"#f59e0b",color:"#000",borderRadius:2}}>{sp}</mark> 
              : sp
          )}
        </span>
      );
    }
    
    return <span key={idx}>{part.content}</span>;
  };
  
  return parts.map(renderPart);
}

export default function CRMChat({token}) {
  _authToken = token
  const [theme,setTheme]=useState(()=>localStorage.getItem('crm_theme')||'dark')
  useEffect(()=>{
    document.body.style.background=theme==='light'?'#fff':''
    document.body.style.colorScheme=theme
  },[theme])
  const TGlight = {bg:'#fff',panel:'#f0f0f0',surface:'#e8e8e8',elevated:'#ddd',
    border:'#ccc',text:'#000',textSec:'#444',textMuted:'#888',
    blue:'#2196f3',green:'#4caf50',red:'#f44336',
    msgOut:'#dcf8c6',msgIn:'#fff',accentPurple:'#7c3aed'}
  useEffect(()=>{
    document.body.style.background = theme==='light'?'#f5f5f5':'#120929'
    document.body.style.color = theme==='light'?'#000':'#f0e6ff'
  },[theme])
  const [chats,setChats]=useState([])
  const [sel,setSel]=useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_sel')) || null } catch { return null }
  })
  const [folder,setFolder]=useState(() => localStorage.getItem('crm_folder') || 'all')
  const [topics,setTopics]=useState({})
  const [selTopic,setSelTopic]=useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_selTopic')) || null } catch { return null }
  })
  const [loadingTopics,setLoadingTopics]=useState(false)
  const [topicSearch,setTopicSearch]=useState("")
  const [topicCtxMenu,setTopicCtxMenu]=useState(null)
  const [msgs,setMsgs]=useState([])
  const [search,setSearch]=useState(() => localStorage.getItem('crm_search') || '')

  useEffect(() => {
    if (sel) localStorage.setItem('crm_sel', JSON.stringify(sel))
    else localStorage.removeItem('crm_sel')
  }, [sel])

  useEffect(() => {
    if (selTopic) localStorage.setItem('crm_selTopic', JSON.stringify(selTopic))
    else localStorage.removeItem('crm_selTopic')
  }, [selTopic])

  useEffect(() => {
    localStorage.setItem('crm_folder', folder)
  }, [folder])

  useEffect(() => {
    localStorage.setItem('crm_search', search)
  }, [search])
  const [input,setInput]=useState("")
  const inputRef = useRef(null)
  const leftColScrollRef = useRef(null)
  const hasRestoredSidebarScroll = useRef(false)
  const [sending,setSending]=useState(false)
  const [loadChats,setLoadChats]=useState(true)
  const [loadMsgs,setLoadMsgs]=useState(false)
  const [loadingMore,setLoadingMore]=useState(false)
  const [hasMoreChats,setHasMoreChats]=useState(true)
  const [hasMore,setHasMore]=useState(true)
  const [onlineStatus,setOnlineStatus]=useState('')

  // Fetch online status
  useEffect(() => {
    if (!sel || sel.isGroup || sel.isChannel) {
      setOnlineStatus('')
      return
    }
    
    let isMounted = true
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/chat/status/${sel.id}`, {headers:{"x-auth-token":token}})
        const data = await res.json()
        if (isMounted && data.status) {
          setOnlineStatus(data.status)
        }
      } catch (e) {
        console.error("status fetch error:", e)
      }
    }
    
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [sel?.id, token])
  const [typing,setTyping]=useState(false)
  const [showScrollBtn,setShowScrollBtn]=useState(false)
  const firstUnreadRef=useRef(null)
  const [readChats,setReadChats]=useState(new Set())
  const [chatFolders,setChatFolders]=useState({})   // {chatId: folderName}
  const [confirmLeave,setConfirmLeave]=useState(null) // chat to confirm leave
  const [previewChat,setPreviewChat]=useState(null)   // chat preview modal // chatIds marked as read this session
  const [showMembers,setShowMembers]=useState(false)
  const [memberSearch,setMemberSearch]=useState("")
  const [notifPerm,setNotifPerm]=useState(false)
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
  const [tags,setTags]=useState({})
  const [leadSource,setLeadSource]=useState({})
  const [probs,setProbs]=useState({})
  const [deals,setDeals]=useState({})
  const [fups,setFups]=useState({})
  const [notes,setNotes]=useState({})
  const [noteInp,setNoteInp]=useState("")
  const [addNote,setAddNote]=useState(false)
  const [ctxMenu,setCtxMenu]=useState(null)
  const [chatCtxMenu,setChatCtxMenu]=useState(null)

  const [pinnedChats,setPinnedChats]=useState(new Set())
  const [mutedChats,setMutedChats]=useState(new Set())
  const [archivedChats,setArchivedChats]=useState(new Set())
  const [selectedMsgs,setSelectedMsgs]=useState(new Set())
  const [selectMode,setSelectMode]=useState(false)
  const [editingMsg,setEditingMsg]=useState(null)
  const [editedMsgs,setEditedMsgs]=useState({})
  const [forwardMsg,setForwardMsg]=useState(null)
  const [reactions,setReactions]=useState({})
  const [chatSearch,setChatSearch]=useState('')
  const [chatSearchOpen,setChatSearchOpen]=useState(false)
  const [globalSearch,setGlobalSearch]=useState('')
  const [globalSearchOpen,setGlobalSearchOpen]=useState(false)
  const [lightbox,setLightbox]=useState(null)
  const [gifOpen,setGifOpen]=useState(false)
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [gifs,setGifs]=useState([])
  const [gifQuery,setGifQuery]=useState('')
  const [pinnedMsgs,setPinnedMsgs]=useState({})
  const [scheduleOpen,setScheduleOpen]=useState(false)
  const [scheduleTime,setScheduleTime]=useState('')
  const [scheduledMsgs,setScheduledMsgs]=useState([])
  const [pollOpen,setPollOpen]=useState(false)
  const [pollQuestion,setPollQuestion]=useState('')
  const [pollOptions,setPollOptions]=useState(['',''])
  const [msgInfoOpen,setMsgInfoOpen]=useState(null)
  const [profilePreview,setProfilePreview]=useState(null)
  const [sharedMediaView,setSharedMediaView]=useState(null)
  const [recording,setRecording]=useState(false)
  const [recordSecs,setRecordSecs]=useState(0)
  const mediaRecRef=useRef(null)
  const recordTimerRef=useRef(null) // {x,y,msg,idx}
  const [replyTo,setReplyTo]=useState(null)
  const endRef=useRef(null)

  const loadingChatsRef = useRef(false)
  const chatsRef = useRef([])
  useEffect(() => { chatsRef.current = chats }, [chats])

  // Load chats
  const fetchChats = useCallback(async (append=false) => {
    if (loadingChatsRef.current) return
    loadingChatsRef.current = true
    if (!append) setLoadChats(true)
    
    try {
      let url = "/api/chat/list?limit=50"
      if (append && chatsRef.current.length > 0) {
        const lastChat = chatsRef.current[chatsRef.current.length - 1]
        if (lastChat && lastChat.date) {
           url += "&offsetDate=" + lastChat.date
        }
      }
      const r = await fetch(url,{headers:{"x-auth-token":token}})
      const d = await r.json()
      if (Array.isArray(d)) {
        if (d.length < 50) setHasMoreChats(false)
        else if (!append) setHasMoreChats(true)
        
        setChats(prev => {
          if (append) {
             const newChats = d.filter(c1 => !prev.some(c2 => c2.id === c1.id))
             return [...prev, ...newChats]
          }
          return d
        })
        
        setSel(prevSel => {
           if (!prevSel && !append && d.length > 0) return d[0]
           return prevSel
        })
      }
    } catch(e) { console.error("chats:",e) }
    
    if (!append) setLoadChats(false)
    loadingChatsRef.current = false
  }, [token])

  useEffect(()=>{ fetchChats() }, [fetchChats])

  // Load messages when chat selected
  const prevSelId = useRef(sel?.id || null)
  const hasRestoredScroll = useRef(false)
  const isNearBottom = useRef(true)
  const scrollPositions = useRef(JSON.parse(localStorage.getItem('crm_scroll_positions') || '{}'))
  const saveScrollTimeout = useRef(null)

  useEffect(() => {
    if (chats.length > 0 && !hasRestoredSidebarScroll.current && leftColScrollRef.current) {
      hasRestoredSidebarScroll.current = true
      const savedScroll = localStorage.getItem('crm_leftCol_scroll')
      if (savedScroll) {
        leftColScrollRef.current.scrollTop = parseInt(savedScroll, 10)
      }
    }
  }, [chats])

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 150
    if (sel?.id) {
      scrollPositions.current[sel.id] = scrollTop
      clearTimeout(saveScrollTimeout.current)
      saveScrollTimeout.current = setTimeout(() => {
        localStorage.setItem('crm_scroll_positions', JSON.stringify(scrollPositions.current))
      }, 300)
    }
    // Mark as read if user has scrolled past the unread separator or reached bottom
    if (sel?.unread > 0 && !readChats.has(sel.id)) {
      if (isNearBottom.current) {
        setReadChats(p => new Set([...p, sel.id]))
        setChats(p => p.map(c => c.id===sel.id ? {...c, unread:0} : c))
      }
    }
  }

  useEffect(()=>{
    if(sel && sel.isForum && selTopic) {
      setMsgs([]); setAiText(""); setAiAnalysis(""); setAiAlt(""); setReplyTo(null)
      hasRestoredScroll.current = false
      loadMessages(sel, selTopic.id)
    }
  },[selTopic, token])

  useEffect(()=>{
    if(!sel) return
    let currentTopic = selTopic
    if (prevSelId.current !== sel.id) {
       currentTopic = null
       setSelTopic(null)
       prevSelId.current = sel.id
    }

    setMsgs([]); setAiText(""); setAiAnalysis(""); setAiAlt(""); setReplyTo(null)
    hasRestoredScroll.current = false
    
    if (sel.isForum && !currentTopic) {
      setLoadingTopics(true)
      fetch(`/api/chat/topics/${sel.id}`, { headers: {"x-auth-token": token} })
        .then(r=>r.json())
        .then(d=>{
          const tList = Array.isArray(d) ? d : []
          setTopics(p=>({...p, [sel.id]: tList}))
          setLoadingTopics(false)
        })
        .catch(e=>{ setLoadingTopics(false) })
      return
    }

    loadMessages(sel, currentTopic?.id || null)
  },[sel, selTopic, token])


  useEffect(()=>{
    if(!msgs.length) return
    if(!hasRestoredScroll.current) {
      hasRestoredScroll.current = true
      if(firstUnreadRef.current && sel?.unread > 0) {
        firstUnreadRef.current.scrollIntoView({behavior:"auto", block:"center"})
      } else {
        const savedScroll = scrollPositions.current[sel?.id]
        if (savedScroll !== undefined) {
          const container = document.querySelector('.msgs')
          if (container) container.scrollTop = savedScroll
        } else {
          endRef.current?.scrollIntoView({behavior:"auto"})
        }
      }
    } else if(!loadingMore && isNearBottom.current) {
      endRef.current?.scrollIntoView({behavior:"smooth"})
    }
  },[msgs, loadingMore, sel?.unread, sel?.id])

  useEffect(()=>{
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 250) + 'px'
      if (isNearBottom.current) {
        endRef.current?.scrollIntoView({behavior:"auto"})
      }
    }
  }, [input, editingMsg])

  // Send message — send then reload (no polling = no duplicates)
  const loadingRef = useRef(false)
  const loadingMoreRef = useRef(false)
  async function loadMessages(chat, topicId=null, append=false) {
    if(!chat) return
    if(!append && loadingRef.current) return
    if(append && loadingMoreRef.current) return
    
    if(append) {
      loadingMoreRef.current = true
      setLoadingMore(true)
    } else {
      loadingRef.current = true
      setLoadMsgs(true)
      setHasMore(true)
    }
    
    try {
      let url, qs = chat.username ? '?username='+encodeURIComponent(chat.username) : ''
      
      let maxId = 0
      if(append && msgsRef.current.length > 0) {
        const validMsgs = msgsRef.current.filter(m => m.id > 0)
        if(validMsgs.length > 0) maxId = validMsgs[0].id
        if(maxId > 0) qs += (qs ? '&' : '?') + 'maxId=' + maxId
      }

      if(topicId) {
        url = '/api/chat/topics/'+chat.id+'/'+topicId+'/messages'+qs
      } else {
        url = '/api/chat/messages/'+chat.id+qs
      }
      const r = await fetch(url, {headers:{"x-auth-token":token}})
      const d = await r.json()
      if(Array.isArray(d)) {
        if(d.length < 40) setHasMore(false)
        else if(!append) setHasMore(true)

        setMsgs(prev => {
          if(append) {
            const newMsgs = d.filter(m1 => !prev.some(m2 => m2.id === m1.id))
            return [...newMsgs, ...prev]
          } else {
            const stillPending = prev.filter(m => m.pending && m.id < 0 && !d.some(s=>s.text===m.text&&s.fromMe))
            return [...d, ...stillPending]
          }
        })
      }
    } catch(e) { console.error("loadMsgs:",e) }
    
    if(append) {
      loadingMoreRef.current = false
      setLoadingMore(false)
    } else {
      loadingRef.current = false
      setLoadMsgs(false)
    }
  }

  const sendingRef = useRef(false)
  async function send(){
    const text=input.trim(); if(!text||!sel||!text.length) return
    // Handle edit mode — call Telegram API
    if(editingMsg) {
      const origId = editingMsg.id
      // Update locally first (optimistic)
      setEditedMsgs(p=>({...p,[origId]:text}))
      setMsgs(p=>p.map(m=>m.id===origId?{...m,text,edited:true}:m))
      setEditingMsg(null)
      setInput('')
      // Call TG edit API
      try {
        const r = await fetch('/api/chat/edit',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-auth-token':token},
          body:JSON.stringify({chatId:sel.id,msgId:origId,text,username:sel.username||undefined})
        })
        const d = await r.json()
        if(!d.ok) console.error('Edit failed:', d.error)
      } catch(e) { console.error('Edit error:', e) }
      return
    }
    if(sendingRef.current) return
    if (editingMsg) {
      setEditedMsgs(p=>({...p, [editingMsg.id]: text}))
      setInput("")
      setEditingMsg(null)
      try {
        // TODO: Call backend edit API when ready
        // await fetch('/api/chat/edit', { method:"POST", body:JSON.stringify({chatId:sel.id, messageId:editingMsg.id, text}) })
      } catch(e) {}
      return
    }

    // Clear input immediately so user sees it's been captured
    setInput("")
    sendingRef.current = true
    setSending(true); setReplyTo(null)
    // Show message instantly (optimistic)
    const tempMsg = {id: -Date.now(), text, fromMe:true, date:Math.floor(Date.now()/1000), pending:true}
    setMsgs(p=>[...p, tempMsg])
    try {
      if(selTopic) {
        await fetch('/api/chat/topics/'+sel.id+'/'+selTopic.id+'/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({text})
        })
      } else {
        await fetch("/api/chat/send",{
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({chatId:sel.id, text})
        })
      }
      setTimeout(async()=>{
        loadingRef.current = false
        await loadMessages(sel, selTopic?.id || null)
      }, 200)
    } catch(e) {
      setMsgs(p=>p.filter(m=>m.id!==tempMsg.id))
      setInput(text)
    }
    sendingRef.current = false
    setSending(false)
  }

  // AI Summarize
  async function getSummary() {
    if(!sel||!msgs.length) return
    setAiLoading(true); setAiMode('summarize'); setAiText(''); setAiAlt(''); setAiAnalysis('')
    try {
      const r = await fetch('/api/ai/summarize',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-auth-token':token},
        body:JSON.stringify({messages:msgs.slice(-30),contactName:sel.name})
      })
      const d = await r.json()
      setAiText(d.summary||'No summary available')
      setAiAnalysis('📝 Conversation Summary')
    } catch(e) { setAiText('Summary error: '+e.message) }
    setAiLoading(false)
  }

  // AI Extract Lead Info
  async function getExtract() {
    if(!sel||!msgs.length) return
    setAiLoading(true); setAiMode('extract'); setAiText(''); setAiAlt(''); setAiAnalysis('')
    try {
      const r = await fetch('/api/ai/extract',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-auth-token':token},
        body:JSON.stringify({messages:msgs.slice(-40),contactName:sel.name})
      })
      const d = await r.json()
      const info = d.info||{}
      const text = Object.entries(info)
        .filter(([,v])=>v&&v!=='unknown'&&v!=='N/A')
        .map(([k,v])=>`• ${k.replace(/_/g,' ')}: ${Array.isArray(v)?v.join(', '):v}`)
        .join('\n')
      setAiText(text||'No lead info extracted')
      setAiAnalysis('🎯 Lead Intelligence')
    } catch(e) { setAiText('Extract error: '+e.message) }
    setAiLoading(false)
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

  const filtered = chats
    .sort((a,b) => {
      const ap = (a.isPinned || pinnedChats.has(a.id)) ? 1 : 0
      const bp = (b.isPinned || pinnedChats.has(b.id)) ? 1 : 0
      if (ap !== bp) return bp - ap
      return (b.date || 0) - (a.date || 0)
    })
    .filter(c => {
      if(!c.name) return false
      // Archive folder: show only archived
      if(folder === 'archived') return archivedChats.has(c.id)
      // All other folders: hide archived
      if(archivedChats.has(c.id)) return false
      // Folder filters
      if(folder === 'unread')   return (c.unread > 0) && !readChats.has(c.id)
      if(folder === 'groups')   return !!(c.isGroup || c.isChannel)
      if(folder === 'personal') return c.isUser === true
      return true
    })
    .filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
  const cStage=sel?stages[sel.id]||"Contacted":"New"
  const cProb=sel?probs[sel.id]??50:50
  const cDeal=sel?deals[sel.id]??0:0
  const cFup=sel?fups[sel.id]||"":""
  const cNotes=sel?notes[sel.id]||[]:[]
  const tmplCats=["all",...new Set(TEMPLATES.map(t=>t.cat))]


  const STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body { overflow: hidden; }

    /* ── ROOT GRID ── */
    .crm-root {
      display: flex;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      background: #120929;
      font-family: 'Inter', system-ui, sans-serif;
      color: #f0e6ff;
    }

    /* ── SIDEBAR ── */
    .sidebar {
      display: flex; flex-direction: column; align-items: center;
      padding: 8px 0; gap: 4px;
      background: #0d0618;
      overflow: hidden;
      height: 100%;
      width: 56px;
      min-width: 56px;
      flex-shrink: 0;
    }
    .si {
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 18px; color: #6b4d94;
      transition: background .15s; flex-shrink: 0; border: none; background: transparent;
    }
    .si:hover, .si.on { background: #1e0a3c; color: #f0e6ff; }

    /* ── LEFT COL ── */
    .lc {
      display: flex; flex-direction: column;
      height: 100%; max-height: 100%;
      min-height: 0;
      width: 270px;
      min-width: 270px;
      flex-shrink: 0;
      background: #1a0533;
      border-right: 1px solid #0d0618;
    }
    .ci {
      display: flex; gap: 10px; padding: 10px 12px;
      height: 72px;
      cursor: pointer; align-items: center;
      transition: background .1s;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .ci:hover { background: #1e0a3c; }
    .ci.sel  { background: #2d1155; }
    
    .sinp {
      width: 100%;
      background: #120929;
      border: none;
      border-radius: 20px;
      padding: 7px 12px 7px 34px;
      color: #f0e6ff;
      outline: none;
      font-size: 14px;
      box-sizing: border-box;
    }
    .sinp::placeholder { color: #6b4d94; }

    /* ── MIDDLE COL — THE KEY LAYOUT ── */
    .mc {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: #120929;
      position: relative;
    }

    /* ── CHAT HEADER ── */
    .chdr {
      height: 58px; min-height: 58px; flex-shrink: 0;
      display: flex; align-items: center;
      padding: 0 14px; gap: 10px;
      background: #1a0533;
      border-bottom: 1px solid #0d0618;
    }
    .hb {
      width: 34px; height: 34px; flex-shrink: 0;
      background: transparent; border: none; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: #9b7ec8; font-size: 16px; transition: background .1s;
    }
    .hb:hover { background: #2d1155; }

    /* ── MESSAGE LIST ── */
    .msgs {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .msgs::-webkit-scrollbar { width: 4px; }
    .msgs::-webkit-scrollbar-thumb { background: #2d1155; border-radius: 2px; }

    /* ── MESSAGE ROW ── */
    .msg-row {
      display: flex;
      width: 100%;
      margin-bottom: 12px;
    }
    .msg-row.out { justify-content: flex-end; }
    .msg-row.in  { justify-content: flex-start; align-items: flex-end; }
    .msg-row.grouped { margin-bottom: 3px; }

    /* ── AVATAR ── */
    .msg-avatar {
      width: 32px; height: 32px; flex-shrink: 0;
      border-radius: 50%; overflow: hidden;
      align-self: flex-end;
      margin-bottom: 2px;
      margin-right: 10px;
    }
    .msg-avatar-gap { width: 42px; flex-shrink: 0; }

    /* ── MESSAGE CONTENT WRAPPER ── */
    .msg-content {
      display: flex;
      flex-direction: column;
      max-width: min(68%, 520px);
      min-width: 0;
    }
    .msg-row.out .msg-content { align-items: flex-end; }
    .msg-row.in .msg-content { align-items: flex-start; }

    /* ── BUBBLE ── */
    .bbl {
      position: relative;
      max-width: 100%;
      min-width: 60px;
      width: fit-content;
      padding: 6px 12px 8px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.45;
      cursor: pointer;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .bbl.out { background: #7c3aed; color: #fff; }
    .bbl.in { background: #1e0a3c; color: #f0e6ff; }
    .bbl.del { opacity: .5; font-style: italic; }
    .bbl.rpl { border-left: 3px solid rgba(124,58,237,.5); padding-left: 10px; border-radius: 8px; margin-bottom: 4px; font-size: 13px; }
    .msg-link { color: #7dd3fc; text-decoration: none; word-break: break-word; overflow-wrap: anywhere; }
    .msg-link:hover { text-decoration: underline; }
    .bbl.out .msg-link { color: #e0e7ff; text-decoration: underline; }

    /* grouped radius */
    .bbl.out.single { border-radius: 16px 16px 4px 16px; }
    .bbl.out.top    { border-radius: 16px 16px 4px 16px; }
    .bbl.out.mid    { border-radius: 16px 4px 4px 16px; }
    .bbl.out.bottom { border-radius: 16px 4px 4px 16px; }
    .bbl.in.single  { border-radius: 16px 16px 16px 4px; }
    .bbl.in.top     { border-radius: 16px 16px 16px 4px; }
    .bbl.in.mid     { border-radius: 4px 16px 16px 4px; }
    .bbl.in.bottom  { border-radius: 4px 16px 16px 4px; }

    /* ── BUBBLE FOOTER (timestamp + tick) ── */
    .bfoot {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 3px;
      margin-top: 4px;
      margin-left: 14px;
      white-space: nowrap;
      font-size: 11px;
      opacity: .65;
      float: right;
    }

    /* ── DATE SEPARATOR ── */
    .dsep {
      display: flex; align-items: center; justify-content: center;
      margin: 20px 0 16px;
    }
    .dsep span {
      background: rgba(124,58,237,.15);
      padding: 4px 12px;
      border-radius: 12px;
      color: #a78bfa;
      font-size: 12px;
      font-weight: 600;
    }

    /* ── REPLY BAR ── */
    .rpl-bar {
      background: #1e0a3c; border-left: 3px solid #7c3aed;
      padding: 6px 10px; margin: 0 14px 4px;
      border-radius: 0 8px 8px 0;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; flex-shrink: 0;
    }

    /* ── INPUT AREA (FOOTER) — NEVER GETS SQUISHED ── */
    .ia {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      background: #1a0533;
      border-top: 1px solid #0d0618;
      height: auto;
    }

    /* Emoji popover row */
    .emoji-row {
      display: flex; gap: 2px; align-items: center;
      height: 36px; flex-shrink: 0;
      overflow-x: auto; padding: 2px 0;
      border-bottom: 1px solid #2d1155;
      margin-bottom: 4px;
    }

    /* Composer row */
    .ir {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      padding: 8px 14px 20px;
      min-height: 64px;
    }

    /* Icon buttons */
    .ib {
      width: 34px; height: 34px; flex-shrink: 0;
      background: transparent; border: none; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: #9b7ec8; font-size: 17px; transition: background .1s;
      margin-bottom: 3px;
    }
    .ib:hover, .ib.on { background: #2d1155; color: #f0e6ff; }
    .ib.g { font-size: 13px; font-weight: 700; }

    /* Textarea */
    .message-input {
      flex: 1; min-width: 0;
      min-height: 40px; max-height: 250px;
      padding: 9px 14px;
      background: #2d1155; border: none; border-radius: 20px;
      color: #f0e6ff; font-size: 14px; font-family: inherit;
      line-height: 1.45; resize: none; outline: none;
      overflow-y: auto; box-sizing: border-box;
    }
    .message-input::placeholder { color: #6b4d94; }

    /* Send button */
    .sb {
      width: 38px; height: 38px; flex-shrink: 0;
      border-radius: 50%; background: #7c3aed; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 17px; color: #fff;
      transition: background .15s, opacity .15s;
    }
    .sb:hover { background: #6d2ed5; }
    .sb:disabled { opacity: .35; cursor: default; }

    /* ── RIGHT COL ── */
    .rc {
      display: flex; flex-direction: column;
      overflow-y: auto;
      width: 280px;
      min-width: 280px;
      flex-shrink: 0;
      background: #1a0533; border-left: 1px solid #0d0618;
      padding: 20px 14px; gap: 14px;
    }
    .rr  { background: #2d1155; border-radius: 10px; padding: 12px; }
    .ri  { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; transition: background .1s; }
    .ri:hover { background: #3d1f6a; }
    .rl  { border-bottom: 1px solid #0d0618; margin: 4px 0; }
    .qb  { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; border: none; text-align: left; transition: background .15s; width: 100%; }
    .ti  { padding: 8px 12px; cursor: pointer; border-radius: 8px; font-size: 13px; transition: background .1s; color: #f0e6ff; border-bottom: 1px solid #2d1155; }
    .ti:hover { background: #2d1155; }
    .tmpl-panel { position: absolute; bottom: 100%; right: 0; background: #1a0533; border: 1px solid #3d1f6a; border-radius: 12px; padding: 8px 0; min-width: 300px; max-height: 300px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.5); z-index: 100; }
    .mi  { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; transition: background .1s; }
    .mi:hover { background: #2d1155; }

    .sinp {
      width: 100%;
      background: #2d1155;
      border: none;
      border-radius: 20px;
      padding: 8px 12px 8px 32px;
      color: #f0e6ff;
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
    }
    .sinp::placeholder { color: #6b4d94; }
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100% { opacity:.4; } 50% { opacity:.8; } }

    @media (max-width: 900px) {
      .sidebar { width: 44px; min-width: 44px; }
      .rc { display: none; }
    }
    @media (max-width: 600px) {
      .sidebar { display: none; }
      .lc { display: none; }
    }
  `

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
        <div style={{height:54,minHeight:54,flexShrink:0,padding:"0 14px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          borderBottom:"1px solid #0d0618"}}>
          <span style={{fontSize:15,fontWeight:700,color:TG.text}}>Messages</span>
          <button onClick={fetchChats} disabled={loadChats}
            style={{background:"none",border:"none",color:TG.textMuted,
              cursor:"pointer",fontSize:16,width:32,height:32,
              display:"flex",alignItems:"center",justifyContent:"center",
              borderRadius:8,transition:"background .1s"}}
            title="Refresh" onMouseEnter={e=>e.currentTarget.style.background="#2d1155"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>
            🔄
          </button>
        </div>
        {/* Folder tabs */}
        <div style={{
          display:'flex',flexShrink:0,
          height:38,minHeight:38,
          borderBottom:'1px solid #0d0618',
          overflowX:'auto',overflowY:'hidden',
          scrollbarWidth:'none',
        }}>
          {[['all','All'],['unread','Unread'],['groups','Groups'],['personal','DMs'],['archived','Archive']].map(([fid,flbl])=>(
            <div key={fid} onClick={()=>setFolder(fid)}
              style={{
                display:'flex',alignItems:'center',gap:4,
                padding:'0 10px',
                height:'100%',
                cursor:'pointer',
                fontSize:12,fontWeight:600,
                flexShrink:0,whiteSpace:'nowrap',
                color:folder===fid?'#a78bfa':'#6b4d94',
                borderBottom:folder===fid?'2px solid #7c3aed':'2px solid transparent',
                boxSizing:'border-box',
                transition:'color .15s',
              }}>
              {flbl}
              {fid==='unread'&&chats.filter(c=>c.unread>0).length>0&&(
                <span style={{
                  background:'#7c3aed',color:'#fff',
                  borderRadius:99,padding:'1px 5px',
                  fontSize:10,fontWeight:700,
                  lineHeight:'14px',display:'inline-block',
                }}>
                  {chats.filter(c=>c.unread>0).length}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{padding:"8px 12px",flexShrink:0,position:"relative",background:"#1a0533"}}>
          <span style={{position:"absolute",left:22,top:"50%",transform:"translateY(-50%)",
            color:"#6b4d94",fontSize:14,pointerEvents:"none"}}>🔍</span>
          <input className="sinp" placeholder="Search"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div ref={leftColScrollRef} style={{flex:1,overflowY:"auto",minHeight:0}} onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target
          localStorage.setItem('crm_leftCol_scroll', scrollTop)
          if (scrollHeight - scrollTop - clientHeight < 100 && hasMoreChats && !loadingChatsRef.current && !search) {
            fetchChats(true)
          }
        }}>
          {loadChats&&<div style={{padding:20,textAlign:"center",color:TG.textMuted,fontSize:13}}>Loading Telegram...</div>}
          {filtered.map(chat=>{
            const isSel=sel?.id===chat.id
            return(
              <div key={chat.id} className={`ci${isSel?" sel":""}`} onContextMenu={e=>{e.preventDefault();setChatCtxMenu({x:e.clientX,y:e.clientY,chat})}} onClick={()=>{
                setSel(chat)
                // Do not mark as read immediately. Wait until messages become visible in handleScroll.
                // TODO: Sync read status to backend if needed
              }}>
                <div style={{position:"relative",flexShrink:0}}>
                  <Avatar name={chat.name} chatId={chat.id} username={chat.username} size={52}/>
                </div>
                <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:600,fontSize:15,color:isSel?"#fff":TG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.isGroup ? <span style={{fontSize:13,marginRight:4}}>👥</span> : chat.isChannel ? <span style={{fontSize:13,marginRight:4}}>📢</span> : null}
                      {chat.name}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:8}}>
                      {chat.isPinned || pinnedChats.has(chat.id) ? (
                        <span style={{color:TG.textMuted,fontSize:12,opacity:isSel?0.8:0.5}}>📌</span>
                      ) : null}
                      <span style={{fontSize:12,color:isSel?"rgba(255,255,255,.7)":TG.textMuted,marginLeft:4}}>{fmtTime(chat.date)}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:14,color:isSel?"rgba(255,255,255,.8)":TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.lastMsg||"No messages"}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:6}}>
                      {chat.unread>0 && !readChats.has(chat.id) && (
                        <div style={{background:isSel?"#fff":TG.blue,color:isSel?"#7c3aed":"#fff",fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:10,minWidth:22,textAlign:"center"}}>
                          {chat.unread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {!loadChats&&filtered.length===0&&<div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13}}>No chats found</div>}
          {hasMoreChats && chats.length > 0 && !search && (
            <div style={{padding:12,textAlign:"center",color:TG.textMuted,fontSize:12}}>Loading more chats...</div>
          )}
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
        ): sel && sel.isForum && !selTopic ? (
          // ── FORUM TOPICS VIEW ──
          <div style={{display:"flex",flexDirection:"column",height:"100%",background:TG.bg}}>
            <div style={{height:58,background:TG.panel,borderBottom:"1px solid "+TG.border,display:"flex",alignItems:"center",padding:"0 16px",gap:12,flexShrink:0}}>
              <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={38}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:TG.text}}>{sel.name}</div>
                <div style={{fontSize:12,color:TG.textSec}}>{sel.memberCount} members · {topics[sel.id]?.length || 0} topics</div>
              </div>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:TG.textMuted,fontSize:12}}>🔍</span>
                <input placeholder="Search topics..." value={topicSearch} onChange={e=>setTopicSearch(e.target.value)}
                  style={{padding:"6px 12px 6px 30px",borderRadius:16,border:"none",background:TG.elevated,color:TG.text,fontSize:13,outline:"none",width:150}}/>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 0"}} onClick={()=>setTopicCtxMenu(null)}>
              {loadingTopics&&<div style={{padding:20,textAlign:"center",color:TG.textSec,fontSize:13}}>Loading topics...</div>}
              {!loadingTopics && topics[sel.id] && topics[sel.id].length === 0 && (
                <div style={{padding:20,textAlign:"center",color:TG.textSec,fontSize:13}}>No topics found.</div>
              )}
              {(Array.isArray(topics[sel.id]) ? topics[sel.id] : []).filter(t=>!topicSearch || t.title?.toLowerCase().includes(topicSearch.toLowerCase())).map(topic=>(
                <div key={topic.id} onClick={()=>{setSelTopic(topic)}}
                  onContextMenu={e=>{e.preventDefault();setTopicCtxMenu({x:e.clientX,y:e.clientY,topic})}}
                  style={{display:"flex",gap:12,padding:"12px 16px",cursor:"pointer",borderBottom:"1px solid "+TG.border,transition:"background .1s",background:topicCtxMenu?.topic?.id===topic.id?TG.elevated:"transparent"}}
                  onMouseEnter={e=>{if(topicCtxMenu?.topic?.id!==topic.id)e.currentTarget.style.background=TG.elevated}}
                  onMouseLeave={e=>{if(topicCtxMenu?.topic?.id!==topic.id)e.currentTarget.style.background="transparent"}}>
                  <div style={{width:46,height:46,borderRadius:"50%",background:TG.elevated,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                    {topic.id===1?"📌":"#"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
                      <span style={{fontWeight:600,fontSize:15,color:TG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{topic.title}</span>
                      <span style={{fontSize:11,color:TG.textMuted,flexShrink:0,marginLeft:8}}>{fmtTime(topic.date)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{topic.lastMsg||"No messages"}</span>
                      {topic.unread>0&&<div style={{background:TG.green,color:"#fff",fontSize:11,fontWeight:700,padding:"1px 6px",borderRadius:10,minWidth:20,textAlign:"center",flexShrink:0,marginLeft:6}}>{topic.unread}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {topicCtxMenu&&(
              <div style={{position:"fixed",left:topicCtxMenu.x,top:topicCtxMenu.y,background:"#1e0a3c",border:"1px solid #3d1f6a",borderRadius:8,padding:"4px 0",boxShadow:"0 4px 12px rgba(0,0,0,.5)",zIndex:100,minWidth:160}}>
                <div className="ctx-item" onClick={()=>{setSelTopic(topicCtxMenu.topic);setTopicCtxMenu(null)}}>Open</div>
                <div className="ctx-item" onClick={()=>{alert("TODO: Mark as read");setTopicCtxMenu(null)}}>Mark as read</div>
                <div className="ctx-item" onClick={()=>{alert("TODO: Mute topic");setTopicCtxMenu(null)}}>Mute</div>
                <div className="ctx-item" onClick={()=>{alert("TODO: Pin topic");setTopicCtxMenu(null)}}>Pin to top</div>
                <div className="ctx-item" onClick={()=>{alert("TODO: Archive topic");setTopicCtxMenu(null)}}>Archive / Hide</div>
              </div>
            )}
          </div>
        ):<>
          {/* Chat header */}
          <div className="chdr">
            {selTopic&&(
              <button onClick={()=>setSelTopic(null)} style={{background:"none",border:"none",color:TG.textSec,cursor:"pointer",fontSize:20,padding:"0 4px",flexShrink:0}}>←</button>
            )}
            <div 
              style={{cursor: 'pointer'}}
              onClick={() => setProfilePreview({ id: sel.id, name: sel.name, username: sel.username, chatId: sel.id, isGroup: sel.isGroup || sel.isChannel })}
            >
              <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={38}/>
            </div>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
              <div 
                style={{fontWeight:700,fontSize:15,color:TG.text,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap", cursor: 'pointer'}}
                onClick={() => setProfilePreview({ id: sel.id, name: sel.name, username: sel.username, chatId: sel.id, isGroup: sel.isGroup || sel.isChannel })}
              >
                {selTopic ? selTopic.title : sel.name}
              </div>
              <div style={{fontSize:12,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {selTopic ? sel.name : 
                 (sel?.isGroup || sel?.isChannel) ? (
                   <span style={{cursor:"pointer",color:TG.blueLight,transition:"color .15s"}} 
                         onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                         onMouseLeave={e=>e.currentTarget.style.color=TG.blueLight}
                         onClick={()=>setShowMembers(true)}>
                     {sel.memberCount ? `${sel.memberCount} members` : "View members"}
                   </span>
                 ) :
                 sel?.isUser ? (
                   onlineStatus === 'online' ? <span style={{color: TG.blueLight}}>● online</span> :
                   onlineStatus === 'unknown' ? '○ status unavailable' :
                   onlineStatus ? '○ ' + onlineStatus :
                   '○ last seen recently'
                 ) :
                 'Group'}
              </div>
            </div>
            <div style={{flexShrink:0}}><StageBadge stage={cStage}/></div>
            <div style={{display:"flex",gap:6,marginLeft:8,flexShrink:0}}>
              <button className="hb" title="Call" style={{fontSize:16}}>📞</button>
              <button className="hb" title="Search in chat" style={{fontSize:16}}>🔍</button>
              <button onClick={()=>setChatSearchOpen(p=>!p)} title="Search in chat"
                style={{width:34,height:34,background:chatSearchOpen?TG.blue:TG.elevated,borderRadius:8,border:"none",cursor:"pointer",fontSize:15}}>
                🔍
              </button>
              <button onClick={getSummary} title="AI Summarize" disabled={!msgs.length}
                style={{width:34,height:34,background:TG.elevated,borderRadius:8,border:"none",cursor:"pointer",fontSize:14,color:TG.textSec}}>
                📝
              </button>
              <button onClick={getExtract} title="Extract Lead Info" disabled={!msgs.length}
                style={{width:34,height:34,background:TG.elevated,borderRadius:8,border:"none",cursor:"pointer",fontSize:14,color:TG.textSec}}>
                🎯
              </button>
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
          <div className="msgs" onScroll={handleScroll}>
            {hasMore && msgs.length > 0 && !loadMsgs && (
              <div style={{textAlign:'center', margin:'10px 0'}}>
                <button onClick={() => loadMessages(sel, selTopic?.id || null, true)} disabled={loadingMore}
                  style={{padding:'6px 14px', borderRadius:20, background:TG.elevated, border:'none', color:TG.textSec, cursor:'pointer', fontSize:12}}>
                  {loadingMore ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}
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
              const next=msgs[i+1]
              const showSep=i===0||(()=>{
                try{
                  const a=typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date)
                  const b=typeof prev.date==="number"?new Date(prev.date*1000):new Date(prev.date)
                  return a.toDateString()!==b.toDateString()
                }catch{return false}
              })()
              let nextShowSep = false;
              if (next) {
                try {
                  const a=typeof next.date==="number"?new Date(next.date*1000):new Date(next.date)
                  const b=typeof msg.date==="number"?new Date(msg.date*1000):new Date(msg.date)
                  nextShowSep = a.toDateString()!==b.toDateString()
                } catch {}
              }
              const isSameSenderAsPrev = prev && prev.fromMe === msg.fromMe && prev.senderId === msg.senderId
              const isSameSenderAsNext = next && next.fromMe === msg.fromMe && next.senderId === msg.senderId

              const isSameGroup = !!(isSameSenderAsPrev && (msg.date - prev.date) < 300 && !showSep)
              const isLastInGroup = !(isSameSenderAsNext && (next.date - msg.date) < 300 && !nextShowSep)
              const isFirstInGroup = !isSameGroup

              let groupClass = ''
              if (isFirstInGroup && isLastInGroup) groupClass = ' single'
              else if (isFirstInGroup) groupClass = ' top'
              else if (isLastInGroup) groupClass = ' bottom'
              else groupClass = ' mid'
              // Infer first unread: last N msgs where N = chat.unread count
              const unreadCount = sel?.unread || 0
              const isFirstUnread = !readChats.has(sel?.id) &&
                unreadCount > 0 &&
                i === Math.max(0, msgs.length - unreadCount)
              return(
                <div key={i} ref={isFirstUnread?firstUnreadRef:null}>
                  {isFirstUnread&&(
                    <div ref={firstUnreadRef} style={{
                      display:"flex",alignItems:"center",gap:10,
                      margin:"12px 0 8px",
                    }}>
                      <div style={{flex:1,height:1,background:"rgba(124,58,237,.35)"}}/>
                      <div style={{
                        display:"flex",alignItems:"center",gap:6,
                        background:"rgba(124,58,237,.18)",
                        border:"1px solid rgba(124,58,237,.3)",
                        borderRadius:20,padding:"3px 12px",
                        fontSize:11,fontWeight:700,color:"#a78bfa",
                        whiteSpace:"nowrap",
                      }}>
                        <span>●</span>
                        <span>{sel.unread} new message{sel.unread>1?'s':''}</span>
                      </div>
                      <div style={{flex:1,height:1,background:"rgba(124,58,237,.35)"}}/>
                    </div>
                  )}
                  {showSep&&<div className="dsep"><span>{fmtDateSep(msg.date)}</span></div>}
                  <div className={`msg-row${msg.fromMe?' out':' in'}${isSameGroup?' grouped':''}`}
                    style={{cursor:selectMode?"pointer":"default"}}
                    onClick={selectMode?()=>setSelectedMsgs(prev=>{const s=new Set(prev);s.has(i)?s.delete(i):s.add(i);return s}):undefined}>
                  {selectMode&&<div style={{width:20,height:20,borderRadius:"50%",border:"2px solid #7c3aed",background:selectedMsgs.has(i)?"#7c3aed":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"center",fontSize:12,color:"#fff",cursor:"pointer"}}>
                    {selectedMsgs.has(i)?"✓":""}
                  </div>}
                    {!msg.fromMe && (
                      isLastInGroup
                      ? <div className="msg-avatar" style={{cursor:'pointer'}} onClick={() => setProfilePreview({ id: msg.senderId||sel.id, name: msg.senderName||sel.name, chatId: sel.id })}><Avatar name={msg.senderName||sel.name} chatId={msg.senderId||sel.id} username={null} size={32}/></div>
                      : <div className="msg-avatar-gap"/>
                    )}
                    <div className="msg-content" onContextMenu={e=>handleCtx(e,msg,i)}>
                      {msg.replyTo&&(
                        <div className="bbl rpl" onClick={()=>{/* scroll to reply */}} style={{background:"rgba(124,58,237,.15)",borderLeft:`3px solid ${TG.blue}`,padding:"4px 8px",borderRadius:"0 6px 6px 0",marginBottom:4,fontSize:11,color:TG.textSec,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>
                          ↩ {msg.replyTo.fromMe?"You":sel.name}: {msg.replyTo.text}
                        </div>
                      )}
                      <div className={`bbl msg-bubble ${msg.fromMe?"out":"in"}${msg.deleted?" del":""}${groupClass}`}>
                        {!msg.fromMe && !sel?.isUser && msg.senderName && !isSameGroup && (
                          <div style={{fontSize:11,fontWeight:700,color:"#7c8ae8",marginBottom:3,whiteSpace:"nowrap",cursor:'pointer'}} onClick={() => setProfilePreview({ id: msg.senderId||sel.id, name: msg.senderName||sel.name, chatId: sel.id })}>{msg.senderName}</div>
                        )}
                        {msg.isPhoto && <ChatPhoto msg={msg} chatId={sel.id} authToken={token} onImageClick={(src)=>setLightbox(src)}/>}
                        {msg.isVideo && (
                          <video controls style={{maxWidth:'100%',maxHeight:200,borderRadius:8,display:'block'}}>
                            <source src={`/api/chat/media/${sel.id}/${msg.id}?t=${token}`}/>
                          </video>
                        )}
                        {msg.isAudio && (
                          <audio controls style={{width:'100%',marginBottom:4}}>
                            <source src={`/api/chat/media/${sel.id}/${msg.id}?t=${token}`}/>
                          </audio>
                        )}
                        {msg.isDoc && <div style={{padding:'4px 0',color:TG.textSec,fontSize:13}}>📎 Document</div>}
                        {/* Render poll messages nicely */}
                        {msg.text?.startsWith('📊 ') && (
                          <div style={{minWidth:200}}>
                            <div style={{fontWeight:600,marginBottom:8,fontSize:14}}>{msg.text.split('\n')[0]}</div>
                            {msg.text.split('\n').slice(1).filter(l=>l.trim()).map((opt,i)=>(
                              <div key={i} style={{background:"rgba(124,58,237,.15)",borderRadius:8,
                                padding:"7px 12px",marginBottom:4,fontSize:13,cursor:"pointer",
                                border:"1px solid rgba(124,58,237,.2)"}}
                                onMouseEnter={e=>e.currentTarget.style.background="rgba(124,58,237,.25)"}
                                onMouseLeave={e=>e.currentTarget.style.background="rgba(124,58,237,.15)"}>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {(()=>{
                          const displayText = editedMsgs[msg.id] || msg.text || ''
                          return renderMessageText(displayText, chatSearch)
                        })()}
                        {/* Link preview */}
                        {msg.text && (msg.text.includes('http://') || msg.text.includes('https://')) && (
                          <LinkPreview url={(msg.text.match(/https?:\/\/\S+/)||[''])[0]}/>
                        )}
                        {reactions[msg.id]&&Object.keys(reactions[msg.id]).length>0&&(
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:3}}>
                            {Object.entries(reactions[msg.id]).map(([e,n])=>(
                              <span key={e} onClick={()=>setReactions(p=>({...p,[msg.id]:{...p[msg.id],[e]:(p[msg.id][e]||1)-1}}))}
                                style={{background:"rgba(124,58,237,.2)",border:"1px solid rgba(124,58,237,.3)",
                                  borderRadius:99,padding:"1px 6px",fontSize:12,cursor:"pointer",userSelect:"none"}}>
                                {e}{n>1?` ${n}`:""}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="bfoot">
                          {(msg.edited||editedMsgs[msg.id])&&(
                            <span style={{fontSize:10,fontStyle:'italic',color:msg.fromMe?'rgba(255,255,255,.5)':'#6b4d94'}}>edited</span>
                          )}
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
          {/* GIF Picker */}
          {gifOpen&&(
            <div style={{height:220,background:TG.panel,borderTop:"1px solid "+TG.border,flexShrink:0,display:"flex",flexDirection:"column"}}>
              <div style={{padding:"6px 10px",borderBottom:"1px solid "+TG.border}}>
                <input value={gifQuery}
                  onChange={e=>{setGifQuery(e.target.value);searchGifs(e.target.value)}}
                  placeholder="Search GIFs..."
                  style={{width:"100%",background:TG.elevated,border:"none",borderRadius:16,padding:"6px 12px",color:TG.text,fontSize:13,outline:"none",boxSizing:"border-box"}}
                  autoFocus/>
              </div>
              <div style={{flex:1,overflowX:"auto",display:"flex",gap:6,padding:"8px 10px",alignItems:"center"}}>
                {gifs.length===0&&<div style={{color:TG.textMuted,fontSize:13,padding:"0 10px"}}>Search for GIFs above</div>}
                {gifs.map(g=>{
                  const url = g.media_formats?.gif?.url || g.media_formats?.tinygif?.url
                  if(!url) return null
                  return (
                    <img key={g.id} src={url} alt={g.title}
                      style={{height:120,borderRadius:8,cursor:"pointer",flexShrink:0}}
                      onClick={async()=>{
                        setGifOpen(false)
                        // Send GIF as a message with the URL
                        await fetch("/api/chat/send",{method:"POST",
                          headers:{"Content-Type":"application/json","x-auth-token":token},
                          body:JSON.stringify({chatId:sel.id,text:url})
                        })
                        setTimeout(()=>{loadingRef.current=false;loadMessages(sel)},500)
                      }}/>
                  )
                })}
              </div>
            </div>
          )}
          {/* Scroll to bottom button */}
          {firstUnreadRef.current&&showScrollBtn&&(
            <button onClick={()=>firstUnreadRef.current?.scrollIntoView({behavior:"smooth",block:"center"})}
              style={{position:"absolute",bottom:130,right:20,padding:"4px 12px",borderRadius:20,
                background:"rgba(124,58,237,.9)",border:"none",cursor:"pointer",
                fontSize:12,color:"#fff",fontWeight:600,zIndex:10,boxShadow:"0 2px 8px rgba(0,0,0,.4)"}}>
              ↑ Unread
            </button>
          )}
          {showScrollBtn&&(
            <button onClick={()=>endRef.current?.scrollIntoView({behavior:"smooth"})}
              style={{position:"absolute",bottom:90,right:20,width:38,height:38,borderRadius:"50%",
                background:TG.elevated,border:"1px solid #3d1f6a",cursor:"pointer",
                fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 2px 8px rgba(0,0,0,.4)",zIndex:10}}>
              ↓
            </button>
          )}
          {/* Voice recording indicator */}
          {recording&&(
            <div style={{padding:"8px 16px",background:"rgba(229,57,53,.1)",borderTop:"1px solid rgba(229,57,53,.2)",
              display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#e53935",animation:"pulse 1s infinite"}}/>
              <span style={{fontSize:13,color:"#e53935",fontWeight:600}}>Recording... {recordSecs}s</span>
              <span style={{fontSize:12,color:TG.textSec,flex:1}}>Release 🎤 to send, or swipe away to cancel</span>
              <button onClick={()=>{mediaRecRef.current?.stop();clearInterval(recordTimerRef.current);setRecording(false);setRecordSecs(0)}}
                style={{background:"none",border:"none",color:TG.textSec,cursor:"pointer",fontSize:13}}>Cancel</button>
            </div>
          )}
          {/* Input area */}
          <div className="ia">
            {/* Editing bar */}
            {editingMsg&&(
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 16px',
                background:'rgba(124,58,237,.15)',height:52,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
                  <span style={{fontSize:20,color:'#7c3aed'}}>✏️</span>
                  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center'}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#a78bfa',marginBottom:2}}>Edit message</div>
                    <div style={{fontSize:13,color:'#9b7ec8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {editingMsg.text}
                    </div>
                  </div>
                </div>
                <button onClick={()=>{setEditingMsg(null);setInput('')}}
                  style={{background:'none',border:'none',color:'#a78bfa',cursor:'pointer',
                    fontSize:20,lineHeight:1,padding:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  ✕
                </button>
              </div>
            )}
            {/* Emoji popover — only show when open */}
            {emojiOpen&&(
              <div style={{display:"flex",gap:4,padding:"4px 2px",overflowX:"auto",flexShrink:0,
                borderBottom:"1px solid #2d1155",marginBottom:2}}>
                {["👍","❤️","😂","🔥","💪","✅","🙏","😎","🤔","👀","💯","🎯","🔑","💎","🚀","⭐"].map(e=>(
                  <button key={e} style={{background:"none",border:"none",cursor:"pointer",fontSize:19,
                    padding:"2px 4px",borderRadius:6,flexShrink:0,lineHeight:1}}
                    onClick={()=>{setInput(p=>p+e)}}>
                    {e}
                  </button>
                ))}
                <button onClick={()=>setEmojiOpen(false)}
                  style={{marginLeft:"auto",background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,flexShrink:0}}>
                  ✕
                </button>
              </div>
            )}
            {/* Input row */}
            <div className="ir">
              <button className="ib" onClick={()=>setEmojiOpen(p=>!p)} title="Emoji"
                style={{background:emojiOpen?"#2d1155":"transparent",fontSize:17}}>😊</button>
              <button className="ib g" title="Attach file"
                onClick={()=>document.getElementById('fileInput').click()} style={{fontSize:17}}>📎</button>
              <textarea className="message-input" placeholder="Type a message..."
                ref={inputRef} value={input} rows={1}
                onChange={e=>{
                  setInput(e.target.value)
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}
                }}
                style={{height:"auto"}}/>
              <button className={`ib g${showTmpl?" on":""}`} onClick={()=>setShowTmpl(v=>!v)} title="Templates" style={{fontSize:17}}>
                📋
              </button>
              <button className="ib g" onClick={getAI} disabled={aiLoading} title="AI Suggest"
                style={{background:aiLoading?"rgba(124,58,237,.25)":TG.elevated,fontSize:17}}>
                {aiLoading?"⏳":"✨"}
              </button>
              <button className="ib s" onClick={send} disabled={!input.trim()||sending}
                style={{opacity:input.trim()&&!sending?1:.4,fontSize:17,background:editingMsg?'#4caf50':'',color:editingMsg?'#fff':''}} title={editingMsg?"Save Edit":"Send"}>
                {editingMsg?"✓":"➤"}
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
                <div style={{fontWeight:700,fontSize:18,color:TG.text,marginTop:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sel.name}</div>
                <div style={{fontSize:12,color:TG.textSec,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {sel.isGroup || sel.isChannel ? `Telegram · ${sel.memberCount ? sel.memberCount + ' members' : 'Group'}` :
                   sel.isUser ? `Telegram · Contact · ${onlineStatus === 'online' ? 'Online' : onlineStatus === 'unknown' ? 'Status unavailable' : onlineStatus || 'Last seen recently'}` : 'Telegram'}
                </div>
                <div style={{marginTop:10,flexShrink:0}}><StageBadge stage={cStage}/></div>
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





      {/* Message Info Modal */}
      {msgInfoOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setMsgInfoOpen(null)}>
          <div style={{background:TG.panel,borderRadius:16,padding:24,width:320}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:TG.text}}>ℹ️ Message Info</div>
            <div style={{background:TG.elevated,borderRadius:10,padding:"10px 12px",marginBottom:16,fontSize:13,color:TG.text,lineHeight:1.5}}>
              {msgInfoOpen.text}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:TG.textSec}}>Sent</span>
                <span style={{color:TG.text}}>{new Date((msgInfoOpen.date||0)*1000).toLocaleString()}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:TG.textSec}}>Status</span>
                <span style={{color:TG.green}}>✓✓ Delivered</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:TG.textSec}}>Message ID</span>
                <span style={{color:TG.textMuted,fontFamily:"monospace"}}>{msgInfoOpen.id}</span>
              </div>
            </div>
            <button onClick={()=>setMsgInfoOpen(null)}
              style={{width:"100%",marginTop:16,padding:"9px",background:TG.elevated,
                color:TG.textSec,border:"none",borderRadius:8,cursor:"pointer",fontSize:13}}>
              Close
            </button>
          </div>
        </div>
      )}
      {/* Poll Modal */}
      {pollOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setPollOpen(false)}>
          <div style={{background:TG.panel,borderRadius:16,padding:24,width:360}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:TG.text}}>📊 Create Poll</div>
            <input value={pollQuestion} onChange={e=>setPollQuestion(e.target.value)}
              placeholder="Ask a question..."
              style={{width:"100%",background:TG.elevated,border:"1px solid #3d1f6a",borderRadius:8,
                padding:"9px 12px",color:TG.text,fontSize:14,marginBottom:12,boxSizing:"border-box"}}/>
            <div style={{marginBottom:8,fontSize:12,color:TG.textSec}}>Options:</div>
            {pollOptions.map((opt,i)=>(
              <div key={i} style={{display:"flex",gap:6,marginBottom:8}}>
                <input value={opt} onChange={e=>{const o=[...pollOptions];o[i]=e.target.value;setPollOptions(o)}}
                  placeholder={`Option ${i+1}`}
                  style={{flex:1,background:TG.elevated,border:"1px solid #3d1f6a",borderRadius:8,
                    padding:"7px 10px",color:TG.text,fontSize:13}}/>
                {pollOptions.length>2&&<button onClick={()=>setPollOptions(p=>p.filter((_,j)=>j!==i))}
                  style={{background:"none",border:"none",color:TG.textMuted,cursor:"pointer",fontSize:16}}>✕</button>}
              </div>
            ))}
            {pollOptions.length<6&&(
              <button onClick={()=>setPollOptions(p=>[...p,''])}
                style={{width:"100%",padding:"7px",background:"transparent",border:"1px dashed #3d1f6a",
                  borderRadius:8,color:TG.textSec,cursor:"pointer",fontSize:13,marginBottom:12}}>
                + Add option
              </button>
            )}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={async()=>{
                if(!pollQuestion.trim()) return alert('Enter a question')
                const validOpts = pollOptions.filter(o=>o.trim())
                if(validOpts.length<2) return alert('Need at least 2 options')
                const pollText = '📊 '+pollQuestion+'\n'+validOpts.map((o,i)=>`${i+1}. ${o}`).join('\n')
                await fetch("/api/chat/send",{method:"POST",
                  headers:{"Content-Type":"application/json","x-auth-token":token},
                  body:JSON.stringify({chatId:sel.id,text:pollText})
                })
                setPollOpen(false);setPollQuestion('');setPollOptions(['',''])
                setTimeout(()=>{loadingRef.current=false;loadMessages(sel)},500)
              }} style={{flex:1,padding:"9px",background:TG.blue,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:600}}>
                Send Poll
              </button>
              <button onClick={()=>setPollOpen(false)}
                style={{padding:"9px 16px",background:TG.elevated,color:TG.textSec,border:"none",borderRadius:8,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Schedule Message Modal */}
      {scheduleOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setScheduleOpen(false)}>
          <div style={{background:TG.panel,borderRadius:16,padding:24,width:300}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:16,color:TG.text}}>⏰ Schedule Message</div>
            <div style={{fontSize:13,color:TG.textSec,marginBottom:8}}>"{input.slice(0,50)}{input.length>50?'...':''}"</div>
            <input type="datetime-local" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)}
              min={new Date().toISOString().slice(0,16)}
              style={{width:"100%",background:TG.elevated,border:"1px solid #3d1f6a",borderRadius:8,
                padding:"8px 12px",color:TG.text,fontSize:13,marginBottom:16,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={sendScheduled} disabled={!scheduleTime}
                style={{flex:1,padding:"9px",background:TG.blue,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:600}}>
                Schedule
              </button>
              <button onClick={()=>setScheduleOpen(false)}
                style={{padding:"9px 16px",background:TG.elevated,color:TG.textSec,border:"none",borderRadius:8,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Scheduled messages indicator */}
      {scheduledMsgs.filter(m=>m.chatId===sel?.id).length>0&&(
        <div style={{padding:"6px 16px",background:"rgba(245,158,11,.1)",borderTop:"1px solid rgba(245,158,11,.2)",
          fontSize:12,color:"#f59e0b",flexShrink:0}}>
          ⏰ {scheduledMsgs.filter(m=>m.chatId===sel.id).length} message(s) scheduled
        </div>
      )}

      {/* Global Search */}
      {globalSearchOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9998,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60}}
          onClick={()=>setGlobalSearchOpen(false)}>
          <div style={{background:TG.panel,borderRadius:16,width:520,maxHeight:"70vh",display:"flex",flexDirection:"column",overflow:"hidden"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid "+TG.border}}>
              <input value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)}
                placeholder="Search messages, chats..."
                style={{width:"100%",background:TG.elevated,border:"none",borderRadius:20,padding:"9px 16px",
                  color:TG.text,fontSize:14,outline:"none",boxSizing:"border-box"}}
                autoFocus/>
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {globalSearch.length>1 && chats.filter(c=>c.name?.toLowerCase().includes(globalSearch.toLowerCase())).map(c=>(
                <div key={c.id} onClick={()=>{setSel(c);setSelTopic(null);setGlobalSearchOpen(false)}}
                  style={{display:"flex",gap:12,padding:"10px 16px",cursor:"pointer",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background=TG.elevated}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <Avatar name={c.name} chatId={c.id} username={c.username} size={38}/>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:TG.text}}>{c.name}</div>
                    <div style={{fontSize:12,color:TG.textSec}}>{c.lastMsg?.slice(0,50)}</div>
                  </div>
                </div>
              ))}
              {globalSearch.length>1 && chats.filter(c=>c.name?.toLowerCase().includes(globalSearch.toLowerCase())).length===0&&(
                <div style={{padding:20,textAlign:"center",color:TG.textMuted,fontSize:13}}>No results for "{globalSearch}"</div>
              )}
              {globalSearch.length<=1&&(
                <div style={{padding:20,textAlign:"center",color:TG.textMuted,fontSize:13}}>Type to search chats and messages</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Image Lightbox */}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:99999,
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={lightbox} alt="photo"
            style={{maxWidth:"95vw",maxHeight:"95vh",objectFit:"contain",borderRadius:8}}
            onClick={e=>e.stopPropagation()}/>
          <button onClick={()=>setLightbox(null)}
            style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",
              border:"none",borderRadius:"50%",width:40,height:40,cursor:"pointer",
              color:"#fff",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
            ✕
          </button>
          <a href={lightbox} download target="_blank"
            style={{position:"absolute",top:16,right:64,background:"rgba(255,255,255,.15)",
              borderRadius:"50%",width:40,height:40,display:"flex",alignItems:"center",
              justifyContent:"center",textDecoration:"none",fontSize:18}}
            onClick={e=>e.stopPropagation()}>
            ⬇️
          </a>
        </div>
      )}
      {/* Forward Message Modal */}
      {forwardMsg&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setForwardMsg(null)}>
          <div style={{background:TG.panel,borderRadius:16,padding:20,width:320,maxHeight:"70vh",overflow:"hidden",display:"flex",flexDirection:"column"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:12,color:TG.text}}>Forward to...</div>
            <div style={{fontSize:12,color:TG.textSec,marginBottom:12,padding:"8px 10px",background:TG.elevated,borderRadius:8}}>
              "{forwardMsg.text?.slice(0,60)}{forwardMsg.text?.length>60?'...':''}"
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {chats.filter(c=>c.name).slice(0,20).map(c=>(
                <div key={c.id} onClick={async()=>{
                  try {
                    await fetch("/api/chat/send",{method:"POST",
                      headers:{"Content-Type":"application/json","x-auth-token":token},
                      body:JSON.stringify({chatId:c.id,text:"↪️ "+forwardMsg.text})
                    })
                    alert("Forwarded to "+c.name)
                  } catch(e){ alert("Failed: "+e.message) }
                  setForwardMsg(null)
                }} style={{display:"flex",gap:10,padding:"10px 8px",cursor:"pointer",borderRadius:8,alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background=TG.elevated}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <Avatar name={c.name} chatId={c.id} username={c.username} size={36}/>
                  <span style={{fontSize:14,color:TG.text}}>{c.name}</span>
                </div>
              ))}
            </div>
            <button onClick={()=>setForwardMsg(null)}
              style={{marginTop:12,padding:"8px",background:TG.elevated,border:"none",borderRadius:8,color:TG.textSec,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* User Profile Preview Modal */}
      <UserProfileModal 
        data={profilePreview} 
        onClose={() => setProfilePreview(null)} 
        token={token} 
        chats={chats}
        setSel={setSel}
        inputRef={inputRef}
        msgs={msgs}
        onOpenMedia={(type) => setSharedMediaView(type)}
      />

      {/* Shared Media Gallery Modal */}
      {sharedMediaView && profilePreview && (
        <SharedMediaModal 
          type={sharedMediaView} 
          msgs={msgs} 
          data={profilePreview} 
          onClose={() => setSharedMediaView(null)} 
          token={token} 
          setLightbox={setLightbox} 
        />
      )}

      {/* Chat Preview Modal */}
      {previewChat&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9998,
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setPreviewChat(null)}>
          <div style={{background:'#1a0533',borderRadius:16,padding:24,width:340,
            boxShadow:'0 8px 32px rgba(0,0,0,.7)'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
              <Avatar name={previewChat.name} chatId={previewChat.id} username={previewChat.username} size={52}/>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:'#f0e6ff'}}>{previewChat.name}</div>
                <div style={{fontSize:12,color:'#6b4d94',marginTop:3}}>
                  {previewChat.isUser?'Private chat':previewChat.isChannel?'Channel':'Group'}
                  {previewChat.memberCount?` · ${previewChat.memberCount} members`:''}
                </div>
              </div>
            </div>
            {previewChat.lastMsg&&(
              <div style={{background:'#120929',borderRadius:10,padding:'10px 12px',
                fontSize:13,color:'#9b7ec8',marginBottom:16,lineHeight:1.5}}>
                {previewChat.lastMsg}
              </div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setSel(previewChat);setSelTopic(null);setPreviewChat(null)}}
                style={{flex:1,padding:'9px',background:'#7c3aed',color:'#fff',
                  border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13}}>
                Open Chat
              </button>
              <button onClick={()=>setPreviewChat(null)}
                style={{padding:'9px 16px',background:'#2d1155',color:'#9b7ec8',
                  border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave/Delete Confirmation */}
      {showMembers && sel && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9998,
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>{setShowMembers(false);setMemberSearch("")}}>
          <div style={{background:'#1a0533',borderRadius:16,width:360,maxHeight:'80vh',
            display:'flex',flexDirection:'column',boxShadow:'0 8px 32px rgba(0,0,0,.7)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #2d1155',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:16,color:'#f0e6ff'}}>{sel.memberCount ? `${sel.memberCount} Members` : 'Members'}</div>
              <button onClick={()=>{setShowMembers(false);setMemberSearch("")}} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{padding:'12px 16px',borderBottom:'1px solid #2d1155',flexShrink:0}}>
              <input placeholder="Search members..." value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}
                style={{width:'100%',padding:'8px 12px',borderRadius:8,background:'#120929',border:'1px solid #2d1155',color:'#f0e6ff',outline:'none',fontSize:13}}/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
              {(sel.members || sel.participants || sel.users || []).length === 0 ? (
                <div style={{padding:32,textAlign:'center',color:'#9b7ec8',fontSize:13}}>
                  <div style={{fontSize:32,marginBottom:12}}>👥</div>
                  Members data not connected yet.
                  <div style={{fontSize:11,color:'#6b4d94',marginTop:6}}>⚠️ TODO: Connect Telegram getParticipants API</div>
                </div>
              ) : (
                (sel.members || sel.participants || sel.users || [])
                  .filter(m => !memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.username?.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',cursor:'pointer'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#2d1155'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <Avatar name={m.name} chatId={m.id} username={m.username} size={42}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'#f0e6ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.name}</div>
                      <div style={{fontSize:12,color:'#9b7ec8',marginTop:2}}>{m.status || m.role || (m.username ? '@'+m.username : 'Member')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {confirmLeave&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9998,
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setConfirmLeave(null)}>
          <div style={{background:'#1a0533',borderRadius:16,padding:24,width:320,
            boxShadow:'0 8px 32px rgba(0,0,0,.7)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,color:'#f0e6ff',marginBottom:8}}>
              {confirmLeave.isUser?'Delete chat?':'Leave group?'}
            </div>
            <div style={{fontSize:13,color:'#9b7ec8',marginBottom:20,lineHeight:1.5}}>
              {confirmLeave.isUser
                ?`Delete conversation with ${confirmLeave.name}? This cannot be undone.`
                :`Leave "${confirmLeave.name}"? You won't receive messages anymore.`}
              <br/><span style={{fontSize:11,color:'#6b4d94',marginTop:6,display:'block'}}>
                ⚠️ TODO: Requires Telegram API — local only for now
              </span>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{
                // TODO: call Telegram leave API when available
                setArchivedChats(p=>{const s=new Set(p);s.add(confirmLeave.id);return s})
                if(sel?.id===confirmLeave.id) setSel(null)
                setConfirmLeave(null)
                alert('Chat hidden locally. Telegram leave API not yet connected.')
              }} style={{flex:1,padding:'9px',background:'#e53935',color:'#fff',
                border:'none',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13}}>
                {confirmLeave.isUser?'Delete':'Leave'}
              </button>
              <button onClick={()=>setConfirmLeave(null)}
                style={{padding:'9px 16px',background:'#2d1155',color:'#9b7ec8',
                  border:'none',borderRadius:8,cursor:'pointer',fontSize:13}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {chatCtxMenu&&(
        <ChatContextMenu
          x={chatCtxMenu.x} y={chatCtxMenu.y} chat={chatCtxMenu.chat}
          isPinned={pinnedChats.has(chatCtxMenu.chat?.id)}
          isMuted={mutedChats.has(chatCtxMenu.chat?.id)}
          isArchived={archivedChats.has(chatCtxMenu.chat?.id)}
          isRead={readChats.has(chatCtxMenu.chat?.id)||!chatCtxMenu.chat?.unread}
          currentFolder={chatFolders[chatCtxMenu.chat?.id]||null}
          onPin={()=>setPinnedChats(p=>{const s=new Set(p);s.has(chatCtxMenu.chat.id)?s.delete(chatCtxMenu.chat.id):s.add(chatCtxMenu.chat.id);return s})}
          onMute={()=>setMutedChats(p=>{const s=new Set(p);s.has(chatCtxMenu.chat.id)?s.delete(chatCtxMenu.chat.id):s.add(chatCtxMenu.chat.id);return s})}
          onMarkRead={()=>{
            setChats(p=>p.map(c=>c.id===chatCtxMenu.chat.id?{...c,unread:0}:c))
            setReadChats(p=>new Set([...p,chatCtxMenu.chat.id]))
          }}
          onMarkUnread={()=>{
            setReadChats(p=>{const s=new Set(p);s.delete(chatCtxMenu.chat.id);return s})
            setChats(p=>p.map(c=>c.id===chatCtxMenu.chat.id?{...c,unread:c.unread||1}:c))
          }}
          onArchive={()=>{
            setArchivedChats(p=>{const s=new Set(p);s.add(chatCtxMenu.chat.id);return s})
            if(sel?.id===chatCtxMenu.chat.id) setSel(null)
          }}
          onUnarchive={()=>setArchivedChats(p=>{const s=new Set(p);s.delete(chatCtxMenu.chat.id);return s})}
          onPreview={()=>{ setPreviewChat(chatCtxMenu.chat); setChatCtxMenu(null) }}
          onSetFolder={f=>setChatFolders(p=>({...p,[chatCtxMenu.chat.id]:f}))}
          onLeave={()=>{ setConfirmLeave(chatCtxMenu.chat); setChatCtxMenu(null) }}
          onClose={()=>setChatCtxMenu(null)}
        />
      )}
      {ctxMenu&&(
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} msg={ctxMenu.msg}
          onDelete={()=>deleteMsg(ctxMenu.idx)}
          onCopy={()=>copyMsg(ctxMenu.msg.text)}
          onReply={()=>setReplyTo(ctxMenu.msg)}
          onDeleteAll={deleteAllMsgs}
          onSelect={()=>{setSelectMode(true);setSelectedMsgs(new Set([ctxMenu.idx]))}}
          onForward={()=>setForwardMsg(ctxMenu.msg)}
          onPin={()=>setPinnedMsgs(p=>({...p,[sel.id]:p[sel.id]?.id===ctxMenu.msg.id?null:ctxMenu.msg}))}
          onInfo={()=>setMsgInfoOpen(ctxMenu.msg)}
          onEdit={()=>{
            if(ctxMenu.msg?.fromMe) {
              const editText = editedMsgs[ctxMenu.msg.id] || ctxMenu.msg.text || ''
              setEditingMsg({id:ctxMenu.msg.id, text:editText})
              setInput(editText)
            }
          }}
          onReact={emoji=>{
            setReactions(p=>{
              const prev = p[ctxMenu.msg.id] || {}
              return {...p, [ctxMenu.msg.id]: {...prev, [emoji]: (prev[emoji]||0)+1}}
            })
          }}
          onClose={()=>setCtxMenu(null)}
        />
      )}
    </div>
  </>)
}
