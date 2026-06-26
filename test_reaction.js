const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');
const sessionFiles = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.session'));
if (sessionFiles.length === 0) {
    console.log("No sessions found");
    process.exit(0);
}
const sessionString = fs.readFileSync(path.join(SESSION_DIR, sessionFiles[0]), 'utf8');

const client = new TelegramClient(new StringSession(sessionString), 20958156, 'bbfcf3d7cd17c661d904b6ff9a34bc3a', {
    connectionRetries: 1
});

async function run() {
    await client.connect();
    console.log("Connected");
    
    // We will get a recent message from "me" and react to it
    const me = await client.getMe();
    const history = await client.invoke(new Api.messages.GetHistory({
        peer: me,
        limit: 1
    }));
    
    if (history.messages.length > 0) {
        const msg = history.messages[0];
        console.log("Reacting to message:", msg.id);
        
        try {
            const res = await client.invoke(new Api.messages.SendReaction({
                peer: me,
                msgId: msg.id,
                reaction: [new Api.ReactionEmoji({ emoticon: '👍' })],
                addToRecent: true
            }));
            console.log("Reaction sent:", res.className);
        } catch (e) {
            console.log("Error reacting:", e.message);
        }
    }
    
    await client.disconnect();
}
run();
