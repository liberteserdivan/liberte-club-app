// Liberte Puan sabitleri — sunucu
export const LP_GAIN = {
  coffee: 1,
  dessert: 2,
  sandwich: 2,
  burger: 3
};

export const LP_COSTS = {
  coffee: 7,
  dessert: 15,
  sandwich: 18,
  burger: 25
};

export const LP_CATEGORIES = ['coffee', 'dessert', 'sandwich', 'burger'];

// Lifetime LP → seviye
export function levelByLp(total) {
  const n = Number(total || 0);
  if (n >= 300) return 'Black';
  if (n >= 150) return 'Gold';
  if (n >= 50) return 'Silver';
  return 'Bronze';
}

function readNullableInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseLegacyJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// customer_loyalty satırından kart — event tarama yok
export function readLoyaltyCard(row, customerId) {
  const id = Number(customerId);
  if (!row) {
    return {
      customerId: id,
      lpBalance: 0,
      lpLifetime: 0,
      level: 'Bronze',
      schemaVersion: 2
    };
  }

  const colBalance = readNullableInt(row.lp_balance) ?? 0;
  const colLifetime = readNullableInt(row.lp_lifetime) ?? 0;
  const legacy = parseLegacyJson(row.legacy_json);
  const legacyBalance = readNullableInt(legacy?.lpBalance) ?? 0;
  const legacyLifetime = readNullableInt(legacy?.lpLifetime) ?? 0;

  const lpBalance = Math.max(colBalance, legacyBalance);
  const lpLifetime = Math.max(colLifetime, legacyLifetime, lpBalance);
  const level = row.level || legacy?.level || levelByLp(lpLifetime);

  return {
    customerId: id,
    lpBalance,
    lpLifetime,
    level,
    schemaVersion: 2
  };
}

// LP kazan
export function applyLpEarn(card, category, count = 1) {
  const gain = (LP_GAIN[category] || 0) * Math.max(1, Math.trunc(count));
  if (!gain) return { ok: false, error: 'Geçersiz kategori' };
  const lpBalance = (card.lpBalance || 0) + gain;
  const lpLifetime = (card.lpLifetime || 0) + gain;
  return {
    ok: true,
    delta: gain,
    card: {
      ...card,
      lpBalance,
      lpLifetime,
      level: levelByLp(lpLifetime)
    }
  };
}

// LP harca
export function applyLpRedeem(card, category, count = 1) {
  const cost = (LP_COSTS[category] || 0) * Math.max(1, Math.trunc(count));
  if (!cost) return { ok: false, error: 'Geçersiz kategori' };
  if ((card.lpBalance || 0) < cost) {
    return { ok: false, error: 'Yetersiz LP' };
  }
  const lpBalance = (card.lpBalance || 0) - cost;
  const lpLifetime = card.lpLifetime || 0;
  return {
    ok: true,
    delta: -cost,
    card: {
      ...card,
      lpBalance,
      lpLifetime,
      level: levelByLp(lpLifetime)
    }
  };
}

// Sadakat olayı yaz
export async function insertLoyaltyEvent(sql, {
  customerId,
  eventType,
  category,
  delta,
  note = null
}) {
  await sql`
    INSERT INTO loyalty_events (customer_id, event_type, category, delta, note, created_at)
    VALUES (
      ${Number(customerId)},
      ${eventType},
      ${category || null},
      ${delta},
      ${note},
      now()
    )
  `;
}

// Kartı DB'ye yaz
export async function writeLoyaltyCard(sql, customerId, card) {
  const id = Number(customerId);
  const level = card.level || levelByLp(card.lpLifetime);
  await sql`
    INSERT INTO customer_loyalty (
      customer_id, lp_balance, lp_lifetime, lp_schema_version, level,
      total_stamps, lifetime_stamps, available_rewards, used_rewards,
      category_stamps, category_rewards, legacy_json
    )
    VALUES (
      ${id},
      ${card.lpBalance || 0},
      ${card.lpLifetime || 0},
      2,
      ${level},
      0,
      ${card.lpLifetime || 0},
      0,
      0,
      ${JSON.stringify({})},
      ${JSON.stringify({})},
      ${JSON.stringify({
        customerId: id,
        lpBalance: card.lpBalance || 0,
        lpLifetime: card.lpLifetime || 0,
        level,
        schemaVersion: 2
      })}
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      lp_balance = EXCLUDED.lp_balance,
      lp_lifetime = EXCLUDED.lp_lifetime,
      lp_schema_version = 2,
      level = EXCLUDED.level,
      lifetime_stamps = EXCLUDED.lifetime_stamps,
      legacy_json = EXCLUDED.legacy_json,
      revision = customer_loyalty.revision + 1,
      updated_at = now()
  `;
}

// QR nonce tek kullanımlık. Tablo yoksa fail-closed (replay korumasız yazıma izin yok).
export async function claimQrNonce(sql, { nonce, action, customerId = null }) {
  if (!sql || !nonce) return { firstUse: true, skipped: !nonce };
  try {
    const rows = await sql`
      INSERT INTO qr_used_tokens (nonce, action, customer_id)
      VALUES (${nonce}, ${action}, ${customerId})
      ON CONFLICT (nonce, action) DO NOTHING
      RETURNING nonce
    `;
    return { firstUse: rows.length > 0 };
  } catch (error) {
    const msg = String(error?.message || error || '');
    if (/relation .*qr_used_tokens.* does not exist/i.test(msg) || error?.code === '42P01') {
      throw Object.assign(new Error('QR nonce tablosu yok'), {
        code: 'QR_NONCE_TABLE_MISSING'
      });
    }
    throw error;
  }
}

// İş kuralı reddi — postgres.js begin içinde throw → rollback (nonce yanmaz)
function rejectLpMutation(status, error, extra = {}) {
  return Object.assign(new Error(error), {
    code: 'LP_MUTATION_REJECTED',
    status,
    ...extra
  });
}

// Kasiyer LP: nonce + okuma + yazma tek transaction (FOR UPDATE serileştirir)
export async function applyCashierLpMutation(sql, {
  customerId,
  action,
  category,
  count,
  nonce
}) {
  const id = Number(customerId);
  const nonceAction = `${action}:${category}:${count}`;

  return sql.begin(async (tx) => {
    await tx`SET LOCAL statement_timeout = '8000ms'`;

    const locked = await tx`
      SELECT id FROM customers WHERE id = ${id} FOR UPDATE
    `;
    if (!locked[0]) {
      throw rejectLpMutation(404, 'Müşteri bulunamadı');
    }

    // Nonce claim TX içinde: mutasyon hata/rollback olursa nonce da geri alınır
    const claim = await claimQrNonce(tx, {
      nonce,
      action: nonceAction,
      customerId: id
    });
    if (!claim.firstUse) {
      throw rejectLpMutation(409, 'Bu QR zaten kullanıldı', { replay: true });
    }

    const current = await loadLoyaltyForCustomer(tx, id);
    const result = action === 'earn'
      ? applyLpEarn(current, category, count)
      : applyLpRedeem(current, category, count);

    if (!result.ok) {
      throw rejectLpMutation(400, result.error || 'LP işlemi reddedildi');
    }

    await writeLoyaltyCard(tx, id, result.card);
    await insertLoyaltyEvent(tx, {
      customerId: id,
      eventType: action === 'earn' ? `earn_${category}` : `redeem_${category}`,
      category,
      delta: result.delta,
      note: 'kasiyer-next'
    });

    return {
      ok: true,
      delta: result.delta,
      card: result.card
    };
  });
}

// LP mutasyon reddini HTTP yanıta çevir
export function isLpMutationRejected(error) {
  return error?.code === 'LP_MUTATION_REJECTED';
}

// Müşteri sadakat satırını oku
export async function loadLoyaltyForCustomer(sql, customerId) {
  const rows = await sql`
    SELECT customer_id, lp_balance, lp_lifetime, lp_schema_version, level, legacy_json
    FROM customer_loyalty
    WHERE customer_id = ${Number(customerId)}
    LIMIT 1
  `;
  return readLoyaltyCard(rows[0], customerId);
}
