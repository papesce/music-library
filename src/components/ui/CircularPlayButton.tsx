type Props = {
  state: 'playing' | 'paused' | 'idle';
  progress?: number; // 0..1
  size?: number; // px, default 30
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function CircularPlayButton({
  state,
  progress = 0,
  size = 30,
  onClick,
  title,
  ariaLabel,
  disabled,
  className,
}: Props) {
  const pct = Math.max(0, Math.min(1, progress ?? 0));
  const r = 13;
  const c = 2 * Math.PI * r;
  const showRing = pct > 0.005 || state === 'playing';
  const offset = showRing ? c * (1 - pct) : c;
  const isPlaying = state === 'playing';

  return (
    <button
      type="button"
      className={`c-play-btn${isPlaying ? ' is-playing' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size } as React.CSSProperties}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
    >
      <svg className="c-play-ring" viewBox="0 0 32 32" aria-hidden="true">
        {/* track */}
        <circle className="c-play-ring-track" cx="16" cy="16" r={r} />
        {/* progress */}
        <circle
          className="c-play-ring-progress"
          cx="16"
          cy="16"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ opacity: showRing ? 1 : 0 }}
        />
      </svg>
      <span className="c-play-icon" aria-hidden="true">
        {isPlaying ? (
          // pause icon - two bars
          <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
            <rect x="2" y="2" width="2.5" height="8" rx="0.7" />
            <rect x="7.5" y="2" width="2.5" height="8" rx="0.7" />
          </svg>
        ) : (
          // play triangle
          <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
            <path d="M3 2.2a1 1 0 0 1 1.5-.87l6 3.9a1 1 0 0 1 0 1.74l-6 3.9A1 1 0 0 1 3 10V2.2z" />
          </svg>
        )}
      </span>
    </button>
  );
}
