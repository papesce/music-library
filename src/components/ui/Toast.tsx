export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="toast">
      <span>{message}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  );
}
