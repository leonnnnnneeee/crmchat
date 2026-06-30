import React, { useState, useEffect, useRef } from 'react';

export default function TelegramMainMenu({ 
  accounts, 
  activeAccountId, 
  onClose, 
  onAddAccount,
  onOpenSavedMessages,
  onOpenContacts,
  onOpenSettings,
  onOpenBackground,
  onManageAccounts,
  onReconnectTelegram,
  onSignOut,
  onResetOrder
}) {
  const [showMore, setShowMore] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    console.log('[DEBUG] mainMenuOpen', true);
    console.log('[DEBUG] activeAccountId', activeAccountId);
    
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      console.log('[DEBUG] mainMenuOpen', false);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, activeAccountId]);

  const activeAcc = accounts.find(a => a.accountId === activeAccountId) || accounts[0];
  const avatarLetter = activeAcc?.displayName 
    ? activeAcc.displayName.charAt(0).toUpperCase() 
    : (activeAcc?.phone ? activeAcc.phone.charAt(1) : 'U');

  const handleItemClick = (label, action) => {
    console.log('[DEBUG] clickedMenuItem', label);
    action();
    onClose();
  };

  const ItemRow = ({ icon, label, onClick, hasArrow }) => (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 16,
        cursor: 'pointer', transition: 'background 0.15s ease',
        color: '#f0e6ff', fontSize: 14, fontWeight: 500
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ fontSize: 18, width: 24, textAlign: 'center', opacity: 0.8 }}>{icon}</div>
      <div style={{ flex: 1 }}>{label}</div>
      {hasArrow && <div style={{ opacity: 0.5 }}>›</div>}
    </div>
  );

  return (
    <div 
      ref={menuRef}
      style={{
        position: 'absolute',
        top: 60, // just below the hamburger menu
        left: 16,
        width: 280,
        background: '#1c1c1e',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100000,
        overflow: 'hidden'
      }}
    >
      {/* Account Info Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.02)'
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: '#7c3aed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, fontWeight: 700
        }}>
          {avatarLetter}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeAcc?.displayName || 'Account'}
          </div>
          <div style={{ fontSize: 13, color: '#a78bfa' }}>
            {activeAcc?.phone || activeAcc?.username || activeAccountId}
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 0' }}>
        {!showMore ? (
          <>
            <ItemRow icon="➕" label="Add Account" onClick={() => handleItemClick('Add Account', onAddAccount)} />
            <ItemRow icon="🔖" label="Saved Messages" onClick={() => handleItemClick('Saved Messages', onOpenSavedMessages)} />
            <ItemRow icon="📱" label="My Stories" onClick={() => handleItemClick('My Stories', () => onOpenSavedMessages())} />
            <ItemRow icon="👥" label="Contacts" onClick={() => handleItemClick('Contacts', onOpenContacts)} />
            <ItemRow icon="⚙️" label="Settings" onClick={() => handleItemClick('Settings', onOpenSettings)} />
            <ItemRow icon="🖼️" label="Background" onClick={() => handleItemClick('Background', onOpenBackground)} />
            <ItemRow icon="⋯" label="More" onClick={() => setShowMore(true)} hasArrow />
          </>
        ) : (
          <>
            <div 
              onClick={() => setShowMore(false)}
              style={{ padding: '12px 16px', cursor: 'pointer', color: '#a78bfa', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 18 }}>‹</span> Back
            </div>
            <ItemRow icon="👥" label="Manage Accounts" onClick={() => handleItemClick('Manage Accounts', onManageAccounts)} />
            <ItemRow icon="🔄" label="Reconnect Telegram" onClick={() => handleItemClick('Reconnect Telegram', onReconnectTelegram)} />
            <ItemRow icon="↕️" label="Reset Order" onClick={() => handleItemClick('Reset Order', onResetOrder)} />
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
            <ItemRow icon="🚪" label="Sign Out" onClick={() => handleItemClick('Sign Out', onSignOut)} />
          </>
        )}
      </div>
    </div>
  );
}
