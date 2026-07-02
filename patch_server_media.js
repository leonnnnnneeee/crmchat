const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  '    if (req.path.includes(\'/audio\')) {\n      res.set(\'Content-Type\', \'audio/ogg\')\n    } else {\n      res.set(\'Content-Type\', \'image/jpeg\')\n    }',
  `    const isVideo = message.media?.className === 'MessageMediaDocument' && message.media?.document?.mimeType?.startsWith('video/');
    const isAudio = req.path.includes('/audio') || (message.media?.className === 'MessageMediaDocument' && message.media?.document?.mimeType?.startsWith('audio/'));
    
    if (isThumb) {
      res.set('Content-Type', 'image/jpeg');
    } else if (isAudio) {
      res.set('Content-Type', message.media?.document?.mimeType || 'audio/ogg');
    } else if (isVideo) {
      res.set('Content-Type', message.media?.document?.mimeType || 'video/mp4');
    } else if (message.media?.className === 'MessageMediaDocument') {
      res.set('Content-Type', message.media?.document?.mimeType || 'application/octet-stream');
    } else {
      res.set('Content-Type', 'image/jpeg');
    }`
);

fs.writeFileSync('server.js', code);
console.log('Media Content-Type patched!');
