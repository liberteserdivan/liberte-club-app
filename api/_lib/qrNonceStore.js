import { isProductionRuntime } from './schemaReady.js';

// QR token tek kullanımlık nonce deposu — replay (tekrar oynatma) saldırısını engeller.
// Aynı (nonce, action) ikilisi ikinci kez gelirse işlem reddedilir. QR token ömrü
// 90 saniye olduğundan, süresi dolan token zaten doğrulamada elenir; bu tablo da
// 90 saniyelik pencere içinde tekrarı yakalar.

// Nonce tablosunu hazırla — production'da bootstrap SQL ile gelir
async function ensureQrNonceTable(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS qr_used_tokens (
    nonce text NOT NULL,
    action text NOT NULL,
    customer_id bigint,
    used_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nonce, action)
  )`;
}

// Nonce'u tek kullanımlık olarak işaretle.
// Dönüş: { firstUse: true }  → ilk kullanım, işleme devam edilebilir
//        { firstUse: false } → daha önce kullanılmış (replay), 409 dönülmeli
export async function claimQrNonce(sql, { nonce, action, customerId = null }) {
  if (!sql) return { firstUse: true };
  // Nonce yoksa (eski token formatı) replay koruması uygulanamaz; izin ver
  if (!nonce) return { firstUse: true };

  await ensureQrNonceTable(sql);

  // INSERT ... ON CONFLICT DO NOTHING: ilk kullanımda satır döner, tekrarda boş döner
  const rows = await sql`
    INSERT INTO qr_used_tokens (nonce, action, customer_id)
    VALUES (${nonce}, ${action}, ${customerId})
    ON CONFLICT (nonce, action) DO NOTHING
    RETURNING nonce
  `;

  return { firstUse: rows.length > 0 };
}

// Eski nonce kayıtlarını temizle — tablo şişmesin (token ömrü 90sn, 10 dk fazlasıyla yeterli)
export async function pruneExpiredQrNonces(sql) {
  if (!sql) return 0;
  const rows = await sql`
    DELETE FROM qr_used_tokens
    WHERE used_at < now() - interval '10 minutes'
    RETURNING nonce
  `;
  return rows.length;
}
