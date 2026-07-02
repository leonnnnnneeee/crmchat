const fs = require('fs');
let code = fs.readFileSync('src/CRMChat.jsx', 'utf8');

code = code.replace(
  '    const parts = [\n      c.name,\n      c.username,\n      c.lastMsg\n    ];',
  '    const parts = [\n      c.name,\n      c.username ? `@${c.username}` : null,\n      c.username,\n      c.lastMsg\n    ];'
);

fs.writeFileSync('src/CRMChat.jsx', code);
console.log('Searchable text patched!');
