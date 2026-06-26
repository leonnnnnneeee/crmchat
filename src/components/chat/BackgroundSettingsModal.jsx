import React, { useRef } from 'react';

const BACKGROUND_OPTIONS = [
  { name: 'Default dark doodle', color: '#0e1621', image: 'url("https://web.telegram.org/a/chat-bg-pattern-dark.png") center/512px' },
  { name: 'Dark minimal', color: '#0f172a', image: 'none' },
  { name: 'Deep Space', color: '#000000', image: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  { name: 'Aurora', color: '#0B1D3A', image: 'linear-gradient(45deg, #00416A, #E4E5E6)' },
  { name: 'Night Mountains', color: '#1a2a6c', image: 'linear-gradient(to right, #1a2a6c, #b21f1f, #fdbb2d)' },
  { name: 'Cyber Grid', color: '#000000', image: 'linear-gradient(transparent 95%, #32CD32 100%), linear-gradient(90deg, transparent 95%, #32CD32 100%)', extraStyle: { backgroundSize: '40px 40px' } },
  { name: 'Ocean', color: '#020024', image: 'linear-gradient(180deg, rgba(2,0,36,1) 0%, rgba(9,9,121,1) 35%, rgba(0,212,255,1) 100%)' },
  { name: 'Coffee', color: '#3c2b21', image: 'linear-gradient(135deg, #3c2b21, #1a0f0a)' },
  { name: 'Real Madrid Classic', color: '#090e17', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_CF.svg?width=800") center/40% no-repeat, linear-gradient(135deg, #0f172a, #000)' },
  { name: 'Bernabéu Night', color: '#090e17', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Santiago_Bernabeu_Stadium_-_Madrid.jpg?width=1200") center/cover' },
  { name: 'Starting XI', color: '#111827', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_CF.svg?width=400") center/15% no-repeat, url("https://commons.wikimedia.org/wiki/Special:FilePath/Estadio_Santiago_Bernab%C3%A9u_-_panoramic_view.jpg?width=1200") center/cover', extraStyle: { backgroundBlendMode: 'overlay' } },
  { name: 'Squad Lineup', color: '#111827', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_C.F._vs_FC_Shakhtar_Donetsk_-_15_September_2015_(1).jpg?width=1200") center/cover' },
  { name: 'Matchday', color: '#000', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_vs_M%C3%A1laga_CF_(1).jpg?width=1200") center/cover' },
  { name: 'Champions Celebration', color: '#111827', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Madrid_2018_Liga_de_Campeones_06.jpg?width=1200") center/cover' },
  { name: 'Tactical Board', color: '#2f4f4f', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Football_pitch_tactics.svg?width=1200") center/cover' },
  { name: 'White Kits', color: '#f8fafc', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_CF.svg?width=400") center/20% no-repeat, url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_C.F._vs_FC_Shakhtar_Donetsk_-_15_September_2015_(1).jpg?width=1200") center/cover', extraStyle: { backgroundBlendMode: 'overlay' } },
  { name: 'UCL Night', color: '#020024', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Estadio_Santiago_Bernab%C3%A9u_-_panoramic_view.jpg?width=1200") center/cover', extraStyle: { backgroundBlendMode: 'hard-light' } },
  { name: 'Hala Madrid', color: '#00529F', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Real_Madrid_vs_M%C3%A1laga_CF_(1).jpg?width=1200") center/cover' },
  { name: 'Santiago Bernabéu', color: '#090e17', image: 'url("https://commons.wikimedia.org/wiki/Special:FilePath/Santiago_Bernabeu_Stadium_-_Madrid.jpg?width=1200") center/cover' },
];

export function BackgroundSettingsModal({
  onClose,
  bgOption, setBgOption,
  bgOpacity, setBgOpacity,
  bgCustomUrl, setBgCustomUrl
}) {
  const fileInputRef = useRef(null);
  const [errorMsg, setErrorMsg] = React.useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File too large. Maximum size is 5MB.');
      setTimeout(() => setErrorMsg(''), 3000);
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
    <>
      <div 
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 999
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1000,
        width: 380, minWidth: 380,
        background: '#090e17', borderLeft: '1px solid #1f2937',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          padding: '0 16px', height: 60, minHeight: 60, borderBottom: '1px solid #1f2937',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#111827', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: '#94a3b8',
              fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center'
            }}>←</button>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>Background</h3>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', lineHeight: 1
          }}>✕</button>
        </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        {['Presets', 'Gallery', 'Upload'].map(tab => (
          <div key={tab} style={{
            flex: 1, textAlign: 'center', padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: tab === 'Presets' ? '#7c3aed' : '#94a3b8',
            borderBottom: tab === 'Presets' ? '2px solid #7c3aed' : '2px solid transparent'
          }}>
            {tab}
          </div>
        ))}
      </div>

      {errorMsg && (
        <div style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', fontSize: 13, textAlign: 'center' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {BACKGROUND_OPTIONS.map((opt) => (
            <div 
              key={opt.name}
              onClick={() => handleSelectOption(opt.name)}
              title={opt.name}
              style={{
                height: 100, borderRadius: 8, cursor: 'pointer',
                border: bgOption === opt.name ? '2px solid #7c3aed' : '2px solid transparent',
                background: opt.image !== 'none' ? opt.image : opt.color,
                backgroundColor: opt.color,
                ...(opt.extraStyle || {}),
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                boxSizing: 'border-box'
              }}
            >
              <div style={{
                background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                width: '100%', textAlign: 'center', padding: '24px 6px 6px',
                fontSize: 11, color: '#fff', fontWeight: 500, 
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {opt.name}
              </div>
              {bgOption === opt.name && (
                <div style={{
                  position: 'absolute', top: 6, right: 6, 
                  background: '#7c3aed', color: '#fff', 
                  borderRadius: '50%', width: 18, height: 18, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 'bold'
                }}>✓</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 24px', borderTop: '1px solid #1f2937', background: '#111827', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#f8fafc', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>Background opacity</span>
          <span style={{ color: '#94a3b8' }}>{Math.round(bgOpacity * 100)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input 
            type="range" min="0.05" max="1.0" step="0.01" 
            value={bgOpacity} onChange={handleOpacityChange}
            style={{ width: '100%', accentColor: '#7c3aed', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
    </>
  );
}

export { BACKGROUND_OPTIONS };
