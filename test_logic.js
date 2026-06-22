const msgs = [
  { id: 1, senderId: 123, text: 'hello http://coincu.com' },
  { id: 2, senderId: 456, text: 'hello http://test.com' },
];

const data = { id: 123, chatId: 123 };

const isLinkMsg = (m) => !!(m.url || m.links?.length > 0 || m.entities?.some?.(e => e.type === 'url') || (m.text && /(https?:\/\/[^\s]+)/.test(m.text)));

let links = 0;
msgs.forEach(m => {
  const isProfileOfChat = data?.id?.toString() === data?.chatId?.toString();
  if (!isProfileOfChat && m.senderId && m.senderId.toString() !== data?.id?.toString()) return;
  if (isLinkMsg(m)) links++;
});
console.log('DM links:', links);

const dataGroup = { id: 123, chatId: 'group_456' };
let groupLinks = 0;
msgs.forEach(m => {
  const isProfileOfChat = dataGroup?.id?.toString() === dataGroup?.chatId?.toString();
  if (!isProfileOfChat && m.senderId && m.senderId.toString() !== dataGroup?.id?.toString()) return;
  if (isLinkMsg(m)) groupLinks++;
});
console.log('Group links (should be 1):', groupLinks);
