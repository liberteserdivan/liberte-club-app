import { useEffect, useState } from 'react';
import { apiJson } from '../lib/api.js';

export default function HomePage({ auth, onLogout, onLoyalty }) {
  const [loyalty, setLoyalty] = useState(auth?.loyalty || null);
  const name = auth?.customer?.name || 'Üye';
  const lp = loyalty?.lpBalance ?? 0;
  const level = loyalty?.level || 'Bronze';

  // LP'yi sunucudan tazele
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiJson('/api/n-auth?action=me');
      if (cancelled || !ok || !data?.ok) return;
      setLoyalty(data.loyalty || null);
      if (typeof onLoyalty === 'function') onLoyalty(data.loyalty || null);
    })();
    return () => { cancelled = true; };
  }, [onLoyalty]);

  return (
    <section className="fade-in">
      <h1 className="brand">Liberte</h1>
      <p className="sub">Merhaba, {name}</p>
      <div className="panel" style={{ marginTop: '1rem' }}>
        <p className="sub" style={{ margin: 0 }}>Liberte Puan</p>
        <p className="stat">{lp} LP</p>
        <p className="sub">Seviye: {level}</p>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onLogout}>
          Çıkış
        </button>
      </div>
    </section>
  );
}
