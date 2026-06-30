import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from '../api/_lib/guardian/guardianConstants.js';
import { attachAutoReportToIncident, shouldAutoAlertForIncident } from '../api/_lib/guardian/guardianAutoReport.js';
import { recordIncident, resetIncidents } from '../api/_lib/guardian/guardianIncidents.js';
import { resetAlerts } from '../api/_lib/guardian/guardianAlerts.js';
import { resetSafeMode } from '../api/_lib/guardian/guardianSafeMode.js';
import { resetMetrics } from '../api/_lib/guardian/guardianMetrics.js';

test('Incident kaydinda otomatik Cursor raporu olusur', () => {
  resetIncidents();
  resetSafeMode();
  resetMetrics();

  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'DB latency yuksek',
    affectedArea: 'db',
    symptoms: ['p95 4200ms'],
    relatedFiles: ['api/_lib/sql.js']
  });

  assert.equal(inc.autoReport?.ready, true);
  assert.match(inc.autoReport.cursorFixPromptMd, /Liberte Cursor Fix Prompt/);
  assert.match(inc.autoReport.incidentReportMd, /Liberte Incident Report/);
  assert.doesNotMatch(inc.autoReport.cursorFixPromptMd, /postgres:\/\/|re_[A-Za-z0-9]+/i);
});

test('Ayni occurrences icin rapor yeniden uretilmez (dedup)', () => {
  resetIncidents();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'Login yavas',
    affectedArea: 'login'
  });
  const firstAt = inc.autoReport.generatedAt;

  attachAutoReportToIncident(inc);
  assert.equal(inc.autoReport.generatedAt, firstAt);
});

test('Occurrences artinca otomatik rapor tazelenir', () => {
  resetIncidents();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'LP yavas',
    affectedArea: 'loyalty'
  });
  const firstAt = inc.autoReport.generatedAt;

  recordIncident({
    level: STATUS.INCIDENT,
    title: 'LP yavas',
    affectedArea: 'loyalty',
    symptoms: ['timeout x2']
  });

  assert.ok(Date.parse(inc.autoReport.generatedAt) >= Date.parse(firstAt));
  assert.equal(inc.occurrences, 2);
});

test('shouldAutoAlertForIncident — incident/critical her zaman alert', () => {
  assert.equal(shouldAutoAlertForIncident({ id: 'x', level: STATUS.INCIDENT }), true);
  assert.equal(shouldAutoAlertForIncident({ id: 'x', level: STATUS.CRITICAL }), true);
  assert.equal(shouldAutoAlertForIncident({ id: 'x', level: STATUS.DEGRADED, occurrences: 1 }), false);
  assert.equal(shouldAutoAlertForIncident({ id: 'x', level: STATUS.DEGRADED, occurrences: 3 }), true);
});

test('Alert metni otomatik rapor hazir bilgisini icerir', async () => {
  resetIncidents();
  resetAlerts();

  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'QR yavas',
    affectedArea: 'qr'
  });

  const { formatAlertText } = await import('../api/_lib/guardian/guardianAlerts.js');
  const text = formatAlertText(inc);
  assert.match(text, /otomatik/i);
  assert.match(text, /CURSOR_FIX_PROMPT/);
});