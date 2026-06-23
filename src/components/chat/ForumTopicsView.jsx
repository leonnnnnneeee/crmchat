import React from 'react';

export default function ForumTopicsView(props) {
  const { 
    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime,
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
    firstUnreadRef, renderMessageText, chatSearch, endRef,
    AISuggestPanel, aiText, setAiText, aiAnalysis, setAiAnalysis,
    aiAlt, setAiAlt, setAiLoading, tmplCats, setTmplCat,
    tmplCat, TEMPLATES, setMsgs, setSelectMode, lightbox, StageBadge, gifOpen, setGifOpen,
    gifQuery, setGifQuery, searchGifs, gifs, loadingRef, showScrollBtn
  } = props;

  return (
    <>
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
              {loadingTopics&&<div style={{padding:40,textAlign:"center",color:TG.textSec,fontSize:14}}>Loading topics...</div>}
              {topicError&&!loadingTopics&&(
                <div style={{padding:40,textAlign:"center",color:TG.textSec,fontSize:14,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                  <div>Failed to load topics.</div>
                  <button onClick={()=>{setForceNormalView(true);loadMessages(sel, null)}} style={{background:'rgba(124,58,237,.2)',border:'1px solid rgba(124,58,237,.5)',color:'#fff',padding:'8px 16px',borderRadius:8,cursor:'pointer'}}>
                    Open normal chat
                  </button>
                </div>
              )}
              {!loadingTopics && topics[sel.id] && topics[sel.id].length === 0 && (
                <div style={{padding:40,textAlign:"center",color:TG.textSec,fontSize:14,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                  <div>No topics found.</div>
                  <button onClick={()=>{setForceNormalView(true);loadMessages(sel, null)}} style={{background:'rgba(124,58,237,.2)',border:'1px solid rgba(124,58,237,.5)',color:'#fff',padding:'8px 16px',borderRadius:8,cursor:'pointer'}}>
                    Open normal chat
                  </button>
                </div>
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
    </>
  );
}
