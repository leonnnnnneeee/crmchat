const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  '      if (req.path.includes(\'/audio\')) {\n        res.set(\'Content-Type\', \'audio/ogg\')\n      } else {\n        res.set(\'Content-Type\', \'image/jpeg\') \n      }',
  `      if (isThumb) {
        res.set('Content-Type', 'image/jpeg');
      } else if (req.path.includes('/audio')) {
        res.set('Content-Type', 'audio/ogg');
      } else {
        let cachedMsg = global.mediaMessageCache ? global.mediaMessageCache.get(chatId + '_' + msgId) : null;
        if (cachedMsg) {
          const isVideo = cachedMsg.media?.className === 'MessageMediaDocument' && cachedMsg.media?.document?.mimeType?.startsWith('video/');
          if (isVideo) res.set('Content-Type', cachedMsg.media.document.mimeType || 'video/mp4');
          else if (cachedMsg.media?.className === 'MessageMediaDocument') res.set('Content-Type', cachedMsg.media.document.mimeType || 'application/octet-stream');
          else res.set('Content-Type', 'image/jpeg');
        } else {
           // Avoid setting incorrect image/jpeg for videos, let browser sniff or assume video if large?
           // Actually, it's safer to not set it if we don't know, so res.sendFile defaults to octet-stream and browser sniffs.
           res.type('application/octet-stream');
        }
      }`
);

fs.writeFileSync('server.js', code);
console.log('Cache hit Content-Type patched!');
