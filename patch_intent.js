const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  '      normalizedEnglishIntent: \'General response\',\n      replyGoal: \'General response\',',
  '      normalizedEnglishIntent: cmd ? `Execute this custom instruction: "${cmd}"` : \'General response\',\n      replyGoal: cmd ? `Execute this custom instruction: "${cmd}"` : \'General response\','
);

fs.writeFileSync('server.js', code);
console.log('Intent patched!');
