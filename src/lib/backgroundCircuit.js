// Liberte Guardian — arka plan istek devre kesicisi (circuit breaker)
// Tek sorumluluk: art arda başarısız olan arka plan uçlarını (realtime/push/session)
// kısa süre devre dışı bırakıp retry storm / istek selini engellemek.
//
// Önemli: Bu kesici YALNIZCA arka plan isteklerini engeller. Kullanıcının manuel
// login submit'i ya da elle "tekrar dene" aksiyonu kesiciyi sıfırlar; asla bloklanmaz.

const FAILURE_THRESHOLD = 3; // 3 ardışık hata sonrası devre açılır
const OPEN_DURATION_MS = 60_000; // açık devre 60sn skip eder

// Her uç (key) için bağımsız durum tutulur
const circuits = new Map();

// Bir uç için durum kaydını al/oluştur
function getCircuit(key) {
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = { failures: 0, openUntil: 0 };
    circuits.set(key, circuit);
  }
  return circuit;
}

// Şu an bu uç için arka plan isteği yapılabilir mi? (açıksa false)
export function canAttempt(key) {
  const circuit = getCircuit(key);
  if (circuit.openUntil && Date.now() < circuit.openUntil) return false;
  // Açık süre dolduysa yarı-açık duruma geç (tek deneme izni)
  if (circuit.openUntil && Date.now() >= circuit.openUntil) {
    circuit.openUntil = 0;
  }
  return true;
}

// Başarılı istek — sayaç sıfırlanır
export function recordSuccess(key) {
  const circuit = getCircuit(key);
  circuit.failures = 0;
  circuit.openUntil = 0;
}

// Başarısız istek — eşiğe ulaşınca devre 60sn açılır
export function recordFailure(key) {
  const circuit = getCircuit(key);
  circuit.failures += 1;
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.openUntil = Date.now() + OPEN_DURATION_MS;
  }
  return circuit.openUntil > 0;
}

// Kullanıcı manuel aksiyonunda (login/elle yenile) ilgili devreyi sıfırla
export function resetCircuit(key) {
  if (key == null) {
    circuits.clear();
    return;
  }
  circuits.delete(key);
}

// Test/teşhis — devre durumunu oku
export function getCircuitState(key) {
  const circuit = getCircuit(key);
  return {
    failures: circuit.failures,
    open: Boolean(circuit.openUntil && Date.now() < circuit.openUntil),
    openUntil: circuit.openUntil
  };
}
