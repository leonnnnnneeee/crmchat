const fs = require('fs');
let code = fs.readFileSync('src/components/chat/MessageList.jsx', 'utf8');

code = code.replace(
  '<video controls style={{maxWidth:\'100%\',maxHeight:320,borderRadius:8,display:\'block\',marginBottom:4}}>\n                            <source src={`/api/chat/media/${sel.id}/${msg.id}?t=${token}`}/>',
  '<video controls preload="metadata" poster={`/api/chat/media/${sel.id}/${msg.id}?thumb=1&t=${token}`} style={{maxWidth:\'100%\',maxHeight:320,borderRadius:8,display:\'block\',marginBottom:4}}>\n                            <source src={`/api/chat/media/${sel.id}/${msg.id}?t=${token}`}/>'
);

fs.writeFileSync('src/components/chat/MessageList.jsx', code);
console.log('Video poster patched!');
