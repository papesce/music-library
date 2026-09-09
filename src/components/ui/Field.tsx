import type { HTMLAttributes } from 'react';

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  /** compact = split editor (7px/8px), default = track edit dialog (9px/12px) */
  size?: 'default' | 'compact';
};

export function Field({ label, value, onChange, placeholder, inputMode, size = 'default' }: FieldProps) {
  const isUnknown = value.trim().toLowerCase() === 'unknown';
  const compact = size === 'compact';

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      {label}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => {
          if (isUnknown) {
            const t = e.target as HTMLInputElement;
            requestAnimationFrame(() => t.select());
          }
        }}
        onMouseUp={e => {
          if (isUnknown) e.preventDefault();
        }}
        onClick={e => {
          if (isUnknown) (e.target as HTMLInputElement).select();
        }}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{
          padding: compact ? '7px 10px' : '9px 12px',
          borderRadius: compact ? 8 : 12,
          border: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.06)',
          color: isUnknown ? 'var(--muted)' : 'var(--text)',
          fontStyle: isUnknown ? 'italic' : 'normal',
          outline: 'none',
          fontSize: compact ? 12 : undefined,
        }}
      />
    </label>
  );
}
