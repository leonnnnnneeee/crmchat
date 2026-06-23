const fs = require('fs');

const components = [
  'ForumTopicsView', 'ChatHeader', 'MessageList', 'Composer', 'CRMRightPanel'
];

let out = `import React from 'react';\nimport Avatar from './Avatar';\n\n`;

for (const name of components) {
  const compCode = fs.readFileSync(`src/components/chat/${name}.jsx`, 'utf-8');
  const inner = compCode.split('<>\n')[1].split('\n    </>')[0];
  out += `export function ${name}(props) {\n`;
  out += `  const {\n`;
  out += `    sel, selTopic, setSelTopic, TG, setProfilePreview, setShowMembers, onlineStatus, setChatSearchOpen, showProfile, setShowProfile, \n`;
  out += `    topics, loadingTopics, topicSearch, setTopicSearch, topicError, setTopicCtxMenu, topicCtxMenu, setSel, \n`;
  out += `    loadMsgs, messagesLoaded, msgs, hasMore, fetchMessages, handleScroll, handleCtx, selectMode, setSelectedMsgs, selectedMsgs, \n`;
  out += `    fmtDateSep, isPhotoMsg, isVideoMsg, isDocMsg, setLightbox, token, reactions, setReactions, editedMsgs, fmtMsgTime, \n`;
  out += `    editingMsg, setEditingMsg, input, setInput, replyTo, setReplyTo, forwardMsg, setForwardMsg, inputRef, handleKeyDown, send, aiLoading, getAI, \n`;
  out += `    emojiOpen, setEmojiOpen, showTmpl, setShowTmpl, recording, recordSecs, fileInput, stopRecording, startRecording, \n`;
  out += `    cStage, stages, setStages, tags, cProb, probs, setProbs, cDeal, deals, setDeals, leadSource, \n`;
  out += `    fups, setFups, notes, saveNote, addNote, setAddNote, noteInp, setNoteInp\n`;
  out += `  } = props;\n\n`;
  
  out += `  // LinkPreview, ChatPhoto, Avatar components must be passed in props or imported if used\n`;
  out += `  const { LinkPreview, ChatPhoto } = props;\n\n`;
  
  out += `  return (<>\n${inner}\n  </>);\n}\n\n`;
}

fs.writeFileSync('src/components/chat/ChatComponents.jsx', out);
