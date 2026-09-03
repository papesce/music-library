import { useState, useCallback } from 'react';

export function useToast() {
  const [error, setError] = useState('');
  const dismiss = useCallback(() => setError(''), []);
  const showError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);
  return { error, setError, dismiss, showError };
}
