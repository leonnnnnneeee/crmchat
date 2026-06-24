function AISuggestPanel({text,suggestions,analysis,alternative,messages,loading,onUse,onUseAlt,onUseAll,onRegenerate,onClose,hasResearch}) {
  const [editIdx,setEditIdx] = useState(null)
  const [edited,setEdited]   = useState({})

  if(!text && !loading && (!suggestions || suggestions.length === 0)) return null

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

      {loading ? (
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
      )}
    </div>
  )
}
