const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const debugEndpoint = `
app.get('/api/debug/accounts', (req, res) => {
  const dump = [];
  for (const [id, acc] of _accounts.entries()) {
    dump.push({
      accountId: id,
      telegramUserId: acc.telegramUserId,
      phone: acc.phone,
      displayName: acc.displayName,
      sessionStatus: acc.sessionStatus,
      hasSession: !!acc.session
    });
  }
  res.json(dump);
});
`;

if (!code.includes('/api/debug/accounts')) {
  code = code.replace("app.get('/api/health', (req,res)", debugEndpoint + "\napp.get('/api/health', (req,res)");
  fs.writeFileSync('server.js', code);
  console.log("Added debug endpoint");
}
