import React, { useState, useRef, useEffect } from 'react';

const TG = {
  blueLight: "#5288c1",
  text: "#f0e6ff",
  textMuted: "#6b4d94"
};

export default function VoiceMessage({ msg, chatId, token }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(msg.media?.document?.attributes?.find(a => a.className === 'DocumentAttributeAudio')?.duration || 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  const fileId = msg.media?.document?.id || '';
  const audioUrl = `/api/telegram/media/audio?chatId=${chatId}&messageId=${msg.id}&fileId=${fileId}&token=${token}`;

  // Ensure only one audio plays at a time
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

  const displayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
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

      {/* Play/Pause Button */}
      <div 
        onClick={togglePlay}
        style={{
          width: 44, height: 44, borderRadius: '50%', background: msg.fromMe ? 'rgba(255,255,255,0.2)' : TG.blueLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
        }}
      >
        {error ? (
          <span style={{ fontSize: 20 }}>⚠️</span>
        ) : isPlaying ? (
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ width: 4, height: 16, background: '#fff', borderRadius: 2 }} />
            <div style={{ width: 4, height: 16, background: '#fff', borderRadius: 2 }} />
          </div>
        ) : (
          <div style={{
            width: 0, height: 0, 
            borderTop: '8px solid transparent', 
            borderBottom: '8px solid transparent', 
            borderLeft: '14px solid #fff',
            marginLeft: 4
          }} />
        )}
      </div>

      {/* Waveform / Progress Bar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div 
          onClick={handleSeek}
          style={{ 
            height: 14, background: 'rgba(255,255,255,0.2)', borderRadius: 7, 
            position: 'relative', cursor: 'pointer', overflow: 'hidden' 
          }}
        >
          <div style={{ 
            position: 'absolute', top: 0, left: 0, bottom: 0, 
            width: `${progress}%`, background: '#fff', borderRadius: 7,
            transition: 'width 0.1s linear'
          }} />
        </div>
        
        {/* Time and Status */}
        <div style={{ fontSize: 11, color: msg.fromMe ? 'rgba(255,255,255,0.8)' : TG.textMuted }}>
          {formatTime(displayTime)}
        </div>
      </div>
    </div>
  );
}
