// Liberte Guardian — istemci telemetrisinden gerçeğe uygun sağlık türetimi
// Tek sorumluluk: son client isteklerinden overall severity + servis bazlı
// incident listesi üretmek. Sunucu "Sağlıklı" derken cihazda 65 hata/30 timeout
// varsa panel ASLA yeşil göstermesin diye kullanılır. Yan etkisi yoktur.

// Seviye sıralaması — en kötü durumu seçmek için
const RANK = { healthy: 0, degraded: 1, incident: 2, critical: 3 };

// Yalnızca bu penceredeki istekler incident üretir — eski hatalar paneli sonsuza kadar kırmızı bırakmaz
export const CLIENT_SAMPLE_WINDOW_MS = 5 * 60 * 1000;

// Zaman damgası olmayan örnekler (test) güncel kabul edilir
function filterFreshSamples(samples) {
  const cutoff = Date.now() - CLIENT_SAMPLE_WINDOW_MS;
  return samples.filter((s) => !s.ts || Number(s.ts) >= cutoff);
}

// İki seviyeden kötü olanı döndür
function worse(a, b) {
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a;
}

// Bir örnek belirli endpoint'e ait mi?
function isEndpoint(sample, path) {
  return String(sample.endpoint || '').startsWith(path);
}

// Bir örnek kalıcı sunucu hatası mı? (503/429 geçici — incident sayılmaz)
function isHardServerError(status) {
  const code = Number(status);
  return code >= 500 && code !== 503 && code !== 429;
}

// Bir örnek "kötü" sayılır mı? (4xx/5xx, timeout, network)
function isBadSample(sample) {
  if (sample.timeout || sample.networkError) return true;
  return Number(sample.status) >= 400;
}

// Son N istek üzerinden hata/timeout oranı
function summarize(samples) {
  const total = samples.length;
  const errors = samples.filter(isBadSample).length;
  const timeouts = samples.filter((s) => s.timeout).length;
  return {
    total,
    errors,
    timeouts,
    errorRate: total ? errors / total : 0
  };
}

// Tek tip incident kaydı üret (panelde "client" kaynaklı gösterilir)
function makeIncident(level, title, affectedArea) {
  return { level, title, affectedArea, source: 'client' };
}

// Son istekleri inceleyip overall severity + client incident listesi üret.
// samples: getRecentRequests(20) çıktısı (en yeni önce). Pure fonksiyon.
export function deriveClientHealth(samples = []) {
  const recent = filterFreshSamples(Array.isArray(samples) ? samples.slice(0, 20) : []);
  const incidents = [];
  let severity = 'healthy';

  if (recent.length === 0) {
    return { severity, incidents, summary: summarize(recent) };
  }

  const summary = summarize(recent);

  // 1) Genel hata oranı > %20 → en az degraded
  if (summary.errorRate > 0.2) {
    severity = worse(severity, 'degraded');
  }

  // 2) Herhangi bir timeout varsa → etkilenen alan incident
  if (summary.timeouts > 0) {
    severity = worse(severity, 'incident');
  }

  // 3) auth/session kalıcı 5xx → auth incident (503/429 geçici — sayılmaz)
  const sessionBad = recent.some(
    (s) => isEndpoint(s, '/api/auth/session') && isHardServerError(s.status)
  );
  if (sessionBad) {
    severity = worse(severity, 'incident');
    incidents.push(makeIncident('incident', 'Oturum doğrulama hata veriyor (auth/session)', 'auth'));
  }

  // 4) realtime 10sn+ yavaşlık, ağ hatası veya kalıcı 5xx → incident (kısa 503 hariç)
  const realtimeBad = recent.some(
    (s) => isEndpoint(s, '/api/realtime')
      && (s.timeout || s.networkError || Number(s.status) === 0
        || isHardServerError(s.status)
        || Number(s.durationMs) >= 10_000)
  );
  if (realtimeBad) {
    severity = worse(severity, 'incident');
    incidents.push(makeIncident('incident', 'Realtime yanıt vermiyor / çok yavaş', 'realtime'));
  }

  // 5) guardian/health 10sn+ veya 504 → guardian/config incident
  const guardianBad = recent.some(
    (s) => isEndpoint(s, '/api/guardian/health')
      && (Number(s.status) === 504 || s.timeout || Number(s.durationMs) >= 10_000)
  );
  if (guardianBad) {
    severity = worse(severity, 'incident');
    incidents.push(makeIncident('incident', 'Guardian sağlık yanıtı yavaş/kritik', 'config'));
  }

  // 7) admin/members 500/timeout/10sn+ → admin (config) incident.
  // Tek bir 500 bile genel hata oranını >%20 yapmasa da incident üretir; böylece
  // Guardian admin/config kartını ve overall durumu yeşil göstermez.
  const adminMembersBad = recent.some(
    (s) => isEndpoint(s, '/api/admin/members')
      && (isHardServerError(s.status) || s.timeout || s.networkError || Number(s.durationMs) >= 15_000)
  );
  if (adminMembersBad) {
    severity = worse(severity, 'incident');
    incidents.push(makeIncident('incident', 'Üye listesi hata veriyor (admin/members 500/yavaş)', 'config'));
  }

  // 6) push/register-device 504 → push degraded (login/ana ekranı BOZMAZ)
  const pushBad = recent.some(
    (s) => isEndpoint(s, '/api/push/register-device')
      && (Number(s.status) === 504 || s.timeout || Number(s.status) >= 500)
  );
  if (pushBad) {
    severity = worse(severity, 'incident');
    incidents.push(makeIncident('incident', 'Bildirim kaydı yanıt vermiyor (push)', 'push'));
  }

  // Çok yüksek hata yoğunluğu → critical
  if (summary.errorRate >= 0.5 && recent.length >= 5) {
    severity = worse(severity, 'critical');
  }

  return { severity, incidents, summary };
}

// Bir servis için client incident var mı? (kart rengini düzeltmek için)
export function clientStatusForService(serviceKey, clientHealth) {
  const inc = (clientHealth?.incidents || []).find((i) => i.affectedArea === serviceKey);
  if (inc) return inc.level;
  return null;
}
