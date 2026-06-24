const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

(async () => {
  try {
    const sessionStr = fs.readFileSync('session.txt', 'utf8').trim();
    const client = new TelegramClient(new StringSession(sessionStr), 25619177, 'd3151b72a6b29f0ce6883b2df76a0c5c', { connectionRetries: 1 });
    await client.connect();
    
    // Test with a known ID but string
    const result = await client.invoke(new Api.messages.GetCommonChats({
      userId: '123456', // Pass string instead of entity
      maxId: 0,
      limit: 100
    }));
    console.log(result);
  } catch (e) {
    console.error("API ERROR:", e.message);
  }
  process.exit();
})();
