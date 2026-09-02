import type { Track } from '../types/api.d';
export function PlayerDock({ track, audioRef, isPaused, onToggle, onStop }:{
  track: Track | null; audioRef: React.RefObject<HTMLAudioElement>; isPaused:boolean; onToggle:()=>void; onStop:()=>void;
}){
  if(!track) return <audio ref={audioRef} style={{ display:'none' }} />;
  return (
    <div className="glass player-dock">
      <div className="player-art">♪</div>
      <div className="player-info"><b>{track.title}</b><span>{track.artist} · {track.album}</span></div>
      <div className="player-controls">
        <button className="play-btn" onClick={onToggle}>{isPaused?'▶':'⏸'}</button>
        <button className="play-btn ghost" onClick={onStop}>⏹</button>
      </div>
      <audio ref={audioRef} controls onEnded={onStop} />
    </div>
  );
}
