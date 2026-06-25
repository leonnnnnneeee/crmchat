// v-edit2-083448
// v035029
import { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react"
import ForumTopicsView from './components/chat/ForumTopicsView';
import ChatHeader from './components/chat/ChatHeader';
import MessageList from './components/chat/MessageList';
import Composer from './components/chat/Composer';
import CRMRightPanel from './components/chat/CRMRightPanel';
import PinnedMessageBar from './components/chat/PinnedMessageBar';
import TranslateBar from './components/chat/TranslateBar';

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

// ── Global Keyboard/Paste Helpers ──
export const allowShortcuts = (e) => {
  if ((e.metaKey || e.ctrlKey) && ['v','c','x','a'].includes(e.key.toLowerCase())) {
    e.stopPropagation()
  }
}

export const handlePaste = (e) => {
  const clipboardData = e.clipboardData || window.clipboardData
  if (clipboardData && clipboardData.files && clipboardData.files.length > 0) {
    e.preventDefault()
    alert('TODO: Implement file/image upload from paste')
  }
}

// ── Avatar — loads real TG photo, falls back to colored initials ──
const photoCache = {}
const linkCache = {}
let sharedMediaCache = {}
let _authToken = ''

function Avatar({name, chatId, username, accessHash, size=40}) {
  const colors=["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const colorIdx = (name||"?").charCodeAt(0) % colors.length
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  const [photoUrl, setPhotoUrl] = useState(photoCache[chatId] || null)
  const [failed, setFailed] = useState(false)

  useEffect(()=>{
    if (!chatId || !_authToken || failed) return
    if (photoCache[chatId]) { setPhotoUrl(photoCache[chatId]); return }
    const qsObj = new URLSearchParams()
    if (username) qsObj.append('username', username)
    if (accessHash) qsObj.append('accessHash', accessHash)
    const qs = qsObj.toString() ? `?${qsObj.toString()}` : ""
    fetch(`/api/chat/photo/${chatId}${qs}`, {headers:{"x-auth-token":_authToken}})
      .then(r => { if (!r.ok) throw new Error("no photo"); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        photoCache[chatId] = url
        setPhotoUrl(url)
      })
      .catch(() => setFailed(true))
  }, [chatId, failed, username, accessHash])

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
function ContextMenu({x,y,msg,allowedReactions,onDelete,onCopy,onReply,onClose,onDeleteAll,onSelect,onForward,onReact,onPin,onInfo,onEdit}) {
  const ref = useRef(null)
  useEffect(()=>{
    const h = e => { 
      // Do not close if clicking inside the context menu (including emojis)
      if(ref.current && !ref.current.contains(e.target)) {
        onClose() 
      }
    }
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

  const defaultEmojis = ['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡', '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡️', '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈', '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '🤝', '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿', '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️', '🤷', '🤷‍♀️', '😡'];
  const quickEmojis = ['👍', '❤️', '😂', '🔥', '🙏', '😎', '👎'];
  let emojisToRender = quickEmojis;
  let fullEmojis = defaultEmojis;
  let reactionsNotAllowed = false;
  let isFallback = false;
  let fallbackReason = '';
  let isLoading = false;
  
  const [expandedPickerOpen, setExpandedPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  if (allowedReactions) {
    if (allowedReactions.status === 'loading') {
      isLoading = true;
      emojisToRender = [];
    } else if (allowedReactions.ok) {
      if (allowedReactions.reactionsEnabled === false) {
        reactionsNotAllowed = true;
        emojisToRender = [];
        fullEmojis = [];
      } else if (allowedReactions.allowAll) {
        emojisToRender = quickEmojis; 
        fullEmojis = defaultEmojis;
      } else if (allowedReactions.reactions && allowedReactions.reactions.length > 0) {
        emojisToRender = allowedReactions.reactions.slice(0, 6);
        fullEmojis = allowedReactions.reactions;
      } else {
        reactionsNotAllowed = true;
        emojisToRender = [];
        fullEmojis = [];
      }
    } else {
      isFallback = true;
      fallbackReason = allowedReactions.error || 'unknown';
      emojisToRender = ['👍', '❤️'];
      fullEmojis = ['👍', '❤️', '😁', '🔥', '👎', '🥰', '👏', '🤔', '🎉', '😎', '🙏'];
    }
  } else {
    isLoading = true;
    emojisToRender = [];
  }
  
  const filteredEmojis = search 
    ? fullEmojis.filter(e => {
        const str = typeof e === 'string' ? e : '';
        return str.toLowerCase().includes(search.toLowerCase()) || 'smile like heart fire ok'.includes(search.toLowerCase())
      }) 
    : fullEmojis;

  const renderEmojiButton = (emoji) => {
    const isCustom = emoji && emoji.type === 'custom';
    const key = isCustom ? emoji.customEmojiId : emoji;
    const content = isCustom ? (
      <img src={emoji.thumbnailUrl} style={{width:24, height:24, objectFit:'contain'}} onError={(e)=>e.target.style.display='none'} alt="custom_emoji" />
    ) : (
      emoji
    );
    
    return (
      <button type="button" key={key} onClick={(e) => { 
        console.log('emojiClickStarted', { selectedMessageId: msg?.id, selectedEmoji: emoji });
        e.stopPropagation(); 
        e.preventDefault(); 
        onReact?.(emoji); 
        setTimeout(() => onClose(), 50); 
      }}
      style={{
        background:'transparent', border:'none',
        fontSize:24,cursor:'pointer',padding:4,borderRadius:8,
        transition:'transform 0.1s', display:'flex', alignItems:'center', justifyContent:'center'
      }}
      onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.2)'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        {content}
      </button>
    );
  };

  if (allowedReactions) {
    if (allowedReactions.status === 'loading') {
      isLoading = true;
      emojisToRender = [];
    } else if (allowedReactions.ok) {
      if (allowedReactions.reactionsEnabled === false) {
        reactionsNotAllowed = true;
        emojisToRender = [];
      } else if (allowedReactions.allowAll) {
        emojisToRender = quickEmojis; 
      } else if (allowedReactions.reactions && allowedReactions.reactions.length > 0) {
        emojisToRender = allowedReactions.reactions.slice(0, 16);
      } else {
        reactionsNotAllowed = true;
        emojisToRender = [];
      }
    } else {
      // Backend returned ok: false, use fallback
      isFallback = true;
      fallbackReason = allowedReactions.error || 'unknown';
      emojisToRender = ['👍', '❤️'];
    }
  } else {
    // If undefined, maybe it hasn't started loading yet, or is loading.
    isLoading = true;
    emojisToRender = [];
  }

  return (
    <div ref={ref} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} style={{
      position:'fixed',left:ax,top:ay,zIndex:9999,
      background:'#1a0b2e',border:'1px solid rgba(124,58,237,.2)',
      borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
      display:'flex',flexDirection:'column',padding:expandedPickerOpen ? 0 : '6px 0',
      minWidth: expandedPickerOpen ? 300 : 180,
      height: expandedPickerOpen ? 350 : 'auto'
    }}>
      {expandedPickerOpen ? (
        <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
          <div style={{padding:'8px', borderBottom:'1px solid rgba(124,58,237,.2)', display:'flex', gap:8, alignItems:'center'}}>
            <button onClick={() => setExpandedPickerOpen(false)} style={{background:'transparent', border:'none', color:'#a78bfa', cursor:'pointer', fontSize:16}}>◀</button>
            <input 
              type="text" 
              placeholder="Search Emojis" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{flex:1, background:'rgba(255,255,255,0.05)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:16, outline:'none', fontSize:14}}
            />
          </div>
          <div style={{flex:1, overflowY:'auto', padding:'8px'}}>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4}}>
              {filteredEmojis.map(renderEmojiButton)}
            </div>
          </div>
        </div>
      ) : (
        <>
          {isLoading ? (
            <div style={{padding:'8px 12px', color:'#a78bfa', fontSize:13, textAlign:'center'}}>
              Loading reactions...
            </div>
          ) : (!reactionsNotAllowed && emojisToRender.length > 0) ? (
            <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} style={{display:'flex', gap:4, padding:'8px 12px', borderBottom:'1px solid rgba(124,58,237,.2)', flexWrap:'wrap', justifyContent:'center', marginBottom:4}}>
              {isFallback && <div style={{width:'100%', fontSize:10, color:'#6b4d94', textAlign:'center', marginBottom:4}}>Using fallback reactions ({fallbackReason})</div>}
              {emojisToRender.map(renderEmojiButton)}
              
              {/* Expand button */}
              {fullEmojis.length > emojisToRender.length && (
                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedPickerOpen(true); }}
                style={{
                  background:'rgba(255,255,255,0.1)', border:'none', color:'#fff',
                  fontSize:14,cursor:'pointer',padding:'4px 8px',borderRadius:8,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  marginLeft: 'auto'
                }}>
                  ⌄
                </button>
              )}
            </div>
          ) : (
            reactionsNotAllowed && <div style={{padding:'8px 12px', fontSize:12, color:'#a78bfa', textAlign:'center', borderBottom:'1px solid rgba(124,58,237,.2)'}}>Reactions not allowed</div>
          )}
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
        </>
      )}
    </div>
  )
}



// ── AI Suggest Panel ──
function AISuggestPanel({text,suggestions,analysis,alternative,messages,loading,onUse,onUseAlt,onUseAll,onRegenerate,onClose,hasResearch,aiInstruction,setAiInstruction,aiError}) {
  const [editIdx,setEditIdx] = useState(null)
  const [edited,setEdited]   = useState({})

  if(!text && !loading && (!suggestions || suggestions.length === 0) && !aiError && !aiInstruction) return null

  // Support both new suggestions array and old text/alternative format
  let msgs = []
  if (suggestions && suggestions.length > 0) {
    msgs = suggestions
  } else {
    msgs = (messages && messages.length > 0) ? messages.map(m => ({ text: m.text, label: 'MSG' })) : [
      ...(text ? [{text, label: 'SUGGESTION 1'}] : []),
      ...(alternative ? [{text:alternative, label: 'SUGGESTION 2'}] : [])
    ]
  }

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

      {/* Command Bar */}
      <div style={{padding:"8px 12px", borderBottom:"1px solid rgba(124,58,237,.15)", display:"flex", flexDirection:"column", gap:8}}>
        <div style={{display:"flex", gap:8}}>
          <input 
            type="text" 
            placeholder="Tell AI what you want to reply, e.g. offer commission, ask budget, mention CMC..."
            value={aiInstruction||""}
            onChange={(e)=>{setAiInstruction&&setAiInstruction(e.target.value);}}
            onPaste={handlePaste}
            onKeyDown={(e)=>{allowShortcuts(e); if(e.key==='Enter'&&!loading) onRegenerate()}}
            style={{flex:1, background:"rgba(0,0,0,.2)", border:"1px solid rgba(124,58,237,.3)", borderRadius:6, padding:"6px 10px", color:"#f0e6ff", fontSize:13, outline:"none"}}
          />
          <button onClick={onRegenerate} disabled={loading} style={{background:"#7c3aed", color:"#fff", border:"none", borderRadius:6, padding:"0 12px", fontSize:13, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.5:1}}>
            {loading ? "..." : "Generate"}
          </button>
        </div>
        
        {/* Quick Command Chips */}
        <div style={{display:"flex", gap:6, overflowX:"auto", paddingBottom:2}} className="no-scrollbar">
          {["Offer commission", "Mention CMC News", "Ask budget", "Ask timeline", "Softer", "More direct", "Don't sell yet", "Follow up"].map(chip => (
            <button key={chip} 
              onClick={()=>{
                 const current = aiInstruction || "";
                 const sep = current && !current.endsWith(" ") ? ", " : "";
                 setAiInstruction && setAiInstruction(current + sep + chip);
              }}
              style={{background:"rgba(124,58,237,.15)", border:"1px solid rgba(124,58,237,.3)", borderRadius:12, padding:"3px 8px", color:"#c4a8e8", fontSize:11, whiteSpace:"nowrap", cursor:"pointer", flexShrink:0}}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {aiError && (
        <div style={{padding:"16px", background:"rgba(229,57,53,.1)", display:"flex", flexDirection:"column", alignItems:"center", gap:12}}>
          <div style={{color:"#f87171", fontSize:13, fontWeight:600, textAlign:"center"}}>{aiError}</div>
          <button onClick={onRegenerate} disabled={loading} style={{background:"#ef4444", color:"#fff", border:"none", borderRadius:6, padding:"6px 16px", fontSize:13, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.5:1}}>
            {loading ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}

      {/* Reply Options */}
      {!aiError && (loading ? (
        <div style={{padding:"12px 14px",display:"flex",gap:8,alignItems:"center",color:"#9b7ec8",fontSize:13}}>
          <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span>
          Generating{hasResearch?' & researching':''} options...
        </div>
      ) : (
        <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
          {msgs.map((msg,i) => (
            <div key={i} style={{background:"rgba(124,58,237,.1)",borderRadius:10,
              border:"1px solid rgba(124,58,237,.2)",overflow:"hidden"}}>
              <div style={{padding:"3px 10px 0",display:"flex",alignItems:"center",
                justifyContent:"space-between"}}>
                <span style={{fontSize:10,color:"#7c3aed",fontWeight:700,letterSpacing:.5,textTransform:"uppercase"}}>
                  {msg.label || `OPTION ${i+1}`}
                </span>
                <button onClick={()=>setEditIdx(editIdx===i?null:i)}
                  style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:11}}>
                  {editIdx===i?'done':'edit'}
                </button>
              </div>
              {editIdx===i ? (
                <textarea value={getMsg(i)}
                  onChange={e=>setEdited(p=>({...p,[i]:e.target.value}))}
                  onPaste={handlePaste}
                  onKeyDown={allowShortcuts}
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
            <button onClick={onRegenerate}
              style={{padding:"6px 12px",background:"transparent",color:"#6b7280",
                border:"1px solid #374151",borderRadius:8,cursor:"pointer",fontSize:11}}>
              ↻ Regenerate
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}


// ── Link Preview ──
function LinkPreview({url}) {
  const [meta,setMeta] = useState(null)
  const [failed,setFailed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(()=>{
    if(!isVisible || meta||failed||!url) return
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
  if(!meta||failed) return <div ref={ref} />
  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{display:"block",textDecoration:"none",marginTop:6}}>
      <div ref={ref} style={{background:"rgba(0,0,0,.2)",borderRadius:8,overflow:"hidden",
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

function ChatPhoto({msg, chatId, authToken, onImageClick, thumb}) {
  const msgId = msg.id
  const [retryCnt, setRetryCnt] = useState(0)
  const thumbKey = thumb !== undefined ? `_thumb_${thumb}` : ''
  const [status, setStatus] = useState(blobCache.has(msgId + thumbKey) ? 'loaded' : 'pending')
  const [imgSrc, setImgSrc] = useState(msg.photoUrl || msg.mediaUrl || blobCache.get(msgId + thumbKey) || '')
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '400px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible || (imgSrc && status === 'loaded')) return
    
    let isMounted = true
    let objectUrl = ''

    const fetchMedia = async () => {
      setStatus('loading')
      try {
        const url = `/api/chat/media/${chatId}/${msgId}?token=${authToken}&r=${retryCnt}${thumb !== undefined ? '&thumb=' + thumb : ''}`
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
        blobCache.set(msgId + thumbKey, objectUrl)
        
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
  }, [msgId, chatId, authToken, retryCnt, isVisible])

  return (
    <div ref={ref} style={{position:'relative',marginBottom:4,minHeight:(status==='loaded'||status==='pending')?0:80,background:(status==='loading'||status==='pending')?'rgba(124,58,237,.1)':'transparent',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',maxWidth:520}}>
      {(status==='loading' || status==='pending') && (
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
             onClick={()=>{
                blobCache.delete(msgId);
                setImgSrc('');
                setRetryCnt(c=>c+1);
                setStatus('pending');
             }}>
          📷 Tap to retry
        </div>
      )}
    </div>
  )
}

const isPhotoMsg = (m) => !!(m.isPhoto || m.photo || m.image || m.media?.type === 'photo' || m.attachments?.some?.(a => a.type === 'photo' || a.type === 'image'));
const isVideoMsg = (m) => !!(m.isVideo || m.video || m.media?.type === 'video' || m.attachments?.some?.(a => a.type === 'video'));
const isDocMsg = (m) => !!(m.isDoc || m.document || m.file || m.media?.type === 'document' || m.media?.type === 'file' || m.attachments?.some?.(a => a.type === 'document' || a.type === 'file'));
const isGifMsg = (m) => !!(m.isGif || m.gif || m.media?.type === 'gif' || m.attachments?.some?.(a => a.type === 'gif'));
const isLinkMsg = (m) => !!(m.url || m.links?.length > 0 || m.entities?.some?.(e => e.type === 'url' || e.className === 'MessageEntityTextUrl' || e.className === 'MessageEntityUrl') || (m.text && /(https?:\/\/[^\s]+)/.test(m.text)));

const removeDiacritics = (str) => {
  if (!str) return "";
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

function SharedMediaModal({ initialTab, msgs, data, onClose, token, setLightbox, jumpToMessage, chats }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'photos');

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const tabs = [
    { id: 'photos', label: 'Photos' },
    { id: 'videos', label: 'Videos' },
    { id: 'files', label: 'Files' },
    { id: 'links', label: 'Links' },
    { id: 'gifs', label: 'GIFs' },
    { id: 'groups', label: 'Groups' }
  ];

  const filtered = useMemo(() => {
    if (!msgs || !Array.isArray(msgs)) return [];
    return msgs.filter(m => {
      const currentChat = chats?.find(c => c.id === data?.chatId);
      const isGroupChat = currentChat?.isGroup || currentChat?.isChannel;
      const isProfileOfGroup = data?.id?.toString() === data?.chatId?.toString();
      
      if (isGroupChat && !isProfileOfGroup && m.senderId && m.senderId.toString() !== data?.id?.toString()) return false;
      
      if (activeTab === 'photos' && isPhotoMsg(m)) return true;
      if (activeTab === 'videos' && isVideoMsg(m)) return true;
      if (activeTab === 'files' && isDocMsg(m)) return true;
      if (activeTab === 'links' && isLinkMsg(m)) return true;
      if (activeTab === 'gifs' && isGifMsg(m)) return true;
      return false;
    });
  }, [msgs, activeTab, data?.id, data?.chatId, chats]);

  return (
    <div style={{position:'fixed',inset:0,background:'#120929',zIndex:10000,display:'flex',flexDirection:'column'}}
         onClick={(e) => { if(e.target===e.currentTarget) onClose() }}>
      
      {/* Header with Tabs */}
      <div style={{background:'#1a103c',display:'flex',flexDirection:'column',borderBottom:'1px solid rgba(124,58,237,.3)'}}>
        <div style={{padding:'16px 24px',display:'flex',alignItems:'center',gap:16}}>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:24}}>←</button>
          <div style={{fontSize:18,fontWeight:600,color:'#fff'}}>Shared Media</div>
          <div style={{marginLeft:'auto',color:'#9b7ec8',fontSize:14}}>{filtered.length > 0 ? `${filtered.length} items` : ''}</div>
        </div>
        <div style={{display:'flex',overflowX:'auto',padding:'0 16px',gap:24,scrollbarWidth:'none'}}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setActiveTab(t.id)} style={{padding:'12px 0',color:activeTab===t.id?'#fff':'#9b7ec8',fontWeight:activeTab===t.id?600:400,borderBottom:activeTab===t.id?'2px solid #7c3aed':'2px solid transparent',cursor:'pointer',textTransform:'capitalize',whiteSpace:'nowrap'}}>
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflowY:'auto',padding:24,display:(activeTab==='photos'||activeTab==='videos'||activeTab==='gifs')?'grid':'flex',flexDirection:'column',gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))',gap:8}}>
        
        {activeTab === 'groups' && (
          <div style={{color:'#9b7ec8',textAlign:'center',marginTop:40,gridColumn:'1 / -1'}}>Not loaded. Full history API pending.</div>
        )}

        {filtered.length === 0 && activeTab !== 'groups' && (
          <div style={{color:'#9b7ec8',textAlign:'center',marginTop:40,gridColumn:'1 / -1',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
            <div>No {activeTab} found in loaded history.</div>
            <button style={{background:'transparent',border:'1px solid rgba(124,58,237,.5)',color:'#9b7ec8',padding:'6px 12px',borderRadius:6,cursor:'pointer',fontSize:13}} onClick={()=>alert('TODO: Fetch full history API')}>Load More</button>
          </div>
        )}
        
        {filtered.map(m => {
          if (activeTab === 'photos' || activeTab === 'videos') {
            if (activeTab === 'photos' && isPhotoMsg(m)) {
              return (
                <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',position:'relative'}}>
                  <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={(src)=>setLightbox(src)}/>
                  <div onClick={() => jumpToMessage(m.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.5)',color:'#fff',padding:'2px 6px',borderRadius:4,fontSize:10,cursor:'pointer'}}>Show msg</div>
                </div>
              )
            }
            if (activeTab === 'videos' && isVideoMsg(m)) {
              return (
                <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                  <video style={{width:'100%',height:'100%',objectFit:'cover'}} src={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`}/>
                  <div style={{position:'absolute',fontSize:24,color:'white',pointerEvents:'none'}}>▶</div>
                  <div onClick={() => jumpToMessage(m.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.5)',color:'#fff',padding:'2px 6px',borderRadius:4,fontSize:10,cursor:'pointer',pointerEvents:'auto'}}>Show msg</div>
                </div>
              )
            }
          }
          if (activeTab === 'gifs') {
            return (
              <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',position:'relative'}}>
                <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={(src)=>setLightbox(src)}/>
                <div style={{position:'absolute',top:4,left:4,background:'rgba(124,58,237,.8)',color:'#fff',padding:'2px 4px',borderRadius:4,fontSize:10,fontWeight:'bold',pointerEvents:'none'}}>GIF</div>
                <div onClick={() => jumpToMessage(m.id)} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,.5)',color:'#fff',padding:'2px 6px',borderRadius:4,fontSize:10,cursor:'pointer',pointerEvents:'auto'}}>Show msg</div>
              </div>
            )
          }
          if (activeTab === 'files') {
            return (
              <div key={m.id} style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:24,cursor:'pointer'}} onClick={() => jumpToMessage(m.id)}>📄</div>
                <div style={{flex:1,cursor:'pointer'}} onClick={() => jumpToMessage(m.id)}>
                  <div style={{color:'#fff',fontSize:14,fontWeight:600}}>{m.fileName || 'Document'}</div>
                  <div style={{color:'#9b7ec8',fontSize:12}}>{new Date(m.date*1000).toLocaleString()} • {m.fileSize ? (m.fileSize/1024).toFixed(1)+'KB' : ''}</div>
                </div>
                <a href={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`} download target="_blank" style={{color:'#7c3aed',textDecoration:'none',fontSize:14}}>Download</a>
              </div>
            )
          }
          if (activeTab === 'links') {
            const matches = m.text.match(/(https?:\/\/[^\s]+)/g) || []
            return matches.map((link, idx) => (
              <div key={`${m.id}-${idx}`} style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:24,cursor:'pointer'}} onClick={() => jumpToMessage(m.id)}>🔗</div>
                <div style={{flex:1,overflow:'hidden',cursor:'pointer'}} onClick={() => jumpToMessage(m.id)}>
                  <div style={{color:'#fff',fontSize:14,fontWeight:600,textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{link}</div>
                  <div style={{color:'#9b7ec8',fontSize:12,textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{m.text}</div>
                </div>
                <a href={link} target="_blank" rel="noreferrer" style={{color:'#7c3aed',textDecoration:'none',fontSize:14}}>Open</a>
              </div>
            ))
          }
          return null
        })}
      </div>
    </div>
  )
}

function UserProfileModal({ data, onClose, token, chats, setSel, inputRef, msgs, messagesLoaded, hasMore, onOpenMedia, setLightbox }) {
  const [status, setStatus] = useState(null)
  const [showMore, setShowMore] = useState(false)
  const [fullProfile, setFullProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('media')
  
  const isTopicInfo = data?.isTopic;
  const isGroupProfile = !isTopicInfo && data?.chatId && data?.id && data.chatId.toString() !== data.id.toString();

  const handleMediaClick = (m) => {
    if (m.isPhoto || m.isVideo) {
      if (setLightbox) setLightbox(`/api/chat/media/${data.chatId}/${m.id}?t=${token}`);
    } else if (m.isDoc) {
      window.open(`/api/chat/media/${data.chatId}/${m.id}?t=${token}`, '_blank');
    }
  };
  
  useEffect(() => {
    if (!data?.chatId) return
    let isMounted = true
    fetch(`/api/chat/profile/${data.chatId}`, { headers: {'x-auth-token': token} })
      .then(async r => {
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if(isMounted && d.ok && d.full) setFullProfile(d.full) })
      .catch(e => console.error(e))
    return () => { isMounted = false }
  }, [data?.chatId, token])

  useEffect(() => {
    if (!data?.id) return
    let isMounted = true
    fetch(`/api/chat/status/${data.id}`, { headers: {'x-auth-token': token} })
      .then(async r => {
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { if(isMounted) setStatus(d.status) })
      .catch(e => { if(isMounted) setStatus('') })
    return () => { isMounted = false }
  }, [data?.id, token])

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const [tabData, setTabData] = useState({ media: [], files: [], links: [], groups: [] });
  const [tabLoading, setTabLoading] = useState({ media: false, files: false, links: false, groups: false });
  const [tabHasMore, setTabHasMore] = useState({ media: true, files: true, links: true, groups: true });
  const [tabOffsetId, setTabOffsetId] = useState({ media: 0, files: 0, links: 0, groups: 0 });
  const [tabError, setTabError] = useState({ media: null, files: null, links: null, groups: null });

  useEffect(() => {
    if (!data) return;
    const keyBase = `${data.chatId}_${data.topicId||''}_${data.id}`;
    
    const initialTabData = { media: [], files: [], links: [], groups: [] };
    const initialTabHasMore = { media: true, files: true, links: true, groups: true };
    const initialTabOffsetId = { media: 0, files: 0, links: 0, groups: 0 };
    const initialTabError = { media: null, files: null, links: null, groups: null };

    ['media', 'files', 'links', 'groups'].forEach(t => {
      const c = sharedMediaCache[`${keyBase}_${t}`];
      if (c) {
        initialTabData[t] = c.items;
        initialTabHasMore[t] = c.hasMore;
        initialTabOffsetId[t] = c.nextCursor;
        initialTabError[t] = c.error;
      }
    });

    setTabData(initialTabData);
    setTabHasMore(initialTabHasMore);
    setTabOffsetId(initialTabOffsetId);
    setTabError(initialTabError);
  }, [data?.id, data?.chatId, data?.topicId]);

  useEffect(() => {
    if (!data?.chatId && activeTab !== 'groups') return;
    if (!data?.id && activeTab === 'groups') return;
    if (tabData[activeTab].length === 0 && tabHasMore[activeTab] && !tabLoading[activeTab]) {
      loadMore(activeTab);
    }
  }, [activeTab, data?.chatId, data?.id, tabData]);

  const loadMore = (tab) => {
    if (tabLoading[tab] || !tabHasMore[tab]) return;
    setTabLoading(prev => ({...prev, [tab]: true}));
    
    let isMounted = true;

    if (tab === 'groups') {
      const accessHashQuery = data.accessHash ? `?accessHash=${data.accessHash}` : '';
      const usernameQuery = data.username ? (data.accessHash ? `&username=${data.username}` : `?username=${data.username}`) : '';
      
      fetch(`/api/chat/common_groups/${data.id}${accessHashQuery}${usernameQuery}`, { headers: {'x-auth-token': token} })
        .then(async r => {
          const ct = r.headers.get('content-type');
          if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
          if (!r.ok) {
            const err = await r.json().catch(()=>({}));
            throw new Error(err.error || `HTTP ${r.status}`);
          }
          return r.json()
        })
        .then(d => {
          if (isMounted && d.ok) {
             setTabData(prev => {
               const updated = d.groups || [];
               sharedMediaCache[`${data.chatId}_${data.topicId||''}_${data.id}_groups`] = { items: updated, hasMore: false, nextCursor: 0, error: null };
               return {...prev, groups: updated};
             });
             setTabHasMore(prev => ({...prev, groups: false}));
             setTabError(prev => ({...prev, groups: null}));
          }
        })
        .catch(e => {
          console.error(e);
          if (isMounted) setTabError(prev => ({...prev, groups: e.message}));
        })
        .finally(() => {
          if (isMounted) setTabLoading(prev => ({...prev, groups: false}));
        });
      return () => { isMounted = false; };
    }

    if (!data?.chatId) {
      setTabLoading(prev => ({...prev, [tab]: false}));
      return;
    }

    const fromUserQuery = isGroupProfile ? `&userId=${data.id}` : '';
    const accessHashQuery = (isGroupProfile && data.accessHash) ? `&accessHash=${data.accessHash}` : '';
    const topicIdQuery = isTopicInfo ? `&topicId=${data.topicId}` : '';
    
    fetch(`/api/telegram/shared-media?chatId=${data.chatId}&type=${tab}${fromUserQuery}${accessHashQuery}${topicIdQuery}&cursor=${tabOffsetId[tab]}&limit=30`, { headers: {'x-auth-token': token} })
      .then(async r => {
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (isMounted && d.ok) {
           const items = d.items || d.media || [];
           const nextCursor = d.nextCursor || d.nextOffsetId || 0;
           setTabData(prev => {
             // Deduplicate by id just in case
             const existingIds = new Set(prev[tab].map(m => m.id));
             const newItems = items.filter(m => !existingIds.has(m.id));
             const updated = [...prev[tab], ...newItems];
             sharedMediaCache[`${data.chatId}_${data.topicId||''}_${data.id}_${tab}`] = {
               items: updated,
               hasMore: d.hasMore,
               nextCursor: nextCursor,
               error: null
             };
             return {...prev, [tab]: updated};
           });
           setTabHasMore(prev => ({...prev, [tab]: d.hasMore}));
           setTabOffsetId(prev => ({...prev, [tab]: nextCursor}));
        } else if (isMounted && !d.ok) {
           setTabError(prev => ({...prev, [tab]: d.error || 'Failed to fetch'}));
        }
      })
      .catch(e => {
        console.error(e);
        if (isMounted) {
            setTabError(prev => {
                sharedMediaCache[`${data.chatId}_${data.topicId||''}_${data.id}_${tab}`] = { 
                    items: tabData[tab], hasMore: tabHasMore[tab], nextCursor: tabOffsetId[tab], error: e.message 
                };
                return {...prev, [tab]: e.message};
            });
        }
      })
      .finally(() => {
        if (isMounted) setTabLoading(prev => ({...prev, [tab]: false}));
      });
      
    return () => { isMounted = false; };
  };

  const getSenderId = (m) => m.senderId || m.fromId || m.userId || m.peerId || m.author?.id || m.sender?.id || m.from?.id;

  const groupMediaMsgs = useMemo(() => {
    if (!isGroupProfile || !msgs) return [];
    return msgs.filter(m => (getSenderId(m) || '').toString() === data?.id?.toString());
  }, [msgs, isGroupProfile, data?.id]);

  const fallbackData = useMemo(() => ({
    media: groupMediaMsgs.filter(m => m.hasMedia && (m.isPhoto || m.isVideo)),
    files: groupMediaMsgs.filter(m => m.isDoc && !m.isVideo),
    links: groupMediaMsgs.filter(m => m.webpageUrl),
    groups: []
  }), [groupMediaMsgs]);

  if (!data) return null

  const handleMessage = () => {
    const existing = chats.find(c => c.isUser && c.id === data.id)
    if (existing) {
      setSel(existing)
      onClose()
      setTimeout(() => inputRef?.current?.focus(), 100)
    } else {
      alert('Cannot open DM, user info missing / backend API pending')
    }
  }

  const bio = fullProfile?.fullUser?.about || fullProfile?.fullChat?.about || data.bio || data.about;
  const businessHoursObj = fullProfile?.fullUser?.businessWorkHours;
  const businessHours = businessHoursObj ? `${businessHoursObj.timezoneId} (${businessHoursObj.openNow ? 'Open Now' : 'Closed'})` : null;
  const location = fullProfile?.fullUser?.businessLocation?.address;

  const isFallback = isGroupProfile && tabError[activeTab] === 'SENDER_NOT_FOUND';

  const tabs = isTopicInfo ? [
    { id: 'media', label: `Media`, count: tabData.media.length, hasMore: tabHasMore.media },
    { id: 'files', label: `Files`, count: tabData.files.length, hasMore: tabHasMore.files },
    { id: 'links', label: `Links`, count: tabData.links.length, hasMore: tabHasMore.links }
  ] : [
    { id: 'media', label: `Media`, count: isFallback ? fallbackData.media.length : tabData.media.length, hasMore: !isFallback && tabHasMore.media },
    { id: 'files', label: `Files`, count: isFallback ? fallbackData.files.length : tabData.files.length, hasMore: !isFallback && tabHasMore.files },
    { id: 'links', label: `Links`, count: isFallback ? fallbackData.links.length : tabData.links.length, hasMore: !isFallback && tabHasMore.links },
    { id: 'groups', label: `Groups`, count: tabData.groups.length, hasMore: tabHasMore.groups }
  ];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9999,display:'flex',justifyContent:'flex-end'}}
         onClick={(e) => { if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'#1a103c',width:400,height:'100%',display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,.5)',borderLeft:'1px solid rgba(124,58,237,.2)',animation:'slideInRight 0.2s ease-out',color:'#fff'}}>
        
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid rgba(124,58,237,.2)'}}>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <button onClick={onClose} style={{background:'none',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:20}}>✕</button>
            <div style={{fontSize:16,fontWeight:600}}>{isTopicInfo ? 'Topic Info' : 'User Info'}</div>
          </div>
          <button style={{background:'none',border:'none',color:'#9b7ec8',cursor:'not-allowed',fontSize:18}}>✎</button>
        </div>

        <div style={{flex:1, overflowY:'auto'}}>
          {/* Top Profile */}
          <div style={{padding:'20px',display:'flex',gap:16,alignItems:'center'}}>
            {isTopicInfo ? (
              <div style={{width: 72, height: 72, borderRadius: '50%', background: '#2b5278', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 600}}>
                #
              </div>
            ) : (
              <Avatar name={data.name||'User'} chatId={data.id} username={data.username} accessHash={data.accessHash} size={72}/>
            )}
            <div style={{minWidth: 0, flex: 1}}>
              <div style={{fontSize:18,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {isTopicInfo ? data.topicTitle : (data.name||'Unknown User')}
                </span>
                {!isTopicInfo && fullProfile?.fullUser?.verified && <span style={{color:'#0088cc',fontSize:14,flexShrink:0}}>✓</span>}
              </div>
              <div style={{fontSize:13,color:status==='online'?'#4caf50':'#9b7ec8',marginTop:6,display:'flex',alignItems:'center',gap:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {isTopicInfo ? (
                  <span style={{background: 'rgba(124,58,237,.2)', color: '#b395e3', padding: '2px 8px', borderRadius: 12, fontSize: 12}}>
                    in {data.name}
                  </span>
                ) : (status ? status : 'last seen recently')}
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          {!isTopicInfo && (
          <div style={{display:'flex', justifyContent:'space-around', padding:'12px 20px', borderBottom:'1px solid rgba(124,58,237,.2)'}}>
            <div onClick={handleMessage} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#7c3aed', gap:4}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>💬</div>
              <span style={{fontSize:12}}>Message</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'not-allowed', color:'#9b7ec8', gap:4, opacity: 0.4}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔕</div>
              <span style={{fontSize:12}}>Mute</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'not-allowed', color:'#9b7ec8', gap:4, opacity: 0.4}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>📞</div>
              <span style={{fontSize:12}}>Call</span>
            </div>
            <div style={{position:'relative'}}>
              <div onClick={()=>setShowMore(!showMore)} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#7c3aed', gap:4}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⋯</div>
                <span style={{fontSize:12}}>More</span>
              </div>
              {showMore && (
                <div style={{position:'absolute',top:'100%',right:0,marginTop:8,background:'#2a1b54',borderRadius:8,padding:8,minWidth:160,boxShadow:'0 4px 12px rgba(0,0,0,.5)',zIndex:10}}>
                  <div onClick={()=>{navigator.clipboard.writeText(data.id);setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy User ID</div>
                  {data.username && <div onClick={()=>{navigator.clipboard.writeText('@'+data.username);setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy Username</div>}
                  <div style={{padding:'8px 12px',cursor:'not-allowed',fontSize:13,color:'#fff',borderRadius:4,opacity:0.4}}>Add to Contacts</div>
                </div>
              )}
            </div>
          </div>
          )}

          <div style={{height: 8, background: '#0d0618', width: '100%', flexShrink:0}} />

          {/* Info Card */}
          {!isTopicInfo && (
            <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:16}}>
              {data.phone && <div><div style={{fontSize:15}}>{data.phone}</div><div style={{fontSize:13,color:'#9b7ec8'}}>Phone</div></div>}
              {data.username && <div><div style={{fontSize:15}}>@{data.username}</div><div style={{fontSize:13,color:'#9b7ec8'}}>Username</div></div>}
              {bio && <div><div style={{fontSize:15, lineHeight:1.4, wordBreak:'break-word'}}>{bio}</div><div style={{fontSize:13,color:'#9b7ec8'}}>Bio</div></div>}
              {businessHours && <div><div style={{fontSize:15,color:'#4caf50'}}>{businessHours}</div><div style={{fontSize:13,color:'#9b7ec8'}}>Business Hours</div></div>}
              {location && <div><div style={{fontSize:15, lineHeight:1.4}}>{location}</div><div style={{fontSize:13,color:'#9b7ec8'}}>Location</div></div>}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:15}}>Notifications</span>
                <div style={{width:36,height:20,background:'#7c3aed',borderRadius:10,position:'relative'}}><div style={{width:16,height:16,background:'#fff',borderRadius:'50%',position:'absolute',top:2,right:2}}/></div>
              </div>
            </div>
          )}

          {!isTopicInfo && <div style={{height: 8, background: '#0d0618', width: '100%', flexShrink:0}} />}

          {isTopicInfo && (
            <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <div style={{fontSize:15,color:'#7dd3fc',wordBreak:'break-all'}}>https://t.me/c/{data.chatId?.toString()?.replace('-100','')}/{data.topicId}</div>
                  <div style={{fontSize:13,color:'#9b7ec8'}}>Link</div>
                </div>
                <div style={{display:'flex',gap:12,color:'#9b7ec8',fontSize:18}}>
                  <div style={{cursor:'pointer'}} onClick={()=>{navigator.clipboard.writeText(`https://t.me/c/${data.chatId?.toString()?.replace('-100','')}/${data.topicId}`)}}>📋</div>
                  <div style={{cursor:'pointer'}}>▣</div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:15}}>Notifications</span>
                <div style={{width:36,height:20,background:'#7c3aed',borderRadius:10,position:'relative'}}><div style={{width:16,height:16,background:'#fff',borderRadius:'50%',position:'absolute',top:2,right:2}}/></div>
              </div>
            </div>
          )}

          {isTopicInfo && <div style={{height: 8, background: '#0d0618', width: '100%', flexShrink:0}} />}

          {/* Tab Bar */}
          <div style={{display:'flex',padding:'0 20px',borderBottom:'1px solid rgba(124,58,237,.2)',overflowX:'auto',scrollbarWidth:'none'}}>
            {tabs.map(t => (
              <div key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:'16px 12px',cursor:'pointer',color:activeTab===t.id?'#7c3aed':'#9b7ec8',borderBottom:activeTab===t.id?'2px solid #7c3aed':'2px solid transparent',fontWeight:activeTab===t.id?600:400,whiteSpace:'nowrap',transition:'0.2s'}}>
                {t.label} {t.count > 0 && <span style={{fontSize:12, background:activeTab===t.id?'rgba(124,58,237,.2)':'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:10, marginLeft:4}}>{t.count}</span>}
              </div>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{padding:20}}>
            {!isGroupProfile && activeTab === 'groups' && tabLoading.groups && tabData.groups.length === 0 && (
              <div style={{padding:20,textAlign:'center',color:'#9b7ec8',fontSize:13}}>Loading common groups...</div>
            )}
            {!isGroupProfile && activeTab === 'groups' && !tabLoading.groups && tabData.groups.length === 0 && !tabError.groups && (
              <div style={{padding:20,textAlign:'center',color:'#9b7ec8',fontSize:13}}>No groups in common</div>
            )}
            
            {tabError[activeTab] && !isFallback && (
              <div style={{padding:20,textAlign:'center',color:'#e53935',fontSize:13}}>Error: {tabError[activeTab]}</div>
            )}

            {isFallback && activeTab !== 'groups' && (
              <div style={{padding:12,textAlign:'center',background:'rgba(229,57,53,.1)',color:'#e53935',fontSize:12,margin:'0 16px',borderRadius:8}}>
                Backend full history search unavailable.<br/>Loaded group messages only.
              </div>
            )}

            {activeTab === 'media' && (
              <div style={{display:'flex', flexDirection:'column', gap:16}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:4}}>
                  {(isFallback ? fallbackData.media : tabData.media).map(m => (
                    <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',cursor:'pointer',position:'relative'}} onClick={()=>handleMediaClick(m)}>
                      <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={()=>{}} thumb={1} />
                      {m.isVideo && <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'#fff',fontSize:24,textShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>▶</div>}
                    </div>
                  ))}
                </div>
                {tabLoading.media ? (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>Loading media...</div>
                ) : !isFallback && tabHasMore.media ? (
                  <div onClick={()=>loadMore('media')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>Load More</div>
                ) : (isFallback ? fallbackData.media.length === 0 : tabData.media.length === 0) && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No media found</div>
                )}
              </div>
            )}
            {activeTab === 'files' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {(isFallback ? fallbackData.files : tabData.files).map(m => (
                  <div key={m.id} onClick={()=>handleMediaClick(m)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:'rgba(124,58,237,.1)',padding:12,borderRadius:8}}>
                    <div style={{width:40,height:40,borderRadius:8,background:'#7c3aed',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📄</div>
                    <div style={{flex:1,overflow:'hidden'}}>
                      <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.fileName || 'Document'}</div>
                      <div style={{fontSize:12,color:'#9b7ec8'}}>{new Date(m.date*1000).toLocaleString()} • {m.fileSize ? (m.fileSize/1024).toFixed(1)+' KB' : ''}</div>
                    </div>
                  </div>
                ))}
                {tabLoading.files ? (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>Loading files...</div>
                ) : !isFallback && tabHasMore.files ? (
                  <div onClick={()=>loadMore('files')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>Load More</div>
                ) : (isFallback ? fallbackData.files.length === 0 : tabData.files.length === 0) && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No files found</div>
                )}
              </div>
            )}
            {activeTab === 'links' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {(isFallback ? fallbackData.links : tabData.links).map((m, i) => {
                  const urlMatch = m.webpageUrl || (m.text ? m.text.match(/(https?:\/\/[^\s]+)/) : null);
                  const finalUrl = typeof urlMatch === 'string' ? urlMatch : (urlMatch ? urlMatch[0] : '#');
                  
                  if (!finalUrl || finalUrl === '#') return null;

                  return (
                    <div key={i} onClick={()=>window.open(finalUrl, '_blank')} style={{display:'flex',gap:12,background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,alignItems:'center',cursor:'pointer'}}>
                      <div style={{width:40,height:40,borderRadius:8,background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔗</div>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#7dd3fc'}}>{m.webpageTitle || m.webpageUrl || 'Link'}</div>
                        <div style={{fontSize:12,color:'#9b7ec8'}}>{new Date(m.date*1000).toLocaleString()}</div>
                      </div>
                    </div>
                  )
                })}
                {tabLoading.links ? (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>Loading links...</div>
                ) : !isFallback && tabHasMore.links ? (
                  <div onClick={()=>loadMore('links')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>Load More</div>
                ) : (isFallback ? fallbackData.links.length === 0 : tabData.links.length === 0) && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No links found</div>
                )}
              </div>
            )}
            {activeTab === 'groups' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {tabData.groups.map(g => (
                  <div key={g.id} onClick={() => {
                      const chat = chats.find(c => c.id.toString() === g.id.toString());
                      if (chat) {
                        setSel(chat);
                        onClose();
                        setTimeout(() => inputRef?.current?.focus(), 100);
                      } else {
                        // If chat not in local list, fallback to basic sel logic
                        setSel({ id: g.id, title: g.title, isGroup: true, username: g.username });
                        onClose();
                      }
                    }} 
                    style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,transition:'0.2s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.2)'} 
                    onMouseLeave={e=>e.currentTarget.style.background='rgba(124,58,237,.1)'}>
                    <Avatar name={g.title} chatId={g.id} username={g.username} accessHash={g.accessHash} size={40} />
                    <div style={{flex:1,overflow:'hidden'}}>
                      <div style={{fontSize:15,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#fff'}}>{g.title}</div>
                      <div style={{fontSize:13,color:'#9b7ec8'}}>{g.participantsCount} members</div>
                    </div>
                  </div>
                ))}
                {tabLoading.groups ? (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>Loading groups...</div>
                ) : tabError.groups ? (
                  <div style={{textAlign:'center',color:'#f87171',paddingTop:10}}>Unavailable ({tabError.groups})</div>
                ) : tabData.groups.length === 0 && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No groups in common</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
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

export default function CRMChat({ token, onAuthFailed }) {
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
  const [topicError,setTopicError]=useState(false)
  const [forceNormalView,setForceNormalView]=useState(false)
  const [topicSearch,setTopicSearch]=useState("")
  const [topicCtxMenu,setTopicCtxMenu]=useState(null)
  const [msgs,setMsgs]=useState([])
  const msgsCacheRef = useRef({})
  const [search,setSearch]=useState(() => localStorage.getItem('crm_search') || '')
  const [globalMatches, setGlobalMatches] = useState([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [hasSearchedGlobal, setHasSearchedGlobal] = useState(true)

  useEffect(() => {
    setGlobalMatches([])
    if (!search.trim()) {
       setHasSearchedGlobal(true)
       return
    }
    setHasSearchedGlobal(false)

    const delay = setTimeout(async () => {
      setIsGlobalSearching(true)
      try {
        const url = `/api/telegram/search?q=${encodeURIComponent(search.trim())}`
        const res = await fetch(url, { headers: { 'x-auth-token': token } })
        if (res.ok) {
          const data = await res.json()
          setGlobalMatches(data)
        }
      } catch (e) {
        console.error('Global search error', e)
      } finally {
        setIsGlobalSearching(false)
        setHasSearchedGlobal(true)
      }
    }, 600)
    return () => clearTimeout(delay)
  }, [search, token])

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
  const [pastedFile,setPastedFile]=useState(null)
  const [filePreview,setFilePreview]=useState(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const leftColScrollRef = useRef(null)
  const hasRestoredSidebarScroll = useRef(false)
  const [sending,setSending]=useState(false)
  const [loadChats,setLoadChats]=useState(true)
  const [loadMsgs,setLoadMsgs]=useState(false)
  const [messagesLoaded,setMessagesLoaded]=useState(false)
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
        } else if (isMounted) {
          setOnlineStatus('')
        }
      } catch (e) {
        console.error("status fetch error:", e)
        if (isMounted) setOnlineStatus('')
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
  const [localReadState,setLocalReadState]=useState(() => JSON.parse(localStorage.getItem('crm_read_state') || '{}'))
  useEffect(() => { localStorage.setItem('crm_read_state', JSON.stringify(localReadState)) }, [localReadState])
  const [chatFolders,setChatFolders]=useState({})   // {chatId: folderName}
  const [confirmLeave,setConfirmLeave]=useState(null) // chat to confirm leave
  const [previewChat,setPreviewChat]=useState(null)   // chat preview modal // chatIds marked as read this session
  const [showMembers,setShowMembers]=useState(false)
  const [memberSearch,setMemberSearch]=useState("")
  const [chatMembersCache, setChatMembersCache] = useState({})
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [membersError, setMembersError] = useState(null)

  const fetchMembers = useCallback(async () => {
    if (!sel || (!sel.isGroup && !sel.isChannel)) return
    setLoadingMembers(true)
    setMembersError(null)
    console.log(`[Members API] Fetching members for ${sel.id}...`)
    try {
      const res = await fetch(`/api/chat/members/${sel.id}`, { headers: { "x-auth-token": token }})
      console.log(`[Members API] URL: /api/chat/members/${sel.id}, Status: ${res.status}`)
      
      if (res.status === 401) {
        setMembersError("TOKEN_EXPIRED")
        return
      }
      if (res.status === 403) {
        setMembersError("Unable to load members due to Telegram permission limits.")
        return
      }
      
      const data = await res.json()
      if (data.ok) {
        setChatMembersCache(p => ({...p, [sel.id]: data.members}))
      } else {
        if (data.error === 'No session' || data.error === 'TG_SESSION_EXPIRED' || data.error?.includes('SESSION')) {
          setMembersError("TG_SESSION_EXPIRED")
        } else {
          setMembersError(data.error || "Failed to load members")
        }
      }
    } catch(e) {
      console.log(`[Members API] Error:`, e)
      setMembersError(e.message)
    } finally {
      setLoadingMembers(false)
    }
  }, [sel, token])

  useEffect(() => {
    if (showMembers && sel && (sel.isGroup || sel.isChannel)) {
      if (!chatMembersCache[sel.id]) {
        fetchMembers()
      } else {
        setMembersError(null)
      }
    }
  }, [showMembers, sel, fetchMembers, chatMembersCache])

  const [notifPerm,setNotifPerm]=useState(false)
  const [showTmpl,setShowTmpl]=useState(false)
  const [tmplCat,setTmplCat]=useState("all")
  const [aiText,setAiText]=useState("")
  const [aiSuggestions,setAiSuggestions]=useState([])
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiAlt, setAiAlt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiInstruction,setAiInstruction]=useState("")
  const msgsRef = useRef([])
  useEffect(()=>{ msgsRef.current = msgs },[msgs])

  const pendingReactionsRef = useRef({})
  const mergeReactions = (msgId, backendReactions) => {
    const pending = pendingReactionsRef.current[msgId]
    if (pending && Date.now() - pending.timestamp < 10000) {
      const optimisticChosen = pending.reactions.find(r => r.chosen)
      if (optimisticChosen) {
        const backendHasIt = backendReactions.find(r => r.chosen && r.emoticon === optimisticChosen.emoticon)
        if (backendHasIt) {
          // Keep pending alive to protect against stale background polling for 10s
          return backendReactions
        }
        return pending.reactions
      } else {
        const backendHasChosen = backendReactions.find(r => r.chosen)
        if (!backendHasChosen) {
          // Keep pending alive to protect against stale background polling for 10s
          return backendReactions
        }
        return pending.reactions
      }
    }
    return backendReactions
  }
  const [showProfile,setShowProfile]=useState(()=>{
    try{
      const s=localStorage.getItem('tg_show_crm')
      return s?JSON.parse(s):true
    }catch{return true}
  })
  useEffect(()=>{
    localStorage.setItem('tg_show_crm',JSON.stringify(showProfile))
  },[showProfile])
  const [stages,setStages]=useState({})
  const [tags,setTags]=useState({})
  const [activeTab,setActiveTab]=useState('messages')
  const [pinnedMsgs,setPinnedMsgs]=useState({})
  const [highlightedMsgId, setHighlightedMsgId] = useState(null)
  const [loadingPinnedMsg, setLoadingPinnedMsg] = useState(false)
  
  const [allowedReactionsCache, setAllowedReactionsCache] = useState({})
  
  const fetchAllowedReactions = useCallback(async (chatId, force = false) => {
    // If it's already fetching or successfully fetched, don't fetch unless forced
    if (!force) {
      const current = allowedReactionsCache[chatId];
      if (current && (current.status === 'loading' || current.ok)) return;
    }
    
    try {
      setAllowedReactionsCache(p => ({ ...p, [chatId]: { status: 'loading' } }));
      
      const url = `/api/telegram/available-reactions?chatId=${chatId}`;
      console.log('endpoint URL', url);
      const res = await fetch(url, { headers: { 'x-auth-token': token } });
      console.log('response status', res.status);
      const d = await res.json();
      console.log('allowedReactionsFetchStatus', d);
      console.log('source', d.source || 'fallback');
      console.log('allowAll', d.allowAll);
      console.log('reactions returned', d.reactions);
      if (!d.ok) console.log('fallback reason', d.error);
      
      setAllowedReactionsCache(p => ({ ...p, [chatId]: d }));
    } catch(e) {
      console.log('fetch available-reactions error:', e);
      setAllowedReactionsCache(p => ({ ...p, [chatId]: { ok: false, error: e.message } }));
    }
  }, [token, allowedReactionsCache]);

  useEffect(() => {
    if (sel) {
      fetchAllowedReactions(sel.id);
    }
  }, [sel, token, fetchAllowedReactions])
  
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
  const [scheduleOpen,setScheduleOpen]=useState(false)
  const [scheduleTime,setScheduleTime]=useState('')
  const [scheduledMsgs,setScheduledMsgs]=useState([])

  // Telegram UI States
  const [pinnedMessage, setPinnedMessage] = useState(null)
  const [dismissedPin, setDismissedPin] = useState(false)
  const [dismissedTranslate, setDismissedTranslate] = useState(false)

  const searchGifs = async (query) => {
    // Dummy function since searchGifs was missing
    if (!query) return setGifs([])
    setGifs([])
  }

  const sendScheduled = async () => {
    // Dummy function since sendScheduled was missing
    alert('Scheduled send is not yet implemented.')
    setScheduleOpen(false)
    setScheduleTime('')
  }
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
    if (!append && chatsRef.current.length === 0) setLoadChats(true)
    console.time('fetchChats')
    
    try {
      let url = "/api/chat/list?limit=50"
      if (append && chatsRef.current.length > 0) {
        const lastChat = chatsRef.current[chatsRef.current.length - 1]
        if (lastChat && lastChat.date) {
           url += `&offsetDate=${lastChat.date}&offsetId=${lastChat.msgId || 0}&offsetPeer=${lastChat.id}`
        }
      }
      const r = await fetch(url,{headers:{"x-auth-token":token}})
      const d = await r.json()
      if (Array.isArray(d)) {
        if (d.length < 50) setHasMoreChats(false)
        else if (!append) setHasMoreChats(true)
        
        setChats(prev => {
          let updatedData = d
          if (append) {
             const newChats = d.filter(c1 => !prev.some(c2 => c2.id === c1.id))
             updatedData = [...prev, ...newChats]
          }
          
          // Override unread with localReadState if applicable
          return updatedData.map(c => {
             const readTime = localReadState[c.id];
             if (readTime && (!c.lastMessageAt || c.lastMessageAt * 1000 <= readTime)) {
                return { ...c, unread: 0 }
             }
             return c;
          })
        })
        
        setSel(prevSel => {
           if (!prevSel && !append && d.length > 0) return d[0]
           // If selected chat exists but not in new fetch, keep it active (pagination/search handling)
           return prevSel
        })
      } else if (d && d.error === 'AUTH_FAILED') {
        if (typeof onAuthFailed === 'function') onAuthFailed()
      } else {
        // Handle server error returning non-array
        console.error("fetchChats invalid response:", d)
      }
    } catch(e) { console.error("fetchChats error:", e) }
    console.timeEnd('fetchChats')
    if (!append) setLoadChats(false)
    loadingChatsRef.current = false
  }, [token])

  useEffect(()=>{ fetchChats() }, [fetchChats])

  // Load messages when chat selected
  const prevSelId = useRef(sel?.id || null)
  const prevSelTopicId = useRef(selTopic?.id || null)
  const hasRestoredScroll = useRef(false)
  const isNearBottom = useRef(true)
  const scrollPositions = useRef(JSON.parse(localStorage.getItem('crm_scroll_positions') || '{}'))
  const saveScrollTimeout = useRef(null)

  useEffect(() => {
    if (chats.length > 0 && !hasRestoredSidebarScroll.current && leftColScrollRef.current) {
      hasRestoredSidebarScroll.current = true
      leftColScrollRef.current.scrollTop = parseInt(localStorage.getItem('crm_leftcol_scroll') || '0', 10)
    }
  }, [chats])

  const markChatAsRead = useCallback((chatId, topicId = null, maxMsgId = 0) => {
    const readKey = chatId + (topicId ? '_' + topicId : '')
    setReadChats(prev => new Set(prev).add(readKey))
    
    const now = Date.now()
    setLocalReadState(prev => ({...prev, [chatId]: now}))
    
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        // Only zero out unread if it's the main chat or we are reading the forum (simplified)
        return { ...c, unread: 0 }
      }
      return c
    }))
    
    setSel(prev => {
      if (prev && prev.id === chatId) {
        return { ...prev, unread: 0 }
      }
      return prev
    })
    
    if (topicId) {
      setSelTopic(prev => prev && prev.id === topicId ? { ...prev, unread: 0 } : prev)
    }

    fetch('/api/chat/read', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-auth-token': token},
      body: JSON.stringify({ chatId, maxId: maxMsgId })
    }).catch(err => console.error("Auto read error", err))
  }, [token])

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 150
    if (sel?.id) {
      const scrollKey = sel.id + (selTopic ? '_' + selTopic.id : '')
      scrollPositions.current[scrollKey] = scrollTop
      clearTimeout(saveScrollTimeout.current)
      saveScrollTimeout.current = setTimeout(() => {
        localStorage.setItem('crm_scroll_positions', JSON.stringify(scrollPositions.current))
      }, 300)
    }
    // Mark as read if user has scrolled past the unread separator or reached bottom
    const unreadCount = selTopic ? (selTopic.unread || 0) : (sel?.unread || 0)
    const readKey = sel?.id + (selTopic ? '_' + selTopic.id : '')
    if (unreadCount > 0 && !readChats.has(readKey)) {
      const maxMsgId = msgsRef.current.length > 0 ? Math.max(...msgsRef.current.map(m => m.id)) : 0;
      if (isNearBottom.current) {
        console.log(`[Unread Debug] Marking ${sel.id} as read. Old count: ${unreadCount}, maxId: ${maxMsgId}`);
        markChatAsRead(sel.id, selTopic?.id, maxMsgId)
      } else if (firstUnreadRef.current) {
        const rect = firstUnreadRef.current.getBoundingClientRect()
        if (rect.top < window.innerHeight) {
          console.log(`[Unread Debug] Marking ${sel.id} as read (scrolled past). Old count: ${unreadCount}, maxId: ${maxMsgId}`);
          markChatAsRead(sel.id, selTopic?.id, maxMsgId)
        }
      }
    }
  }

  useEffect(()=>{
    if(!sel) return
    let currentTopic = selTopic
    let chatOrTopicChanged = false
    
    if (prevSelId.current !== sel.id) {
       currentTopic = null
       setSelTopic(null)
       chatOrTopicChanged = true
       prevSelId.current = sel.id
       prevSelTopicId.current = null
       setForceNormalView(false)
       setTopicError(false)
       setPinnedMessage(null) // reset pin on chat change
       setDismissedTranslate(localStorage.getItem(`dismissed_translate_${sel.id}`) === 'true')
       setDismissedPin(localStorage.getItem(`dismissed_pin_${sel.id}_main`) === 'true')
    } else if (prevSelTopicId.current !== selTopic?.id) {
       prevSelTopicId.current = selTopic?.id
       chatOrTopicChanged = true
       setPinnedMessage(null) // reset pin on topic change
       setDismissedPin(localStorage.getItem(`dismissed_pin_${sel.id}_${selTopic?.id}`) === 'true')
    }
    
    if (chatOrTopicChanged) {
      hasRestoredScroll.current = false
      const cacheKey = sel.id + (currentTopic ? '_' + currentTopic.id : '')
      if (msgsCacheRef.current[cacheKey]) {
        setMsgs(msgsCacheRef.current[cacheKey])
        setMessagesLoaded(true)
        setLoadMsgs(false)
      } else {
        setMsgs([])
        setMessagesLoaded(false)
        setLoadMsgs(true)
      }
    }
    
    if (sel.isForum && !currentTopic && !forceNormalView) {
      setLoadingTopics(true)
      setTopicError(false)
      fetch(`/api/chat/topics/${sel.id}`, { headers: {"x-auth-token": token} })
        .then(r=>{
          if (!r.ok) throw new Error('Failed to fetch')
          return r.json()
        })
        .then(d=>{
          const tList = Array.isArray(d) ? d : []
          setTopics(p=>({...p, [sel.id]: tList}))
          setLoadingTopics(false)
          if (tList.length === 0) {
            setForceNormalView(true)
            loadMessages(sel, null)
          }
        })
        .catch(e=>{
          setLoadingTopics(false)
          setForceNormalView(true)
          loadMessages(sel, null)
        })
      return
    }

    loadMessages(sel, currentTopic?.id || null)

    // Fetch Pinned Message
    fetch(`/api/telegram/messages/pinned?chatId=${sel.id}${currentTopic ? '&topicId='+currentTopic.id : ''}`, {
      headers:{'x-auth-token':token}
    })
    .then(r=>r.json())
    .then(d=>{
      if(d.ok && d.pinnedMessage) setPinnedMessage(d.pinnedMessage)
      else setPinnedMessage(null)
    }).catch(console.error)

  },[sel, selTopic, token, forceNormalView])

  const activeAiRequest = useRef(null);

  // Clear AI suggestions when chat or context changes
  const clientMsgsCount = (msgs||[]).filter(m => !m.fromMe && !m.deleted).length;
  const lastClientMsgText = clientMsgsCount > 0 ? (msgs||[]).filter(m => !m.fromMe && !m.deleted).pop().text : "";

  useEffect(()=>{
    setAiSuggestions([]); setAiText(""); setAiError(null); setAiInstruction("");
    activeAiRequest.current = null;
  },[sel?.id, selTopic?.id])

  useEffect(()=>{
    // Don't clear instruction, just clear the suggestions/error because the context changed
    if (aiSuggestions.length > 0 || aiError || aiText) {
      setAiSuggestions([]); setAiText(""); setAiError(null);
    }
  },[msgs?.length, lastClientMsgText])

  // Clear AI error when command input changes, but keep suggestions until Generate is clicked
  useEffect(() => {
    if (aiError) {
      setAiError(null);
    }
  }, [aiInstruction]);


  useEffect(()=>{
    if(!msgs.length) return
    if(!hasRestoredScroll.current) {
      hasRestoredScroll.current = true
      const unreadCount = selTopic ? (selTopic.unread || 0) : (sel?.unread || 0)
      if(firstUnreadRef.current && unreadCount > 0) {
        firstUnreadRef.current.scrollIntoView({behavior:"auto", block:"center"})
        
        // Wait a tick for layout, then check if the unread divider is visible
        setTimeout(() => {
           if (firstUnreadRef.current) {
             const rect = firstUnreadRef.current.getBoundingClientRect()
             if (rect.top < window.innerHeight) {
               const maxMsgId = msgsRef.current.length > 0 ? Math.max(...msgsRef.current.map(m => m.id)) : 0;
               markChatAsRead(sel.id, selTopic?.id, maxMsgId)
             }
           }
        }, 100)
      } else {
        const scrollKey = sel?.id + (selTopic ? '_' + selTopic.id : '')
        const savedScroll = scrollPositions.current[scrollKey]
        if (savedScroll !== undefined) {
          const container = document.querySelector('.msgs')
          if (container) container.scrollTop = savedScroll
        } else {
          endRef.current?.scrollIntoView({behavior:"auto"})
        }
        
        // If unreadCount > 0 but we scrolled to the bottom (or no unread separator), mark as read
        if (unreadCount > 0) {
           setTimeout(() => {
             const container = document.querySelector('.msgs')
             if (!container || container.scrollHeight - container.scrollTop - container.clientHeight < 150) {
               const maxMsgId = msgsRef.current.length > 0 ? Math.max(...msgsRef.current.map(m => m.id)) : 0;
               markChatAsRead(sel.id, selTopic?.id, maxMsgId)
             }
           }, 100)
        }
      }
    } else if(!loadingMore && isNearBottom.current) {
      endRef.current?.scrollIntoView({behavior:"smooth"})
    }
  },[msgs, loadingMore, sel?.unread, selTopic?.unread, sel?.id, selTopic?.id])

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
  const selRef = useRef(sel)
  const selTopicRef = useRef(selTopic)
  useEffect(() => { selRef.current = sel; selTopicRef.current = selTopic }, [sel, selTopic])

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
            const isSameChat = selRef.current?.id === msg.chatId;
            const isSameTopic = !selRef.current?.isForum || (msg.topicId && selTopicRef.current?.id === msg.topicId) || (!msg.topicId && !selTopicRef.current);
            
            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                if (prev.some(m => m.id === msg.id)) return prev
                msg.reactions = mergeReactions(msg.id, msg.reactions || [])
                const updated = [...prev, msg]
                const nextState = updated.sort((a,b) => a.date - b.date)
                msgsCacheRef.current[selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState
                return nextState
              })
              
              // Regenerate AI Reply if we are in the chat
              setAiSuggestions([])
              setAiText('')

              // Mark as read immediately if window has focus and message is incoming
              if (!msg.fromMe && document.hasFocus()) {
                markChatAsRead(msg.chatId, msg.topicId, msg.id)
              }
            }
          }
          else if (data.type === 'delete_messages') {
             const { ids, chatId } = data
             if (selRef.current?.id === chatId) {
                setMsgs(prev => {
                  const nextState = prev.filter(m => !ids.includes(m.id))
                  msgsCacheRef.current[selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState
                  return nextState
                })
             }
          }
          else if (data.type === 'update_reactions') {
            const { chatId, msgId, topicId, reactions, recentReactions } = data;
            const isSameChat = selRef.current?.id === chatId;
            const isSameTopic = !selRef.current?.isForum || (topicId && selTopicRef.current?.id === topicId) || (!topicId && !selTopicRef.current);
            
            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                const idx = prev.findIndex(m => m.id === msgId);
                if (idx === -1) return prev;
                
                // Only update if the reaction stringified content actually changed (optional optimization)
                const updatedMsgs = [...prev];
                updatedMsgs[idx] = { 
                  ...updatedMsgs[idx], 
                  reactions: mergeReactions(msgId, reactions || []),
                  recentReactions: recentReactions || []
                };
                msgsCacheRef.current[selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = updatedMsgs;
                return updatedMsgs;
              });
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

  async function loadMessages(chat, topicId=null, append=false) {
    if(!chat) return
    if(!append && loadingRef.current) return
    if(append && loadingMoreRef.current) return
    
    if(append) {
      loadingMoreRef.current = true
      setLoadingMore(true)
    } else {
      loadingRef.current = true
      if (msgsRef.current.length === 0) setLoadMsgs(true)
      setHasMore(true)
    }
    console.time('loadMessages')
    
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
          let nextState;
          if(append) {
            const newMsgs = d.filter(m1 => !prev.some(m2 => m2.id === m1.id))
            nextState = [...newMsgs, ...prev]
          } else {
            const stillPending = prev.filter(m => m.pending && m.id < 0 && !d.some(s=>s.text===m.text&&s.fromMe))
            nextState = [...d, ...stillPending]
          }
          let finalState = nextState.map(m => ({
            ...m,
            reactions: mergeReactions(m.id, m.reactions || [])
          }))
          msgsCacheRef.current[chat.id + (topicId ? '_' + topicId : '')] = finalState;
          return finalState;
        })
      } else if (d && d.error === 'AUTH_FAILED') {
        if (typeof onAuthFailed === 'function') onAuthFailed()
      }
    } catch(e) { console.error("loadMsgs:",e) }
    console.timeEnd('loadMessages')
    
    if(append) {
      loadingMoreRef.current = false
      setLoadingMore(false)
    } else {
      loadingRef.current = false
      setLoadMsgs(false)
      setMessagesLoaded(true)
    }
  }

  const sendingRef = useRef(false)

  const toggleReaction = async (targetChatId, targetTopicId, msgId, emoji) => {
    console.log(`[Reaction Click] msgId=${msgId}, clickedEmoji=${emoji}`);
    
    const allowed = allowedReactionsCache[targetChatId];
    const currentMsgs = msgsRef.current || [];
    const isCustom = emoji && emoji.type === 'custom';
    
    const getReactionKey = (r) => {
      if (!r) return '';
      if (typeof r === 'string') return r;
      if (r.type === 'custom') return `custom_${r.customEmojiId}`;
      if (r.type === 'emoji') return r.emoticon;
      if (r.emoticon) return r.emoticon;
      return '';
    };
    
    const emojiKey = getReactionKey(emoji);

    let validationResult = 'allowed';
    if (allowed) {
      if (allowed.ok) {
        if (allowed.reactionsEnabled === false) {
          validationResult = 'not_allowed';
        } else if (!allowed.allowAll) {
          if (!allowed.reactions || allowed.reactions.length === 0) {
            validationResult = 'not_allowed';
          } else if (!allowed.reactions.some(r => getReactionKey(r) === emojiKey)) {
            validationResult = 'not_allowed';
          }
        }
      }
    }

    if (validationResult === 'not_allowed') {
      toast.error('This reaction is not allowed in this chat.');
      return;
    }

    if (!pendingReactionsRef.current) pendingReactionsRef.current = {};
    
    const msgIndex = currentMsgs.findIndex(m => m.id === msgId);
    if (msgIndex === -1) {
      console.log('Reaction failed: Message not found in local msgs state', msgId);
      return;
    }
    
    const originalMsg = currentMsgs[msgIndex];
    const originalReactions = originalMsg.reactions || [];
    
    const existing = originalReactions.find(r => getReactionKey(r) === emojiKey);
    const myCurrentReactions = originalReactions.filter(r => r.chosen);
    
    let newReactions = [...originalReactions];
    
    let action = 'skip';
    if (existing && existing.chosen) {
      action = 'remove';
      if (existing.count <= 1) {
        newReactions = newReactions.filter(r => getReactionKey(r) !== emojiKey);
      } else {
        newReactions = newReactions.map(r => getReactionKey(r) === emojiKey ? { ...r, count: r.count - 1, chosen: false } : r);
      }
    } else {
      if (myCurrentReactions.length >= 3) {
        action = 'replace';
        const removedKey = getReactionKey(myCurrentReactions[0]);
        newReactions = newReactions.map(r => {
          if (getReactionKey(r) === removedKey) return { ...r, count: r.count - 1, chosen: false };
          return r;
        }).filter(r => r.count > 0);
      } else {
        action = 'add';
      }
      
      const newExisting = newReactions.find(r => getReactionKey(r) === emojiKey);
      if (newExisting) {
        newReactions = newReactions.map(r => getReactionKey(r) === emojiKey ? { ...r, count: r.count + 1, chosen: true } : r);
      } else {
        const newReactionObj = isCustom 
          ? { type: 'custom', customEmojiId: emoji.customEmojiId, thumbnailUrl: emoji.thumbnailUrl, count: 1, chosen: true }
          : { type: 'emoji', emoticon: emoji, count: 1, chosen: true };
        newReactions.push(newReactionObj);
      }
    }
    
    console.log('action', action);
    
    const chosenEmojiObjs = newReactions.filter(r => r.chosen);
    const payloadEmoji = chosenEmojiObjs.map(r => {
      if (r.type === 'custom') return { type: 'custom', customEmojiId: r.customEmojiId };
      return r.emoticon || r;
    });
    
    console.log('nextReactionList', payloadEmoji);
    
    console.log('optimisticReactions', newReactions);
    
    // Cache optimistic reaction for merging immediately
    pendingReactionsRef.current[msgId] = { timestamp: Date.now(), reactions: newReactions };
    
    // Apply optimistic update strictly by messageId
    setMsgs(prevMsgs => {
      const updated = prevMsgs.map(m => m.id === msgId ? { ...m, reactions: newReactions } : m);
      msgsCacheRef.current[targetChatId + (targetTopicId ? '_' + targetTopicId : '')] = updated;
      return updated;
    });
    
    console.log('refetch reaction payload', {
      chatId: targetChatId,
      messageId: msgId,
      emoji: payloadEmoji,
      topicId: targetTopicId
    });

    try {
      const res = await fetch('/api/telegram/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          chatId: targetChatId,
          messageId: msgId,
          emoji: payloadEmoji,
          topicId: targetTopicId
        })
      });
      const d = await res.json();
      console.log('apiStatus', d);
      console.log('backendValidationResult', d.code || 'allowed');
      console.log('finalReactionsFromTelegram', d.tgRes || 'unchanged');
      if (!d.ok && !d.unchanged) {
        if (d.error && d.error.includes('REACTION_INVALID') || d.code === 'REACTION_INVALID') {
          alert('This reaction is not allowed in this chat (REACTION_INVALID).');
          // Update cache to remove this emoji if it was mistakenly cached as allowed
          setAllowedReactionsCache(prev => {
            const current = prev[targetChatId];
            if (current && current.ok && !current.allowAll && current.reactions) {
              return {
                ...prev,
                [targetChatId]: {
                  ...current,
                  reactions: current.reactions.filter(e => !compareEmoji(e, emoji))
                }
              };
            }
            return prev;
          });
          fetchAllowedReactions(targetChatId, true);
        } else {
          alert('Lỗi thả emoji từ Telegram: ' + (d.error || 'Unknown error'));
        }
        delete pendingReactionsRef.current[msgId];
        setMsgs(prev => prev.map(m => m.id === msgId ? originalMsg : m));
      }
    } catch (e) {
      console.log(`[Reaction Sync] Telegram API error:`, e.message);
      console.error('API response/error', e);
      alert('Lỗi thả emoji: ' + e.message);
      delete pendingReactionsRef.current[msgId];
      setMsgs(prev => prev.map(m => m.id === msgId ? originalMsg : m));
    }
  }

  async function send(){
    const safeInput = (input === "null" || input == null) ? "" : input;
    const text=safeInput.trim(); 
    if((!text && !pastedFile) || !sel) return
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
    const sentDate = Math.floor(Date.now()/1000)
    const tempMsg = {id: -Date.now(), text, fromMe:true, date:sentDate, pending:true}
    setMsgs(p=>[...p, tempMsg])
    
    // Optimistic chat list update
    let prevChatState = null;
    setChats(prev => {
      const idx = prev.findIndex(c => c.id === sel.id)
      if (idx > -1) {
        prevChatState = { date: prev[idx].date, lastMsg: prev[idx].lastMsg }
        const newChats = [...prev]
        newChats[idx] = { ...newChats[idx], date: sentDate, lastMsg: text }
        return newChats
      }
      return prev
    })

    try {
      if (pastedFile) {
        const formData = new FormData()
        formData.append('chatId', sel.id)
        if (selTopic) formData.append('topicId', selTopic.id)
        if (sel.username) formData.append('username', sel.username)
        if (text) formData.append('caption', text)
        formData.append('file', pastedFile)

        await fetch('/api/chat/send-media', {
          method: 'POST',
          headers: { "x-auth-token": token },
          body: formData
        })
        setPastedFile(null)
        setFilePreview(null)
      } else if(selTopic) {
        await fetch('/api/chat/topics/'+sel.id+'/'+selTopic.id+'/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({text, username: sel.username || undefined})
        })
      } else {
        await fetch('/api/chat/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({chatId:sel.id, text, username: sel.username || undefined})
        })
      }
      
      // Update message status to remove pending
      setMsgs(p=>p.map(m=>m.id===tempMsg.id ? {...m, pending:false} : m))
      
      setTimeout(async()=>{
        loadingRef.current = false
        await loadMessages(sel, selTopic?.id || null)
      }, 200)
    } catch(e) {
      // Rollback
      setMsgs(p=>p.filter(m=>m.id!==tempMsg.id))
      setInput(text)
      if (prevChatState) {
        setChats(prev => {
          const idx = prev.findIndex(c => c.id === sel.id)
          if (idx > -1) {
            const newChats = [...prev]
            newChats[idx] = { ...newChats[idx], date: prevChatState.date, lastMsg: prevChatState.lastMsg }
            return newChats
          }
          return prev
        })
      }
    }
    sendingRef.current = false
    setSending(false)
  }

  // AI Summarize
  async function getSummary() {
    if(!sel||!msgs.length) return
    setAiLoading(true); setAiText(''); setAiSuggestions([]); setAiAlt(''); setAiAnalysis(''); setAiError(null)
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
  const getExtract = async () => {
    if(!sel) return
    setAiLoading(true); setAiText(''); setAiSuggestions([]); setAiAlt(''); setAiAnalysis(''); setAiError(null)
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

    const allMsgs = (msgsRef.current||[]).filter(m => m.text && !m.deleted && !m.pending)
    
    if (!messagesLoaded || allMsgs.length === 0) {
      setAiError("Context not loaded. Please wait for messages to load before generating.");
      return;
    }

    let cmd = (aiInstruction||"").normalize('NFC').trim();
    // Remove accidental mid-word punctuation like "đang. làm"
    cmd = cmd.replace(/([a-zA-Z\p{L}])[.,]([a-zA-Z\p{L}])/gu, '$1 $2');
    cmd = cmd.replace(/\s+/g, ' ');
    
    const attemptId = Math.random().toString(36).substring(2, 8);
    activeAiRequest.current = attemptId;

    console.log("[AI Suggest Generate Click]", {
      generateAttemptId: attemptId,
      rawCommand: aiInstruction,
      normalizedCommand: cmd,
      isGenerating: aiLoading,
      selectedChatId: sel.id,
      messagesCount: allMsgs.length
    });

    if (cmd.length > 0 && cmd.length < 3) {
      setAiError("Please enter a clearer instruction.");
      console.log("[AI Suggest Validation]", { status: "failed", errorMessage: "Instruction too short", commandInput: aiInstruction });
      return;
    }
    console.log("[AI Suggest Validation]", { status: "passed", commandInput: aiInstruction });

    setAiText(""); setAiSuggestions([]); setAiLoading(true); setAiError(null)

    const clientMsgs = allMsgs.filter(m => !m.fromMe)
    const lastClientMsgObj = clientMsgs.length > 0 ? clientMsgs[clientMsgs.length-1] : null;
    let lastClientMsg = "";
    if (lastClientMsgObj) {
      lastClientMsg = lastClientMsgObj.text || "";
      if (lastClientMsgObj.isAudio || lastClientMsgObj.voice || lastClientMsgObj.audio || lastClientMsgObj.media?.type === 'audio') {
        const cachedTranscript = localStorage.getItem(`transcript_${lastClientMsgObj.id}`);
        lastClientMsg = cachedTranscript ? `[Voice Transcript]: ${cachedTranscript}` : `[Voice Message]: (Transcript not available)`;
      }
    }

    const aiPayload = {
      contactName: sel.name,
      lastMessage: lastClientMsg,
      messages: allMsgs.slice(-40).map(m => {
        let text = m.text || "";
        if (m.isAudio || m.voice || m.audio || m.media?.type === 'audio') {
          const cachedTranscript = localStorage.getItem(`transcript_${m.id}`);
          text = cachedTranscript ? `[Voice Transcript]: ${cachedTranscript}` : `[Voice Message]: (Transcript not available)`;
        }
        return { text, fromMe: m.fromMe };
      }),
      stage: stages[sel.id] || "Contacted",
      notes: (notes[sel.id]||[]).map(n=>n.content).join(" | "),
      instruction: cmd,
      chatId: sel.id,
      topicId: selTopic?.id || null
    };

    console.log("[AI Suggest Request Payload]", {
      selectedChatId: aiPayload.chatId,
      selectedTopicId: aiPayload.topicId,
      messagesSentCount: aiPayload.messages.length,
      latestCustomerMessage: aiPayload.lastMessage,
      userCommand: aiPayload.instruction
    });

    try {
      const r = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: {"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify(aiPayload)
      })
      const d = await r.json()
      
      // Ignore if a newer request was started
      if (activeAiRequest.current !== attemptId) {
        console.log(`[AI Suggest API Response - ${attemptId}] Ignored (stale request)`);
        return;
      }

      console.log(`[AI Suggest API Response - ${attemptId}]`, {
        responseSource: d.source || "unknown",
        normalizedIntent: d.normalizedIntent,
        finalPromptPreview: d.finalPromptPreview,
        suggestionsCount: d.suggestions?.length || 0,
        errorMessage: d.error || null
      });

      if (d.ok === false || d.error) {
        setAiError(d.error || "Failed to generate custom reply. Please try rephrasing your command.");
      } else if (d.suggestions) {
        setAiSuggestions(d.suggestions)
      } else if (d.suggestion) {
        setAiText(d.suggestion)
      }
    } catch(e) { 
      console.error("AI:", e) 
      setAiError("Network error connecting to AI service.")
    } finally {
      setAiLoading(false)
    }
  }

  // Right-click context menu
  function handleCtx(e,msg,idx){
    e.preventDefault()
    setCtxMenu({x:e.clientX,y:e.clientY,msg,idx})
  }

  async function deleteMsg(idx){
    const msg = msgs[idx]
    if(!msg) return
    setMsgs(p=>p.filter((m,i)=>i!==idx))
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
    // Remove all my messages from UI immediately
    setMsgs(p=>p.filter(m=>!m.fromMe))
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

  const searchLower = removeDiacritics(search.trim());

  // 1. Log actual chat object structure
  // 3. Verify which real fields exist
  if (chats.length > 0 && !window.__loggedChatStructure) {
    console.log("DEBUG [Chat Object Structure]:", Object.keys(chats[0]), chats[0]);
    window.__loggedChatStructure = true;
  }

  // 4. Build a getSearchableText(chat) helper using the real fields
  const getSearchableText = (c) => {
    // Only use fields we KNOW exist in the object based on server.js
    const parts = [
      c.name,
      c.username,
      c.lastMsg
    ];
    return removeDiacritics(parts.filter(Boolean).join(" "));
  };

  const preSearchFiltered = [...chats]
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
    });

  const deferredSearchLower = useDeferredValue(searchLower);

  const localFiltered = useMemo(() => {
    return preSearchFiltered.filter(c => {
      if (!deferredSearchLower) return true;
      return getSearchableText(c).includes(deferredSearchLower);
    });
  }, [preSearchFiltered, deferredSearchLower]);

  const filtered = useMemo(() => {
    if (!deferredSearchLower) return localFiltered;
    const localIds = new Set(localFiltered.map(c => c.id));
    const uniqueGlobals = globalMatches.filter(g => !localIds.has(g.id));
    return [...localFiltered, ...uniqueGlobals];
  }, [localFiltered, globalMatches, deferredSearchLower]);

  useEffect(() => {
    // 2. Log exactly what was requested
    console.log("DEBUG [Search Flow]:", {
      searchQuery: search.trim(),
      activeFilter: folder,
      rawChatsLength: chats.length,
      preSearchFilteredLength: preSearchFiltered.length,
      matchedChatsLength: filtered.length,
      first5SearchableText: filtered.slice(0, 5).map(c => getSearchableText(c))
    });

    console.log("[ChatSync Debug]", { total: chats.length, filtered: filtered.length, matchedChats: filtered.length, folder, searchQuery: search.trim(), selId: sel?.id, msgsCount: msgs.length, loadMsgs, messagesLoaded })

    if (chats.length > 0 && !sel) {
      setSel(filtered.length > 0 ? filtered[0] : chats[0])
    }
  }, [chats, filtered, sel, search, folder, preSearchFiltered.length])

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
      width: 320px;
      min-width: 320px;
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
      background-color: #0e1621;
      background-image: url('https://web.telegram.org/a/chat-bg-pattern-dark.png');
      background-size: 512px;
      background-attachment: scroll;
      background-blend-mode: overlay;
    }
    .msgs::-webkit-scrollbar { width: 4px; }
    .msgs::-webkit-scrollbar-thumb { background: #2d1155; border-radius: 2px; }

    /* ── MESSAGE ROW ── */
    .msg-row {
      display: flex;
      width: 100%;
      margin-bottom: 10px;
    }
    .msg-row.out { justify-content: flex-end; }
    .msg-row.in  { justify-content: flex-start; align-items: flex-end; }
    .msg-row.grouped { margin-bottom: 2px; }

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
    .bbl.out { background: #8774e1; color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    .bbl.in { background: #212d3b; color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    .bbl.del { opacity: .5; font-style: italic; }
    .bbl.rpl { border-left: 3px solid rgba(255,255,255,.5); padding-left: 10px; border-radius: 8px; margin-bottom: 4px; font-size: 13px; }
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
      color: rgba(255, 255, 255, 0.5);
      float: right;
    }

    /* ── DATE SEPARATOR ── */
    .dsep {
      display: flex; align-items: center; justify-content: center;
      margin: 20px 0 16px;
    }
    .dsep span {
      background: rgba(0,0,0,0.25);
      padding: 4px 10px;
      border-radius: 14px;
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      font-weight: 500;
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
      gap: 8px;
      padding: 10px 16px 14px;
      min-height: 56px;
    }

    /* Icon buttons */
    .ib {
      width: 36px; height: 36px; flex-shrink: 0;
      background: transparent; border: none; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: #9b7ec8; font-size: 20px; transition: background .1s;
      margin-bottom: 2px;
    }
    .ib:hover, .ib.on { background: rgba(255,255,255,0.08); color: #f0e6ff; }
    .ib.g { font-size: 16px; font-weight: 700; }

    /* Textarea */
    .message-input {
      flex: 1; min-width: 0;
      min-height: 40px; max-height: 120px;
      padding: 10px 14px;
      background: #23153d; border: none; border-radius: 20px;
      color: #f0e6ff; font-size: 15px; font-family: inherit;
      line-height: 20px; resize: none; outline: none;
      overflow-y: auto; box-sizing: border-box;
    }
    .message-input::placeholder { color: #6b4d94; }

    /* Send button */
    .sb {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: 50%; background: #8774e1; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: #fff;
      transition: background .15s, opacity .15s;
      margin-bottom: 2px;
    }
    .sb:hover { background: #766ac8; }
    .sb:disabled { opacity: .35; cursor: default; }

    /* ── RIGHT COL ── */
    .rc {
      display: flex; flex-direction: column;
      overflow-y: auto;
      width: 320px;
      min-width: 320px;
      flex-shrink: 0;
      background: #1a0533; border-left: 1px solid #0d0618;
      padding: 20px 14px; gap: 14px;
      box-sizing: border-box; height: 100%;
    }
    .rr  { background: #2d1155; border-radius: 10px; padding: 12px; }
    .ri  { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; transition: background .1s; }
    .ri:hover { background: #3d1f6a; }
    .rl  { border-bottom: 1px solid #0d0618; margin: 4px 0; }
    .qb  { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; border: none; text-align: left; transition: background .15s; width: 100%; background: #2d1155; color: #f0e6ff; margin-bottom: 4px; }
    .qb:hover { background: #3d1f6a; }
    .ti  { padding: 8px 12px; cursor: pointer; border-radius: 8px; font-size: 13px; transition: background .1s; color: #f0e6ff; border-bottom: 1px solid #2d1155; }
    .ti:hover { background: #2d1155; }
    .tmpl-panel { position: absolute; bottom: 100%; right: 0; background: #1a103c; border: 1px solid #3d1f6a; border-radius: 12px; padding: 8px 0; min-width: 300px; max-height: 300px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.5); z-index: 100; }
    .mi  { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; transition: background .1s; }
    .mi:hover { background: #2d1155; }
    
    .highlighted-msg .bbl {
      box-shadow: 0 0 15px rgba(124, 58, 237, 0.8) !important;
      border: 1px solid #a78bfa !important;
      transition: all 0.3s ease-in-out;
    }

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

  const jumpToMessage = useCallback((msgId) => {
    const el = document.getElementById('msg-' + msgId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.5s';
      el.style.background = 'rgba(124,58,237,.3)';
      setTimeout(() => el.style.background = 'transparent', 2000);
      setSharedMediaView(null);
      setProfilePreview(null);
    } else {
      alert('Message not currently loaded in DOM.');
    }
  }, []);


  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || pastedFile) {
        send();
      }
    }
  }, [input, pastedFile, send]);

  const handleComposerPaste = useCallback((e) => {
    const clipboardData = e.clipboardData || window.clipboardData
    if (clipboardData && clipboardData.files && clipboardData.files.length > 0) {
      e.preventDefault()
      const file = clipboardData.files[0]
      setPastedFile(file)
      if (file.type.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(file))
      } else {
        setFilePreview(null)
      }
    }
  }, [])

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPastedFile(file)
      if (file.type.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(file))
      } else {
        setFilePreview(null)
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const chatProps = {
    sel, selTopic, setSelTopic, TG: {}, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, toggleReaction, editedMsgs, fmtMsgTime,
    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,
    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInputRef, handleFileChange, mediaRecRef, recordTimerRef, setRecording, setRecordSecs,
    pastedFile, setPastedFile, filePreview, setFilePreview, handleComposerPaste,
    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,
    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,
    LinkPreview, ChatPhoto, Avatar, fmtTime,
    STAGES: {}, cFup, cNotes, msgInfoOpen, setMsgInfoOpen,
    pollOpen, setPollOpen, pollQuestion, setPollQuestion,
    pollOptions, setPollOptions, scheduleOpen, setScheduleOpen,
    scheduleTime, setScheduleTime, sendScheduled, scheduledMsgs,
    globalSearchOpen, setGlobalSearchOpen, globalSearch, setGlobalSearch,
    chats, sending, setForceNormalView, loadingMore, readChats,
    firstUnreadRef, renderMessageText, chatSearch, endRef, aiInstruction, setAiInstruction,
    AISuggestPanel, aiText, setAiText, aiSuggestions, setAiSuggestions, aiAnalysis, setAiAnalysis,
    aiAlt, setAiAlt, setAiLoading, tmplCats, setTmplCat,
    tmplCat, TEMPLATES: [], setMsgs, setSelectMode, lightbox, StageBadge, gifOpen, setGifOpen,
    gifQuery, setGifQuery, searchGifs, gifs, loadingRef, showScrollBtn, aiError, highlightedMsgId
  };

  const handlePinnedMessageClick = async (pinnedMessageId) => {
    console.log('pinnedMessageId', pinnedMessageId);
    console.log('chatId', sel?.id);
    console.log('topicId', selTopic?.id);
    
    // Check if message exists in current DOM
    const el = document.getElementById('msg-' + pinnedMessageId);
    if (el) {
      console.log('existsInCurrentMessages', true);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(pinnedMessageId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
      return;
    }
    
    const existsInCache = msgs.some(m => m.id === pinnedMessageId);
    console.log('existsInCache', existsInCache);
    
    try {
      setLoadingPinnedMsg(true);
      const url = `/api/telegram/messages/around?chatId=${sel.id}&messageId=${pinnedMessageId}${selTopic?.id ? `&topicId=${selTopic.id}` : ''}`;
      const res = await fetch(url, { headers: { 'x-auth-token': token } });
      const d = await res.json();
      console.log('aroundFetchStatus', d.ok);
      if (!d.ok) {
        console.log('errorCode', d.code);
        alert(d.error || 'Failed to load pinned message context.');
        setLoadingPinnedMsg(false);
        return;
      }
      
      console.log('fetchedMessagesCount', d.messages?.length);
      console.log('targetFound', d.messages?.some(m => m.id === pinnedMessageId));
      
      if (d.messages && d.messages.length > 0) {
        // Merge into current messages
        setMsgs(prev => {
          const map = new Map();
          [...d.messages, ...prev].forEach(m => map.set(m.id, m));
          const merged = Array.from(map.values()).sort((a,b) => a.date - b.date);
          
          msgsCacheRef.current[sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = merged;
          return merged;
        });
        
        // Wait for render, then scroll
        requestAnimationFrame(() => {
          setTimeout(() => {
            const newEl = document.getElementById('msg-' + pinnedMessageId);
            console.log('scrollSuccess', !!newEl);
            if (newEl) {
              newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setHighlightedMsgId(pinnedMessageId);
              setTimeout(() => setHighlightedMsgId(null), 2000);
            }
          }, 100);
        });
      }
    } catch (e) {
      console.log('Fetch around error', e);
      alert('Error fetching pinned message context.');
    } finally {
      setLoadingPinnedMsg(false);
    }
  }

  return (<>
    <style>{STYLES}</style>
    <div className="crm-root">

      {/* SIDEBAR */}
      <div className="sidebar">
        <div style={{width:36,height:36,background:'#7c3aed',borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15,marginBottom:10}}>⚡</div>
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
          <span style={{fontSize:15,fontWeight:700,color:'#f0e6ff'}}>Messages</span>
          <button onClick={fetchChats} disabled={loadChats}
            style={{background:"none",border:"none",color:'#9b7ec8',
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
        <div style={{padding:"12px 24px",borderBottom:`1px solid #0d0618`}}>
          <input type="text" placeholder="Search" style={{width:"100%",padding:"10px 16px",background:'#120929',border:"none",borderRadius:20,color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}
            value={search} onChange={e=>setSearch(e.target.value)} />
          {search.trim() && (
            <div style={{fontSize: 11, color: '#6b4d94', marginTop: 8, textAlign: 'center'}}>
              {isGlobalSearching ? 'Searching all chats...' : null}
            </div>
          )}
        </div>
        <div ref={leftColScrollRef} style={{flex:1,overflowY:"auto",minHeight:0}} onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target
          localStorage.setItem('crm_leftCol_scroll', scrollTop)
          if (scrollHeight - scrollTop - clientHeight < 100 && hasMoreChats && !loadingChatsRef.current && !search) {
            fetchChats(true)
          }
        }}>
          {loadChats&&<div style={{padding:20,textAlign:"center",color:'#6b4d94',fontSize:13}}>Loading Telegram...</div>}
          {filtered.map(chat=>{
            const isSel=sel?.id===chat.id
            return(
              <div key={chat.id} className={`ci${isSel?" sel":""}`} onContextMenu={e=>{e.preventDefault();setChatCtxMenu({x:e.clientX,y:e.clientY,chat})}} onClick={()=>{
                setSel(chat)
              }}>
                <div style={{position:"relative",flexShrink:0}}>
                  <Avatar name={chat.name} chatId={chat.id} username={chat.username} accessHash={chat.accessHash} size={52}/>
                </div>
                <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:600,fontSize:15,color:isSel?"#fff":'#f0e6ff',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.isGroup ? <span style={{fontSize:13,marginRight:4}}>👥</span> : chat.isChannel ? <span style={{fontSize:13,marginRight:4}}>📢</span> : null}
                      {chat.name}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:8}}>
                      {chat.isPinned || pinnedChats.has(chat.id) ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#6b4d94', opacity: isSel ? 0.8 : 0.5}}>
                          <path d="M12 17v5" />
                          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                      ) : null}
                      <span style={{fontSize:12,color:isSel?"rgba(255,255,255,.7)":'#6b4d94',marginLeft:4}}>{fmtTime(chat.date)}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:14,color:isSel?"rgba(255,255,255,.8)":'#9b7ec8',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.lastMsg||"No messages"}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:6}}>
                      {chat.unread>0 && !readChats.has(chat.id) && (
                        <div style={{background:isSel?"#fff":'#7c3aed',color:isSel?"#7c3aed":"#fff",fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:10,minWidth:22,textAlign:"center"}}>
                          {chat.unread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {search.trim() && !hasSearchedGlobal && (
             <div style={{padding:20,textAlign:"center",color:'#6b4d94',fontSize:13}}>Waiting for global search...</div>
          )}
          {!loadChats&&filtered.length===0&&!isGlobalSearching&&hasSearchedGlobal&&(
            <div style={{padding:32,textAlign:"center",color:'#6b4d94',fontSize:13}}>
              {search.trim() ? (
                <>
                  <div style={{marginBottom: 8}}>No matches for "{search.trim()}"</div>
                  <button onClick={() => setSearch('')} style={{background: 'none', border: '1px solid #3d1f6a', padding: '6px 12px', borderRadius: 16, color: '#a78bfa', cursor: 'pointer'}}>Clear Search</button>
                </>
              ) : folder !== 'all' ? (
                <>
                  <div style={{marginBottom: 8}}>No chats in this folder</div>
                  <button onClick={() => setFolder('all')} style={{background: 'none', border: '1px solid #3d1f6a', padding: '6px 12px', borderRadius: 16, color: '#a78bfa', cursor: 'pointer'}}>View All</button>
                </>
              ) : (
                <>
                  <div style={{marginBottom: 8}}>No chats found</div>
                  <button onClick={() => fetchChats()} style={{background: 'none', border: '1px solid #3d1f6a', padding: '6px 12px', borderRadius: 16, color: '#a78bfa', cursor: 'pointer'}}>Retry Loading</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MID COL */}
      <div className="mc">
        {!sel?(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:'#9b7ec8'}}>
            <div style={{width:80,height:80,background:'#2d1155',borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
            <div style={{fontSize:16,fontWeight:500,color:'#f0e6ff'}}>Select a conversation</div>
            <div style={{fontSize:13}}>Pick a chat from your Telegram on the left</div>
          </div>
        ): sel && sel.isForum && !selTopic && !forceNormalView ? (
          <ForumTopicsView {...chatProps} />
        ):<>
          <ChatHeader {...chatProps} />
          {pinnedMessage && !dismissedPin && (
            <div style={{ position: 'relative' }}>
              <PinnedMessageBar 
                pinnedMessage={pinnedMessage} 
                onClick={handlePinnedMessageClick} 
                onDismiss={() => {
                  setDismissedPin(true)
                  localStorage.setItem(`dismissed_pin_${sel.id}_${selTopic?.id||'main'}`, 'true')
                }} 
              />
              {loadingPinnedMsg && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: 'rgba(124,58,237,0.9)', color: '#fff',
                  fontSize: 12, padding: '4px 0', textAlign: 'center', zIndex: 10
                }}>
                  Loading pinned message...
                </div>
              )}
            </div>
          )}

          {!dismissedTranslate && (
            <TranslateBar 
              onTranslate={() => alert('TODO: Translate API integration (Feature Placeholder)')}
              onDismiss={() => {
                setDismissedTranslate(true)
                localStorage.setItem(`dismissed_translate_${sel.id}`, 'true')
              }}
            />
          )}
          <MessageList {...chatProps} />
          <Composer {...chatProps} />
        </>}
      </div>

      {/* RIGHT COL */}
      <CRMRightPanel {...chatProps} />

      {/* User Profile Preview Modal */}
      <UserProfileModal 
        data={profilePreview} 
        onClose={() => setProfilePreview(null)} 
        token={token} 
        chats={chats}
        setSel={setSel}
        inputRef={inputRef}
        msgs={msgs}
        messagesLoaded={messagesLoaded}
        hasMore={hasMore}
        setLightbox={setLightbox}
        onOpenMedia={(type) => setSharedMediaView(type)}
      />

      {/* Shared Media Gallery Modal */}
      {sharedMediaView && profilePreview && (
        <SharedMediaModal 
          initialTab={sharedMediaView} 
          msgs={msgs} 
          data={profilePreview} 
          onClose={() => setSharedMediaView(null)} 
          token={token} 
          setLightbox={setLightbox} 
          jumpToMessage={jumpToMessage}
          chats={chats}
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
              <Avatar name={previewChat.name} chatId={previewChat.id} username={previewChat.username} accessHash={previewChat.accessHash} size={52}/>
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
              <div style={{fontWeight:700,fontSize:16,color:'#f0e6ff'}}>
                {(loadingMembers || membersError) ? 'Members' : (sel.memberCount ? `${sel.memberCount} Members` : 'Members')}
              </div>
              <button onClick={()=>{setShowMembers(false);setMemberSearch("")}} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{padding:'12px 16px',borderBottom:'1px solid #2d1155',flexShrink:0}}>
              <input placeholder="Search members..." value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}
                style={{width:'100%',padding:'8px 12px',borderRadius:8,background:'#120929',border:'1px solid #2d1155',color:'#f0e6ff',outline:'none',fontSize:13}}/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
              {(() => {
                const currentMembers = chatMembersCache[sel.id] || []
                const filteredMembers = currentMembers.filter(m => !memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.username?.toLowerCase().includes(memberSearch.toLowerCase()))

                if (membersError) {
                  return (
                    <div style={{padding:32,textAlign:'center',color:'#e53935',fontSize:13}}>
                      <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
                      
                      {membersError === 'TOKEN_EXPIRED' ? (
                        <>
                          <div style={{marginBottom:16,color:'#f0e6ff'}}>Session expired, please sign in again.</div>
                          <button onClick={() => window.location.reload()} style={{padding:'8px 16px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>Sign In</button>
                        </>
                      ) : membersError === 'TG_SESSION_EXPIRED' ? (
                        <>
                          <div style={{marginBottom:16,color:'#f0e6ff'}}>Telegram session expired, please reconnect</div>
                          <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                            <button onClick={() => onAuthFailed && onAuthFailed()} style={{padding:'8px 16px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>Reconnect</button>
                            <button onClick={() => fetchMembers()} style={{padding:'8px 16px',background:'transparent',color:'#9b7ec8',border:'1px solid #9b7ec8',borderRadius:8,cursor:'pointer'}}>Retry</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{marginBottom:16,color:'#f0e6ff'}}>{membersError}</div>
                          <button onClick={() => fetchMembers()} style={{padding:'8px 16px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}}>Retry</button>
                        </>
                      )}
                    </div>
                  )
                }

                if (loadingMembers && currentMembers.length === 0) {
                  return (
                    <div style={{padding:32,textAlign:'center',color:'#9b7ec8',fontSize:13}}>
                      Loading members...
                    </div>
                  )
                }

                if (currentMembers.length === 0) {
                  return (
                    <div style={{padding:32,textAlign:'center',color:'#9b7ec8',fontSize:13}}>
                      No members found.
                    </div>
                  )
                }

                if (filteredMembers.length === 0) {
                  return (
                    <div style={{padding:32,textAlign:'center',color:'#9b7ec8',fontSize:13}}>
                      No members match your search.
                    </div>
                  )
                }

                return filteredMembers.map(m => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',cursor:'pointer'}}
                    onClick={() => setProfilePreview({ id: m.id, name: m.name, username: m.username, chatId: sel.id, accessHash: m.accessHash })}
                    onMouseEnter={e=>e.currentTarget.style.background='#2d1155'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <Avatar name={m.name} chatId={m.id} username={m.username} accessHash={m.accessHash} size={42}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'#f0e6ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {m.name} {m.isBot && <span style={{fontSize:10,background:'#7c3aed',color:'#fff',padding:'2px 6px',borderRadius:4,marginLeft:6,verticalAlign:'middle'}}>BOT</span>}
                        {m.isPremium && <span style={{fontSize:12,marginLeft:4,verticalAlign:'middle'}} title="Premium">⭐</span>}
                      </div>
                      <div style={{fontSize:12,color:'#9b7ec8',marginTop:2}}>{m.status || m.role || (m.username ? '@'+m.username : 'Member')}</div>
                    </div>
                  </div>
                ))
              })()}
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
          allowedReactions={allowedReactionsCache[sel.id]}
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
          onReact={(emoji) => toggleReaction(sel.id, selTopic?.id || null, ctxMenu.msg.id, emoji)}
          onClose={()=>setCtxMenu(null)}
        />
      )}
    </div>
  </>)
}
