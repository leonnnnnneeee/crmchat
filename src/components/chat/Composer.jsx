import React from 'react';

export default function Composer(props) {
  const { 
    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime,
    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,
    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInputRef, handleFileChange, stopRecording, startRecording, mediaRecRef, recordTimerRef, setRecording, setRecordSecs,
    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,
    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,
    LinkPreview, ChatPhoto, Avatar, fmtTime
  } = props;

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
                onClick={()=>fileInputRef.current?.click()} style={{fontSize:17}}>📎</button>
              <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} />
              <textarea className="message-input" placeholder="Type a message..."
                ref={inputRef} value={input} rows={1}
                onChange={e=>{
                  setInput(e.target.value)
                }}
                onKeyDown={handleKeyDown}
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
    </>
  );
}
