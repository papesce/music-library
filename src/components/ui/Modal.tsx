import type { ReactNode } from 'react';

export function Modal({
  children,
  onClose,
  width = 'min(480px, calc(100% - 32px))',
  zIndex = 71,
}: {
  children: ReactNode;
  onClose: () => void;
  width?: string;
  zIndex?: number;
}) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} style={{ zIndex: zIndex - 1 }} />
      <div className="glass modal" style={{ zIndex, width }}>
        {children}
      </div>
    </>
  );
}
