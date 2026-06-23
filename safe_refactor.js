const fs = require('fs');
let lines = fs.readFileSync('src/CRMChat.jsx', 'utf-8').split('\n');

const components = {
  ForumTopicsView: { startStr: '/* TODO(Refactor): Split out into <ForumTopicsView> component */', endStr: '):<>' },
  ChatHeader: { startStr: '{/* TODO(Refactor): Split out into <ChatHeader> component */}', endStr: '{/* Messages */}' },
  MessageList: { startStr: '{/* TODO(Refactor): Split out into <MessageList> and <MessageBubble> components */}', endStr: '{/* Input area */}' },
  Composer: { startStr: '{/* TODO(Refactor): Split out into <Composer> component */}', endStr: '</>}' },
  CRMRightPanel: { startStr: '{/* TODO(Refactor): Split out into <CRMRightPanel> component */}', endStr: '{/* User Profile Preview Modal */}' } // Found the actual modal after rc
};

let importsAdded = false;
let chatPropsAdded = false;

// We will do this backwards so line numbers don't shift for earlier components
const compNames = ['CRMRightPanel', 'Composer', 'MessageList', 'ChatHeader', 'ForumTopicsView'];

for (const name of compNames) {
  const bounds = components[name];
  
  const startIdx = lines.findIndex(l => l.includes(bounds.startStr));
  if (startIdx === -1) { console.log("Missing start:", name); continue; }
  
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].includes(bounds.endStr)) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) { console.log("Missing end:", name); continue; }
  
  // Extract content
  let compLines = lines.slice(startIdx + 1, endIdx);
  
  // For ForumTopicsView, endStr `):<>` is on endIdx, but we only want to replace the inside
  // For others, endStr is usually a comment that we want to keep
  let replaceEnd = endIdx;
  if (name === 'CRMRightPanel') {
     // endStr is `{/* User Profile Preview Modal */}`, which means CRMRightPanel ended just before this
     // But wait! CRMRightPanel closes with `</div>\n      )}`
     // Let's find the closing of `showProfile&&(...)`
     let j = endIdx - 1;
     while (j > startIdx && !lines[j].includes(')}')) j--;
     replaceEnd = j + 1;
     compLines = lines.slice(startIdx + 1, replaceEnd);
  }
  
  // Write to separate file
  const compCode = compLines.join('\n');
  fs.writeFileSync(`src/components/chat/${name}.jsx`, `import React from 'react';\n\nexport default function ${name}(props) {\n  const { \n    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,\n    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,\n    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,\n    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime,\n    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,\n    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInput, stopRecording, startRecording, mediaRecRef, recordTimerRef, setRecording, setRecordSecs,\n    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,\n    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,\n    LinkPreview, ChatPhoto, Avatar, fmtTime\n  } = props;\n\n  return (\n    <>\n${compCode}\n    </>\n  );\n}\n`);
  
  // Replace in main file
  const replacement = `          <${name} {...chatProps} />`;
  lines.splice(startIdx + 1, replaceEnd - startIdx - 1, replacement);
  console.log(`Replaced ${name}`);
}

// Now add imports and chatProps to main file
const importIdx = lines.findIndex(l => l.includes('import { useState'));
if (importIdx !== -1 && !importsAdded) {
  lines.splice(importIdx + 1, 0, `import ForumTopicsView from './components/chat/ForumTopicsView';\nimport ChatHeader from './components/chat/ChatHeader';\nimport MessageList from './components/chat/MessageList';\nimport Composer from './components/chat/Composer';\nimport CRMRightPanel from './components/chat/CRMRightPanel';`);
  importsAdded = true;
}

const returnIdx = lines.findIndex(l => l.includes('return (<>'));
if (returnIdx !== -1 && !chatPropsAdded) {
  lines.splice(returnIdx, 0, `
  const chatProps = {
    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile,
    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel,
    loadMsgs, messagesLoaded, msgs, hasMore, loadMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs,
    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime,
    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI,
    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInput, stopRecording, startRecording, mediaRecRef, recordTimerRef, setRecording, setRecordSecs,
    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource,
    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp,
    LinkPreview, ChatPhoto, Avatar, fmtTime
  };
`);
  chatPropsAdded = true;
}

fs.writeFileSync('src/CRMChat.jsx', lines.join('\n'));
