import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordIncident, listIncidents, resolveIncident, hasOpenHumanIncident, resetIncidents
} from '../api/_lib/guardian/guardianIncidents.js';

test('Aynı hata tekrarında tek incident güncellenir (spam yok)', () => {
  resetIncidents();
  const first = recordIncident({ level: 'incident', title: 'LP yavaş', affectedArea: 'loyalty', symptoms: ['p95 12000ms'] });
  const second = recordIncident({ level: 'incident', title: 'LP yavaş', affectedArea: 'loyalty', symptoms: ['timeout x6'] });
  assert.equal(first.id, second.id);
  const open = listIncidents({ status: 'open' });
  assert.equal(open.length, 1);
  assert.equal(open[0].occurrences, 2);
  // Yeni belirti birleştirilir
  assert.ok(open[0].symptoms.includes('timeout x6'));
});

test('Critical incident requiresHuman = true olur', () => {
  resetIncidents();
  const inc = recordIncident({ level: 'critical', title: 'DB yok', affectedArea: 'db' });
  assert.equal(inc.requiresHuman, true);
  assert.equal(hasOpenHumanIncident(), true);
});

test('Safe actions listesi incident\u0027a kaydedilir', () => {
  resetIncidents();
  const inc = recordIncident({
    level: 'incident', title: 'QR yavaş', affectedArea: 'qr',
    safeActionsTaken: ['polling_reduced', 'qr_health_check']
  });
  assert.deepEqual(inc.safeActionsTaken, ['polling_reduced', 'qr_health_check']);
});

test('Incident kaydında PII maskelenir (telefon/e-posta sızmaz)', () => {
  resetIncidents();
  const inc = recordIncident({
    level: 'incident',
    title: 'Hata 05551234506 test@example.com',
    affectedArea: 'api',
    symptoms: ['kullanıcı 05551234506 etkilendi']
  });
  assert.doesNotMatch(inc.title, /05551234506/);
  assert.doesNotMatch(inc.title, /test@example\.com/);
  assert.doesNotMatch(JSON.stringify(inc.symptoms), /05551234506/);
});

test('Incident çözülünce resolved olur ve requiresHuman düşer', () => {
  resetIncidents();
  const inc = recordIncident({ level: 'critical', title: 'Login fail', affectedArea: 'login' });
  const resolved = resolveIncident(inc.id);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.requiresHuman, false);
  assert.equal(listIncidents({ status: 'open' }).length, 0);
});
