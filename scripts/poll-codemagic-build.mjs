#!/usr/bin/env node
/**
 * Codemagic build durumunu izler.
 * Kullanım: node scripts/poll-codemagic-build.mjs <buildId>
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildId = process.argv[2];

if (!buildId) {
  console.error('buildId gerekli');
  process.exit(1);
}

function loadLocalEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const token = String(process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN || '').trim();
if (!token) {
  console.error('CODEMAGIC_API_TOKEN eksik');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const terminalStatuses = new Set(['finished', 'failed', 'canceled', 'cancelled', 'skipped', 'timeout']);

for (let attempt = 1; attempt <= 90; attempt += 1) {
  const response = await fetch(`https://api.codemagic.io/builds/${buildId}`, {
    headers: { 'x-auth-token': token }
  });
  const payload = await response.json();
  const build = payload.build || payload;

  const status = String(build.status || build.buildStatus || 'unknown');
  const stage = build.currentStep?.name || build.currentStep || '';
  const finishedAt = build.finishedAt || null;

  console.log(JSON.stringify({
    attempt,
    status,
    stage,
    finishedAt,
    branch: build.branch || null,
    workflowId: build.workflowId || null
  }));

  if (terminalStatuses.has(status)) {
    if (build.error) {
      console.log('ERROR:', typeof build.error === 'string' ? build.error : JSON.stringify(build.error));
    }
    if (build.stackTrace) {
      console.log('STACK:', build.stackTrace);
    }
    if (Array.isArray(build.buildActions)) {
      const failed = build.buildActions.filter((action) => action.status === 'failed');
      for (const action of failed) {
        console.log('FAILED_STEP:', action.name || action.type);
        if (action.logUrl) console.log('LOG_URL:', action.logUrl);
      }
    }
    process.exit(status === 'finished' ? 0 : 1);
  }

  await sleep(20000);
}

console.error('Timeout: build 30 dakika icinde tamamlanmadi');
process.exit(2);
