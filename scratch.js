const { Api } = require('telegram/tl')
const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')

console.log("InputUser has photo?", new Api.InputUser({userId: BigInt(1), accessHash: BigInt(1)}).photo !== undefined);
