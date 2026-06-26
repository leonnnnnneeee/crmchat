import React, { useRef } from 'react';

const BACKGROUND_OPTIONS = [
  { name: 'Default dark doodle', color: '#0e1621', image: 'https://web.telegram.org/a/chat-bg-pattern-dark.png' },
  { name: 'Dark minimal', color: '#0f172a', image: '' },
  { name: 'Deep Space', color: '#000000', image: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  { name: 'Aurora', color: '#0B1D3A', image: 'linear-gradient(45deg, #00416A, #E4E5E6)' },
  { name: 'Night Mountains', color: '#1a2a6c', image: 'linear-gradient(to right, #1a2a6c, #b21f1f, #fdbb2d)' },
  { name: 'Cyber Grid', color: '#000000', image: 'linear-gradient(transparent 95%, #32CD32 100%), linear-gradient(90deg, transparent 95%, #32CD32 100%)', extraStyle: { backgroundSize: '40px 40px' } },
  { name: 'Ocean', color: '#020024', image: 'linear-gradient(180deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)' },
  { name: 'Coffee', color: '#3c2b21', image: 'linear-gradient(135deg, #3c2b21, #1a0f0a)' },
  { name: 'Real Madrid Classic', color: '#0f172a', image: 'linear-gradient(135deg, #00529F, #EE324E)' }, // Placeholder
  { name: 'Santiago Bernabéu', color: '#090e17', image: 'linear-gradient(to bottom, #111, #333)' }, // Placeholder
  { name: 'Real Madrid Squad / Lineup', color: '#111827', image: 'linear-gradient(45deg, #1e293b, #334155)' }, // Placeholder
  { name: 'Real Madrid Matchday', color: '#000', image: 'linear-gradient(180deg, #1a2a6c, #EE324E)' }, // Placeholder
  { name: 'Real Madrid Champions Celebration', color: '#111827', image: 'linear-gradient(45deg, #FFD700, #00529F)' }, // Placeholder
  { name: 'Tactical Board', color: '#2f4f4f', image: 'linear-gradient(to right, #2f4f4f 1px, transparent 1px), linear-gradient(to bottom, #2f4f4f 1px, transparent 1px)' }, // Placeholder
  { name: 'White Kits', color: '#f8fafc', image: 'linear-gradient(135deg, #ffffff, #e2e8f0)' }, // Placeholder
  { name: 'UCL Night', color: '#020024', image: 'linear-gradient(45deg, #000033, #000099)' }, // Placeholder
  { name: 'Hala Madrid', color: '#00529F', image: 'linear-gradient(to right, #00529F, #fff, #00529F)' }, // Placeholder
];

export function BackgroundSettingsModal({
  onClose,
  bgOption, setBgOption,
  bgOpacity, setBgOpacity,
  bgCustomUrl, setBgCustomUrl
}) {
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum size is 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setBgCustomUrl(dataUrl);
      setBgOption('Custom');
      localStorage.setItem('crm_bg_custom', dataUrl);
      localStorage.setItem('crm_bg_option', 'Custom');
    };
    reader.readAsDataURL(file);
  };

  const handleSelectOption = (optName) => {
    setBgOption(optName);
    localStorage.setItem('crm_bg_option', optName);
  };

  const handleOpacityChange = (e) => {
    const val = parseFloat(e.target.value);
    setBgOpacity(val);
    localStorage.setItem('crm_bg_opacity', val);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999
    }} onClick={onClose}>
      <div style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 16,
        width: 480, maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #1f2937',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#0f172a'
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f8fafc' }}>Chat Background</h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: 24, cursor: 'pointer', lineHeight: 1
          }}>&times;</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#cbd5e1', marginBottom: 12 }}>Background Pattern Opacity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input 
                type="range" min="0.05" max="0.45" step="0.01" 
                value={bgOpacity} onChange={handleOpacityChange}
                style={{ flex: 1, accentColor: '#7c3aed' }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8', width: 40, textAlign: 'right' }}>
                {Math.round(bgOpacity * 100)}%
              </span>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 500, color: '#cbd5e1', marginBottom: 12 }}>Select Background</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
            <div 
              onClick={() => fileInputRef.current?.click()}
              style={{
                height: 140, borderRadius: 12, border: '2px dashed #334155',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#94a3b8', transition: 'border-color .2s',
                background: bgOption === 'Custom' && bgCustomUrl ? `url(${bgCustomUrl}) center/cover` : 'transparent',
                borderColor: bgOption === 'Custom' ? '#7c3aed' : '#334155'
              }}
            >
              {!bgCustomUrl || bgOption !== 'Custom' ? (
                <>
                  <span style={{ fontSize: 24, marginBottom: 8 }}>+</span>
                  <span style={{ fontSize: 12, textAlign: 'center', padding: '0 4px' }}>Upload<br/>(Max 5MB)</span>
                </>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 12, fontSize: 12, color: '#fff' }}>Custom</div>
              )}
            </div>
            <input type="file" ref={fileInputRef} accept="image/png, image/jpeg, image/webp" style={{ display: 'none' }} onChange={handleFileUpload} />

            {BACKGROUND_OPTIONS.map((opt) => (
              <div 
                key={opt.name}
                onClick={() => handleSelectOption(opt.name)}
                title={opt.name}
                style={{
                  height: 140, borderRadius: 12, cursor: 'pointer',
                  border: bgOption === opt.name ? '3px solid #7c3aed' : '3px solid transparent',
                  background: opt.image.startsWith('linear-gradient') ? opt.image : (opt.image ? `url(${opt.image}) center/cover` : opt.color),
                  backgroundColor: opt.color,
                  ...(opt.extraStyle || {}),
                  position: 'relative', overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                {bgOption === opt.name && (
                  <div style={{
                    position: 'absolute', bottom: 6, right: 6, 
                    background: '#7c3aed', color: '#fff', 
                    borderRadius: '50%', width: 20, height: 20, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 'bold'
                  }}>✓</div>
                )}
                {opt.name.includes('Real Madrid') && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6, right: 6,
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    borderRadius: 4, padding: '2px 4px',
                    fontSize: 9, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>TODO Asset</div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

export { BACKGROUND_OPTIONS };
