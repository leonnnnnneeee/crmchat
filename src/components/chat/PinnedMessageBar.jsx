import React from 'react';

const TG = {
  elevated: "#2d1155",
  blueLight: "#5288c1",
  text: "#f0e6ff",
  textMuted: "#6b4d94",
  panel: "#1a0533"
};

export default function PinnedMessageBar({ pinnedMessage, onClick, onDismiss }) {
  if (!pinnedMessage) return null;

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
    onClick={() => onClick(pinnedMessage.id)}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 1)'}
    onMouseLeave={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.85)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TG.blueLight, fontSize: 16
        }}>
          📌
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 13, color: TG.blueLight, fontWeight: 600 }}>
            Pinned Message
          </div>
          <div style={{ fontSize: 13, color: TG.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pinnedMessage.text || 'Message'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
