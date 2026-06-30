// v-edit2-083448
// v035029
import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react"
import { safeFetch } from './utils/api';
import { ErrorBoundary } from './components/ErrorBoundary'
import ForumTopicsView from './components/chat/ForumTopicsView';
import ChatHeader from './components/chat/ChatHeader';
import MessageList from './components/chat/MessageList';
import Composer from './components/chat/Composer';
import CRMRightPanel from './components/chat/CRMRightPanel';
import PinnedMessageBar from './components/chat/PinnedMessageBar';
import TranslateBar from './components/chat/TranslateBar';
import { BackgroundSettingsModal, BACKGROUND_OPTIONS } from './components/chat/BackgroundSettingsModal';
import TelegramSettings from './components/chat/TelegramSettings';
import TelegramMainMenu from './components/chat/TelegramMainMenu';

const translationCache = new Map();

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
export let _activeAccountId = 'default'

export const isChatActuallyForum = (chat) => {
  if (!chat) return false;
  return Boolean(chat.isForum || chat.forum || chat.hasTopics || chat.topics || chat.forumTopics || chat.threads || chat.topicCount > 0);
};

export function setActiveAccountId(id) {
  _activeAccountId = id;
}

if (!window._fetchIntercepted) {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    if (url.startsWith('/api/')) {
      args[1] = args[1] || {};
      let headers = args[1].headers;
      if (headers instanceof Headers) {
        if (_authToken && !headers.has('x-auth-token')) headers.set('x-auth-token', _authToken);
        if (_activeAccountId && !headers.has('x-account-id')) headers.set('x-account-id', _activeAccountId);
      } else {
        headers = headers || {};
        // Use case-insensitive check for x-auth-token since some calls use 'x-auth-token' and some use 'X-Auth-Token' (if any)
        if (_authToken && !headers['x-auth-token']) headers['x-auth-token'] = _authToken;
        if (_activeAccountId && !headers['x-account-id']) headers['x-account-id'] = _activeAccountId;
        args[1].headers = headers;
      }
    }
    return originalFetch(...args);
  };
  window._fetchIntercepted = true;
}

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
      .then(r => { if (r.__httpStatus >= 400) throw new Error("no photo"); return r.blob() })
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
function ContextMenu({x,y,msg,chatId,token,allowedReactions,readOutboxMaxId,onDelete,onCopy,onReply,onClose,onDeleteAll,onSelect,onForward,onReact,onPin,onInfo,onEdit}) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y, opacity: 0 });
  const [expandedPickerOpen, setExpandedPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [readInfo, setReadInfo] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    if (msg?.fromMe && msg.id <= readOutboxMaxId && chatId) {
      setReadInfo({ loading: true, data: null, error: null });
      safeFetch(`/api/chat/messages/${chatId}/${msg.id}/read-receipts`, {
        headers: { 'x-auth-token': token }
      })
      .then(res => {
        if (!res.__httpStatus || res.ok) {
          setReadInfo({ loading: false, data: res, error: null });
        } else {
          setReadInfo({ loading: false, data: null, error: res.error });
        }
      })
      .catch(err => {
        setReadInfo({ loading: false, data: null, error: err.message });
      });
    }
  }, [msg?.id, msg?.fromMe, readOutboxMaxId, chatId, token]);

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

  useEffect(() => {
    if (ref.current) {
      requestAnimationFrame(() => {
        const rect = ref.current.getBoundingClientRect();
        const chatContainer = document.querySelector('.mc') || document.body;
        const bounds = chatContainer.getBoundingClientRect();

        let ax = x;
        let ay = y;

        // Determine if menu initially overlaps right panel / bounds
        const overlapsRightPanel = ax + rect.width > bounds.right;
        let openedDirectionX = 'right';
        let openedDirectionY = 'down';

        if (ax + rect.width > bounds.right - 12) {
          ax = Math.max(bounds.left + 12, x - rect.width); // open left of cursor if possible
          openedDirectionX = 'left';
        }
        if (ax < bounds.left + 12) {
          ax = bounds.left + 12;
        }
        
        if (ay + rect.height > bounds.bottom - 12) {
          ay = Math.max(bounds.top + 12, y - rect.height); // open upward if possible
          openedDirectionY = 'up';
        }
        if (ay < bounds.top + 12) {
          ay = bounds.top + 12;
        }

        let maxHeight = bounds.height - 24;
        if (ay + rect.height > bounds.bottom - 12) {
          // If clamping pushes it out of bounds bottom, shrink it
          maxHeight = Math.min(maxHeight, bounds.bottom - ay - 12);
        }

        console.log(`[Context Menu Layout Debug]
- chatContainerRect: ${bounds.width}x${bounds.height} at (${bounds.left}, ${bounds.top})
- rawMenuPosition: (${x}, ${y})
- measuredMenuWidthHeight: ${rect.width}x${rect.height}
- finalClampedPosition: (${ax}, ${ay})
- openedDirection: ${openedDirectionX}/${openedDirectionY}
- overlapsRightPanel: ${overlapsRightPanel}`);

        setPos({ left: ax, top: ay, opacity: 1, maxHeight });
      });
    }
  }, [x, y, expandedPickerOpen, readInfo]);

  const Item=({icon,label,action,danger,sep})=>sep
    ? <div style={{height:1,background:'rgba(255,255,255,0.15)',margin:'4px 8px'}}/>
    : <div onClick={()=>{action?.();onClose()}}
        style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',
          gap:12,fontSize:14,color:danger?'#ef4444':'#e2e8f0',borderRadius:8,margin:'2px 6px',
          fontWeight:500, userSelect:'none'}}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <span style={{fontSize:18,width:24,textAlign:'center',display:'inline-block'}}>{icon}</span>{label}
      </div>

  const defaultEmojis = ['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡', '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡️', '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈', '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '🤝', '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿', '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️', '🤷', '🤷‍♀️', '😡'];
  const quickEmojis = ['👍', '❤️', '😂', '🔥', '🙏', '😎', '👎'];
  let emojisToRender = quickEmojis;
  let fullEmojis = defaultEmojis;
  let reactionsNotAllowed = false;
  let isFallback = false;
  let fallbackReason = '';
  let isLoading = false;

  if (allowedReactions) {
    if (allowedReactions.status === 'loading') {
      isLoading = true;
      emojisToRender = [];
    } else if (!allowedReactions.__httpStatus || allowedReactions.ok) {
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
    } else if (!allowedReactions.__httpStatus || allowedReactions.ok) {
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
      position:'fixed',left:pos.left,top:pos.top,zIndex:9999,
      background:'rgba(25, 20, 36, 0.95)', border:'1px solid rgba(255,255,255,0.05)',
      borderRadius:12,boxShadow:'0 16px 40px rgba(0,0,0,0.5)',
      display:'flex',flexDirection:'column',padding:expandedPickerOpen ? 0 : '8px 0',
      minWidth: expandedPickerOpen ? 300 : 200,
      height: expandedPickerOpen ? 350 : 'auto',
      maxHeight: pos.maxHeight ? pos.maxHeight : 'none',
      overflowY: 'auto',
      opacity: pos.opacity,
      transition: 'opacity 0.15s ease-out',
      backdropFilter: 'blur(10px)'
    }}>
      {expandedPickerOpen ? (
        <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
          <div style={{padding:'8px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:8, alignItems:'center'}}>
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
            <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} style={{display:'flex', gap:4, padding:'0 12px 8px 12px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexWrap:'nowrap', justifyContent:'space-between', marginBottom:4}}>
              {isFallback && <div style={{width:'100%', fontSize:10, color:'#6b4d94', textAlign:'center', marginBottom:4}}>Using fallback ({fallbackReason})</div>}
              {emojisToRender.slice(0, 6).map(renderEmojiButton)}
              
              {/* Expand button */}
              {fullEmojis.length > emojisToRender.length && (
                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpandedPickerOpen(true); }}
                style={{
                  background:'rgba(255,255,255,0.05)', border:'none', color:'#fff',
                  fontSize:16,cursor:'pointer',padding:'4px 6px',borderRadius:16,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  marginLeft: 'auto'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              )}
            </div>
          ) : (
            reactionsNotAllowed && <div style={{padding:'8px 12px', fontSize:12, color:'#a78bfa', textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.05)'}}>Reactions not allowed</div>
          )}
          
          {msg?.fromMe && (() => {
            const isRead = msg.id <= readOutboxMaxId;
            const status = msg.pending ? 'sending' : msg.failed ? 'failed' : isRead ? 'read' : 'sent';
            
            const formatTime = (ts) => {
              const d = new Date(ts * 1000);
              const now = new Date();
              const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
              
              const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              if (isToday) return `Today at ${timeStr}`;
              if (isYesterday) return `Yesterday at ${timeStr}`;
              return `${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`;
            };

            let timeText = 'Unknown status';
            let renderGroupReadReceipts = null;
            let errorText = null;

            if (status === 'read') {
              timeText = 'Seen';
              if (readInfo.error) {
                errorText = readInfo.error;
              } else if (readInfo.data) {
                if (readInfo.data.type === 'private' && readInfo.data.date) {
                  timeText = `Seen (${formatTime(readInfo.data.date)})`;
                } else if (readInfo.data.type === 'group' && readInfo.data.participants && readInfo.data.participants.length > 0) {
                  timeText = `Seen by ${readInfo.data.participants.length}`;
                  renderGroupReadReceipts = (
                    <div style={{maxHeight: 120, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4px 0'}}>
                      {readInfo.data.participants.map(p => (
                        <div key={p.userId} style={{padding: '6px 12px', fontSize: 13, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between'}}>
                          <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120}}>
                            {p.firstName || p.lastName ? `${p.firstName} ${p.lastName}` : (p.username ? `@${p.username}` : `User ${p.userId}`)}
                          </span>
                          <span style={{color: 'rgba(255,255,255,0.5)', fontSize: 12}}>
                            {p.date ? formatTime(p.date) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
              }
            } else if (status === 'sent') {
              timeText = 'Sent';
            } else if (status === 'sending') {
              timeText = 'Sending...';
            } else if (status === 'failed') {
              timeText = 'Failed';
            }
            
            return (
              <>
                <div style={{
                  display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                  color:'#fff', fontSize:14, cursor:'default', userSelect:'none'
                }}>
                  <span style={{color: msg.failed ? '#ef4444' : (isRead ? '#4ade80' : 'rgba(255,255,255,.6)'), display:'flex', alignItems:'center'}}>
                    {msg.pending ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    ) : msg.failed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    ) : isRead ? (
                      <svg width="20" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 6 7 17 2 12" />
                        <polyline points="22 10 13 19 11 17" />
                      </svg>
                    ) : (
                      <svg width="16" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </span>
                  <span style={{color:'rgba(255,255,255,0.9)'}}>
                    {timeText}
                  </span>
                </div>
                {renderGroupReadReceipts}
                <div style={{height:1, background:'rgba(255,255,255,0.05)', margin:'4px 0'}} />
              </>
            );
          })()}

          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>} label='Reply' action={onReply}/>
          {msg?.fromMe && <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>} label='Edit' action={onEdit}/>}
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>} label='Copy' action={onCopy}/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>} label='Translate' action={() => {}}/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>} label='Pin' action={onPin}/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>} label='Forward' action={onForward}/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>} label='Message info' action={onInfo}/>
          <Item sep/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>} label='Select' action={onSelect}/>
          <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>} label='Delete' action={onDelete} danger/>
          {msg?.fromMe && <Item icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>} label='Delete all' action={onDeleteAll} danger/>}
        </>
      )}
    </div>
  )
}



// ── AI Suggest Panel ──
function AISuggestPanel({text,suggestions,analysis,alternative,messages,loading,warning,onUse,onUseAlt,onUseAll,onRegenerate,onClose,hasResearch,aiInstruction,setAiInstruction,aiError,onReconnect, projectResearch, useResearch, setUseResearch, onRefreshResearch}) {
  const [editIdx,setEditIdx] = useState(null)
  const [edited,setEdited]   = useState({})

  const isResearchActive = projectResearch && !projectResearch.dismissed;
  const safeAiInstruction = (aiInstruction === "null" || aiInstruction == null) ? "" : aiInstruction;

  if(!text && !loading && (!suggestions || suggestions.length === 0) && !aiError && !safeAiInstruction && !isResearchActive) return null

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
    <div style={{margin:"0 16px 8px", background:"rgba(30,20,50,0.95)", backdropFilter:"blur(12px)",
      border:"1px solid rgba(124,58,237,.35)", borderRadius:12, overflow:"hidden", flexShrink:0,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)"}}>
      {/* Header */}
      
      {/* Project Research Card */}
      {isResearchActive && projectResearch.status === 'ready' && projectResearch.data && (
        <div style={{margin: "12px 16px", padding: 12, background: "rgba(0,0,0,0.4)", borderRadius: 8, border: "1px solid rgba(124,58,237,0.3)"}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
            <div>
              <div style={{fontSize: 14, fontWeight: 600, color: "#a78bfa"}}>
                {projectResearch.data.projectName || 'Project name unclear'} 
                <span style={{fontSize: 11, color: "#94a3b8", marginLeft: 8, fontWeight: 400}}>{projectResearch.data.category}</span>
              </div>
              <div style={{fontSize: 12, color: "#cbd5e1", marginTop: 4}}>{projectResearch.data.shortDescription}</div>
              <div style={{fontSize: 11, color: "#94a3b8", marginTop: 6}}><strong>Campaign/Stage:</strong> {projectResearch.data.productStage}</div>
              <div style={{fontSize: 11, color: "#94a3b8", marginTop: 2}}><strong>Likely Need:</strong> {projectResearch.data.currentNeeds}</div>
              <div style={{fontSize: 11, color: "#38bdf8", marginTop: 2}}><strong>Coincu Angle:</strong> {projectResearch.data.marketingAngle}</div>
            </div>
            <label style={{display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: useResearch ? "#a78bfa" : "#64748b"}}>
              <input type="checkbox" checked={useResearch} onChange={e => setUseResearch(e.target.checked)} style={{cursor: "pointer", accentColor: "#7c3aed"}} />
              Use research
            </label>
          </div>
          <div style={{display: "flex", gap: 12, marginTop: 10, fontSize: 11}}>
            <span style={{color: "#a78bfa", cursor: "pointer"}} onClick={() => alert(JSON.stringify(projectResearch.data, null, 2))}>View details</span>
            <span style={{color: "#64748b", cursor: "pointer"}} onClick={onRefreshResearch}>Refresh research</span>
          </div>
        </div>
      )}

      {/* Research Status */}
      {projectResearch && projectResearch.status === 'loading' && (
        <div style={{margin: "12px 16px", fontSize: 12, color: "#94a3b8"}}>
          <span className="spinner" style={{display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: 6}} />
          Researching project...
        </div>
      )}
      {projectResearch && projectResearch.status === 'error' && (
        <div style={{margin: "12px 16px", fontSize: 12, color: "#ef4444", display: "flex", alignItems: "center", gap: 8}}>
          Research unavailable, using chat context only.
          <span style={{cursor: "pointer", textDecoration: "underline"}} onClick={onRefreshResearch}>Retry</span>
        </div>
      )}

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
            value={safeAiInstruction}
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
          {aiError === 'TOKEN_EXPIRED' ? (
            <>
              <div style={{color:"#f87171", fontSize:13, fontWeight:600, textAlign:"center"}}>Session expired. Please reconnect or refresh your token.</div>
              <div style={{display:"flex", gap: 10}}>
                <button onClick={onRegenerate} disabled={loading} style={{background:"#ef4444", color:"#fff", border:"none", borderRadius:6, padding:"6px 16px", fontSize:13, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.5:1}}>
                  {loading ? "Retrying..." : "Retry"}
                </button>
                <button onClick={onReconnect} style={{background:"#4a5568", color:"#fff", border:"none", borderRadius:6, padding:"6px 16px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  Reconnect / Login again
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{color:"#f87171", fontSize:13, fontWeight:600, textAlign:"center"}}>{aiError}</div>
              <button onClick={onRegenerate} disabled={loading} style={{background:"#ef4444", color:"#fff", border:"none", borderRadius:6, padding:"6px 16px", fontSize:13, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.5:1}}>
                {loading ? "Retrying..." : "Retry"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Warning State */}
      {warning && !aiError && (
        <div style={{padding:"8px 16px", background:"rgba(245,158,11,.1)", color:"#fbbf24", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:8}}>
          <span>⚠️</span> {warning}
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
            <div key={i} style={{background:"rgba(0,0,0,0.5)",borderRadius:10,
              border:"1px solid rgba(124,58,237,.4)",overflow:"hidden"}}>
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
function LinkPreview({url, webPage}) {
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
    if(webPage) {
      setMeta({
        title: webPage.title || '',
        desc: webPage.description || '',
        domain: webPage.siteName || (() => { try { return new URL(webPage.displayUrl || webPage.url || url).hostname.replace('www.','') } catch { return url } })(),
        img: null // Telegram API needs dedicated fetch for webPage photo, omit for now to keep it fast
      });
      return;
    }
    
    if(!isVisible || meta||failed||!url) return
    if(linkCache[url]) { setMeta(linkCache[url]); return }
    safeFetch('https://api.allorigins.win/get?url='+encodeURIComponent(url))
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
  },[url, webPage, isVisible])
  
  if(!meta||failed) return <div ref={ref} />
  
  return (
    <a href={webPage?.url || url} target="_blank" rel="noreferrer"
      style={{display:"block",textDecoration:"none",marginTop:4}}>
      <div ref={ref} style={{background:"rgba(0,0,0,.15)",borderRadius:6,overflow:"hidden",
        borderLeft: "3px solid #3b82f6"}}>
        {meta.img&&<img src={meta.img} alt="" style={{width:"100%",maxHeight:140,objectFit:"cover",display:"block"}}
          onError={e=>e.target.style.display="none"}/>}
        <div style={{padding:"6px 10px"}}>
          <div style={{fontSize:12,color:"#3b82f6",marginBottom:2,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meta.domain}</div>
          {meta.title&&<div style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:2,lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{meta.title}</div>}
          {meta.desc&&<div style={{fontSize:13,color:"rgba(255,255,255,.6)",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{meta.desc}</div>}
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
const MediaSkeleton = () => (
  <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:4}}>
    {[...Array(12)].map((_, i) => (
      <div key={i} style={{aspectRatio:'1/1', background:'rgba(124,58,237,.15)', borderRadius:4, animation:'pulse 1.5s infinite ease-in-out'}} />
    ))}
  </div>
);

const RowSkeleton = () => (
  <div style={{display:'flex',flexDirection:'column',gap:12}}>
    {[...Array(6)].map((_, i) => (
      <div key={i} style={{display:'flex',gap:12,padding:12,borderRadius:8,alignItems:'center'}}>
        <div style={{width:40,height:40,borderRadius:8,background:'rgba(124,58,237,.15)', animation:'pulse 1.5s infinite ease-in-out'}} />
        <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
          <div style={{height:14, background:'rgba(124,58,237,.15)', borderRadius:4, width:'70%', animation:'pulse 1.5s infinite ease-in-out'}} />
          <div style={{height:12, background:'rgba(124,58,237,.15)', borderRadius:4, width:'40%', animation:'pulse 1.5s infinite ease-in-out'}} />
        </div>
      </div>
    ))}
  </div>
);

function UserProfileModal({ data, onClose, token, chats, setSel, inputRef, msgs, messagesLoaded, hasMore, onOpenMedia, setLightbox, activeAcc }) {
  const [status, setStatus] = useState(null)
  const [showMore, setShowMore] = useState(false)
  const [fullProfile, setFullProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('media')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState(null)
  
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
    const targetId = data?.chatId || data?.id;
    console.log('[Debug] UserProfileModal selectedUserId/targetId:', targetId, '| raw sender object:', data);
    if (!targetId) return;
    let isMounted = true
    console.log(`[Debug] Resolve endpoint URL: /api/chat/profile/${targetId}`);
    safeFetch(`/api/chat/profile/${targetId}`, { headers: {'x-auth-token': token} })
      .then(async r => {
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (r.__httpStatus >= 400) {
          if (r.status === 401 && typeof onAuthFailed === 'function') onAuthFailed();
          const err = r.catch(()=>({}));
          throw new Error(err.error || err.code || `HTTP ${r.status}`);
        }
        return r;
      })
      .then(d => { 
        if(isMounted && d.ok && d.full) {
          console.log('[Debug] Resolved profile object:', d.full);
          setFullProfile(d.full);
        }
      })
      .catch(e => console.error('[Debug] Resolve error:', e))
    return () => { isMounted = false }
  }, [data?.chatId, token])

  useEffect(() => {
    if (!data?.id) return
    let isMounted = true
    safeFetch(`/api/chat/status/${data.id}`, { headers: {'x-auth-token': token} })
      .then(async r => {
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (r.__httpStatus >= 400) {
          if (r.status === 401 && typeof onAuthFailed === 'function') onAuthFailed();
          const err = r.catch(()=>({}));
          throw new Error(err.error || err.code || `HTTP ${r.status}`);
        }
        return r;
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

  const fetchedTabsRef = useRef(new Set());
  
  useEffect(() => {
    if (!data) return;
    const keyBase = `${activeAcc}_${data.chatId}_${data.topicId||''}_${data.id}`;
    
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
    fetchedTabsRef.current.clear(); // Reset tracking on profile change
  }, [data?.id, data?.chatId, data?.topicId, activeAcc]);

  useEffect(() => {
    if (!data?.chatId && activeTab !== 'groups') return;
    if (!data?.id && activeTab === 'groups') return;
    
    if (!tabLoading[activeTab]) {
      if (tabData[activeTab].length === 0 && tabHasMore[activeTab]) {
        loadMore(activeTab);
      } else if (!fetchedTabsRef.current.has(activeTab)) {
        // Background refresh for latest items if already cached
        loadMore(activeTab, true);
      }
    }
  }, [activeTab, data?.chatId, data?.id, tabData]);

  const loadMore = (tab, isBackgroundRefresh = false) => {
    if (tabLoading[tab] || (!isBackgroundRefresh && !tabHasMore[tab])) return;
    fetchedTabsRef.current.add(tab);
    setTabLoading(prev => ({...prev, [tab]: true}));
    
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        controller.abort();
        setTabError(prev => ({...prev, [tab]: "Media is taking longer than usual"}));
        setTabLoading(prev => ({...prev, [tab]: false}));
      }
    }, 10000);

    if (tab === 'groups') {
      const accessHashQuery = data.accessHash ? `?accessHash=${data.accessHash}` : '';
      const usernameQuery = data.username ? (data.accessHash ? `&username=${data.username}` : `?username=${data.username}`) : '';
      
      safeFetch(`/api/chat/common_groups/${data.id}${accessHashQuery}${usernameQuery}`, { headers: {'x-auth-token': token}, signal: controller.signal })
        .then(async r => {
          clearTimeout(timeoutId);
          const ct = r.headers.get('content-type');
          if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
          if (r.__httpStatus >= 400) {
            if (r.status === 401 && typeof onAuthFailed === 'function') onAuthFailed();
          const err = r.catch(()=>({}));
            throw new Error(err.error || `HTTP ${r.status}`);
          }
          return r
        })
        .then(d => {
          if (isMounted && d.ok) {
             setTabData(prev => {
               const updated = d.groups || [];
               sharedMediaCache[`${activeAcc}_${data.chatId}_${data.topicId||''}_${data.id}_groups`] = { items: updated, hasMore: false, nextCursor: 0, error: null };
               return {...prev, groups: updated};
             });
             setTabHasMore(prev => ({...prev, groups: false}));
             setTabError(prev => ({...prev, groups: null}));
          }
        })
        .catch(e => {
          clearTimeout(timeoutId);
          console.error(e);
          if (isMounted && e.name !== 'AbortError') setTabError(prev => ({...prev, groups: e.message}));
        })
        .finally(() => {
          if (isMounted) setTabLoading(prev => ({...prev, groups: false}));
        });
      return () => { isMounted = false; controller.abort(); };
    }

    if (!data?.chatId) {
      setTabLoading(prev => ({...prev, [tab]: false}));
      return;
    }

    const fromUserQuery = isGroupProfile ? `&userId=${data.id}` : '';
    const accessHashQuery = (isGroupProfile && data.accessHash) ? `&accessHash=${data.accessHash}` : '';
    const topicIdQuery = isTopicInfo ? `&topicId=${data.topicId}` : '';
    
    const currentCursor = isBackgroundRefresh ? 0 : tabOffsetId[tab];
    console.log(`[Debug] Media tab type: ${tab} | API URL: /api/telegram/shared-media?chatId=${data.chatId}&type=${tab}${fromUserQuery}${accessHashQuery}${topicIdQuery}&cursor=${currentCursor}&limit=30`);
    
    safeFetch(`/api/telegram/shared-media?chatId=${data.chatId}&type=${tab}${fromUserQuery}${accessHashQuery}${topicIdQuery}&cursor=${currentCursor}&limit=30`, { headers: {'x-auth-token': token}, signal: controller.signal })
      .then(async r => {
        clearTimeout(timeoutId);
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('text/html')) throw new Error('API route not found or backend returned HTML');
        if (r.__httpStatus >= 400) {
          if (r.status === 401 && typeof onAuthFailed === 'function') onAuthFailed();
          const err = r.catch(()=>({}));
          throw new Error(err.error || err.code || `HTTP ${r.status}`);
        }
        return r;
      })
      .then(d => {
        if (isMounted && d.ok) {
           const items = d.items || d.media || [];
           const nextCursor = d.nextCursor || d.nextOffsetId || 0;
           console.log(`[Debug] Media API status success: ${tab} loaded ${items.length} items`);
           setTabData(prev => {
             // Deduplicate by id just in case
             const existingIds = new Set(prev[tab].map(m => m.id));
             const newItems = items.filter(m => !existingIds.has(m.id));
             let updated;
             if (isBackgroundRefresh) {
               updated = [...newItems, ...prev[tab]];
             } else {
               updated = [...prev[tab], ...newItems];
             }
             sharedMediaCache[`${activeAcc}_${data.chatId}_${data.topicId||''}_${data.id}_${tab}`] = {
               items: updated,
               hasMore: isBackgroundRefresh ? prev.hasMore : d.hasMore,
               nextCursor: isBackgroundRefresh ? prev.nextCursor : nextCursor,
               error: null
             };
             return {...prev, [tab]: updated};
           });
           if (!isBackgroundRefresh) {
             setTabHasMore(prev => ({...prev, [tab]: d.hasMore}));
             setTabOffsetId(prev => ({...prev, [tab]: nextCursor}));
           }
        } else if (isMounted && !d.ok) {
           console.log(`[Debug] Media API status error: ${tab} failed - ${d.error}`);
           setTabError(prev => ({...prev, [tab]: d.error || 'Failed to fetch'}));
        }
      })
      .catch(e => {
        clearTimeout(timeoutId);
        console.error(`[Debug] Media API throw error: ${tab} -`, e);
        if (isMounted && e.name !== 'AbortError') {
            setTabError(prev => {
                sharedMediaCache[`${activeAcc}_${data.chatId}_${data.topicId||''}_${data.id}_${tab}`] = { 
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

  const handleMessage = async () => {
    const existing = chats.find(c => c.id === data.id)
    if (existing) {
      setSel(existing)
      onClose()
      setTimeout(() => inputRef?.current?.focus(), 100)
    } else {
      console.log('[Fwd Debug] handleMessage clicked for:', data);
      let finalAccessHash = data.accessHash;
      let finalTitle = data.name || data.title;
      let finalUsername = data.username;
      
      if (!finalAccessHash && (data.username || data.id)) {
        setResolving(true);
        try {
          const queryParam = data.username ? `username=${data.username}` : `peerId=${data.id}`;
          console.log(`[Fwd Debug] Resolving entity via backend: ${queryParam}`);
          const json = await safeFetch(`/api/telegram/entities/resolve?${queryParam}`, { headers: {'x-auth-token': token} });
          console.log(`[Fwd Debug] Resolve response:`, json);
          
          if (!json.__httpStatus || json.ok) {
            finalAccessHash = json.accessHash;
            if (json.username) finalUsername = json.username;
            if (json.firstName) {
               finalTitle = json.firstName + (json.lastName ? ' ' + json.lastName : '');
            } else if (json.title) {
               finalTitle = json.title;
            }
          }
        } catch (e) {
          console.log('[Fwd Debug] Resolve failed:', e);
        }
        setResolving(false);
      }
      
      if (!finalAccessHash && !finalUsername) {
        setResolveError('Cannot message: Telegram user cannot be resolved.');
        return;
      }
      
      const newChat = {
        id: data.id,
        title: finalTitle,
        isUser: !data.isGroup && !data.isChannel,
        isGroup: data.isGroup,
        isChannel: data.isChannel,
        username: finalUsername,
        accessHash: finalAccessHash
      };
      
      console.log('[Fwd Debug] Opening new DM chat object:', newChat);
      
      setSel(newChat);
      onClose();
      setTimeout(() => inputRef?.current?.focus(), 100);
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

        {resolveError && (
          <div style={{background: 'rgba(229, 57, 53, 0.1)', color: '#e53935', padding: '10px 20px', fontSize: 13, borderBottom: '1px solid rgba(229, 57, 53, 0.2)'}}>
            {resolveError}
          </div>
        )}

        <div style={{flex:1, overflowY:'auto'}}>
          {/* Top Profile */}
          <div style={{padding:'20px',display:'flex',gap:16,alignItems:'center'}}>
            {isTopicInfo ? (
              <div style={{width: 72, height: 72, borderRadius: '50%', background: '#2b5278', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 600}}>
                #
              </div>
            ) : (() => {
              const fullUserObj = fullProfile?.users?.[0] || fullProfile?.chats?.[0];
              const resolvedName = fullUserObj ? [fullUserObj.firstName, fullUserObj.lastName].filter(Boolean).join(' ') : null;
              const hasName = data.name && data.name !== 'Unknown user' && data.name !== 'Unknown User';
              const displayName = hasName ? data.name : (resolvedName || 'Unknown User');
              return <Avatar name={displayName} chatId={data.id} username={data.username || fullUserObj?.username} accessHash={data.accessHash} size={72}/>;
            })()}
            <div style={{minWidth: 0, flex: 1}}>
              <div style={{fontSize:18,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {isTopicInfo ? data.topicTitle : (() => {
                    const fullUserObj = fullProfile?.users?.[0] || fullProfile?.chats?.[0];
                    const resolvedName = fullUserObj ? [fullUserObj.firstName, fullUserObj.lastName].filter(Boolean).join(' ') : null;
                    const hasName = data.name && data.name !== 'Unknown user' && data.name !== 'Unknown User';
                    return hasName ? data.name : (resolvedName || 'Unknown User');
                  })()}
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
            <div onClick={resolving ? undefined : handleMessage} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor: resolving ? 'wait' : 'pointer', color:'#7c3aed', gap:4}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>
                {resolving ? <span style={{display: 'inline-block', animation: 'spin 1s linear infinite'}}>⏳</span> : '💬'}
              </div>
              <span style={{fontSize:12}}>{resolving ? 'Opening...' : 'Message'}</span>
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
              <div style={{padding:20,textAlign:'center',color:'#e53935',fontSize:13}}>
                {tabError[activeTab].includes('API route not found') ? 'Shared media unavailable' : `Error: ${tabError[activeTab]}`}
              </div>
            )}

            {isFallback && activeTab !== 'groups' && (
              <div style={{padding:12,textAlign:'center',background:'rgba(229,57,53,.1)',color:'#e53935',fontSize:12,margin:'0 16px',borderRadius:8}}>
                Backend full history search unavailable.<br/>Loaded group messages only.
              </div>
            )}

            {activeTab === 'media' && (
              <div style={{display:'flex', flexDirection:'column', gap:16}}>
                {tabData.media.length === 0 && tabLoading.media ? (
                  <MediaSkeleton />
                ) : (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:4}}>
                    {(isFallback ? fallbackData.media : tabData.media).map(m => (
                      <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',cursor:'pointer',position:'relative'}} onClick={()=>handleMediaClick(m)}>
                        <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={()=>{}} thumb={1} />
                        {m.isVideo && <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'#fff',fontSize:24,textShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>▶</div>}
                      </div>
                    ))}
                  </div>
                )}
                {tabLoading.media && tabData.media.length > 0 ? (
                  <div style={{textAlign:'center', padding:10}}><div className="small-spinner" style={{display:'inline-block',width:16,height:16,border:'2px solid rgba(124,58,237,.3)',borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 1s linear infinite'}}/></div>
                ) : !isFallback && tabHasMore.media && tabData.media.length > 0 ? (
                  <div onClick={()=>loadMore('media')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>{tabError.media ? 'Retry' : 'Load More'}</div>
                ) : (isFallback ? fallbackData.media.length === 0 : tabData.media.length === 0) && !tabError.media && !tabLoading.media && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No media found</div>
                )}
              </div>
            )}
            {activeTab === 'files' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {tabData.files.length === 0 && tabLoading.files ? (
                  <RowSkeleton />
                ) : (
                  (isFallback ? fallbackData.files : tabData.files).map(m => (
                    <div key={m.id} onClick={()=>handleMediaClick(m)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:'rgba(124,58,237,.1)',padding:12,borderRadius:8}}>
                      <div style={{width:40,height:40,borderRadius:8,background:'#7c3aed',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📄</div>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.fileName || 'Document'}</div>
                        <div style={{fontSize:12,color:'#9b7ec8'}}>{new Date(m.date*1000).toLocaleString()} • {m.fileSize ? (m.fileSize/1024).toFixed(1)+' KB' : ''}</div>
                      </div>
                    </div>
                  ))
                )}
                {tabLoading.files && tabData.files.length > 0 ? (
                  <div style={{textAlign:'center', padding:10}}><div className="small-spinner" style={{display:'inline-block',width:16,height:16,border:'2px solid rgba(124,58,237,.3)',borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 1s linear infinite'}}/></div>
                ) : !isFallback && tabHasMore.files && tabData.files.length > 0 ? (
                  <div onClick={()=>loadMore('files')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>{tabError.files ? 'Retry' : 'Load More'}</div>
                ) : (isFallback ? fallbackData.files.length === 0 : tabData.files.length === 0) && !tabError.files && !tabLoading.files && (
                  <div style={{textAlign:'center',color:'#9b7ec8',paddingTop:10}}>No files found</div>
                )}
              </div>
            )}
            {activeTab === 'links' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {tabData.links.length === 0 && tabLoading.links ? (
                  <RowSkeleton />
                ) : (
                  (isFallback ? fallbackData.links : tabData.links).map((m, i) => {
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
                  })
                )}
                {tabLoading.links && tabData.links.length > 0 ? (
                  <div style={{textAlign:'center', padding:10}}><div className="small-spinner" style={{display:'inline-block',width:16,height:16,border:'2px solid rgba(124,58,237,.3)',borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 1s linear infinite'}}/></div>
                ) : !isFallback && tabHasMore.links && tabData.links.length > 0 ? (
                  <div onClick={()=>loadMore('links')} style={{textAlign:'center',color:'#7c3aed',cursor:'pointer',padding:8,background:'rgba(124,58,237,.1)',borderRadius:8}}>{tabError.links ? 'Retry' : 'Load More'}</div>
                ) : (isFallback ? fallbackData.links.length === 0 : tabData.links.length === 0) && !tabError.links && !tabLoading.links && (
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

function renderMessageText(text, searchStr, entities = []) {
  if (!text) return '';
  
  const parts = [];
  let lastIndex = 0;
  
  if (entities && entities.length > 0) {
    const sorted = [...entities].sort((a,b) => a.offset - b.offset);
    sorted.forEach((ent) => {
      if (ent.offset > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, ent.offset) });
      }
      const content = text.substring(ent.offset, ent.offset + ent.length);
      let href = ent.url || content;
      if (ent.className === 'MessageEntityTextUrl' || ent.className === 'MessageEntityUrl') {
        if (!href.match(/^https?:\/\//i)) href = 'https://' + href;
        parts.push({ type: 'link', content, href });
      } else if (ent.className === 'MessageEntityBold') {
        parts.push({ type: 'bold', content });
      } else if (ent.className === 'MessageEntityItalic') {
        parts.push({ type: 'italic', content });
      } else if (ent.className === 'MessageEntityCode' || ent.className === 'MessageEntityPre') {
        parts.push({ type: 'code', content });
      } else {
        parts.push({ type: 'text', content });
      }
      lastIndex = Math.max(lastIndex, ent.offset + ent.length);
    });
  } else {
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
      if (!href.match(/^https?:\/\//i)) href = 'https://' + href;
      parts.push({ type: 'link', content: url, href });
      if (trailing) {
        parts.push({ type: 'text', content: trailing });
      }
      lastIndex = offset + match.length;
      return match;
    });
  }
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }
  
  const renderContent = (content) => {
    const lines = content.split('\n');
    return lines.map((line, lineIdx) => {
      let renderedLine = line;
      if (searchStr && line.toLowerCase().includes(searchStr.toLowerCase())) {
        const searchParts = line.split(new RegExp(`(${searchStr})`, 'gi'));
        renderedLine = (
          <span>
            {searchParts.map((sp, i) => 
              sp.toLowerCase() === searchStr.toLowerCase() 
                ? <mark key={i} style={{background:"#f59e0b",color:"#000",borderRadius:2}}>{sp}</mark> 
                : sp
            )}
          </span>
        );
      }
      return (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {renderedLine}
        </React.Fragment>
      );
    });
  };
  
  return parts.map((part, idx) => {
    if (part.type === 'link') {
      return (
        <a key={idx} href={part.href} target="_blank" rel="noopener noreferrer" 
           onClick={e => e.stopPropagation()}
           className="msg-link"
           style={{ color: '#8b5cf6', textDecoration: 'none' }}
           onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
           onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
          {renderContent(part.content)}
        </a>
      );
    }
    if (part.type === 'bold') return <strong key={idx}>{renderContent(part.content)}</strong>;
    if (part.type === 'italic') return <em key={idx}>{renderContent(part.content)}</em>;
    if (part.type === 'code') return <code key={idx} style={{background: "rgba(0,0,0,0.1)", padding: "2px 4px", borderRadius: 4, fontFamily: "monospace", fontSize: "0.9em"}}>{renderContent(part.content)}</code>;
    
    return <span key={idx} style={{whiteSpace: 'pre-wrap'}}>{renderContent(part.content)}</span>;
  });
}
function AccountMenu({ accounts, activeAccountId, onClose, onAddAccount, onSwitchAccount, onAuthFailed, onLogout, onOpenSettings }) {
  const activeAcc = accounts.find(a => a.accountId === activeAccountId) || accounts[0];
  
  return (
    <div style={{
      position: 'absolute', bottom: 60, left: 20, width: 280,
      background: '#1c1c1d', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      border: '1px solid #2c2c2e', zIndex: 99999, overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      {/* Active Account Info */}
      <div style={{ padding: '16px', borderBottom: '1px solid #2c2c2e', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 600 }}>
          {activeAcc?.displayName ? activeAcc.displayName.charAt(0).toUpperCase() : 'A'}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeAcc?.displayName || 'Unknown Account'}
          </div>
          <div style={{ color: '#8e8e93', fontSize: 13, marginTop: 2 }}>
            {activeAcc?.phone || activeAcc?.username || 'Telegram Connected'}
          </div>
        </div>
      </div>
      


      {/* Account List */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {accounts.map(acc => (
          <div key={acc.accountId} 
            onClick={() => { onSwitchAccount(acc.accountId); onClose(); }}
            style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: acc.accountId === activeAccountId ? 'rgba(124,58,237,0.1)' : 'transparent' }}
            onMouseEnter={e => { if(acc.accountId !== activeAccountId) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { if(acc.accountId !== activeAccountId) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: acc.accountId === activeAccountId ? '#7c3aed' : '#3a3a3c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {acc.displayName ? acc.displayName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: acc.accountId === activeAccountId ? '#fff' : '#e5e5ea', fontSize: 14, fontWeight: 500 }}>
                {acc.displayName || acc.accountId}
              </div>
              <div style={{ color: '#8e8e93', fontSize: 12, marginTop: 2 }}>
                {acc.phone ? `+${acc.phone}` : (acc.username ? `@${acc.username}` : 'Telegram account')}
              </div>
            </div>
            {acc.accountId === activeAccountId && <div style={{ color: '#7c3aed', fontSize: 16 }}>✓</div>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '8px 0', borderTop: '1px solid #2c2c2e' }}>
        <div onClick={() => { if(typeof onOpenSettings === 'function') onOpenSettings(); onClose(); }} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#f2f2f7', fontSize: 14 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 18 }}>⚙️</span> Settings
        </div>
        <div onClick={() => { onAddAccount(); onClose(); }} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#f2f2f7', fontSize: 14 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 18 }}>➕</span> Add Account
        </div>
        <div onClick={onClose} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#f2f2f7', fontSize: 14 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 18 }}>⚙️</span> Manage Accounts
        </div>
        <div onClick={() => { if(typeof onAuthFailed === 'function') onAuthFailed(); onClose(); }} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#f2f2f7', fontSize: 14 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 18 }}>🔌</span> Reconnect TG
        </div>
        <div onClick={() => { if(typeof onLogout === 'function') onLogout(); onClose(); }} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#ff453a', fontSize: 14 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,69,58,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 18 }}>🚪</span> Sign Out
        </div>
      </div>
    </div>
  );
}

function AddAccountModal({ onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phone Login State
  const [phone, setPhone] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [accountId, setAccountId] = useState(''); // E.g., short name for the account

  // Session String State
  const [sessionStr, setSessionStr] = useState('');

  const tabStyle = (id) => ({
    flex: 1, textAlign: 'center', padding: '10px 0', cursor: 'pointer',
    color: activeTab === id ? '#7c3aed' : '#8e8e93',
    borderBottom: activeTab === id ? '2px solid #7c3aed' : '2px solid transparent',
    fontWeight: activeTab === id ? 600 : 500,
    fontSize: 14, transition: 'all 0.2s'
  });

  const generateAccountId = (prefix = 'acc') => prefix + '_' + Math.random().toString(36).substr(2, 6);

  const handleSendCode = async () => {
    if (!phone) return setError('Phone is required');
    setError('');
    setLoading(true);
    const newId = generateAccountId(phone.replace(/[^0-9]/g, ''));
    setAccountId(newId);
    try {
      const res = await fetch('/api/tg/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': _authToken },
        body: JSON.stringify({ phone, accountId: newId })
      });
      ;
      if (data.__httpStatus >= 400) throw new Error(data.error);
      setPhoneCodeHash(data.phoneCodeHash);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code) return setError('Code is required');
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/tg/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': _authToken },
        body: JSON.stringify({ phone, code, phoneCodeHash, password, accountId })
      });
      const data = res;
      if (data.__httpStatus >= 400) {
        if (data.error && data.error.includes('SESSION_PASSWORD_NEEDED')) {
          setNeedsPassword(true);
          return;
        }
        throw new Error(data.error);
      }
      if (onSuccess) onSuccess(data.accountId || accountId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSession = async () => {
    if (!sessionStr) return setError('Session string is required');
    setError('');
    setLoading(true);
    const newId = generateAccountId('import');
    try {
      const res = await fetch('/api/telegram/accounts/add-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': _authToken },
        body: JSON.stringify({ sessionString: sessionStr.trim(), accountId: newId })
      });
      const data = res;
      if (data.__httpStatus >= 400) throw new Error(data.error);
      if (onSuccess) onSuccess(data.accountId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        width: 400, background: '#1c1c1d', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2c2c2e' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Add Account</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {error && (
          <div style={{ margin: '20px 20px 0', padding: '10px 14px', background: 'rgba(255,69,58,0.1)', color: '#ff453a', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,69,58,0.2)' }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 20px', marginTop: 10, borderBottom: '1px solid #2c2c2e' }}>
          <div style={tabStyle('phone')} onClick={() => { setActiveTab('phone'); setError(''); }}>Phone Number</div>
          <div style={tabStyle('session')} onClick={() => { setActiveTab('session'); setError(''); }}>Session String</div>
        </div>

        {/* Content */}
        <div style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 200 }}>
          {activeTab === 'phone' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!phoneCodeHash ? (
                <>
                  <div>
                    <div style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8 }}>Phone Number (with country code)</div>
                    <input type="text" placeholder="+1 234 567 8900" value={phone} onChange={e => setPhone(e.target.value)} disabled={loading} style={{ width: '100%', padding: '12px 16px', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none' }} />
                  </div>
                  <button onClick={handleSendCode} disabled={loading} style={{ width: '100%', padding: '12px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Sending...' : 'Send Code'}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <div style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8 }}>Login Code</div>
                    <input type="text" placeholder="12345" value={code} onChange={e => setCode(e.target.value)} disabled={loading} style={{ width: '100%', padding: '12px 16px', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none' }} />
                  </div>
                  {needsPassword && (
                    <div>
                      <div style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8 }}>2FA Password</div>
                      <input type="password" placeholder="Enter your 2FA password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} style={{ width: '100%', padding: '12px 16px', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 15, outline: 'none' }} />
                    </div>
                  )}
                  <button onClick={handleVerifyCode} disabled={loading} style={{ width: '100%', padding: '12px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Verifying...' : 'Verify Login'}
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'session' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ color: '#8e8e93', fontSize: 13, marginBottom: 8 }}>StringSession</div>
                <textarea placeholder="Paste your generated StringSession here..." value={sessionStr} onChange={e => setSessionStr(e.target.value)} disabled={loading} style={{ width: '100%', height: 100, padding: '12px 16px', background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', resize: 'none' }} />
              </div>
              <button onClick={handleImportSession} disabled={loading} style={{ width: '100%', padding: '12px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Importing...' : 'Import Session'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default function CRMChat({ token, onAuthFailed, onTokenRefresh, onLogout }) {
  _authToken = token
  const [theme,setTheme]=useState(()=>localStorage.getItem('crm_theme')||'dark')
  
  // ── MULTI-ACCOUNT STATE ──
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccId] = useState(() => localStorage.getItem('crmchat_active_account') || 'default');
  const [sseStatus, setSseStatus] = useState('connecting');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Sync activeAccountId with global interceptor var
  useEffect(() => { setActiveAccountId(activeAccountId); }, [activeAccountId]);

  const fetchAccounts = useCallback(() => {
    safeFetch('/api/telegram/accounts', { headers: { 'x-auth-token': token } })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAccounts(data);
          
          const currActive = localStorage.getItem('crmchat_active_account') || 'default';
          const activeCanonical = data.find(a => a.isActive);
          
          let targetActiveId = currActive;
          if (activeCanonical) {
            targetActiveId = activeCanonical.accountId;
          } else {
            const exists = data.find(a => a.accountId === currActive);
            if (!exists) {
              const first = data.find(a => a.sessionStatus === 'connected') || data[0];
              targetActiveId = first.accountId;
            }
          }

          if (targetActiveId !== currActive) {
            console.log('[Multi-Account] Migrating active account from', currActive, 'to canonical', targetActiveId);
            localStorage.setItem('crmchat_active_account', targetActiveId);
          } else {
            console.log('[Multi-Account] Restored active account:', targetActiveId);
          }
          
          setActiveAccId(targetActiveId);
          setActiveAccountId(targetActiveId); // global interceptor
        } else {
          setAccounts([{ accountId: 'default', displayName: 'Default Account', sessionStatus: 'connected' }]);
        }
      })
      .catch(() => {
        setAccounts([{ accountId: 'default', displayName: 'Default Account', sessionStatus: 'connected' }]);
      });
  }, [token]);

  // Load Accounts on Mount
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

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
  
  const [projectResearch, setProjectResearch] = useState(null)
  const [useResearch, setUseResearch] = useState(true)
  
  useEffect(() => {
    setProjectResearch(null);
    setUseResearch(true);
  }, [sel?.id, selTopic?.id]);

  const msgsCacheRef = useRef({})
  const chatsCacheRef = useRef({})
  const activeAccRef = useRef(activeAccountId);
  useEffect(() => { activeAccRef.current = activeAccountId; }, [activeAccountId]);
  const [search,setSearch]=useState(() => {
    const init = localStorage.getItem('crm_search');
    return (init === 'null' || init == null) ? '' : init;
  })
  const [globalMatches, setGlobalMatches] = useState([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [hasSearchedGlobal, setHasSearchedGlobal] = useState(true)
  const [globalSearchTriggered, setGlobalSearchTriggered] = useState(false)
  const [customOrder, setCustomOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('crm_chat_custom_order') || '[]')
    } catch {
      return []
    }
  })
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const [activeTranslations, setActiveTranslations] = useState({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState('Vietnamese')

  const handleTranslate = async () => {
    if (!sel && !selTopic) return;
    
    // Collect all text messages in the current view that haven't been translated
    const msgsToTranslate = msgs.filter(m => {
      const voiceTranscript = m.media?.document ? localStorage.getItem(`transcript_${m.id}`) : null;
      const text = m.text || voiceTranscript || m.message || '';
      return text.trim().length > 0 && !activeTranslations[m.id];
    });
    
    if (msgsToTranslate.length === 0) {
      toast.success('No new messages to translate.');
      return;
    }
    
    setIsTranslating(true);
    
    try {
      const payload = {
        chatId: sel?.id,
        topicId: selTopic?.id,
        messageIds: msgsToTranslate.map(m => m.id),
        messages: msgsToTranslate.map(m => {
          const voiceTranscript = m.media?.document ? localStorage.getItem(`transcript_${m.id}`) : null;
          return {
            id: m.id,
            text: m.text || voiceTranscript || m.message || ''
          };
        }),
        targetLanguage: translateTargetLanguage,
        sourceLanguage: 'auto'
      };
      
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(payload)
      });
      
      const data = res;
      if (data.__httpStatus >= 400) {
        toast.error(data.error || 'Translation failed');
        return;
      }
      
      const newTranslations = { ...activeTranslations };
      for (const t of data.translations) {
        const cacheKey = `${t.messageId}_${t.targetLanguage}`;
        translationCache.set(cacheKey, t.translatedText);
        newTranslations[t.messageId] = t.translatedText;
      }
      
      setActiveTranslations(newTranslations);
    } catch (e) {
      console.error('Translation error:', e);
      toast.error('Failed to connect to translation service');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!search.trim()) return;
    setGlobalSearchTriggered(true);
    setIsGlobalSearching(true);
    try {
      const url = `/api/telegram/search?q=${encodeURIComponent(search.trim())}`
      const data = await safeFetch(url, { headers: { 'x-auth-token': token } })
      if (!res.__httpStatus || res.ok) {
        
        const query = search.trim().toLowerCase()
        const strictMatches = (data || []).filter(c => {
          const name = (c.name || '').toLowerCase()
          const username = (c.username || '').toLowerCase()
          return name.includes(query) || username.includes(query)
        }).slice(0, 20)
        setGlobalMatches(strictMatches)
      }
    } catch (e) {
      console.error('Global search error', e)
    } finally {
      setIsGlobalSearching(false)
      setHasSearchedGlobal(true)
    }
  };

  useEffect(() => {
    setGlobalMatches([])
    setGlobalSearchTriggered(false)
    if (!search.trim()) {
       setHasSearchedGlobal(true)
    } else {
       setHasSearchedGlobal(false)
    }
  }, [search])

  const handleResetOrder = () => {
    setCustomOrder([]);
    localStorage.removeItem('crm_chat_custom_order');
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    let newOrder = [...customOrder];
    const draggedId = filtered[draggedIndex].id;
    const targetId = filtered[index].id;

    // Ensure all items in preSearchFiltered are in newOrder if they aren't already
    const existingSet = new Set(newOrder);
    preSearchFiltered.forEach(c => {
      if (!existingSet.has(c.id)) {
        newOrder.push(c.id);
      }
    });

    // Move draggedId to targetId's position
    newOrder = newOrder.filter(id => id !== draggedId);
    const targetIdx = newOrder.indexOf(targetId);
    if (targetIdx !== -1) {
      newOrder.splice(targetIdx, 0, draggedId);
    } else {
      newOrder.push(draggedId);
    }

    setCustomOrder(newOrder);
    localStorage.setItem('crm_chat_custom_order', JSON.stringify(newOrder));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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
  const [messageFetchError, setMessageFetchError] = useState(null)
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
        const data = await safeFetch(`/api/chat/status/${sel.id}`, {headers:{"x-auth-token":token}})
        
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
      const data = await safeFetch(`/api/chat/members/${sel.id}`, { headers: { "x-auth-token": token }})
      console.log(`[Members API] URL: /api/chat/members/${sel.id}, Status: ${res.status}`)
      
      if (res.status === 401) {
        setMembersError("TOKEN_EXPIRED")
        return
      }
      if (res.status === 403) {
        setMembersError("Unable to load members due to Telegram permission limits.")
        return
      }
      
      
      if (!data.__httpStatus || data.ok) {
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
  const [aiWarning, setAiWarning] = useState(null)
  const [aiInstruction,setAiInstruction]=useState("")
  const msgsRef = useRef([])
  useEffect(()=>{ msgsRef.current = msgs },[msgs])

  const pendingReactionsRef = useRef({})
  const mergeReactions = (msgId, backendReactions = []) => {
    // 1. Start with the backend reactions as truth
    const mergedMap = new Map()
    for (const r of backendReactions) {
      if (!r || r.count === 0) continue
      const key = r.type === 'custom' ? `custom_${r.customEmojiId}` : `emoji_${r.emoticon}`
      mergedMap.set(key, { ...r })
    }

    // 2. Check for recent pending optimistic reactions (within 10s)
    const pending = pendingReactionsRef.current[msgId]
    if (pending && Date.now() - pending.timestamp < 10000) {
      for (const pr of pending.reactions) {
        if (!pr || pr.count === 0) continue
        const key = pr.type === 'custom' ? `custom_${pr.customEmojiId}` : `emoji_${pr.emoticon}`
        
        // If backend hasn't reflected our optimistic choice yet, apply optimistic choice
        if (pr.chosen && !mergedMap.has(key)) {
          mergedMap.set(key, { ...pr })
        } else if (pr.chosen && mergedMap.has(key)) {
          mergedMap.get(key).chosen = true
        }
      }
    }

    return Array.from(mergedMap.values())
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
      const d = await safeFetch(url, { headers: { 'x-auth-token': token } });
      console.log('response status', res.status);
      ;
      console.log('allowedReactionsFetchStatus', d);
      console.log('source', d.source || 'fallback');
      console.log('allowAll', d.allowAll);
      console.log('reactions returned', d.reactions);
      if (d.__httpStatus >= 400) console.log('fallback reason', d.error);
      
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
  const [loadingChats, setLoadingChats] = useState(false)

  // Background Settings State
  const [bgOption, setBgOption] = useState(() => localStorage.getItem('crm_bg_option') || 'Default dark doodle');
  const [bgCustomUrl, setBgCustomUrl] = useState(() => localStorage.getItem('crm_bg_custom') || '');
  const [bgOpacity, setBgOpacity] = useState(() => {
    const val = localStorage.getItem('crm_bg_opacity');
    return val ? parseFloat(val) : 0.2;
  });
  const [showBgSettings, setShowBgSettings] = useState(false);

  // Main Menu States
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

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

  // --- Auto Project Detection ---
  const doProjectResearch = useCallback((links, projectName) => {
    console.log('[DEBUG] shouldResearch', true, 'detectedLinks', links);
    setProjectResearch(prev => ({...prev, status: 'loading'}));
    
    const payload = {
      accountId: activeAccRef.current,
      chatId: sel?.id,
      projectName: projectName || 'Unknown',
      links: links,
      recentMessages: msgs.slice(-10)
    };
    
    safeFetch('/api/ai/research-project', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify(payload) })
    .then(d => {
       console.log('[DEBUG] researchApiStatus', d);
       if (!d.__httpStatus || d.ok) {
         setProjectResearch({ status: 'ready', data: d.research });
         setUseResearch(true);
       } else {
         setProjectResearch({ status: 'error' });
       }
    })
    .catch(e => {
       console.log('[DEBUG] researchApiError', e);
       setProjectResearch({ status: 'error' });
    });
  }, [msgs, sel?.id, token]);

  useEffect(() => {
    if (!msgs || msgs.length === 0 || !sel) return;
    
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.fromMe || lastMsg.pending) return;
    
    // Only detect once per message ID for this chat
    if (projectResearch && projectResearch.lastScannedMsgId === lastMsg.id) return;
    if (projectResearch && projectResearch.status === 'loading') return;
    if (projectResearch && projectResearch.status === 'ready') return;
    
    const text = lastMsg.text || "";
    const linkRegex = /(https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|t\.me|coinmarketcap\.com|coingecko\.com)[^\s]+)|(https?:\/\/[a-zA-Z0-9-]+\.(?:io|xyz|network|finance|money|tech|app|org)[^\s]*)|(docs\.[a-zA-Z0-9-]+\.[a-zA-Z]+[^\s]*)/gi;
    const matches = text.match(linkRegex);
    
    if (matches && matches.length > 0) {
      setProjectResearch({ status: 'loading', lastScannedMsgId: lastMsg.id });
      doProjectResearch(matches, 'Unknown');
    } else {
      setProjectResearch(prev => ({ ...(prev || {}), lastScannedMsgId: lastMsg.id }));
    }
  }, [msgs.length, doProjectResearch, sel, projectResearch]);

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
      const d = await safeFetch(url,{headers:{"x-auth-token":token}})
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
          const result = updatedData.map(c => {
             const readTime = localReadState[c.id];
             if (readTime && (!c.lastMessageAt || c.lastMessageAt * 1000 <= readTime)) {
                return { ...c, unread: 0 }
             }
             return c;
          })
          
          chatsCacheRef.current[activeAccRef.current] = result;
          return result;
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

  useEffect(()=>{ 
    if (chatsCacheRef.current[activeAccountId]) {
      setChats(chatsCacheRef.current[activeAccountId])
    } else {
      setChats([])
    }
    fetchChats() 
  }, [fetchChats, activeAccountId])

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

    safeFetch('/api/chat/read', { method: 'POST', headers: {'Content-Type': 'application/json', 'x-auth-token': token}, body: JSON.stringify({ chatId, maxId: maxMsgId })
    }).catch(err => console.error("Auto read error", err))
  }, [token])

  const handleScroll = (e) => {
    const msgsContainer = e.target
    const { scrollTop, scrollHeight, clientHeight } = msgsContainer
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 150
    if (sel?.id) {
      const scrollKey = activeAccRef.current + '_' + sel.id + (selTopic ? '_' + selTopic.id : '')
      
      const msgElements = Array.from(msgsContainer.querySelectorAll('[data-msg-id]'))
      let anchorId = null
      let offset = 0
      const containerRect = msgsContainer.getBoundingClientRect()
      for (const el of msgElements) {
         const rect = el.getBoundingClientRect()
         if (rect.bottom > containerRect.top) {
            anchorId = el.getAttribute('data-msg-id')
            offset = rect.top - containerRect.top
            break
         }
      }

      scrollPositions.current[scrollKey] = { anchorId, offset, scrollTop }
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
       setProjectResearch(null)
       setUseResearch(false)
       chatOrTopicChanged = true
       prevSelId.current = sel.id
       prevSelTopicId.current = null
       setForceNormalView(false)
       setTopicError(false)
       setMessageFetchError(null)
       setPinnedMessage(null) // reset pin on chat change
       setDismissedTranslate(localStorage.getItem(`dismissed_translate_${sel.id}_main`) === 'true')
       setDismissedPin(localStorage.getItem(`dismissed_pin_${sel.id}_main`) === 'true')
    } else if (prevSelTopicId.current !== selTopic?.id) {
       prevSelTopicId.current = selTopic?.id
       chatOrTopicChanged = true
       setPinnedMessage(null) // reset pin on topic change
       setDismissedTranslate(localStorage.getItem(`dismissed_translate_${sel.id}_${selTopic?.id}`) === 'true')
       setDismissedPin(localStorage.getItem(`dismissed_pin_${sel.id}_${selTopic?.id}`) === 'true')
    }
    
    if (chatOrTopicChanged) {
      hasRestoredScroll.current = false
      const cacheKey = activeAccRef.current + '_' + sel.id + (currentTopic ? '_' + currentTopic.id : '')
      
      console.log('[DEBUG] Chat Selected:', {
        selectedChatId: sel.id,
        selectedChatTitle: sel.title || sel.firstName || sel.name,
        isGroup: sel.isGroup || false,
        isForum: isChatActuallyForum(sel),
        topicCount: sel.topicCount || 0,
        topicsFetched: !!topics[sel.id],
        openedView: (isChatActuallyForum(sel) && !currentTopic && !forceNormalView) ? 'topics' : (currentTopic ? 'topicMessages' : 'normalChat'),
        selectedTopicId: currentTopic?.id || null,
        messageFetchKey: cacheKey
      });

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
    
    if (isChatActuallyForum(sel) && !currentTopic && !forceNormalView) {
      setLoadingTopics(true)
      setTopicError(false)
      safeFetch(`/api/chat/topics/${sel.id}?t=${Date.now()}`, { headers: {"x-auth-token": token} })
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
    safeFetch(`/api/telegram/messages/pinned?chatId=${sel.id}${currentTopic ? '&topicId='+currentTopic.id : ''}`, { headers:{'x-auth-token':token} })
    .then(r => r)
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
    if (aiSuggestions.length > 0 || aiError || aiText || aiWarning) {
      setAiSuggestions([]); setAiText(""); setAiError(null); setAiWarning(null);
    }
  },[msgs?.length, lastClientMsgText])

  // Clear AI error when command input changes, but keep suggestions until Generate is clicked
  useEffect(() => {
    if (aiError || aiWarning) {
      setAiError(null);
      setAiWarning(null);
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
        const scrollKey = activeAccRef.current + '_' + sel?.id + (selTopic ? '_' + selTopic.id : '')
        const savedState = scrollPositions.current[scrollKey]
        const container = document.querySelector('.msgs')
        
        if (savedState && container) {
          if (savedState.anchorId) {
            const anchorEl = container.querySelector(`[data-msg-id="${savedState.anchorId}"]`)
            if (anchorEl) {
               container.scrollTop = anchorEl.offsetTop - (savedState.offset || 0)
            } else {
               container.scrollTop = savedState.scrollTop || 0
            }
          } else if (typeof savedState === 'number') { // legacy fallback
            container.scrollTop = savedState
          } else {
            container.scrollTop = savedState.scrollTop || 0
          }
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
    if (!token || !activeAccountId) return
    
    let sse = null
    let retryCount = 0
    let reconnectTimeout = null
    let watchdogInterval = null
    let lastPing = Date.now()

    const connectSSE = () => {
      setSseStatus('connecting');
      sse = new EventSource('/api/chat/stream?token=' + encodeURIComponent(token) + '&accountId=' + activeAccountId)
      
      sse.onopen = () => {
        retryCount = 0
        lastPing = Date.now()
        setSseStatus('connected');
        console.log('[DEBUG] realtimeConnected', true, 'accountId', activeAccountId)
        fetchChats()
        if (selRef.current) {
           loadMessages(selRef.current)
        }
        
        watchdogInterval = setInterval(() => {
          if (Date.now() - lastPing > 20000) {
            console.log('[DEBUG] SSE Watchdog timeout, reconnecting...')
            if (sse) sse.close()
            setSseStatus('error')
            connectSSE()
          }
        }, 5000)
      }

      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'ping' || data.type === 'connected') {
            lastPing = Date.now()
            return
          }
          if (data.type === 'new_message') {
            const msg = data.message
            console.log('[DEBUG] updateReceived', true, 'updateType', data.type, 'accountId', data.accountId, 'chatId', msg.chatId, 'messageId', msg.id)
            
            // 1. Update chats list and unread count
            setChats(prev => {
              const newChats = [...prev]
              const idx = newChats.findIndex(c => c.id?.toString() === msg.chatId?.toString())
              if (idx > -1) {
                const c = newChats[idx]
                if (selRef.current?.id?.toString() !== msg.chatId?.toString() && !msg.fromMe) {
                  c.unread = (c.unread || 0) + 1
                }
                c.lastMessage = msg.hasMedia ? '[Media]' : msg.text
                c.lastMessageText = msg.text
                c.lastMessageAt = msg.date
                c.lastActivity = msg.date
                c.date = msg.date
                
                chatsCacheRef.current[activeAccRef.current] = newChats;
                
                console.log('[DEBUG] sidebarUpdated', {
                  updateSource: 'realtime',
                  activeAccountId: activeAccRef.current,
                  chatId: msg.chatId,
                  newLastActivity: msg.date,
                  pinned: c.isPinned
                })
                
                return newChats
              } else {
                setTimeout(() => fetchChats(false), 1000)
              }
              return newChats
            })

            // 2. Append to msgs if in active chat
            const isSameChat = selRef.current?.id?.toString() === msg.chatId?.toString();
            const isSameTopic = !selRef.current?.isForum || (msg.topicId && selTopicRef.current?.id === msg.topicId) || (!msg.topicId && !selTopicRef.current);
            console.log('[DEBUG] active chatId/topicId', selRef.current?.id, selTopicRef.current?.id)
            
            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                if (prev.some(m => m.id === msg.id)) {
                  console.log('[DEBUG] duplicateSkipped', true)
                  return prev;
                }
                msg.reactions = mergeReactions(msg.id, msg.reactions || []);
                const pendingIdx = prev.findIndex(m => m.pending && m.text === msg.text && m.fromMe);
                let updated;
                if (pendingIdx > -1) {
                  updated = [...prev];
                  updated[pendingIdx] = msg;
                  console.log('[DEBUG] tempMessageReplaced', true)
                } else {
                  updated = [...prev, msg];
                }
                console.log('[DEBUG] messageMerged', true)
                const nextState = updated.sort((a,b) => a.date - b.date)
                msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState
                return nextState
              })
              
              setAiSuggestions([])
              setAiText('')

              if (!msg.fromMe && document.hasFocus()) {
                markChatAsRead(msg.chatId, msg.topicId, msg.id)
              }
            }
          }
          else if (data.type === 'delete_messages') {
             const { ids, chatId } = data
             if (selRef.current?.id?.toString() === chatId?.toString()) {
                setMsgs(prev => {
                  const nextState = prev.filter(m => !ids.includes(m.id))
                  msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState
                  return nextState
                })
             }
          }
          else if (data.type === 'read_outbox') {
             const { chatId, maxId } = data;
             setChats(prev => prev.map(c => c.id?.toString() === chatId?.toString() ? { ...c, readOutboxMaxId: Math.max(c.readOutboxMaxId || 0, maxId) } : c));
             if (selRef.current?.id?.toString() === chatId?.toString()) {
                 setSel(prev => prev ? { ...prev, readOutboxMaxId: Math.max(prev.readOutboxMaxId || 0, maxId) } : prev);
             }
          }
          else if (data.type === 'update_reactions') {
            const { chatId, msgId, topicId, reactions, recentReactions } = data;
            const isSameChat = selRef.current?.id?.toString() === chatId?.toString();
            const isSameTopic = !selRef.current?.isForum || (topicId && selTopicRef.current?.id === topicId) || (!topicId && !selTopicRef.current);
            
            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                const idx = prev.findIndex(m => m.id === msgId);
                if (idx === -1) return prev;
                
                const updatedMsgs = [...prev];
                updatedMsgs[idx] = { 
                  ...updatedMsgs[idx], 
                  reactions: mergeReactions(msgId, reactions || []),
                  recentReactions: recentReactions || []
                };
                msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = updatedMsgs;
                return updatedMsgs;
              });
            }
          }
        } catch (err) {
          console.error('SSE parse error:', err)
        }
      }

      sse.onerror = () => {
        setSseStatus('error');
        sse.close()
        const delay = Math.min(10000, 1000 * Math.pow(2, retryCount++))
        reconnectTimeout = setTimeout(connectSSE, delay)
      }
    }

    connectSSE()

    return () => {
      clearInterval(watchdogInterval)
      clearTimeout(reconnectTimeout)
      if (sse) sse.close()
    }
  }, [token, activeAccountId])

  // Fallback Polling (if SSE fails)
  useEffect(() => {
    if (!token) return;
    let pollInterval;
    let sidebarPollInterval;
    if (sseStatus !== 'connected') {
      console.log('[DEBUG] pollingFallbackActive', true)
      
      // Lightweight sidebar polling every 15s
      sidebarPollInterval = setInterval(() => {
        fetchChats(false)
      }, 15000)

      // Active chat polling every 5s
      pollInterval = setInterval(() => {
        if (!sendingRef.current && sel?.id) {
          const minId = msgsRef.current.length > 0 ? Math.max(...msgsRef.current.map(m=>m.id)) : 0;
          loadMessages(sel, selTopic?.id, false, true, minId);
        }
      }, 5000);
    }
    return () => {
       clearInterval(pollInterval);
       clearInterval(sidebarPollInterval);
    }
  }, [token, sel, selTopic, sseStatus]);

  const loadMessageRequestIds = useRef({})

  async function loadMessages(chat, topicId=null, append=false, isBackground=false, minId=0) {
    if(!chat) return
    if(!append && loadingRef.current) return
    if(append && loadingMoreRef.current) return
    
    if(!append) setMessageFetchError(null)
    
    const cacheKey = activeAccRef.current + '_' + chat.id + (topicId ? '_' + topicId : '')
    const hasCached = Array.isArray(msgsCacheRef.current[cacheKey]) && msgsCacheRef.current[cacheKey].length > 0
    
    if(append) {
      if(!isBackground) {
         loadingMoreRef.current = true
         setLoadingMore(true)
      }
    } else {
      if(!isBackground) loadingRef.current = true
      if (!hasCached && msgsRef.current.length === 0 && !isBackground) setLoadMsgs(true)
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
      
      const outboxMaxId = chat.readOutboxMaxId || 0;
      qs += (qs ? '&' : '?') + 'readOutboxMaxId=' + outboxMaxId;
      if (minId > 0) qs += '&minId=' + minId;

      const reqId = Date.now();
      loadMessageRequestIds.current[cacheKey] = reqId;

      if(topicId) {
        url = '/api/chat/topics/'+chat.id+'/'+topicId+'/messages'+qs
      } else {
        url = '/api/chat/messages/'+chat.id+qs
      }
      const d = await safeFetch(url, {headers:{"x-auth-token":token}})
      
      if (loadMessageRequestIds.current[cacheKey] !== reqId) {
        console.log('[DEBUG] staleResponseIgnored', true, { 
          activeAccountId: activeAccRef.current,
          messageFetchChatId: chat.id,
          cacheKey
        });
        return;
      }

      if(Array.isArray(d)) {
        if(d.length < 40) setHasMore(false)
        else if(!append) setHasMore(true)

        const prevCached = msgsCacheRef.current[cacheKey] || [];
        let nextState;
        
        if(append) {
          const newMsgs = d.filter(m1 => !prevCached.some(m2 => m2.id === m1.id))
          nextState = [...newMsgs, ...prevCached]
        } else {
          const idSet = new Set(d.map(m => m.id));
          const existingOlder = prevCached.filter(p => !idSet.has(p.id) && p.id > 0);
          const stillPending = prevCached.filter(m => m.pending && m.id < 0 && !d.some(s=>s.text===m.text&&s.fromMe));
          nextState = [...existingOlder, ...d, ...stillPending];
          nextState.sort((a, b) => a.date - b.date);
          
          // Sync fallback polling new messages to sidebar metadata
          if (d.length > 0) {
            const latestMsg = d[d.length - 1];
            setChats(p => {
              const newChats = [...p];
              const cIdx = newChats.findIndex(c => c.id === chat.id);
              if (cIdx > -1) {
                const c = newChats[cIdx];
                if (latestMsg.date > (c.date || 0)) {
                  console.log('[DEBUG] sidebarUpdated', {
                    updateSource: 'polling',
                    activeAccountId: activeAccRef.current,
                    chatId: chat.id,
                    oldLastActivity: c.date,
                    newLastActivity: latestMsg.date
                  });
                  c.date = latestMsg.date;
                  c.lastMessageAt = latestMsg.date;
                  c.lastActivity = latestMsg.date;
                  c.lastMessage = latestMsg.hasMedia ? '[Media]' : latestMsg.text;
                  c.lastMsg = c.lastMessage;
                  chatsCacheRef.current[activeAccRef.current] = newChats;
                }
              }
              return newChats;
            });
          }
        }
        
        let finalState = nextState.map(m => ({
          ...m,
          reactions: mergeReactions(m.id, m.reactions || [])
        }))
        
        msgsCacheRef.current[cacheKey] = finalState;
        
        // Only update UI if this is still the selected chat
        const currentCacheKey = activeAccRef.current + '_' + selRef.current?.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '');
        if (currentCacheKey === cacheKey) {
          console.log('[DEBUG] Rendering messages for matching chat', {
            activeAccountId: activeAccRef.current,
            selectedChatId: selRef.current?.id,
            selectedChatTitle: selRef.current?.title || selRef.current?.firstName,
            messageFetchChatId: chat.id,
            cacheKey,
            renderedMessageChatId: chat.id
          });
          setMsgs(finalState);
        } else {
          console.log('[DEBUG] Background fetch complete, skipping render (chat mismatch)', {
            currentCacheKey,
            cacheKey,
            messageFetchChatId: chat.id
          });
        }
        
      } else if (d && d.error === 'AUTH_FAILED') {
        if (typeof onAuthFailed === 'function') onAuthFailed()
      } else if (d && d.error) {
        if (d.error === 'ACCOUNT_SESSION_EXPIRED') {
          setMessageFetchError('This Telegram account session expired. Reconnect this account.');
        } else {
          setMessageFetchError(d.error);
        }
      }
    } catch(e) { console.error("loadMsgs:",e); setMessageFetchError(e.message); }
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
      if (!allowed.__httpStatus || allowed.ok) {
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
      console.error('This reaction is not allowed in this chat.');
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
      msgsCacheRef.current[activeAccRef.current + '_' + targetChatId + (targetTopicId ? '_' + targetTopicId : '')] = updated;
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
      const d = res;
      console.log('apiStatus', d);
      console.log('backendValidationResult', d.code || 'allowed');
      console.log('finalReactionsFromTelegram', d.tgRes || 'unchanged');
      if (!d.ok && !d.unchanged) {
        if (d.error && (d.error.includes('REACTION_INVALID') || d.code === 'REACTION_INVALID')) {
          toast.warning('Telegram không cho phép icon này (cần Premium hoặc bị cấm), nhưng đã lưu hiển thị tạm.');
          // Giữ nguyên giao diện mượt (optimistic UI), không rollback
          delete pendingReactionsRef.current[msgId];
          return;
        } else {
          toast.error('Lỗi thả emoji từ Telegram: ' + (d.error || 'Unknown error'));
        }
        delete pendingReactionsRef.current[msgId];
        setMsgs(prev => prev.map(m => m.id === msgId ? originalMsg : m));
      }
    } catch (e) {
      console.log(`[Reaction Sync] Telegram API error:`, e.message);
      console.error('API response/error', e);
      toast.error('Lỗi thả emoji: ' + e.message);
      delete pendingReactionsRef.current[msgId];
      setMsgs(prev => prev.map(m => m.id === msgId ? originalMsg : m));
    }
  }

  async function send(retryText = null){
    if (retryText && typeof retryText === 'object') retryText = null;
    const safeInput = typeof retryText === 'string' ? retryText : ((input === "null" || input == null) ? "" : input);
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
        const d = r
        if(!d.ok) console.error('Edit failed:', d.error)
      } catch(e) { console.error('Edit error:', e) }
      return
    }
    if(sendingRef.current) return
    
    // Clear input immediately so user sees it's been captured
    setInput("")
    sendingRef.current = true
    setSending(true); setReplyTo(null)
    // Show message instantly (optimistic)
    const sentDate = Math.floor(Date.now()/1000)
    const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true}
    console.log('[DEBUG] sendClicked', { activeAccountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text })
    console.log('[DEBUG] optimisticTempId', tempMsg.id)
    
    // Force scroll to bottom immediately
    isNearBottom.current = true;
    setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 10)

    setMsgs(p => {
       const nextState = [...p, tempMsg];
       msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic ? '_' + selTopic.id : '')] = nextState;
       return nextState;
    });

    // Optimistic chat list update
    let prevChatState = null;
    setChats(prev => {
      const idx = prev.findIndex(c => c.id === sel.id)
      if (idx > -1) {
        prevChatState = { date: prev[idx].date, lastMsg: prev[idx].lastMsg, lastMessageAt: prev[idx].lastMessageAt, lastActivity: prev[idx].lastActivity }
        const newChats = [...prev]
        newChats[idx] = { ...newChats[idx], date: sentDate, lastMessageAt: sentDate, lastActivity: sentDate, lastMessage: text, lastMsg: text }
        
        console.log('[DEBUG] sidebarUpdated', {
          updateSource: 'send',
          activeAccountId: activeAccRef.current,
          chatId: sel.id,
          newLastActivity: sentDate
        })
        
        chatsCacheRef.current[activeAccRef.current] = newChats;
        return newChats
      }
      return prev
    })

    try {
      let realMsgId = null;
      let realDate = sentDate;

      if (pastedFile) {
        const formData = new FormData()
        formData.append('chatId', sel.id)
        if (selTopic) formData.append('topicId', selTopic.id)
        if (sel.username) formData.append('username', sel.username)
        if (text) formData.append('caption', text)
        formData.append('file', pastedFile)

        const r = await fetch('/api/chat/send-media', {
          method: 'POST',
          headers: { "x-auth-token": token },
          body: formData
        })
        const d = r
        if (d.ok && d.messageId) { realMsgId = d.messageId; realDate = d.date; }
        
        setPastedFile(null)
        setFilePreview(null)
      } else if(selTopic) {
        const r = await fetch('/api/chat/topics/'+sel.id+'/'+selTopic.id+'/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({text, username: sel.username || undefined})
        })
        const d = r
        if (d.ok && d.messageId) { realMsgId = d.messageId; realDate = d.date; }
      } else {
        const payload = {chatId:sel.id, text, username: sel.username || undefined};
        const r = await fetch('/api/chat/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify(payload)
        })
        const d = r
        if (d.ok && d.messageId) { realMsgId = d.messageId; realDate = d.date; }
        console.log('[DEBUG] sendApiResponse', d)
      }
      
      // Update message status to remove pending and replace with real ID
      setMsgs(p => {
         const nextState = p.map(m => m.id === tempMsg.id ? {...m, pending:false, id: realMsgId || m.id, date: realDate || m.date} : m);
         msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState;
         return nextState;
      });
      
      loadingRef.current = false
    } catch(e) {
      // Mark as failed instead of deleting
      console.error('Send message failed:', e);
      setMsgs(p => {
         const nextState = p.map(m => m.id === tempMsg.id ? {...m, pending:false, failed:true} : m);
         msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = nextState;
         return nextState;
      });
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
      const d = r
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
      const d = r
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

    if (cmd.length > 0 && cmd.length < 3) {
      setAiError("Please enter a clearer instruction.");
      return;
    }

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
      topicId: selTopic?.id || null,
      projectResearch: useResearch && projectResearch?.data ? JSON.stringify(projectResearch.data, null, 2) : null
    };

    console.log('[DEBUG] finalPromptIncludesResearch', !!aiPayload.projectResearch);
    console.log('[DEBUG] researchUsedInReply', !!(useResearch && projectResearch?.data));

    try {
      const r = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: {"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify(aiPayload)
      })
      const d = r
      
      // Ignore if a newer request was started
      if (activeAiRequest.current !== attemptId) return;
      
      if (r.status === 401 && d.code === 'TOKEN_EXPIRED') {
        try {
          const refR = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'x-auth-token': token }
          });
          const refD = refR;
          
          if (refD.ok && refD.token) {
            if (typeof onTokenRefresh === 'function') onTokenRefresh(refD.token);
            
            const retryR = await fetch("/api/ai/suggest", {
              method: "POST",
              headers: {"Content-Type":"application/json","x-auth-token":refD.token},
              body: JSON.stringify(aiPayload)
            });
            const retryD = retryR;
            
            if (activeAiRequest.current !== attemptId) return;
            
            if (retryD.ok === false || retryD.error) {
              setAiError(retryD.code === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : (retryD.error || "Failed to generate custom reply."));
            } else if (retryD.suggestions) {
              setAiSuggestions(retryD.suggestions)
            } else if (retryD.suggestion) {
              setAiText(retryD.suggestion)
            }
          } else {
            setAiError('TOKEN_EXPIRED'); 
          }
        } catch (refErr) {
          setAiError('TOKEN_EXPIRED');
        }
        return;
      }

      if (d.ok === false) {
        setAiError(d.code === 'AI_PROVIDER_AUTH_ERROR' ? "AI Service Provider is unavailable. Please check backend configuration." : (d.error || "Failed to generate custom reply."));
      } else if (d.suggestions) {
        setAiSuggestions(d.suggestions)
        if (d.aiWarning) setAiWarning(d.aiWarning)
      } else if (d.suggestion) {
        setAiText(d.suggestion)
        if (d.aiWarning) setAiWarning(d.aiWarning)
      }
    } catch(e) { 
      setAiError("Network error connecting to AI service.")
    } finally {
      if (activeAiRequest.current === attemptId) setAiLoading(false)
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
        await safeFetch("/api/chat/delete",{
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
        await safeFetch("/api/chat/delete",{
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
      
      if (ap && bp && customOrder.length > 0) {
        const idxA = customOrder.indexOf(a.id);
        const idxB = customOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
      }
      
      const dateA = a.lastMessageAt || a.date || a.lastActivity || 0;
      const dateB = b.lastMessageAt || b.date || b.lastActivity || 0;
      return dateB - dateA;
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
    return localFiltered;
  }, [localFiltered]);

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
      height: 100vh;
      max-height: 100vh;
      overflow: hidden;
      background: #0f172a;
      font-family: 'Inter', system-ui, sans-serif;
      color: #f8fafc;
    }

    /* ── SIDEBAR ── */
    .sidebar {
      display: flex; flex-direction: column; align-items: center;
      padding: 12px 0; gap: 8px;
      background: #090e17; /* Very deep navy for sidebar */
      overflow: hidden;
      height: 100%;
      width: 72px; /* Slim modern sidebar */
      min-width: 72px;
      flex-shrink: 0;
      border-right: 1px solid rgba(255,255,255,0.02);
    }
    .si {
      width: 46px; height: 46px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 22px; color: #64748b;
      transition: all .2s ease; flex-shrink: 0; border: none; background: transparent;
    }
    .si:hover { background: rgba(124,58,237,0.1); color: #a78bfa; transform: translateY(-1px); }
    .si.on { background: #7c3aed; color: #fff; box-shadow: 0 4px 14px rgba(124,58,237,0.35); }

    /* ── LEFT COL (Chat List) ── */
    .lc {
      display: flex; flex-direction: column;
      height: 100%; max-height: 100%;
      min-height: 0;
      width: 400px;
      min-width: 400px;
      flex-shrink: 0;
      background: #111827; /* Charcoal */
      border-right: 1px solid rgba(255,255,255,0.05);
    }
    .ci {
      display: flex; gap: 14px; padding: 12px 16px;
      height: 76px;
      cursor: pointer; align-items: center;
      transition: background .15s ease, transform .1s;
      flex-shrink: 0;
      box-sizing: border-box;
      border-radius: 12px;
      margin: 2px 10px;
    }
    .ci:hover { background: rgba(255,255,255,0.03); }
    .ci.sel  { background: linear-gradient(135deg, #7c3aed, #5b21b6); color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
    .ci.sel .ci-preview, .ci.sel .ci-time { color: rgba(255,255,255,0.85) !important; }
    .ci.sel .ci-unread { background: #fff !important; color: #7c3aed !important; }
    
    .sinp {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.02);
      border-radius: 20px;
      padding: 9px 12px 9px 36px;
      color: #f8fafc;
      outline: none;
      font-size: 14px;
      box-sizing: border-box;
      transition: background 0.2s, border 0.2s;
    }
    .sinp:focus { background: rgba(255,255,255,0.07); border-color: rgba(124,58,237,0.4); }
    .sinp::placeholder { color: #64748b; }

    /* ── MIDDLE COL (Main Chat) ── */
    .mc {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: #0f172a;
      position: relative;
    }

    /* ── CHAT HEADER ── */
    .chdr {
      height: 60px; min-height: 60px; flex-shrink: 0;
      display: flex; align-items: center;
      padding: 0 16px; gap: 12px;
      background: #111827;
      border-bottom: 1px solid #1f2937;
    }
    .hb {
      width: 36px; height: 36px; flex-shrink: 0;
      background: transparent; border: none; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: #94a3b8; font-size: 18px; transition: background .2s;
    }
    .hb:hover { background: rgba(255,255,255,0.05); color: #cbd5e1; }

    .msgs {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 0;
      /* Dynamic background applied inline */
    }
    .msgs::-webkit-scrollbar { width: 4px; }
    .msgs::-webkit-scrollbar-thumb { background: #2d1155; border-radius: 2px; }
    
    .msgs-inner {
      width: 100%;
      display: flex;
      flex-direction: column;
    }

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
      max-width: min(64%, 560px);
      min-width: 0;
    }
    .msg-row.out .msg-content { align-items: flex-end; }
    .msg-row.in .msg-content { align-items: flex-start; }

    /* ── BUBBLE ── */
    .bbl {
      position: relative;
      max-width: 100%;
      min-width: 80px;
      width: fit-content;
      padding: 8px 12px 24px 12px;
      border-radius: 18px;
      font-size: 15px;
      line-height: 1.45;
      cursor: pointer;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      backdrop-filter: blur(10px);
    }
    .bbl::after {
      content: "";
      display: block;
      clear: both;
    }
    .bbl.out { background: linear-gradient(135deg, #6d28d9, #4f46e5); color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
    .bbl.in { background: rgba(30, 41, 59, 0.85); color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.03); }
    .bbl.del { opacity: .5; font-style: italic; }
    .bbl.rpl { border-left: 3px solid rgba(255,255,255,.5); padding-left: 10px; border-radius: 8px; margin-bottom: 6px; font-size: 13px; background: rgba(0,0,0,0.1); }
    .msg-link { color: #7dd3fc; text-decoration: none; word-break: break-word; overflow-wrap: anywhere; }
    .msg-link:hover { text-decoration: underline; }
    .bbl.out .msg-link { color: #e0e7ff; text-decoration: underline; }

    /* grouped radius */
    .bbl.out.single { border-radius: 18px 18px 4px 18px; }
    .bbl.out.top    { border-radius: 18px 18px 4px 18px; }
    .bbl.out.mid    { border-radius: 18px 4px 4px 18px; }
    .bbl.out.bottom { border-radius: 18px 4px 4px 18px; }
    .bbl.in.single  { border-radius: 18px 18px 18px 4px; }
    .bbl.in.top     { border-radius: 18px 18px 18px 4px; }
    .bbl.in.mid     { border-radius: 4px 18px 18px 4px; }
    .bbl.in.bottom  { border-radius: 4px 18px 18px 4px; }

    /* ── BUBBLE FOOTER (timestamp + tick) ── */
    .bfoot {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 4px;
      position: absolute;
      bottom: 5px;
      right: 10px;
      white-space: nowrap;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      font-weight: 500;
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
      background: transparent;
      padding: 0 16px 16px;
    }

    /* Emoji popover row */
    .emoji-row {
      display: flex; gap: 2px; align-items: center;
      height: 36px; flex-shrink: 0;
      overflow-x: auto; padding: 2px 0;
      margin-bottom: 4px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(10px);
      border-radius: 8px;
    }

    /* Composer row */
    .ir {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      padding: 10px 14px;
      min-height: 56px;
      background: rgba(15, 23, 42, 0.85); /* Glassmorphism background */
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.2);
    }

    /* Icon buttons */
    .ib {
      width: 40px; height: 40px; flex-shrink: 0;
      background: transparent; border: none; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: #94a3b8; font-size: 22px; transition: background .15s, color .15s;
    }
    .ib:hover, .ib.on { background: rgba(255,255,255,0.08); color: #cbd5e1; }
    .ib.g { font-size: 18px; font-weight: 700; }
    .ib.s { color: #a78bfa; }
    .ib.s:hover { background: rgba(124,58,237,0.15); color: #c4b5fd; }

    /* Textarea */
    .message-input {
      flex: 1; min-width: 0;
      min-height: 40px; max-height: 140px;
      padding: 10px 4px;
      background: transparent; border: none;
      color: #f8fafc; font-size: 15px; font-family: inherit;
      line-height: 20px; resize: none; outline: none;
      overflow-y: auto; box-sizing: border-box;
    }
    .message-input::placeholder { color: #64748b; }

    /* Send button */
    .sb {
      width: 40px; height: 40px; flex-shrink: 0;
      border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #4f46e5); border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: #fff;
      box-shadow: 0 4px 12px rgba(124,58,237,0.3);
      transition: transform 0.1s;
    }
    .sb:hover { transform: scale(1.05); }
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

  const resendMessage = (failedMsg) => {
    // Basic resend for text. Files not supported in this simple resend.
    if (!failedMsg.text) return;
    setMsgs(p => {
      const next = p.filter(m => m.id !== failedMsg.id);
      msgsCacheRef.current[activeAccRef.current + '_' + selRef.current.id + (selTopicRef.current ? '_' + selTopicRef.current.id : '')] = next;
      return next;
    });
    send(failedMsg.text);
  };

  const chatProps = {
    resendMessage,
    sel, selTopic, setSelTopic, TG: {}, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, messageFetchError, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
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
    chatMembersCache, fetchMembers,
    AISuggestPanel, aiText, setAiText, aiSuggestions, setAiSuggestions, aiAnalysis, setAiAnalysis, aiWarning, setAiWarning,
    aiAlt, setAiAlt, setAiLoading, tmplCats, setTmplCat,
    tmplCat, TEMPLATES: [], setMsgs, setSelectMode, lightbox, StageBadge, gifOpen, setGifOpen,
    gifQuery, setGifQuery, searchGifs, gifs, loadingRef, showScrollBtn, aiError, highlightedMsgId, onAuthFailed,
    activeTranslations, handleTranslate, projectResearch, useResearch, setUseResearch, doProjectResearch
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
      const d = await safeFetch(url, { headers: { 'x-auth-token': token } });
      console.log('aroundFetchStatus', d.ok);
      if (d.__httpStatus >= 400) {
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
          
          msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = merged;
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
      <div className="sidebar" style={{position: 'relative', zIndex: 100}}>
        <div 
           title="Menu" 
           style={{width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",fontSize:24,cursor:"pointer",transition:"all 0.2s"}}
           onMouseEnter={e => e.currentTarget.style.color="#f0e6ff"}
           onMouseLeave={e => e.currentTarget.style.color="#64748b"}
           onClick={() => setShowMainMenu(true)}
        >
          ☰
        </div>
        
        <div style={{display:'flex', flexDirection:'column', gap:12, flex:1, width:'100%', alignItems:'center', marginTop: 12}}>
          <div title="Coincu App" style={{width:36,height:36,background:'linear-gradient(135deg, #7c3aed, #4f46e5)',borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:"0 4px 14px rgba(124,58,237,0.4)"}}>⚡</div>
        </div>

        <div style={{marginTop:'auto',marginBottom:12}}>
          <div style={{width:38,height:38,borderRadius:"50%",background:"#2d1155",border:"2px solid #7c3aed",display:"flex",alignItems:"center",justifyContent:"center",color:"#a78bfa",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}} title="Account" onClick={() => setShowMainMenu(true)}>
            {accounts.find(a => a.accountId === activeAccRef.current)?.phone?.charAt(1) || 'L'}
          </div>
        </div>

        {/* Telegram Main Menu Dropdown */}
        {showMainMenu && (
          <TelegramMainMenu 
            accounts={accounts}
            activeAccountId={activeAccRef.current}
            onClose={() => setShowMainMenu(false)}
            onAddAccount={() => setShowAddAccount(true)}
            onOpenSavedMessages={() => setToastMessage('Saved Messages is not available yet.')}
            onOpenContacts={() => setToastMessage('Contacts list is not available yet.')}
            onOpenSettings={() => {
              console.log('[DEBUG] settingsOpened');
              setShowSettings(true);
            }}
            onOpenBackground={() => {
              console.log('[DEBUG] backgroundPanelOpen', true);
              setShowBgSettings(true);
            }}
            onManageAccounts={() => setShowAccountMenu(true)}
            onReconnectTelegram={onAuthFailed}
            onSignOut={onLogout}
            onResetOrder={handleResetOrder}
          />
        )}
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,41,59,0.95)', color: '#fff', padding: '12px 24px',
          borderRadius: 8, fontSize: 14, fontWeight: 500, zIndex: 999999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {toastMessage}
        </div>
      )}

      {showAccountMenu && (
        <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, zIndex: 99998}} onClick={() => setShowAccountMenu(false)}>
          <AccountMenu 
            accounts={accounts} 
            activeAccountId={activeAccRef.current} 
            onOpenSettings={() => setShowSettings(true)}
            onClose={() => setShowAccountMenu(false)} 
            onAddAccount={() => {
              console.log('[DEBUG] addAccountClicked');
              setShowAddAccount(true);
            }}
            onSwitchAccount={(id) => {
              console.log('[MultiAccount] Switching to account:', id);
              setActiveAccId(id);
              setActiveAccountId(id);
              localStorage.setItem('crmchat_active_account', id);
              setSel(null);
              setSelTopic(null);
              setMsgs([]);
              setChats([]);
              setShowAccountMenu(false);
            }}
            onAuthFailed={onAuthFailed}
            onLogout={onLogout}
          />
        </div>
      )}
      
      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} onSuccess={fetchAccounts} />}

      {/* LEFT COL */}
      <div className="lc">
        <div style={{height:60,minHeight:60,padding:"0 16px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          borderBottom:"1px solid #1f2937"}}>
          <div style={{display:'flex', flexDirection:'column'}}>
            <span style={{fontSize:15,fontWeight:700,color:'#f8fafc'}}>Coincu CRM</span>
            <span style={{fontSize:11,fontWeight:500,color:'#94a3b8'}}>Telegram connected</span>
          </div>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <button onClick={fetchChats} disabled={loadChats}
              style={{background:"none",border:"none",color:'#64748b',
                cursor:"pointer",fontSize:16,width:32,height:32,
                display:"flex",alignItems:"center",justifyContent:"center",
                borderRadius:8,transition:"background .2s, color .2s"}}
              title="Refresh" onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="#cbd5e1"}}
              onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="#64748b"}}>
              🔄
            </button>
          </div>
        </div>
        {/* Folder tabs as pills */}
        <div style={{
          display:'flex',flexShrink:0, gap: 8,
          padding: '12px 16px',
          overflowX:'auto',overflowY:'hidden',
          scrollbarWidth:'none',
        }}>
          {[['all','All'],['unread','Unread'],['groups','Groups'],['personal','DMs'],['archived','Archive']].map(([fid,flbl])=>(
            <div key={fid} onClick={()=>setFolder(fid)}
              style={{
                display:'flex',alignItems:'center',gap:6,
                padding:'6px 14px',
                cursor:'pointer',
                fontSize:13,fontWeight:600,
                flexShrink:0,whiteSpace:'nowrap',
                color:folder===fid?'#fff':'#94a3b8',
                background:folder===fid?'#7c3aed':'rgba(255,255,255,0.05)',
                borderRadius:20,
                boxSizing:'border-box',
                transition:'all .2s',
              }}>
              {flbl}
              {fid==='unread'&&chats.filter(c=>c.unread>0).length>0&&(
                <span style={{
                  background:folder===fid?'#fff':'#7c3aed',
                  color:folder===fid?'#7c3aed':'#fff',
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
        <div style={{padding:"0 16px 12px",borderBottom:`1px solid #1f2937`}}>
          <input type="text" placeholder="Search" style={{width:"100%",padding:"10px 16px",background:'rgba(255,255,255,0.05)',border:"none",borderRadius:12,color:"#f8fafc",fontSize:14,outline:"none",fontFamily:"inherit"}}
            value={search || ""} onChange={e=>setSearch(e.target.value)} />
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
          {filtered.map((chat, idx)=>{
            const isSel=sel?.id===chat.id
            const isDragged = draggedIndex === idx
            const isDragOver = dragOverIndex === idx
            return(
              <div 
                key={chat.id} 
                className={`ci${isSel?" sel":""}`} 
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onContextMenu={e=>{e.preventDefault();setChatCtxMenu({x:e.clientX,y:e.clientY,chat})}} 
                onClick={()=>{
                  setSel(chat)
                }}
                style={{
                  opacity: isDragged ? 0.4 : 1,
                  borderTop: isDragOver ? '2px solid #7c3aed' : 'none',
                  transition: 'opacity 0.2s, border-top 0.1s',
                  cursor: 'grab'
                }}
              >
                <div style={{position:"relative",flexShrink:0}}>
                  <Avatar name={chat.name} chatId={chat.id} username={chat.username} accessHash={chat.accessHash} size={52}/>
                </div>
                <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:600,fontSize:15,color:isSel?"#fff":'#f8fafc',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.isGroup ? <span style={{fontSize:13,marginRight:4}}>👥</span> : chat.isChannel ? <span style={{fontSize:13,marginRight:4}}>📢</span> : null}
                      {chat.name}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:8}}>
                      {chat.isPinned || pinnedChats.has(chat.id) ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#64748b', opacity: isSel ? 0.8 : 0.5}}>
                          <path d="M12 17v5" />
                          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                      ) : null}
                      <span className="ci-time" style={{fontSize:12,color:isSel?"rgba(255,255,255,.7)":'#64748b',marginLeft:4}}>{fmtTime(chat.date)}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div className="ci-preview" style={{fontSize:14,color:isSel?"rgba(255,255,255,.8)":'#94a3b8',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                      {chat.lastMsg||"No messages"}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginLeft:6}}>
                      {chat.unread>0 && !readChats.has(chat.id) && (
                        <div className="ci-unread" style={{background:isSel?"#fff":'#7c3aed',color:isSel?"#7c3aed":"#fff",fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:10,minWidth:22,textAlign:"center"}}>
                          {chat.unread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {!loadChats && filtered.length === 0 && !globalSearchTriggered && (
            <div style={{padding:32,textAlign:"center",color:'#6b4d94',fontSize:13}}>
              {search.trim() ? (
                <>
                  <div style={{marginBottom: 8}}>No local matches for "{search.trim()}"</div>
                  <button onClick={() => setSearch('')} style={{background: 'none', border: '1px solid #3d1f6a', padding: '6px 12px', borderRadius: 16, color: '#a78bfa', cursor: 'pointer', marginBottom: 12}}>Clear Search</button>
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

          {search.trim() && !globalSearchTriggered && (
             <div style={{padding: '16px', textAlign: 'center'}}>
               <button onClick={handleGlobalSearch} style={{
                 background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed', 
                 padding: '10px 16px', borderRadius: 8, color: '#a78bfa', cursor: 'pointer',
                 fontSize: 13, fontWeight: 600, width: '100%', transition: 'background 0.2s'
               }}
               onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.2)'}
               onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,58,237,0.1)'}>
                 Search Telegram globally
               </button>
             </div>
          )}

          {globalSearchTriggered && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#94a3b8', 
                textTransform: 'uppercase', letterSpacing: '0.5px', background: 'rgba(0,0,0,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1f2937'
              }}>
                Global Telegram results
                <button onClick={() => { setGlobalSearchTriggered(false); setGlobalMatches([]); }} style={{
                  background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, cursor: 'pointer', fontWeight: 600
                }}>
                  Back to my chats
                </button>
              </div>
              
              {isGlobalSearching && <div style={{padding:20,textAlign:"center",color:'#6b4d94',fontSize:13}}>Searching globally...</div>}
              
              {!isGlobalSearching && globalMatches.length === 0 && (
                <div style={{padding:20,textAlign:"center",color:'#ef4444',fontSize:13}}>No global results found</div>
              )}

              {globalMatches.map(chat=>{
                const isSel=sel?.id===chat.id
                return(
                  <div key={chat.id} className={`ci${isSel?" sel":""}`} onClick={()=>{
                    setSel(chat)
                  }}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <Avatar name={chat.name} chatId={chat.id} username={chat.username} accessHash={chat.accessHash} size={52}/>
                    </div>
                    <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:4}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontWeight:600,fontSize:15,color:isSel?"#fff":'#f8fafc',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                          {chat.isGroup ? <span style={{fontSize:13,marginRight:4}}>👥</span> : chat.isChannel ? <span style={{fontSize:13,marginRight:4}}>📢</span> : null}
                          {chat.name}
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div className="ci-preview" style={{fontSize:13,color:'#a78bfa',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>
                          {chat.username ? `@${chat.username}` : 'Global result'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
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
        ): sel && isChatActuallyForum(sel) && !selTopic && !forceNormalView ? (
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
              chatId={sel.id}
              topicId={selTopic?.id}
              sourceComponent="CRMChat"
              targetLanguage={translateTargetLanguage}
              isTranslating={isTranslating}
              onTranslate={handleTranslate}
              onDismiss={() => {
                setDismissedTranslate(true)
                localStorage.setItem(`dismissed_translate_${sel.id}_${selTopic?.id || 'main'}`, 'true')
              }}
            />
          )}
          
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, pointerEvents: 'none',
            opacity: bgOpacity,
            background: bgOption === 'Custom' && bgCustomUrl ? `url(${bgCustomUrl}) center/cover` : 
                        (BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.image && BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.image !== 'none' ? 
                         BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.image : 
                         BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.color || '#120929'),
            backgroundColor: BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.color || '#120929',
            ...(BACKGROUND_OPTIONS.find(o => o.name === bgOption)?.extraStyle || {})
          }} />

          <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <MessageList {...chatProps} />
          </div>
          <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column' }}>
            <AISuggestPanel
              text={aiText} suggestions={aiSuggestions} analysis={aiAnalysis} alternative={aiAlt} loading={aiLoading} warning={aiWarning}
              aiError={aiError}
              onUse={(txt)=>{setInput(txt);setAiText("");setAiSuggestions([]);setAiAnalysis("");setAiAlt("")}}
              onUseAlt={()=>{setInput(aiAlt);setAiText("");setAiSuggestions([]);setAiAnalysis("");setAiAlt("")}}
              onRegenerate={()=>getAI(false)}
              onClose={()=>{
                 setAiText("");
                 setAiSuggestions([]);
                 setAiAnalysis("");
                 setAiAlt("");
                 setAiLoading(false);
                 setAiInstruction("");
                 if (projectResearch) {
                   setProjectResearch(prev => prev ? { ...prev, dismissed: true } : null);
                 }
              }}
              aiInstruction={aiInstruction}
              setAiInstruction={setAiInstruction}
              onReconnect={onAuthFailed}
              projectResearch={projectResearch} useResearch={useResearch} setUseResearch={setUseResearch}
              onRefreshResearch={() => {
                 if (projectResearch?.data?.website) {
                    doProjectResearch([projectResearch.data.website], projectResearch.data.projectName);
                 } else {
                    alert("No website found to refresh research.");
                 }
              }}
            />
            <Composer {...chatProps} />
          </div>
        </>}
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <TelegramSettings 
          onClose={() => setShowSettings(false)}
          activeAccountId={activeAccRef.current}
          accounts={accounts}
          token={token}
        />
      )}

      {/* User Profile Preview Modal */}
      <UserProfileModal 
        activeAcc={activeAccRef.current}
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
          chatId={sel.id} token={token}
          allowedReactions={allowedReactionsCache[sel.id]}
          readOutboxMaxId={sel?.readOutboxMaxId || 0}
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

      {showBgSettings && (
        <BackgroundSettingsModal
          onClose={() => setShowBgSettings(false)}
          bgOption={bgOption} setBgOption={setBgOption}
          bgOpacity={bgOpacity} setBgOpacity={setBgOpacity}
          bgCustomUrl={bgCustomUrl} setBgCustomUrl={setBgCustomUrl}
        />
      )}

      {lightbox && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', zIndex: 100000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out'
        }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full screen" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', top: 20, right: 20, color: '#fff', fontSize: 32, cursor: 'pointer' }} onClick={() => setLightbox(null)}>×</div>
        </div>
      )}

    </div>
  </>)
}
