const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

if (!code.includes('function normalizePhone(')) {
  const normalizeFunc = `
function normalizePhone(p) {
  if (!p) return '';
  let cleaned = String(p).replace(/[\\s\\-\\(\\)]/g, '');
  if (!cleaned.startsWith('+') && cleaned.length > 5) cleaned = '+' + cleaned;
  return cleaned;
}
`;
  code = code.replace(/const _accounts = new Map\(\)/, normalizeFunc + 'const _accounts = new Map()');
  fs.writeFileSync('server.js', code);
  console.log('normalizePhone added');
}
