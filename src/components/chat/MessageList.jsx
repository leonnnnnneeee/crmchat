import React, { useEffect } from 'react';
import VoiceMessage from './VoiceMessage';

const getSenderId = (m) => m.senderId || m.fromId || m.userId || m.peerId || m.author?.id || m.sender?.id || m.from?.id;

const resolveSender = (msg, chat) => {
  if (msg.senderName) return msg.senderName;
  if (msg.fromName) return msg.fromName;
  if (msg.sender?.firstName) return msg.sender.firstName + (msg.sender.lastName ? ' ' + msg.sender.lastName : '');
  if (msg.sender?.username) return msg.sender.username;
  if (msg.from?.firstName) return msg.from.firstName;
  if (msg.author?.name) return msg.author.name;

  const sId = getSenderId(msg);
  if (sId) {
    const cache = chat?.participants || chat?.members || chat?.users || [];
    const found = cache.find(u => u.id == sId || u.userId == sId);
    if (found) return found.name || found.firstName || found.username;
  }
  
  return "Unknown user";
};

export default function MessageList(props) {
  const { 
    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, toggleReaction, editedMsgs, fmtMsgTime,
    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,
    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInputRef, handleFileChange, mediaRecRef, recordTimerRef, setRecording, setRecordSecs,
    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,
    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,
    LinkPreview, ChatPhoto, Avatar, fmtTime,
    STAGES, cFup, cNotes, msgInfoOpen, setMsgInfoOpen,
    pollOpen, setPollOpen, pollQuestion, setPollQuestion,
    pollOptions, setPollOptions, scheduleOpen, setScheduleOpen,
    scheduleTime, setScheduleTime, sendScheduled, scheduledMsgs,
    globalSearchOpen, setGlobalSearchOpen, globalSearch, setGlobalSearch,
    chats, sending, setForceNormalView, loadingMore, readChats,
    firstUnreadRef, renderMessageText, chatSearch, endRef, aiInstruction, setAiInstruction,
    AISuggestPanel, aiText, setAiText, aiSuggestions, setAiSuggestions, aiAnalysis, setAiAnalysis,
    aiAlt, setAiAlt, setAiLoading, tmplCats, setTmplCat,
    tmplCat, TEMPLATES, setMsgs, setSelectMode, lightbox, StageBadge, gifOpen, setGifOpen,
    gifQuery, setGifQuery, searchGifs, gifs, loadingRef, showScrollBtn, aiError, onAuthFailed
  } = props;

  const [seenTooltip, setSeenTooltip] = React.useState(null);

  useEffect(() => {
    const handleClose = (e) => {
      if (e.key === 'Escape') setSeenTooltip(null);
    };
    const handleClickOutside = () => setSeenTooltip(null);
    window.addEventListener('keydown', handleClose);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleClose);
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const firstInMsg = msgs.find(m => !m.fromMe);
    if (firstInMsg && !window.__loggedSenderInfo) {
      const sId = getSenderId(firstInMsg);
      const sName = resolveSender(firstInMsg, sel);
      console.log("DEBUG [Sender Info]:", { messageId: firstInMsg.id, senderId: sId, resolvedSenderName: sName, rawMessage: firstInMsg });
      window.__loggedSenderInfo = true;
    }
  }, [msgs, sel]);

  return (
    <>
          {/* Handles scroll restoration, grouping, reactions, and media rendering */}
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
            {!loadMsgs&&messagesLoaded&&msgs.length===0&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:TG.textSec,marginTop:60}}>
                <div style={{fontSize:36}}>👋</div>
                <div style={{fontSize:14}}>No messages yet</div>
                <div style={{fontSize:12,color:TG.textMuted}}>Start with a template or AI suggest</div>
              </div>
            )}
            <div className="msgs-inner">
            {msgs.map((msg,i)=>{
              const prev=msgs[i-1]
              const next=msgs[i+1]
              
              const getTime = (d) => typeof d === 'number' ? d * 1000 : new Date(d).getTime();
              const msgTime = getTime(msg.date);

              const showSep=i===0||(()=>{
                try{
                  const a=new Date(msgTime)
                  const b=new Date(getTime(prev.date))
                  return a.toDateString()!==b.toDateString()
                }catch{return false}
              })()
              let nextShowSep = false;
              if (next) {
                try {
                  const a=new Date(getTime(next.date))
                  const b=new Date(msgTime)
                  nextShowSep = a.toDateString()!==b.toDateString()
                } catch {}
              }
              const isSameSenderAsPrev = prev && prev.fromMe === msg.fromMe && prev.senderId === msg.senderId
              const isSameSenderAsNext = next && next.fromMe === msg.fromMe && next.senderId === msg.senderId

              const isSameGroup = !!(isSameSenderAsPrev && (msgTime - getTime(prev.date)) < 300000 && !showSep)
              const isLastInGroup = !(isSameSenderAsNext && (getTime(next.date) - msgTime) < 300000 && !nextShowSep)
              const isFirstInGroup = !isSameGroup

              let groupClass = ''
              if (isFirstInGroup && isLastInGroup) groupClass = ' single'
              else if (isFirstInGroup) groupClass = ' top'
              else if (isLastInGroup) groupClass = ' bottom'
              else groupClass = ' mid'
              // Infer first unread: last N msgs where N = chat.unread count
              const unreadCount = selTopic ? (selTopic.unread || 0) : (sel?.unread || 0)
              const readKey = sel?.id + (selTopic ? '_' + selTopic.id : '')
              const isFirstUnread = !readChats.has(readKey) &&
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
                        <span>{unreadCount} new message{unreadCount>1?'s':''}</span>
                      </div>
                      <div style={{flex:1,height:1,background:"rgba(124,58,237,.35)"}}/>
                    </div>
                  )}
                  {showSep&&<div className="dsep"><span>{fmtDateSep(msgTime)}</span></div>}
                  <div id={'msg-'+msg.id} className={`msg-row${msg.fromMe?' out':' in'}${!isLastInGroup?' grouped':''}${props.highlightedMsgId === msg.id ? ' highlighted-msg' : ''}`}
                    style={{cursor:selectMode?"pointer":"default"}}
                    onClick={selectMode?()=>setSelectedMsgs(prev=>{const s=new Set(prev);s.has(i)?s.delete(i):s.add(i);return s}):undefined}>
                  {selectMode&&<div style={{width:20,height:20,borderRadius:"50%",border:"2px solid #7c3aed",background:selectedMsgs.has(i)?"#7c3aed":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"center",fontSize:12,color:"#fff",cursor:"pointer"}}>
                    {selectedMsgs.has(i)?"✓":""}
                  </div>}
                    {!msg.fromMe && (
                      isLastInGroup
                      ? <div className="msg-avatar" style={{cursor:'pointer'}} onClick={() => setProfilePreview({ id: getSenderId(msg)||sel.id, name: resolveSender(msg, sel)||sel.name, username: msg.senderUsername, accessHash: msg.senderAccessHash, chatId: sel.id })}><Avatar name={resolveSender(msg, sel)||sel.name} chatId={getSenderId(msg)||sel.id} username={msg.senderUsername} accessHash={msg.senderAccessHash} size={32}/></div>
                      : <div className="msg-avatar-gap"/>
                    )}
                    <div className="msg-content" onContextMenu={e=>handleCtx(e,msg,i)}>
                      <div className={`bbl msg-bubble ${msg.fromMe?"out":"in"}${groupClass}`} style={{ padding: (msg.isAudio || msg.voice || msg.audio || msg.media?.type === 'audio') ? '6px' : undefined }}>
                        {sel?.isGroup && isFirstInGroup && !msg.fromMe && (
                          <div style={{fontSize:12,fontWeight:600,color:"#7dd3fc",marginBottom:2,whiteSpace:"nowrap",cursor:'pointer'}} onClick={() => setProfilePreview({ id: getSenderId(msg)||sel.id, name: resolveSender(msg, sel)||sel.name, username: msg.senderUsername, accessHash: msg.senderAccessHash, chatId: sel.id })}>{resolveSender(msg, sel)}</div>
                        )}
                        {msg.replyTo&&(
                          <div onClick={()=>{/* scroll to reply */}} style={{background:"rgba(255,255,255,.05)",borderLeft:`3px solid #7dd3fc`,padding:"2px 8px",borderRadius:"0 4px 4px 0",marginBottom:6,fontSize:13,color:"rgba(255,255,255,.7)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",flexDirection:"column"}}>
                            <span style={{color:"#7dd3fc",fontWeight:500,fontSize:12}}>{msg.replyTo.fromMe?"You":sel.name}</span>
                            <span>{msg.replyTo.text}</span>
                          </div>
                        )}
                        {isPhotoMsg(msg) && <ChatPhoto msg={msg} chatId={sel.id} authToken={token} onImageClick={(src)=>setLightbox(src)}/>}
                        {isVideoMsg(msg) && (
                          <video controls style={{maxWidth:'100%',maxHeight:320,borderRadius:8,display:'block',marginBottom:4}}>
                            <source src={`/api/chat/media/${sel.id}/${msg.id}?t=${token}`}/>
                          </video>
                        )}
                        {(msg.isAudio || msg.audio || msg.voice || msg.media?.type === 'audio') && (
                          <div style={{marginBottom:4}}>
                            <VoiceMessage msg={msg} chatId={sel?.id} token={token} />
                          </div>
                        )}
                        {isDocMsg(msg) && <div style={{padding:'4px 0',color:TG.textSec,fontSize:13}}>📎 Document</div>}
                        {/* Render poll messages nicely */}
                        {msg.text?.startsWith('📊 ') && (
                          <div style={{minWidth:200}}>
                            <div style={{fontWeight:600,marginBottom:8,fontSize:14}}>{msg.text.split('\n')[0]}</div>
                            {msg.text.split('\n').slice(1).filter(l=>l.trim()).map((opt,i)=>(
                              <div key={i} style={{background:"rgba(255,255,255,.1)",borderRadius:8,
                                padding:"7px 12px",marginBottom:4,fontSize:13,cursor:"pointer",
                                border:"1px solid rgba(255,255,255,.1)"}}
                                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"}
                                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.1)"}>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Forwarded Header */}
                        {msg.fwdFrom && (
                          <div style={{color: '#8b5cf6', fontSize: 13, marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #8b5cf6', display: 'flex', flexDirection: 'column'}}>
                            <span style={{fontSize: 11, fontWeight: 500, opacity: 0.8}}>Forwarded from</span>
                            {(()=>{
                              let displayName = 'Unknown Sender';
                              if (msg.fwdFrom.forwardedFromName && msg.fwdFrom.forwardedFromTitle) {
                                displayName = `${msg.fwdFrom.forwardedFromName} | ${msg.fwdFrom.forwardedFromTitle}`;
                              } else if (msg.fwdFrom.forwardedFromName) {
                                displayName = msg.fwdFrom.forwardedFromName;
                              } else if (msg.fwdFrom.forwardedFromTitle) {
                                displayName = msg.fwdFrom.forwardedFromTitle;
                              } else if (msg.fwdFrom.postAuthor) {
                                displayName = msg.fwdFrom.postAuthor;
                              }
                              
                              if (i === msgs.length - 1) {
                                console.log(`[Fwd Debug] msgId=${msg.id}`, msg.fwdFrom, `resolvedName=${displayName}`, `fallbackUsed=${msg.fwdFrom.fallbackUsed}`);
                              }
                              
                              return <span style={{fontWeight: 600}}>{displayName}</span>;
                            })()}
                          </div>
                        )}
                        {(()=>{
                          const displayText = editedMsgs[msg.id] || msg.text || ''
                          return renderMessageText(displayText, chatSearch, msg.entities)
                        })()}
                        {/* Link preview */}
                        {(msg.webPage || (msg.text && (msg.text.includes('http://') || msg.text.includes('https://')))) && (
                          <LinkPreview webPage={msg.webPage} url={(msg.text?.match(/https?:\/\/\S+/)||[''])[0]}/>
                        )}
                        <span className="time-spacer" style={{display: 'inline-block', width: msg.fromMe ? '60px' : '45px', height: '10px', float: 'none', clear: 'both'}} />
                        <div className="bfoot">
                          {(msg.edited||editedMsgs[msg.id])&&(
                            <span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>edited</span>
                          )}
                          <span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>{fmtMsgTime(msg.date)}</span>
                          {msg.fromMe && (() => {
                            const maxId = sel?.readOutboxMaxId || 0;
                            const isRead = msg.normalizedStatus === 'seen' || msg.id <= maxId;
                            const status = msg.pending ? 'sending' : msg.failed ? 'failed' : isRead ? 'read' : 'sent';

                            
                            return (
                              <span 
                                onClick={(e) => {
                                  if (isRead) {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setSeenTooltip(seenTooltip?.msgId === msg.id ? null : { msgId: msg.id, x: rect.left, y: Math.max(10, rect.top - 36) });
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (isRead) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setSeenTooltip({ msgId: msg.id, x: rect.left, y: Math.max(10, rect.top - 36) });
                                  }
                                }}
                                onMouseLeave={() => setSeenTooltip(null)}
                                style={{
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  marginLeft: 4, 
                                  cursor: isRead ? 'pointer' : 'default',
                                  color: msg.failed ? '#ef4444' : (isRead ? '#4ade80' : 'rgba(255,255,255,.6)')
                                }}
                              >
                                {msg.pending ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                ) : msg.failed ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                  </svg>
                                ) : isRead ? (
                                  <svg width="16" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:'translateY(1px)'}}>
                                    <polyline points="18 6 7 17 2 12" />
                                    <polyline points="22 10 13 19 11 17" />
                                  </svg>
                                ) : (
                                  <svg width="14" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:'translateY(1px)'}}>
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4,marginLeft: msg.fromMe?0:12,marginRight: msg.fromMe?12:0,justifyContent:msg.fromMe?"flex-end":"flex-start"}}>
                          {msg.reactions.map((r, idx)=>{
                            const isCustom = r.type === 'custom';
                            const keyStr = isCustom ? r.customEmojiId : r.emoticon;
                            
                            return (
                            <span key={`${keyStr}-${idx}`} onClick={(e)=>{ 
                                e.stopPropagation(); 
                                const payload = isCustom ? { type: 'custom', customEmojiId: r.customEmojiId } : r.emoticon;
                                toggleReaction(sel.id, selTopic?.id || null, msg.id, payload); 
                              }}
                              style={{
                                background: r.chosen ? "rgba(124,58,237,.3)" : "rgba(0,0,0,.4)",
                                border: r.chosen ? "1px solid rgba(124,58,237,.5)" : "1px solid rgba(255,255,255,.05)",
                                borderRadius:16,padding:"3px 8px 3px 6px",fontSize:13,color:"rgba(255,255,255,.8)",
                                cursor:"pointer",userSelect:"none",display:"inline-flex",alignItems:"center",gap:6,
                                boxShadow: "0 1px 2px rgba(0,0,0,.2)"
                              }}>
                              <span style={{display:'flex', alignItems:'center', gap:2}}>
                                {msg.recentReactions?.filter(rr => (rr.type === 'custom' ? rr.customEmojiId === r.customEmojiId : rr.emoticon === r.emoticon)).slice(0, 3).map((rr, rrIdx) => (
                                  <span key={rrIdx} style={{display:'inline-flex', borderRadius:'50%', overflow:'hidden', width:16, height:16}}>
                                    <Avatar chatId={rr.peerId} size={16} name="" />
                                  </span>
                                ))}
                                {isCustom ? (
                                  <img src={r.thumbnailUrl} style={{width:18, height:18, objectFit:'contain'}} onError={(e)=>{e.target.style.display='none'}} alt="custom_emoji" />
                                ) : (
                                  r.emoticon
                                )}
                              </span>
                              {r.count > 0 ? <span style={{fontSize:12, fontWeight:500}}>{r.count}</span> : ""}
                            </span>
                          )})}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            </div>
            <div style={{height: 80, flexShrink: 0}} />
            <div ref={endRef}/>
          </div>

          {/* AI Suggest panel */}
          <AISuggestPanel
            text={aiText} suggestions={aiSuggestions} analysis={aiAnalysis} alternative={aiAlt} loading={aiLoading}
            aiError={aiError}
            onUse={(txt)=>{setInput(txt);setAiText("");setAiSuggestions([]);setAiAnalysis("");setAiAlt("")}}
            onUseAlt={()=>{setInput(aiAlt);setAiText("");setAiSuggestions([]);setAiAnalysis("");setAiAlt("")}}
            onRegenerate={()=>getAI(false)}
            onClose={()=>{setAiText("");setAiSuggestions([]);setAiAnalysis("");setAiAlt("");setAiLoading(false);setAiInstruction("")}}
            aiInstruction={aiInstruction}
            setAiInstruction={setAiInstruction}
            onReconnect={onAuthFailed}
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
                setMsgs(p=>p.filter((m,i)=>!selectedMsgs.has(i)))
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
          {seenTooltip && (
            <div style={{
              position: 'fixed',
              top: seenTooltip.y,
              left: seenTooltip.x - 20, // center somewhat
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 99999,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap'
            }}>
              <svg width="16" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 6 7 17 2 12" />
                <polyline points="22 10 13 19 11 17" />
              </svg>
              <span>Seen</span>
            </div>
          )}
    </>
  );
}
