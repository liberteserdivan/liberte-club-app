import { useCallback, useEffect, useState } from 'react';
import { fetchAppState, pickCustomer, pickLoyalty } from '../services/stateService.js';

export function useAppState(session) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!session?.customerId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchAppState();
      setState(data);
    } catch (err) {
      setError(err.message || 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [session?.customerId]);

  useEffect(() => {
    if (!session?.customerId) {
      setState(null);
      return;
    }
    const timer = setTimeout(() => { refresh(); }, 300);
    return () => clearTimeout(timer);
  }, [session?.customerId, refresh]);

  const customer = session?.customerId ? pickCustomer(state || {}, session.customerId) : null;
  const loyalty = session?.customerId ? pickLoyalty(state || {}, session.customerId) : null;

  return { state, setState, customer, loyalty, loading, error, refresh };
}
