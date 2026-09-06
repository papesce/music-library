import type { ToastState } from '../../hooks/useToast';

export function Toast({
  message,
  variant,
  toast,
  onDismiss,
}: {
  message?: string;
  variant?: 'error' | 'success';
  toast?: ToastState;
  onDismiss: () => void;
}) {
  const resolved = toast ?? (message ? { message, variant: variant ?? 'error' as const } : null);
  if (!resolved?.message) return null;
  const v = resolved.variant ?? 'error';
  return (
    <div className={`toast toast--${v}`}>
      <span>{resolved.message}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  );
}
