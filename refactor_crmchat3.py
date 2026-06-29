import os
import re

filepath = '/Users/linh/Downloads/crmchat_latest/src/CRMChat.jsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update handleSend optimistic creation and cache save
old_temp_msg = 'const tempMsg = {id: -Date.now(), text, fromMe:true, date:sentDate, pending:true}\n    setMsgs(p=>[...p, tempMsg])'
new_temp_msg = '''const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true}
    setMsgs(p => {
      const nextState = [...p, tempMsg];
      msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
      return nextState;
    })'''
content = content.replace(old_temp_msg, new_temp_msg)

# 2. Update handleSend error block
old_error_block = '''    } catch(e) {
      // Rollback
      setMsgs(p=>p.filter(m=>m.id!==tempMsg.id))
      setInput(text)'''
new_error_block = '''    } catch(e) {
      console.error('Send failed:', e);
      setMsgs(p => {
         const nextState = p.map(m => m.id === tempMsg.id ? {...m, pending:false, failed:true} : m);
         msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
         return nextState;
      });
      // Do not clear input so user can try again if they want, or they can use the retry button
      // setInput(text)'''
content = content.replace(old_error_block, new_error_block)

# 3. Update loadMessages sort logic
old_sort_logic = 'nextState.sort((a, b) => a.id - b.id);'
new_sort_logic = 'nextState.sort((a, b) => a.date - b.date);'
content = content.replace(old_sort_logic, new_sort_logic)

# 4. Update SSE new_message deduplication
old_sse_merge = '''            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                if (prev.some(m => m.id === msg.id)) return prev
                msg.reactions = mergeReactions(msg.id, msg.reactions || [])
                const updated = [...prev, msg]
                const nextState = updated.sort((a,b) => a.date - b.date)'''
new_sse_merge = '''            if (isSameChat && isSameTopic) {
              setMsgs(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                msg.reactions = mergeReactions(msg.id, msg.reactions || []);
                const pendingIdx = prev.findIndex(m => m.pending && m.text === msg.text && m.fromMe);
                let updated;
                if (pendingIdx > -1) {
                  // Replace pending message with the real one
                  updated = [...prev];
                  updated[pendingIdx] = msg;
                } else {
                  updated = [...prev, msg];
                }
                const nextState = updated.sort((a,b) => a.date - b.date)'''
content = content.replace(old_sse_merge, new_sse_merge)

# 5. Add resendMessage function and pass it to MessageList
old_chatProps = '''  const chatProps = {
    sel, selTopic, setSelTopic,'''
new_chatProps = '''  const resendMessage = (failedMsg) => {
    // Basic resend for text. Files not supported in this simple resend.
    if (!failedMsg.text) return;
    setInput(failedMsg.text);
    setMsgs(p => p.filter(m => m.id !== failedMsg.id));
    setTimeout(() => {
      send(failedMsg.text);
    }, 50);
  };

  const chatProps = {
    resendMessage,
    sel, selTopic, setSelTopic,'''
content = content.replace(old_chatProps, new_chatProps)

with open(filepath, 'w') as f:
    f.write(content)
