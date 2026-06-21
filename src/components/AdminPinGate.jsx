import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { patchMemorySession, markAdminPinVerifiedLocally } from '../lib/session.js';
import { refreshRealtimeAuth } from '../lib/supabaseClient.js';
import { apiJson, AUTH_REQUEST_OPTIONS } from '../lib/apiClient.js';
import { formatClientApiError } from '../lib/apiErrors.js';
import { useLocalAuth, verifyDevAdminPin } from '../lib/devAuth.js';

// Yönetici PIN doğrulama ekranı
export default function AdminPinGate({ onVerified, onSkip, fullscreen = false }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!pin.trim()) {
      setError('Yönetici PIN gir.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (useLocalAuth()) {
        verifyDevAdminPin(pin.trim());
        onVerified?.();
        return;
      }

      const { response, data } = await apiJson('/api/auth/admin-pin', {
        method: 'POST',
        body: JSON.stringify({ pin: pin.trim() }),
        ...AUTH_REQUEST_OPTIONS
      });

      if (!response.ok) {
        const formatted = formatClientApiError({ response, data, fallback: 'PIN doğrulanamadı' });
        throw new Error(formatted.message || 'PIN doğrulanamadı');
      }

      patchMemorySession({
        adminVerified: Boolean(data.adminVerified),
        realtimeToken: data.realtimeToken || null
      });
      markAdminPinVerifiedLocally();
      await refreshRealtimeAuth();
      onVerified?.();
    } catch (e) {
      const formatted = formatClientApiError({ error: e, fallback: 'PIN doğrulanamadı' });
      setError(formatted.message || e.message || 'PIN doğrulanamadı');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`adminPinGate${fullscreen ? ' adminPinGate--fullscreen' : ''}`}>
      <div className="adminPinCard">
        <ShieldCheck size={28} aria-hidden="true" />
        <h3>Yönetici Doğrulama</h3>
        <p>QR tarama ve yönetim işlemleri için yönetici PIN gir.</p>
        <form onSubmit={submit}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Yönetici PIN"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Kontrol ediliyor...' : 'Doğrula'}
          </button>
        </form>
        {error && <p className="adminPinError">{error}</p>}
        {onSkip && (
          <button type="button" className="ghost adminPinSkip" onClick={onSkip}>
            Müşteri modunda devam et
          </button>
        )}
      </div>
    </div>
  );
}
