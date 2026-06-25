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
      padding: '6px 16px',
      background: TG.panel,
      borderBottom: `1px solid ${TG.elevated}`,
      flexShrink: 0,
      cursor: 'pointer'
    }}
    onClick={() => onClick(pinnedMessage.id)}
    onMouseEnter={e => e.currentTarget.style.background = '#251141'}
    onMouseLeave={e => e.currentTarget.style.background = TG.panel}
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
