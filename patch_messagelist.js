const fs = require('fs');
let code = fs.readFileSync('src/components/chat/MessageList.jsx', 'utf8');

code = code.replace(
  '{msg.replyTo&&(\n                          <div onClick={()=>{/* scroll to reply */}} style={{background:"rgba(255,255,255,.05)",borderLeft:`3px solid #7dd3fc`,padding:"2px 8px",borderRadius:"0 4px 4px 0",marginBottom:6,fontSize:13,color:"rgba(255,255,255,.7)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",flexDirection:"column"}}>\n                            <span style={{color:"#7dd3fc",fontWeight:500,fontSize:12}}>{msg.replyTo.fromMe?"You":sel.name}</span>\n                            <span>{msg.replyTo.text}</span>\n                          </div>\n                        )}',
  `                        {(msg.replyTo || msg.replyToMsgId) && (() => {
                          const replyMsg = msg.replyTo || msgs.find(m => m.id === msg.replyToMsgId);
                          if (!replyMsg) return (
                            <div onClick={()=>{/* scroll to reply */}} style={{background:"rgba(255,255,255,.05)",borderLeft:\`3px solid #7dd3fc\`,padding:"2px 8px",borderRadius:"0 4px 4px 0",marginBottom:6,fontSize:13,color:"rgba(255,255,255,.7)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",flexDirection:"column"}}>
                              <span style={{color:"#7dd3fc",fontWeight:500,fontSize:12}}>Unknown Sender</span>
                              <span>Replied Message</span>
                            </div>
                          );
                          return (
                            <div onClick={()=>{/* scroll to reply */}} style={{background:"rgba(255,255,255,.05)",borderLeft:\`3px solid #7dd3fc\`,padding:"2px 8px",borderRadius:"0 4px 4px 0",marginBottom:6,fontSize:13,color:"rgba(255,255,255,.7)",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",flexDirection:"column"}}>
                              <span style={{color:"#7dd3fc",fontWeight:500,fontSize:12}}>{replyMsg.fromMe ? "You" : (replyMsg.senderName || sel.name)}</span>
                              <span>{replyMsg.text || 'Media'}</span>
                            </div>
                          );
                        })()}`
);

fs.writeFileSync('src/components/chat/MessageList.jsx', code);
console.log('MessageList rendering of replyTo patched!');
