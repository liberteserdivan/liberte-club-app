// Liberte Guardian — PII maskeleme yardımcıları
// Tek sorumluluk: raporlara/yanıtlara müşteri PII'si veya secret sızmasını önlemek.
// Bölüm 14 kuralları: customerId, telefon, e-posta maskelenir; secret asla yazılmaz.

// Telefon maskele: 05551234506 → 05******06
export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return digits ? '***' : '';
  return `${digits.slice(0, 2)}${'*'.repeat(Math.max(2, digits.length - 4))}${digits.slice(-2)}`;
}

// E-posta maskele: test@example.com → t***@example.com
export function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at <= 0) return value ? '***' : '';
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local[0]}***${domain}`;
}

// customerId maskele: cus_12345689 → cus_12****89, sayısal id → 12****89
export function maskCustomerId(id) {
  const value = String(id ?? '').trim();
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
}

// Serbest metinden olası secret/PII desenlerini temizle (rapor güvenliği)
const SECRET_PATTERNS = [
  /(postgres(?:ql)?:\/\/)[^\s"']+/gi, // DB bağlantı string'leri
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, // JWT
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g, // private key
  /\bre_[A-Za-z0-9_-]{8,}\b/g, // Resend API key (re_...)
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // e-posta
  /\b\d{10,}\b/g // uzun sayı dizileri (telefon vb.)
];

// Metni rapora yazmadan önce güvenli hale getir
export function redactText(text) {
  let out = String(text == null ? '' : text);
  out = out.replace(SECRET_PATTERNS[0], '$1[REDACTED]');
  out = out.replace(SECRET_PATTERNS[1], '[REDACTED_JWT]');
  out = out.replace(SECRET_PATTERNS[2], '[REDACTED_PRIVATE_KEY]');
  out = out.replace(SECRET_PATTERNS[3], '[REDACTED_RESEND_KEY]');
  out = out.replace(SECRET_PATTERNS[4], (m) => maskEmail(m));
  out = out.replace(SECRET_PATTERNS[5], (m) => (m.length >= 10 ? maskPhone(m) : m));
  return out;
}

// Bir nesneyi derinlemesine temizle — string değerler redactText'ten geçer
export function redactObject(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactObject(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      // Hassas anahtar adlarını tamamen gizle
      if (/secret|password|token|apikey|api_key|private|service_account|database_url|resend|vapid/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactObject(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
