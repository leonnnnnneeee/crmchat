const fs = require('fs');
const content = fs.readFileSync('src/CRMChat.jsx', 'utf-8');

const components = {
  ForumTopicsView: { start: '/* TODO(Refactor): Split out into <ForumTopicsView> component */', end: '):<>' },
  ChatHeader: { start: '{/* TODO(Refactor): Split out into <ChatHeader> component */}', end: '{/* Messages */}' },
  MessageList: { start: '{/* TODO(Refactor): Split out into <MessageList> and <MessageBubble> components */}', end: '{/* Input area */}' },
  Composer: { start: '{/* TODO(Refactor): Split out into <Composer> component */}', end: '</>}' },
  CRMRightPanel: { start: '{/* TODO(Refactor): Split out into <CRMRightPanel> component */}', end: '</div>\n    </div>\n  )\n}' }
};

for (const [name, bounds] of Object.entries(components)) {
  const startIdx = content.indexOf(bounds.start);
  if (startIdx === -1) { console.log(name + ' start not found'); continue; }
  
  let endIdx = content.indexOf(bounds.end, startIdx + bounds.start.length);
  if (name === 'CRMRightPanel') {
     endIdx = content.lastIndexOf('</div>\n    </div>\n  )\n}');
  }
  
  if (endIdx === -1) { console.log(name + ' end not found'); continue; }
  
  const compCode = content.substring(startIdx + bounds.start.length, endIdx).trim();
  fs.writeFileSync(`src/components/chat/${name}.jsx`, `import React from 'react';\n\nexport default function ${name}(props) {\n  const { /* destructured props go here */ } = props;\n  return (\n    <>\n      ${compCode}\n    </>\n  );\n}\n`);
  console.log(`Extracted ${name}`);
}
