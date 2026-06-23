const fs = require('fs');

let content = fs.readFileSync('src/CRMChat.jsx', 'utf-8');

// 1. Remove Avatar function
content = content.replace(/function Avatar[\s\S]*?^}/m, '');

// 2. Add imports
const imports = `import Avatar, { setAvatarAuthToken } from './components/chat/Avatar';
import { ForumTopicsView, ChatHeader, MessageList, Composer, CRMRightPanel } from './components/chat/ChatComponents';\n`;
content = content.replace(/import.*?from "react"/, `import { useState, useEffect, useRef, useCallback, useMemo } from "react"\n${imports}`);

// 3. Add setAvatarAuthToken call
content = content.replace(/_authToken = token/, `_authToken = token;\n  setAvatarAuthToken(token);`);

// 4. Add chatProps definition right before `return (<>`
const chatPropsStr = `
  const chatProps = {
    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, fetchMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime,
    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,
    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInput, stopRecording, startRecording,
    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,
    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,
    LinkPreview, ChatPhoto, Avatar
  };

  return (<>`;
content = content.replace(/return\s*\(\s*<>\s*/, chatPropsStr);

// 5. Replace components
content = content.replace(/\/\* TODO\(Refactor\): Split out into <ForumTopicsView> component \*\/[\s\S]*?\):\s*<>/, `/* TODO(Refactor): Split out into <ForumTopicsView> component */
          <ForumTopicsView {...chatProps} />
        ):<>`);

content = content.replace(/\{\/\* TODO\(Refactor\): Split out into <ChatHeader> component \*\/\}[\s\S]*?\{\/\* Messages \*\/\}/, `{/* TODO(Refactor): Split out into <ChatHeader> component */}
          <ChatHeader {...chatProps} />

          {/* Messages */}`);

content = content.replace(/\{\/\* TODO\(Refactor\): Split out into <MessageList> and <MessageBubble> components \*\/\}[\s\S]*?\{\/\* Input area \*\/\}/, `{/* TODO(Refactor): Split out into <MessageList> and <MessageBubble> components */}
          <MessageList {...chatProps} />

          {/* Input area */}`);

content = content.replace(/\{\/\* TODO\(Refactor\): Split out into <Composer> component \*\/\}[\s\S]*?<\/>}/, `{/* TODO(Refactor): Split out into <Composer> component */}
          <Composer {...chatProps} />
        </>}`);

const crmStart = '{/* TODO(Refactor): Split out into <CRMRightPanel> component */}';
const startIdx = content.indexOf(crmStart);
const endIdx = content.lastIndexOf('</div>\n    </div>\n  )\n}');
if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + `{/* TODO(Refactor): Split out into <CRMRightPanel> component */}
      <CRMRightPanel {...chatProps} />
    </div>
  )
}` + content.substring(endIdx + '</div>\n    </div>\n  )\n}'.length);
}

fs.writeFileSync('src/CRMChat.jsx', content);
console.log('CRMChat.jsx updated!');
