#!/usr/bin/env node
/**
 * Codemagic workflow tetikleyici (ios-release / android-release).
 *
 * Kullanım:
 *   CODEMAGIC_API_TOKEN=... CODEMAGIC_APP_ID=... node scripts/trigger-codemagic.mjs ios-release
 *   CODEMAGIC_API_TOKEN=... CODEMAGIC_APP_ID=... node scripts/trigger-codemagic.mjs android-release
 */
const workflowId = process.argv[2] || 'ios-release';
const branch = process.argv[3] || 'main';
const token = String(process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN || '').trim();
const appId = String(process.env.CODEMAGIC_APP_ID || '').trim();

const validWorkflows = new Set(['ios-release', 'android-release']);

if (!validWorkflows.has(workflowId)) {
  console.error(`Geçersiz workflow: ${workflowId}. Seçenekler: ios-release, android-release`);
  process.exit(1);
}

if (!token) {
  console.error('CODEMAGIC_API_TOKEN eksik. Codemagic → Account settings → API token');
  process.exit(1);
}

if (!appId) {
  console.error('CODEMAGIC_APP_ID eksik. Codemagic → App settings → Application ID');
  process.exit(1);
}

const body = {
  appId,
  workflowId,
  branch
};

const response = await fetch('https://api.codemagic.io/builds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-auth-token': token
  },
  body: JSON.stringify(body)
});

const text = await response.text();
let payload = text;
try {
  payload = JSON.parse(text);
} catch {
  // Ham metin
}

if (!response.ok) {
  console.error(`Codemagic hata (${response.status}):`, payload);
  process.exit(1);
}

console.log(`Build tetiklendi: workflow=${workflowId} branch=${branch}`);
console.log(JSON.stringify(payload, null, 2));
