import { useCallback, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, show };
}
