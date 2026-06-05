import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import { buildCustomerRecord, createSession } from '../lib/auth.js';
import { loadAppState, saveAppState } from '../lib/appState.js';
import { isValidPinFormat, normalizePin, saveCustomerPin } from '../lib/pinAuth.js';

function validEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

function loyaltyTemplate(id) {
  return {
    customerId: id,
    totalStamps: 0,
    categoryStamps: { coffee: 0, dessert: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, burger: 0 },
    availableRewards: 0,
    usedRewards: 0,
    lifetimeStamps: 0,
    level: 'Bronze'
  };
}

// Kayıt — telefon + kişisel PIN ile hesap oluştur
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const phone = cleanPhone(body.phone);
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const pin = normalizePin(body.pin);
    const pinConfirm = normalizePin(body.pinConfirm);
    const birthDate = String(body.birthDate || '');
    const referralCode = String(body.referralCode || '').trim().toUpperCase();
    const deviceId = String(body.deviceId || '').trim();

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
    if (phone.length < 10 || !validEmail(email)) {
      return res.status(400).json({ error: 'Telefon ve geçerli e-posta zorunlu' });
    }
    if (name.split(' ').filter(Boolean).length < 2) {
      return res.status(400).json({ error: 'İsim soyisim zorunlu' });
    }
    if (!isValidPinFormat(pin)) {
      return res.status(400).json({ error: 'PIN 4 veya 6 haneli olmalı.' });
    }
    if (pin !== pinConfirm) {
      return res.status(400).json({ error: 'PIN tekrarı eşleşmiyor.' });
    }

    const remote = await loadAppState();
    const state = remote.data || { customers: [], loyalty: {}, history: [] };

    const duplicatePhone = (state.customers || []).some((c) => cleanPhone(c.phone) === phone);
    const duplicateEmail = (state.customers || []).some(
      (c) => String(c.email || '').toLowerCase() === email
    );
    if (duplicatePhone || duplicateEmail) {
      return res.status(409).json({ error: 'Bu telefon veya e-posta zaten kayıtlı' });
    }

    const customer = buildCustomerRecord({
      phone,
      email,
      name,
      birthDate,
      referralCode,
      isAdmin: false
    });

    state.customers = [...(state.customers || []), customer];
    state.loyalty = { ...(state.loyalty || {}), [customer.id]: loyaltyTemplate(customer.id) };
    state.history = [
      {
        id: Date.now(),
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        type: 'register',
        count: 0,
        source: 'Uygulama kayıt',
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(state.history || [])
    ];

    await saveAppState(state);

    const sql = neon(process.env.DATABASE_URL);
    await saveCustomerPin(sql, phone, customer.id, pin);

    const session = await createSession(res, {
      customerId: customer.id,
      role: 'user',
      deviceId
    });

    return res.status(200).json({
      ok: true,
      customerId: customer.id,
      role: session.role,
      isAdmin: false,
      adminVerified: false,
      sessionToken: session.token
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Kayıt tamamlanamadı' });
  }
}
