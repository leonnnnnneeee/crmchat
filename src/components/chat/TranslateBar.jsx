import React from 'react';

const TG = {
  elevated: "#2d1155",
  blueLight: "#5288c1",
  text: "#f0e6ff",
  textMuted: "#6b4d94"
};

export default function TranslateBar({ onTranslate, onDismiss, chatId, topicId, sourceComponent, targetLanguage = 'Vietnamese', isTranslating = false }) {
  React.useEffect(() => {
    console.log('[TranslateBar Rendered]', {
      selectedChatId: chatId,
      selectedTopicId: topicId,
      translateBarRenderCount: 1, // Rendered once per mount
      translateBarSourceComponent: sourceComponent,
      translateBarVisible: true,
      dismissedState: false
    });
  }, [chatId, topicId, sourceComponent]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      margin: '8px 16px',
      background: 'rgba(30, 41, 59, 0.85)', /* Glassmorphism */
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      flexShrink: 0,
      cursor: 'pointer',
      transition: 'background 0.2s',
      zIndex: 10
    }}
    onClick={onTranslate}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 1)'}
    onMouseLeave={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.85)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TG.blueLight, fontSize: 16
        }}>
          {isTranslating ? <span style={{display:'inline-block', animation:'spin 1s linear infinite'}}>⏳</span> : 'A文'}
        </div>
        <div style={{ fontSize: 14, color: TG.blueLight, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isTranslating ? 'Translating...' : `Translate to ${targetLanguage}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div 
          onClick={(e) => { e.stopPropagation(); /* TODO: settings */ }}
          style={{ padding: '6px 8px', color: TG.textMuted, cursor: 'pointer', borderRadius: '50%' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          ⚙️
        </div>
        <div 
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          style={{ padding: '6px 8px', color: TG.textMuted, cursor: 'pointer', borderRadius: '50%', fontSize: 12 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          ✕
        </div>
      </div>
    </div>
  );
}
