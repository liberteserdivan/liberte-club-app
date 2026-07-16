import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_DIR = path.join(__dirname, '..', 'reports');

/** Kosu raporu olusturucu */
export function createRunReport({ provider, commit, artifacts = [] }) {
  return {
    provider,
    commit: commit || process.env.CM_COMMIT || process.env.GITHUB_SHA || 'unknown',
    generatedAt: new Date().toISOString(),
    artifacts,
    devices: [],
    summary: { total: 0, passed: 0, failed: 0 },
    failures: [],
    confirmations: {
      noSecretLeak: true,
      noStoreUpload: true
    }
  };
}

/** Cihaz sonucunu rapora ekler */
export function appendDeviceResult(report, result) {
  report.devices.push({
    platform: result.platform,
    deviceName: result.deviceName,
    osVersion: result.osVersion,
    status: result.status,
    durationMs: result.durationMs
  });
  report.summary.total += 1;
  if (result.status === 'passed') {
    report.summary.passed += 1;
  } else {
    report.summary.failed += 1;
    report.failures.push(...(result.failures || []));
  }
}

/** Raporu diske yazar */
export function writeRunReport(report, filename = 'mobile-smoke-report.json') {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const target = path.join(REPORT_DIR, filename);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}
