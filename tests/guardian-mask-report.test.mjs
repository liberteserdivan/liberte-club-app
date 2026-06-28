import test from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskEmail, maskCustomerId, redactText, redactObject } from '../api/_lib/guardian/mask.js';
import { buildCursorFixPrompt, buildIncidentReport } from '../api/_lib/guardian/guardianReport.js';

test('maskPhone telefonu maskeler', () => {
  assert.equal(maskPhone('05551234506'), '05*******06');
});

test('maskEmail e-postayı maskeler', () => {
  assert.equal(maskEmail('test@example.com'), 't***@example.com');
});

test('maskCustomerId müşteri kimliğini maskeler', () => {
  assert.equal(maskCustomerId('cus_12345689'), 'cu********89');
});

test('redactText DB URL ve JWT sızıntısını engeller', () => {
  const text = 'bağlantı postgres://user:pass@host:5432/db ve token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghij.klmnopqrst';
  const out = redactText(text);
  assert.doesNotMatch(out, /user:pass@host/);
  assert.doesNotMatch(out, /eyJhbGci/);
});

test('redactText Resend API key (re_...) maskeler', () => {
  const text = 'resend anahtarı re_AbCdEf123456789 ile gönderildi';
  const out = redactText(text);
  assert.doesNotMatch(out, /re_AbCdEf123456789/);
  assert.match(out, /\[REDACTED_RESEND_KEY\]/);
});

test('Cursor prompt / incident report içine Resend key açık yazılmaz', () => {
  const incident = {
    id: 'LBT-INC-20260628-009', level: 'incident', title: 'E-posta hatası re_SECRETKEY123456',
    affectedArea: 'api', requiresHuman: true,
    symptoms: ['alert gönderimi re_SECRETKEY123456 ile başarısız'],
    suspectedRootCauses: [], relatedFiles: [], safeActionsTaken: [],
    startedAt: '2026-06-28T00:00:00.000Z', lastSeenAt: '2026-06-28T00:00:00.000Z'
  };
  const prompt = buildCursorFixPrompt(incident);
  const report = buildIncidentReport(incident, { status: 'incident' });
  assert.doesNotMatch(prompt, /re_SECRETKEY123456/);
  assert.doesNotMatch(report, /re_SECRETKEY123456/);
});

test('redactObject hassas anahtarları gizler', () => {
  const out = redactObject({ database_url: 'postgres://x', token: 'abc', nested: { secret: 'y', ok: 1 } });
  assert.equal(out.database_url, '[REDACTED]');
  assert.equal(out.token, '[REDACTED]');
  assert.equal(out.nested.secret, '[REDACTED]');
  assert.equal(out.nested.ok, 1);
});

test('Cursor fix prompt secret/PII içermez ve kısıtları belirtir', () => {
  const incident = {
    id: 'LBT-INC-20260628-001', level: 'incident', title: 'LP yavaş', affectedArea: 'loyalty',
    requiresHuman: true, symptoms: ['p95 14000ms'], suspectedRootCauses: ['DB lock'],
    relatedFiles: ['api/_lib/loyaltyStore.js'], safeActionsTaken: ['polling_reduced']
  };
  const prompt = buildCursorFixPrompt(incident);
  assert.match(prompt, /DB migration çalıştırma/);
  assert.match(prompt, /Secret\/env değiştirme/);
  assert.doesNotMatch(prompt, /postgres:\/\//);
});

test('Incident raporu severity ve cursor prompt içerir', () => {
  const incident = {
    id: 'LBT-INC-20260628-002', level: 'critical', title: 'DB yok', affectedArea: 'db',
    requiresHuman: true, startedAt: '2026-06-28T00:00:00.000Z', lastSeenAt: '2026-06-28T00:05:00.000Z',
    symptoms: ['timeout'], suspectedRootCauses: ['pooler'], relatedFiles: ['api/_lib/sql.js'], safeActionsTaken: []
  };
  const report = buildIncidentReport(incident, { status: 'critical' });
  assert.match(report, /# Liberte Incident Report/);
  assert.match(report, /Critical/);
  assert.match(report, /Cursor Prompt/);
});
