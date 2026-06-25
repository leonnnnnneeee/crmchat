import React, { useState, useRef, useEffect, useMemo } from 'react';

const TG = {
  blueLight: "#5288c1",
  text: "#f0e6ff",
  textMuted: "rgba(255,255,255,0.6)",
  activeWave: "#fff",
  inactiveWave: "rgba(255,255,255,0.3)"
};

export default function VoiceMessage({ msg, chatId, token }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(msg.media?.document?.attributes?.find(a => a.className === 'DocumentAttributeAudio')?.duration || 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  // Transcription state
  const cacheKey = `transcript_${msg.id}`;
  const [transcript, setTranscript] = useState(localStorage.getItem(cacheKey) || null);
  const [transcribing, setTranscribing] = useState(false);

  const fileId = msg.media?.document?.id || '';
  const audioUrl = `/api/telegram/media/audio?chatId=${chatId}&messageId=${msg.id}&fileId=${fileId}&token=${token}`;

  // Deterministic fake waveform based on msg.id (30 bars)
  const waveform = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      // Create a pseudo-random height between 20% and 100%
      const seed = (msg.id + i) * 1.37;
      const height = Math.abs(Math.sin(seed)) * 0.8 + 0.2;
      return height;
    });
  }, [msg.id]);

  useEffect(() => {
    const handlePlay = (e) => {
      if (audioRef.current && e.target !== audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    document.addEventListener('play', handlePlay, true);
    return () => document.removeEventListener('play', handlePlay, true);
  }, []);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => setError(true));
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    if (audioRef.current.duration) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && audioRef.current.duration !== Infinity) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = percentage * duration;
    setProgress(percentage * 100);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const transcribeVoice = async (e) => {
    e.stopPropagation();
    if (transcribing || transcript) return;
    setTranscribing(true);
    try {
      const res = await fetch('/api/ai/transcribe-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ chatId, messageId: msg.id, fileId })
      });
      const data = await res.json();
      if (data.ok && data.text) {
        setTranscript(data.text);
        localStorage.setItem(cacheKey, data.text);
      } else {
        alert('Transcription failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Transcription request failed: ' + e.message);
    } finally {
      setTranscribing(false);
    }
  };

  const displayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 240 }}>
      {/* Main Audio Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        
        {/* Hidden Audio Element */}
        <audio 
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setProgress(0); setCurrentTime(0); }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => setError(true)}
          preload="metadata"
        />

        {/* Circular Play/Pause Button */}
        <div 
          onClick={togglePlay}
          style={{
            width: 44, height: 44, borderRadius: '50%', 
            background: msg.fromMe ? '#fff' : TG.blueLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            cursor: 'pointer', flexShrink: 0
          }}
        >
          {error ? (
            <span style={{ fontSize: 20 }}>⚠️</span>
          ) : isPlaying ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 4, height: 16, background: msg.fromMe ? '#7c3aed' : '#fff', borderRadius: 2 }} />
              <div style={{ width: 4, height: 16, background: msg.fromMe ? '#7c3aed' : '#fff', borderRadius: 2 }} />
            </div>
          ) : (
            <div style={{
              width: 0, height: 0, 
              borderTop: '8px solid transparent', 
              borderBottom: '8px solid transparent', 
              borderLeft: `14px solid ${msg.fromMe ? '#7c3aed' : '#fff'}`,
              marginLeft: 4
            }} />
          )}
        </div>

        {/* Waveform and Info Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          
          {/* Waveform Bars */}
          <div 
            onClick={handleSeek}
            style={{ 
              display: 'flex', alignItems: 'flex-end', gap: 2, height: 24, 
              cursor: 'pointer', width: '100%' 
            }}
          >
            {waveform.map((h, i) => {
              const barPercent = (i / waveform.length) * 100;
              const isActive = barPercent <= progress;
              return (
                <div 
                  key={i} 
                  style={{
                    flex: 1,
                    height: `${h * 100}%`,
                    background: isActive ? TG.activeWave : TG.inactiveWave,
                    borderRadius: 2,
                    transition: 'background 0.1s'
                  }} 
                />
              )
            })}
          </div>
          
          {/* Bottom Row: Duration & Transcribe Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: msg.fromMe ? 'rgba(255,255,255,0.8)' : TG.textMuted }}>
              {formatTime(displayTime)}
            </div>
            
            {/* Transcribe Button */}
            {!transcript && (
              <div 
                onClick={transcribeVoice}
                style={{
                  fontSize: 14, fontWeight: 'bold', color: msg.fromMe ? '#fff' : TG.blueLight,
                  cursor: transcribing ? 'default' : 'pointer',
                  opacity: transcribing ? 0.5 : 1,
                  padding: '0 4px'
                }}
                title="Transcribe Voice Message"
              >
                {transcribing ? '...' : 'A'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Text */}
      {transcript && (
        <div style={{ 
          marginTop: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.15)', 
          borderRadius: 8, fontSize: 13, color: '#fff', borderLeft: `2px solid ${msg.fromMe ? '#fff' : TG.blueLight}`
        }}>
          {transcript}
        </div>
      )}
    </div>
  );
}
