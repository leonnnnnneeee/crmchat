import { getSafeInitials } from '../../utils/avatarUtils';
import React, { useState, useEffect } from 'react';
import { safeFetch } from '../../utils/api';

export default function TelegramSettings({ onClose, activeAccountId, accounts, token }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [avatarSrc, setAvatarSrc] = useState(null);

  const activeAcc = accounts.find(a => a.accountId === activeAccountId);

  useEffect(() => {
    if (!activeAccountId) {
      setLoading(false);
      return;
    }
    
    let isMounted = true;
    setLoading(true);

    const fetchProfile = async () => {
      console.log('[DEBUG] activeAccountId:', activeAccountId);
      console.log('[DEBUG] settingsProfileRequestUrl:', `/api/telegram/accounts/${activeAccountId}/profile`);
      console.log('[DEBUG] accountFromList:', activeAcc);

      try {
        const data = await safeFetch(`/api/telegram/accounts/${activeAccountId}/profile`, {
          headers: { 'x-auth-token': token }
        });
        
        console.log('[DEBUG] telegramProfileResponse:', data);
        if (data.ok && isMounted) {
          setProfileData(data);
        }
      } catch (err) {
        console.error('Failed to fetch account profile', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchProfile();

    return () => { isMounted = false; };
  }, [activeAccountId, token]); // Only depend on IDs and token to prevent loops

  // --- Profile Merging Logic ---
  const mergedDisplayName = profileData?.displayName || activeAcc?.displayName || profileData?.username || activeAcc?.username || profileData?.phone || activeAcc?.phone || "Telegram Account";
  const mergedUsername = profileData?.username || activeAcc?.username || "";
  const rawPhone = profileData?.phone || activeAcc?.phone || "";
  const mergedBio = profileData?.bio || "Not set";
  const normalizeTelegramStatus = (profile, account) => {
    const sStatus = profile?.sessionStatus || 'disconnected';
    const isActive = account?.accountId === profile?.accountId;
    const uStatus = profile?.userStatus || '';
    const lastSeen = profile?.lastSeenAt;

    let text = 'last seen recently';
    let color = 'rgba(255,255,255,0.8)';
    let reason = 'fallback default';

    if (sStatus === 'expired') {
      text = 'session expired';
      color = '#ff3b30';
      reason = 'session expired';
    } else if (sStatus === 'disconnected') {
      text = 'disconnected';
      color = '#ff9500';
      reason = 'session disconnected';
    } else if (isActive && sStatus === 'connected') {
      text = 'online';
      color = '#34c759';
      reason = 'active and connected';
    } else if (uStatus.includes('Online')) {
      text = 'online';
      color = '#34c759';
      reason = 'userStatus online';
    } else if (uStatus.includes('Offline') && lastSeen) {
      const d = new Date(lastSeen * 1000);
      text = `last seen at ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      color = 'rgba(255,255,255,0.8)';
      reason = 'userStatus offline with timestamp';
    } else if (uStatus.includes('Recently')) {
      text = 'last seen recently';
      color = 'rgba(255,255,255,0.8)';
      reason = 'userStatus recently';
    } else if (uStatus) {
      text = uStatus.replace('UserStatus', '').toLowerCase();
      color = 'rgba(255,255,255,0.8)';
      reason = 'userStatus parsed';
    } else {
      reason = 'missing status, defaulted to last seen recently';
    }

    if (profile) {
      console.log('[DEBUG] Status Normalization:', {
        activeAccountId: account?.accountId,
        profileAccountId: profile.accountId,
        sessionStatus: sStatus,
        isActive,
        rawUserStatus: uStatus,
        lastSeenAt: lastSeen,
        normalizedDisplayStatus: text,
        fallbackUsed: reason
      });
    }

    return { text, color };
  };

  const statusObj = profileData ? normalizeTelegramStatus(profileData, activeAcc) : { text: 'Loading...', color: 'rgba(255,255,255,0.5)' };
  const telegramUserId = profileData?.telegramUserId || activeAcc?.telegramUserId;

  console.log('[DEBUG] mergedProfile:', { mergedDisplayName, mergedUsername, rawPhone, mergedBio, telegramUserId });

  // --- Avatar Logic ---
  useEffect(() => {
    if (!telegramUserId) return;
    let isMounted = true;
    
    fetch(`/api/chat/photo/${telegramUserId}`, { headers: { 'x-auth-token': token } })
      .then(r => {
        if (!r.ok) throw new Error('No photo');
        return r.blob();
      })
      .then(blob => {
        if (blob.size > 0 && isMounted) {
          setAvatarSrc(URL.createObjectURL(blob));
          console.log('[DEBUG] avatarResolved', true);
        } else {
          console.log('[DEBUG] avatarResolved', false);
          console.log('[DEBUG] fallbackUsed reason:', 'Blob size is 0');
        }
      })
      .catch(e => {
        console.log('[DEBUG] avatarResolved', false);
        console.log('[DEBUG] fallbackUsed reason:', e.message);
      });
      
    return () => { isMounted = false; };
  }, [telegramUserId, token]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const formatPhone = (phone) => {
    if (!phone) return 'Not set';
    const p = phone.replace(/[^0-9+]/g, '');
    if (p.startsWith('84') || p.startsWith('+84')) {
      const core = p.replace(/^\+?84/, '');
      if (core.length === 9) {
        return `+84 ${core.slice(0,3)} ${core.slice(3,6)} ${core.slice(6)}`;
      }
    }
    return p.startsWith('+') ? p : '+' + p;
  };

  const SectionItem = ({ icon, label, value, onClick }) => (
    <div 
      onClick={onClick ? onClick : () => showToast('Coming soon')}
      style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 16, cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ fontSize: 22, color: '#8e8e93', width: 28, display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, color: '#f2f2f7' }}>{label}</span>
        {value && <span style={{ fontSize: 14, color: '#8e8e93' }}>{value}</span>}
      </div>
      <div style={{ fontSize: 14, color: '#636366' }}>›</div>
    </div>
  );

  const InfoItem = ({ icon, value, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 22, color: '#8e8e93', width: 28, display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 16, color: '#f2f2f7', fontWeight: 500 }}>{value}</span>
        <span style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      zIndex: 100000, display: 'flex'
    }}>
      {/* Dimmed Background */}
      <div 
        onClick={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' }} 
      />
      
      {/* Drawer */}
      <div style={{
        position: 'relative', width: 420, maxWidth: '100%', height: '100%', 
        background: '#0d0d0d', display: 'flex', flexDirection: 'column', 
        borderRight: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', animation: 'slideIn 0.2s ease-out'
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
          .tg-scroll::-webkit-scrollbar { width: 6px; }
          .tg-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        `}</style>
        
        {/* Header Fixed */}
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 12,
          background: 'rgba(13,13,13,0.85)', backdropFilter: 'blur(10px)', zIndex: 10,
          position: 'absolute', top: 0, left: 0, right: 0, borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#f2f2f7', fontSize: 24, cursor: 'pointer',
            width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
            ←
          </button>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 600, color: '#f2f2f7' }}>Settings</div>
          <button onClick={() => showToast('Coming soon')} style={{ background: 'none', border: 'none', color: '#f2f2f7', fontSize: 18, cursor: 'pointer', padding: 8 }}>
            🔲
          </button>
          <button onClick={() => showToast('Coming soon')} style={{ background: 'none', border: 'none', color: '#f2f2f7', fontSize: 18, cursor: 'pointer', padding: 8 }}>
            ✏️
          </button>
          <button onClick={() => showToast('Coming soon')} style={{ background: 'none', border: 'none', color: '#f2f2f7', fontSize: 20, cursor: 'pointer', padding: 8 }}>
            ⋮
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="tg-scroll" style={{ flex: 1, overflowY: 'auto', background: '#000' }}>
          
          {/* Profile Cover */}
          <div style={{
            height: 320, background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', 
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.2)' }} />
            <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
              <div style={{
                width: 120, height: 120, borderRadius: '50%', background: '#a78bfa',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, color: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', overflow: 'hidden'
              }}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  getSafeInitials(mergedDisplayName)
                )}
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 16, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                {loading && !profileData ? 'Loading...' : mergedDisplayName}
              </div>
              <div style={{ fontSize: 14, color: statusObj.color, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {statusObj.color === '#34c759' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34c759' }} />}
                {loading && !profileData ? '...' : statusObj.text}
              </div>
            </div>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Account Info Card */}
            <div style={{ background: '#1c1c1e', borderRadius: 12, overflow: 'hidden' }}>
              <InfoItem icon="📞" value={formatPhone(rawPhone)} label="Phone" />
              <InfoItem icon="👤" value={mergedUsername ? `@${mergedUsername}` : 'Not set'} label="Username" />
              <InfoItem icon="ℹ️" value={loading && !profileData ? 'Loading...' : mergedBio} label="Bio" />
            </div>

            {/* General Settings Card */}
            <div style={{ background: '#1c1c1e', borderRadius: 12, overflow: 'hidden' }}>
              <SectionItem icon="🔔" label="Notifications and Sounds" />
              <SectionItem icon="💾" label="Data and Storage" />
              <SectionItem icon="🔒" label="Privacy and Security" />
              <SectionItem icon="⚙️" label="General Settings" />
              <SectionItem icon="📁" label="Chat Folders" />
              <SectionItem icon="🎨" label="Stickers and Emoji" />
              <SectionItem icon="📷" label="Speakers and Camera" />
              <SectionItem icon="💻" label="Devices" value="1" />
              <SectionItem icon="🌐" label="Language" value="English" />
              <SectionItem icon="⌨️" label="Keyboard Shortcuts" />
            </div>

            {/* Premium Card */}
            <div style={{ background: '#1c1c1e', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <SectionItem icon="⭐" label="Telegram Premium" />
              <SectionItem icon="🎁" label="Send a Gift" />
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: 20,
          fontSize: 14, zIndex: 100001, animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
