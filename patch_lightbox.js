const fs = require('fs');
let code = fs.readFileSync('src/CRMChat.jsx', 'utf8');

code = code.replace(
  'onClick={() => { if(isVideoMsg(m)) setLightbox(`/api/chat/media/${data.chatId}/${m.id}?t=${token}`); else setLightbox(`/api/chat/media/${data.chatId}/${m.id}?t=${token}`) }}',
  'onClick={() => { if(isVideoMsg(m)) setLightbox(`/api/chat/media/${data.chatId}/${m.id}?type=video&t=${token}`); else setLightbox(`/api/chat/media/${data.chatId}/${m.id}?t=${token}`) }}'
);

fs.writeFileSync('src/CRMChat.jsx', code);
console.log('Lightbox video URL patched!');
