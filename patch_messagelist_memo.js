const fs = require('fs');
let code = fs.readFileSync('src/components/chat/MessageList.jsx', 'utf8');

code = code.replace(
  'if (prev.highlightedMsgId !== next.highlightedMsgId) return false;',
  'if (prev.highlightedMsgId !== next.highlightedMsgId) return false;\n  if (prev.replyTo !== next.replyTo) return false;\n  if (prev.editingMsg !== next.editingMsg) return false;\n  if (prev.forwardMsg !== next.forwardMsg) return false;'
);

fs.writeFileSync('src/components/chat/MessageList.jsx', code);
console.log('MessageList memo comparator patched!');
