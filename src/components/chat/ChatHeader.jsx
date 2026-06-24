import React from 'react';

export default function ChatHeader(props) {
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
          <div className="chdr" style={{ height: '60px', minHeight: '60px', padding: '0 16px', gap: '12px' }}>
            {selTopic&&(
              <button onClick={()=>setSelTopic(null)} style={{background:"none",border:"none",color:TG.textSec,cursor:"pointer",fontSize:22,padding:"0 4px",flexShrink:0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', transition: 'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>←</button>
            )}
            <div 
              style={{cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0}}
              onClick={() => setProfilePreview({ id: sel.id, name: sel.name, username: sel.username, chatId: sel.id, isGroup: sel.isGroup || sel.isChannel, isTopic: !!selTopic, topicId: selTopic?.id, topicTitle: selTopic?.title })}
            >
              {selTopic ? (
                <div style={{width: 42, height: 42, borderRadius: '50%', background: '#2b5278', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 600}}>
                  #
                </div>
              ) : (
                <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={42}/>
              )}
            </div>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:"2px"}}>
              <div 
                style={{fontWeight:600,fontSize:16,color:TG.text,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap", cursor: 'pointer'}}
                onClick={() => setProfilePreview({ id: sel.id, name: sel.name, username: sel.username, chatId: sel.id, isGroup: sel.isGroup || sel.isChannel, isTopic: !!selTopic, topicId: selTopic?.id, topicTitle: selTopic?.title })}
              >
                {selTopic ? selTopic.title : sel.name}
              </div>
              <div style={{fontSize:13,color:TG.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap", lineHeight:1.2}}>
                {selTopic ? (
                   <span style={{cursor:"pointer",color:TG.textSec,transition:"color .15s"}} 
                         onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                         onMouseLeave={e=>e.currentTarget.style.color=TG.textSec}
                         onClick={()=>setSelTopic(null)}>
                     In {sel.name}
                   </span>
                 ) : 
                 (sel?.isGroup || sel?.isChannel) ? (
                   <span style={{cursor:"pointer",color:TG.textSec,transition:"color .15s"}} 
                         onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                         onMouseLeave={e=>e.currentTarget.style.color=TG.textSec}
                         onClick={()=>setShowMembers(true)}>
                     {sel.memberCount ? `${sel.memberCount} members` : "View members"}
                   </span>
                 ) :
                 sel.isUser ? (
                   onlineStatus || 'last seen recently'
                 ) : 'last seen recently'
                 }
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginLeft:16,flexShrink:0, alignItems: 'center'}}>
              <button onClick={()=>setChatSearchOpen(p=>!p)} title="Search in chat" style={{background: 'none', border: 'none', color: TG.textSec, cursor: 'pointer', fontSize: 18, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                🔍
              </button>
              <button onClick={()=>setShowProfile(p=>!p)} title="Toggle CRM Panel" style={{background: showProfile ? 'rgba(124,58,237,0.2)' : 'none', border: 'none', color: showProfile ? '#a78bfa' : TG.textSec, cursor: 'pointer', fontSize: 20, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s'}} onMouseEnter={e=>e.currentTarget.style.background=showProfile?'rgba(124,58,237,0.3)':'rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background=showProfile?'rgba(124,58,237,0.2)':'transparent'}>
                {showProfile ? '▶' : '◀'}
              </button>
              <button title="More Actions" style={{background: 'none', border: 'none', color: TG.textSec, cursor: 'pointer', fontSize: 20, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                ⋮
              </button>
            </div>
          </div>

          {/* Translate Bar */}
          <div style={{
            height: '34px', minHeight: '34px', flexShrink: 0,
            background: '#23153d', borderBottom: '1px solid #0d0618',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px',
            color: '#a78bfa', fontSize: '13px', cursor: 'pointer',
            transition: 'background .15s'
          }} onMouseEnter={e=>e.currentTarget.style.background='#2d1155'} onMouseLeave={e=>e.currentTarget.style.background='#23153d'}
            onClick={()=>alert("Translation backend not configured yet.")}
          >
            <span style={{fontSize: '15px'}}>A文</span>
            <span style={{flex: 1, fontWeight: 500}}>Translate to English</span>
            <button style={{background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '15px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              onClick={(e)=>{e.stopPropagation(); alert("Translation Settings TODO")}}
            >
              ⚙️
            </button>
            <button style={{background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '15px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              onClick={(e)=>{e.stopPropagation(); alert("Hide Translate Bar TODO")}}
            >
              ✕
            </button>
          </div>

    </>
  );
}
