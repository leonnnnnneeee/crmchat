import os
import re

filepath = '/Users/linh/Downloads/crmchat_latest/src/CRMChat.jsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Add sendClicked, activeAccountId, chatId, topicId, tempId, optimisticMessageAdded
old_send_start = 'const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true}'
new_send_start = '''console.log('[DEBUG] sendClicked', { activeAccountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text });
    const tempMsg = {id: -Date.now(), accountId: activeAccRef.current, chatId: sel.id, topicId: selTopic?.id || null, text, fromMe:true, date:sentDate, pending:true}
    console.log('[DEBUG] tempId', tempMsg.id);'''
content = content.replace(old_send_start, new_send_start)

# 1b. optimisticMessageAdded
old_cache_set = '''      msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
      return nextState;
    })'''
new_cache_set = '''      msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
      console.log('[DEBUG] optimisticMessageAdded', true);
      return nextState;
    })'''
content = content.replace(old_cache_set, new_cache_set)

# 2. sidebarUpdated
old_sidebar = '''        newChats[idx] = { ...newChats[idx], date: sentDate, lastMsg: text }
        return newChats
      }
      return prev
    })'''
new_sidebar = '''        newChats[idx] = { ...newChats[idx], date: sentDate, lastMsg: text }
        console.log('[DEBUG] sidebarUpdated', true);
        return newChats
      }
      return prev
    })'''
content = content.replace(old_sidebar, new_sidebar)

# 3. sendApiRequest, sendApiResponse, realMessageId, messageReplaced
old_api_send = '''      } else {
        const r = await fetch('/api/chat/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({chatId:sel.id, text, username: sel.username || undefined})
        })
        const d = await r.json()
        if (d.ok && d.messageId) { realMsgId = d.messageId; realDate = d.date; }
      }'''
new_api_send = '''      } else {
        const payload = {chatId:sel.id, text, username: sel.username || undefined};
        console.log('[DEBUG] sendApiRequest payload', payload);
        const r = await fetch('/api/chat/send', {
          method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify(payload)
        })
        const d = await r.json()
        console.log('[DEBUG] sendApiResponse', d);
        if (d.ok && d.messageId) { realMsgId = d.messageId; realDate = d.date; }
      }
      console.log('[DEBUG] realMessageId', realMsgId);'''
content = content.replace(old_api_send, new_api_send)

old_replace = '''      setMsgs(p => {
         const nextState = p.map(m => m.id === tempMsg.id ? {...m, pending:false, id: realMsgId || m.id, date: realDate || m.date} : m);
         msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
         return nextState;
      });'''
new_replace = '''      setMsgs(p => {
         const nextState = p.map(m => m.id === tempMsg.id ? {...m, pending:false, id: realMsgId || m.id, date: realDate || m.date} : m);
         msgsCacheRef.current[activeAccRef.current + '_' + sel.id + (selTopic?.id ? '_' + selTopic.id : '')] = nextState;
         console.log('[DEBUG] messageReplaced', true);
         return nextState;
      });'''
content = content.replace(old_replace, new_replace)

# 4. realtimeDuplicateSkipped
old_realtime = '''                if (pendingIdx > -1) {
                  // Replace pending message with the real one
                  updated = [...prev];
                  updated[pendingIdx] = msg;
                } else {'''
new_realtime = '''                if (pendingIdx > -1) {
                  // Replace pending message with the real one
                  updated = [...prev];
                  updated[pendingIdx] = msg;
                  console.log('[DEBUG] realtimeDuplicateSkipped', true, 'replaced pending message with SSE message');
                } else {'''
content = content.replace(old_realtime, new_realtime)

with open(filepath, 'w') as f:
    f.write(content)
