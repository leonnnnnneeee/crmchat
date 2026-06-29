import os
import re

filepath = '/Users/linh/Downloads/crmchat_latest/src/components/chat/MessageList.jsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Add resendMessage to props extraction
old_props = 'const { msgs, sel, renderMessageText, '
new_props = 'const { msgs, sel, renderMessageText, resendMessage, '
content = content.replace(old_props, new_props)

# 2. Add clickable Retry to failed icon
old_failed_icon = '''                                ) : msg.failed ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                  </svg>
                                )'''

new_failed_icon = '''                                ) : msg.failed ? (
                                  <div onClick={() => resendMessage && resendMessage(msg)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 4 }} title="Click to retry">
                                    <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>Retry</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <line x1="12" y1="8" x2="12" y2="12"></line>
                                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                  </div>
                                )'''

content = content.replace(old_failed_icon, new_failed_icon)

with open(filepath, 'w') as f:
    f.write(content)
