const fs = require('fs');
let code = fs.readFileSync('src/CRMChat.jsx', 'utf8');

code = code.replace(
  '<video style={{width:\'100%\',height:\'100%\',objectFit:\'cover\'}} src={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`}/>',
  '<video style={{width:\'100%\',height:\'100%\',objectFit:\'cover\'}} src={`/api/chat/media/${data.chatId}/${m.id}?t=${token}`} poster={`/api/chat/media/${data.chatId}/${m.id}?thumb=1&t=${token}`} preload="none"/>'
);

fs.writeFileSync('src/CRMChat.jsx', code);
console.log('SharedMediaModal video patched!');
