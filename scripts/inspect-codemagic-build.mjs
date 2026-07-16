#!/usr/bin/env node
/**
 * Codemagic build detaylarini yazdirir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildId = process.argv[2];

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const token = process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN;
const response = await fetch(`https://api.codemagic.io/builds/${buildId}`, {
  headers: { 'x-auth-token': token }
});
const payload = await response.json();
const build = payload.build || payload;

const summary = {
  buildId,
  status: build.status,
  branch: build.branch,
  workflowId: build.workflowId,
  startedAt: build.startedAt,
  finishedAt: build.finishedAt,
  appVersion: build.appVersion,
  buildNumber: build.buildNumber,
  index: build.index,
  error: build.error || null,
  publishing: build.publishers || build.publishing || null,
  artifacts: (build.artefacts || build.artifacts || []).map((item) => ({
    name: item.name,
    type: item.type,
    url: item.url
  }))
};

console.log(JSON.stringify(summary, null, 2));
