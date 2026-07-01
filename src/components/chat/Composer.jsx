import React, { useState, useEffect, useRef } from 'react';
import { allowShortcuts, handlePaste } from '../../CRMChat';

export default function Composer(props) {
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
    gifQuery, setGifQuery, searchGifs, gifs, loadingRef, showScrollBtn,
    pastedFile, setPastedFile, filePreview, setFilePreview, handleComposerPaste,
    chatMembersCache, fetchMembers, setAiPanelOpen
  } = props;

  // --- MENTIONS ---
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(null);

  const members = (sel && chatMembersCache?.[sel.id]) || [];
  
  const filteredMembers = mentionQuery !== null ? members.filter(m => {
    const q = mentionQuery.toLowerCase();
    const nameMatch = m.name?.toLowerCase().includes(q);
    const userMatch = m.username?.toLowerCase().includes(q);
    return nameMatch || userMatch;
  }).slice(0, 10) : [];

  const handleMentionSelect = (member) => {
    if (mentionStartPos === null) return;
    const val = safeInputValue;
    const before = val.substring(0, mentionStartPos);
    const after = val.substring(inputRef.current.selectionEnd);
    const mentionText = member.username ? `@${member.username} ` : `${member.name} `;
    
    setInput(before + mentionText + after);
    setMentionQuery(null);
    setMentionStartPos(null);
    
    // Focus back and set cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.selectionStart = inputRef.current.selectionEnd = before.length + mentionText.length;
      }
    }, 0);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    
    if (match && (sel?.isGroup || sel?.isChannel)) {
      setMentionQuery(match[1]);
      setMentionStartPos(cursorPos - match[1].length - 1);
      setMentionIndex(0);
      if (members.length === 0 && fetchMembers) {
        fetchMembers();
      }
    } else {
      setMentionQuery(null);
      setMentionStartPos(null);
    }
  };

  const composerKeyDown = (e) => {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev > 0 ? prev - 1 : filteredMembers.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev < filteredMembers.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setMentionStartPos(null);
        return;
      }
    }
    
    allowShortcuts(e);
    handleKeyDown(e);
  };

  const safeInputValue = (input === "null" || input == null) ? "" : input;
  console.log('[Debug] Composer raw input value before render:', input);

  return (
    <>
          {/* Handles AI suggestions, templates, voice recording, typing indicator */}
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
                    onClick={()=>{setInput(p=>((p === "null" || p == null) ? "" : p)+e)}}>
                    {e}
                  </button>
                ))}
                <button onClick={()=>setEmojiOpen(false)}
                  style={{marginLeft:"auto",background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,flexShrink:0}}>
                  ✕
                </button>
              </div>
            )}
            {/* File preview */}
            {pastedFile && (
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'8px 16px',
                background:'rgba(124,58,237,.15)',borderBottom:'1px solid #2d1155',flexShrink:0}}>
                {filePreview ? (
                  <div style={{width:40,height:40,borderRadius:6,overflow:'hidden',flexShrink:0,background:'#000'}}>
                    <img src={filePreview} alt="preview" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  </div>
                ) : (
                  <div style={{width:40,height:40,borderRadius:6,background:'#2d1155',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>
                    📄
                  </div>
                )}
                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',justifyContent:'center'}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#f0e6ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {pastedFile.name || 'Attachment'}
                  </div>
                  <div style={{fontSize:12,color:'#9b7ec8'}}>
                    {(pastedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button onClick={() => { setPastedFile(null); setFilePreview(null); }}
                  style={{background:'none',border:'none',color:'#a78bfa',cursor:'pointer',
                    fontSize:20,lineHeight:1,padding:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  ✕
                </button>
              </div>
            )}
            {/* Mention Dropdown */}
            {mentionQuery !== null && filteredMembers.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 8,
                background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, 
                maxHeight: 200, overflowY: 'auto', zIndex: 100, boxShadow: '0 -4px 12px rgba(0,0,0,0.5)'
              }}>
                {filteredMembers.map((m, idx) => (
                  <div key={m.id} onClick={() => handleMentionSelect(m)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      background: mentionIndex === idx ? 'rgba(124,58,237,0.3)' : 'transparent',
                      borderBottom: '1px solid #2c2c2e'
                    }}>
                    <div style={{width: 28, height: 28, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 'bold'}}>
                      {m.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{fontSize: 13, color: '#f0e6ff', fontWeight: 600}}>{m.name}</div>
                      {m.username && <div style={{fontSize: 11, color: '#a78bfa'}}>@{m.username}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="ir" style={{ position: 'relative' }}>
              {/* AI Sparkle on the left */}
              <button className="ib s" onClick={() => {
                console.log('[Debug] sparkleClicked');
                setAiPanelOpen(true);
                if (typeof getAI === 'function') getAI(false);
              }} disabled={aiLoading} title="AI Suggest"
                style={{fontSize:18, opacity: aiLoading ? 0.5 : 1}}>
                {aiLoading?"⏳":"✨"}
              </button>

              <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} />
              <textarea className="message-input" placeholder="Message..."
                ref={inputRef} value={safeInputValue} rows={1}
                onChange={handleInputChange}
                onPaste={handleComposerPaste}
                onKeyDown={composerKeyDown}
                style={{height:"auto"}}/>
              
              {/* Right side buttons */}
              <button className={`ib g${showTmpl?" on":""}`} onClick={()=>setShowTmpl(v=>!v)} title="Templates" style={{fontSize:17}}>
                📋
              </button>
              <button className="ib" onClick={()=>setEmojiOpen(p=>!p)} title="Emoji"
                style={{fontSize:17}}>😊</button>
              <button className="ib g" title="Attach file"
                onClick={()=>fileInputRef.current?.click()} style={{fontSize:17}}>📎</button>
              
              <button className="sb" onClick={send} disabled={(!safeInputValue.trim() && !pastedFile)||sending}
                style={{opacity:(safeInputValue.trim() || pastedFile)&&!sending?1:.4, background:editingMsg?'#4caf50':''}} title={editingMsg?"Save Edit":"Send"}>
                {editingMsg ? "✓" : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z" /></svg>}
              </button>
            </div>
          </div>
    </>
  );
}
