const fs = require('fs');
let code = fs.readFileSync('src/CRMChat.jsx', 'utf8');

// 1. Capture replyToMsgId and replyToObj before setReplyTo(null)
code = code.replace(
  '    setInput("")\n    sendingRef.current = true\n    setSending(true); setReplyTo(null)',
  `    setInput("")\n    sendingRef.current = true\n    const replyToObj = replyTo;\n    const replyToMsgId = replyTo ? replyTo.id : undefined;\n    setSending(true); setReplyTo(null)`
);

// 2. Add replyTo to tempMsg
code = code.replace(
  'const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true}',
  'const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true, replyTo: replyToObj}'
);

// 3. Add replyToMsgId to formData
code = code.replace(
  "if (text) formData.append('caption', text)\n        formData.append('file', pastedFile)",
  "if (text) formData.append('caption', text)\n        if (replyToMsgId) formData.append('replyToMsgId', replyToMsgId)\n        formData.append('file', pastedFile)"
);

// 4. Add replyToMsgId to topics payload
code = code.replace(
  "body:JSON.stringify({text, username: sel.username || undefined})",
  "body:JSON.stringify({text, username: sel.username || undefined, replyToMsgId})"
);

// 5. Add replyToMsgId to normal payload
code = code.replace(
  "const payload = {chatId:sel.id, text, username: sel.username || undefined};",
  "const payload = {chatId:sel.id, text, username: sel.username || undefined, replyToMsgId};"
);

fs.writeFileSync('src/CRMChat.jsx', code);
console.log('CRMChat send function patched!');
