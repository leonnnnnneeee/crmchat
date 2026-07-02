const fs = require('fs');
let code = fs.readFileSync('src/CRMChat.jsx', 'utf8');

code = code.replace(
  'useEffect(() => { selRef.current = sel; selTopicRef.current = selTopic }, [sel, selTopic])',
  'useEffect(() => { selRef.current = sel; selTopicRef.current = selTopic; setReplyTo(null); setEditingMsg(null); }, [sel, selTopic])'
);

fs.writeFileSync('src/CRMChat.jsx', code);
console.log('CRMChat cleared states on switch patched!');
