import { useState, useCallback } from 'react';

export type ToastVariant = 'error' | 'success';
export type ToastState = { message: string; variant: ToastVariant } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const setError = useCallback((msg: string) => {
    if (!msg) { setToast(null); return; }
    setToast({ message: msg, variant: 'error' });
  }, []);
  const setSuccess = useCallback((msg: string) => {
    if (!msg) { setToast(null); return; }
    setToast({ message: msg, variant: 'success' });
  }, []);
  const showError = useCallback((e: unknown) => {
    setToast({ message: e instanceof Error ? e.message : String(e), variant: 'error' });
  }, []);
  // backwards compat: error is current message (for callers that read `error`)
  const error = toast?.message ?? '';
  const variant = toast?.variant ?? 'error';
  return { toast, error, variant, message: error, setError, setSuccess, setToast, dismiss, showError };
}
