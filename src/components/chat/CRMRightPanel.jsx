import React from 'react';

export default function CRMRightPanel(props) {
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
      {showProfile&&(
        <div className="rc">
          {!sel?(
            <div style={{padding:32,textAlign:"center",color:TG.textMuted,fontSize:13,marginTop:60}}>Select a chat</div>
          ):(
            <>
              <div style={{padding:"22px 16px 16px",textAlign:"center",borderBottom:`1px solid ${TG.border}`}}>
                <Avatar name={sel.name} chatId={sel.id} username={sel.username} size={70}/>
                <div style={{fontWeight:700,fontSize:18,color:TG.text,marginTop:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {selTopic ? selTopic.title : sel.name}
                </div>
                <div style={{fontSize:12,color:TG.textSec,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {selTopic ? `Topic in ${sel.name}` : 
                   sel.isGroup || sel.isChannel ? `Telegram · ${sel.memberCount ? sel.memberCount + ' members' : 'Group'}` :
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
    </>
  );
}
