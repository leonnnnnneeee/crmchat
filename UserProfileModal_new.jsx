function UserProfileModal({ data, onClose, token, chats, setSel, inputRef, msgs, messagesLoaded, hasMore, onOpenMedia }) {
  const [status, setStatus] = useState(null)
  const [showMore, setShowMore] = useState(false)
  const [fullProfile, setFullProfile] = useState(null)
  const [activeMediaTab, setActiveMediaTab] = useState(null)
  const [sharedMedia, setSharedMedia] = useState([])
  const [mediaLoading, setMediaLoading] = useState(false)
  
  const isGroupProfile = data?.isGroup;
  
  useEffect(() => {
    if (!data?.chatId) return
    let isMounted = true
    fetch(`/api/chat/profile/${data.chatId}`, { headers: {'x-auth-token': token} })
      .then(r => r.json())
      .then(d => { if(isMounted && d.ok && d.full) setFullProfile(d.full) })
      .catch(e => console.error(e))
    return () => { isMounted = false }
  }, [data?.chatId, token])

  useEffect(() => {
    if (!activeMediaTab) return
    let isMounted = true
    setMediaLoading(true)
    setSharedMedia([])
    fetch(`/api/chat/shared_media/${data.chatId}?type=${activeMediaTab}`, { headers: {'x-auth-token': token} })
      .then(r => r.json())
      .then(d => {
        if(isMounted && d.ok) {
           setSharedMedia(d.media || [])
           setMediaLoading(false)
        }
      })
      .catch(e => {
         if(isMounted) { setMediaLoading(false) }
      })
    return () => { isMounted = false }
  }, [activeMediaTab, data?.chatId, token])

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
    }
  }

  // Extract full profile info
  const bio = fullProfile?.fullUser?.about || fullProfile?.fullChat?.about || data.bio || data.about;
  const businessHours = fullProfile?.fullUser?.businessWorkHours;
  const location = fullProfile?.fullUser?.businessLocation?.address;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}
         onClick={(e) => { if(e.target===e.currentTarget) onClose() }}>
      <div style={{background:'#1a103c',width:420,maxHeight:'90vh',display:'flex',flexDirection:'column',borderRadius:12,overflow:'hidden',boxShadow:'0 10px 40px rgba(0,0,0,.5)',border:'1px solid rgba(124,58,237,.3)',color:'#fff'}}>
        
        {/* Header */}
        <div style={{position:'relative', padding:'24px 24px 16px', background:'linear-gradient(180deg, rgba(124,58,237,.2) 0%, #1a103c 100%)', display:'flex', flexDirection:'column', alignItems:'center'}}>
          <div style={{position:'absolute', top:12, right:12}}>
            <button onClick={onClose} style={{background:'transparent',border:'none',color:'#9b7ec8',cursor:'pointer',fontSize:24}}>&times;</button>
          </div>
          <Avatar name={data.name||'User'} chatId={data.id} username={data.username} size={90}/>
          <div style={{fontSize:22,fontWeight:700,marginTop:12,textAlign:'center'}}>{data.name||'Unknown User'}</div>
          <div style={{fontSize:14,color:status==='online'?'#4caf50':'#9b7ec8',marginTop:4}}>
            {status ? status : 'last seen recently'}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div style={{display:'flex', justifyContent:'space-around', padding:'12px 24px', flexShrink:0}}>
          <div onClick={handleMessage} style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', color:'#e0d4f5', gap:4}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>💬</div>
            <span style={{fontSize:12}}>Message</span>
          </div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'not-allowed', color:'#e0d4f5', gap:4, opacity: 0.4}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(124,58,237,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔕</div>
            <span style={{fontSize:12}}>Mute</span>
          </div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', cursor:'not-allowed', color:'#e0d4f5', gap:4, opacity: 0.4}}>
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
                <div onClick={()=>{navigator.clipboard.writeText(data.id);setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy User ID</div>
                {data.username && <div onClick={()=>{navigator.clipboard.writeText('@'+data.username);setShowMore(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,color:'#fff',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Copy Username</div>}
                <div style={{padding:'8px 12px',cursor:'not-allowed',fontSize:13,color:'#fff',borderRadius:4,opacity:0.4}}>Add to Contacts</div>
                <div style={{padding:'8px 12px',cursor:'not-allowed',fontSize:13,color:'#fff',borderRadius:4,opacity:0.4}}>Add CRM Note</div>
              </div>
            )}
          </div>
        </div>

        <div style={{height: 8, background: '#0d0618', width: '100%', flexShrink:0}} />

        {/* Scrollable Body */}
        <div style={{overflowY:'auto', flex:1, display:'flex', flexDirection:'column'}}>
          {/* Info Section */}
          <div style={{padding:'16px 24px', display:'flex', flexDirection:'column', gap:16}}>
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
            {bio && (
              <div>
                <div style={{fontSize:15, color:'#fff', lineHeight:1.4}}>{bio}</div>
                <div style={{fontSize:13, color:'#9b7ec8'}}>Bio</div>
              </div>
            )}
            {location && (
              <div>
                <div style={{fontSize:15, color:'#fff', lineHeight:1.4}}>{location}</div>
                <div style={{fontSize:13, color:'#9b7ec8'}}>Location</div>
              </div>
            )}
            {businessHours && (
              <div>
                <div style={{fontSize:15, color:'#4caf50', lineHeight:1.4}}>Business Hours Available</div>
                <div style={{fontSize:13, color:'#9b7ec8'}}>Business</div>
              </div>
            )}
            
            {/* Settings (UI only) */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8}}>
              <span style={{fontSize:15}}>Notifications</span>
              <div style={{width:36,height:20,background:'#7c3aed',borderRadius:10,position:'relative'}}>
                <div style={{width:16,height:16,background:'#fff',borderRadius:'50%',position:'absolute',top:2,right:2}}/>
              </div>
            </div>
          </div>
          
          <div style={{height: 8, background: '#0d0618', width: '100%', flexShrink:0}} />

          {/* Inline Media Tabs */}
          <div style={{padding:'0 24px', borderBottom:'1px solid rgba(124,58,237,.2)', display:'flex', gap:24, overflowX:'auto', scrollbarWidth:'none'}}>
            {['photos','videos','files','links','gifs'].map(t => (
              <div key={t} onClick={() => setActiveMediaTab(activeMediaTab === t ? null : t)} style={{padding:'12px 0',color:activeMediaTab===t?'#fff':'#9b7ec8',fontWeight:activeMediaTab===t?600:400,borderBottom:activeMediaTab===t?'2px solid #7c3aed':'2px solid transparent',cursor:'pointer',textTransform:'capitalize',whiteSpace:'nowrap'}}>
                {t}
              </div>
            ))}
          </div>

          {/* Media Content */}
          {activeMediaTab && (
             <div style={{padding:24, minHeight:200, display: (activeMediaTab==='photos'||activeMediaTab==='videos'||activeMediaTab==='gifs')?'grid':'flex', flexDirection:'column', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:8}}>
               {mediaLoading ? (
                 <div style={{gridColumn:'1 / -1', color:'#9b7ec8', textAlign:'center', marginTop:20}}>Loading...</div>
               ) : sharedMedia.length === 0 ? (
                 <div style={{gridColumn:'1 / -1', color:'#9b7ec8', textAlign:'center', marginTop:20}}>No {activeMediaTab} found.</div>
               ) : (
                 sharedMedia.map(m => {
                   if (activeMediaTab === 'photos' || activeMediaTab === 'videos') {
                     if (activeMediaTab === 'photos' && m.isPhoto) {
                       return (
                         <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',position:'relative'}}>
                           <ChatPhoto msg={m} chatId={data.chatId} authToken={token} onImageClick={()=>{}}/>
                         </div>
                       )
                     }
                     if (activeMediaTab === 'videos' && m.isVideo) {
                       return (
                         <div key={m.id} style={{aspectRatio:'1/1',background:'rgba(124,58,237,.1)',borderRadius:8,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                           <video style={{width:'100%',height:'100%',objectFit:'cover'}} src={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`}/>
                           <div style={{position:'absolute',fontSize:24,color:'white',pointerEvents:'none'}}>▶</div>
                         </div>
                       )
                     }
                   }
                   if (activeMediaTab === 'files') {
                     return (
                       <div key={m.id} style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
                         <div style={{fontSize:24}}>📄</div>
                         <div style={{flex:1}}>
                           <div style={{color:'#fff',fontSize:14,fontWeight:600}}>{m.fileName || 'Document'}</div>
                           <div style={{color:'#9b7ec8',fontSize:12}}>{new Date(m.date*1000).toLocaleString()}</div>
                         </div>
                       </div>
                     )
                   }
                   if (activeMediaTab === 'links') {
                     const matches = m.text.match(/(https?:\/\/[^\s]+)/g) || []
                     return matches.map((link, idx) => (
                       <div key={`${m.id}-${idx}`} style={{background:'rgba(124,58,237,.1)',padding:12,borderRadius:8,display:'flex',alignItems:'center',gap:12}}>
                         <div style={{fontSize:24}}>🔗</div>
                         <div style={{flex:1,overflow:'hidden'}}>
                           <div style={{color:'#fff',fontSize:14,fontWeight:600,textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{link}</div>
                           <div style={{color:'#9b7ec8',fontSize:12,textOverflow:'ellipsis',whiteSpace:'nowrap',overflow:'hidden'}}>{m.text}</div>
                         </div>
                         <a href={link} target="_blank" rel="noreferrer" style={{color:'#7c3aed',textDecoration:'none',fontSize:14}}>Open</a>
                       </div>
                     ))
                   }
                   return null;
                 })
               )}
             </div>
          )}

        </div>
      </div>
    </div>
  )
}
