#!/usr/bin/env node
/**
 * QR endpoint teşhis — oturumsuz ve imza durumu
 * Kullanım: node scripts/probe-qr-api.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQrSigningSecret, createCustomerQrToken, formatQrPayload } from '../api/_lib/qrToken.js';
import { diagFetchInit } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const signing = resolveQrSigningSecret();
console.log('signingSource:', signing.source);
console.log('signingReady:', Boolean(signing.secret));

if (signing.secret) {
  const issued = createCustomerQrToken(1781893223931);
  const payload = formatQrPayload(issued.token);
  console.log('sampleTokenLength:', issued.token.length);
  console.log('samplePayloadLength:', payload.length);
  console.log('samplePayloadPrefix:', payload.slice(0, 24) + '...');
}

const base = process.env.QR_PROBE_URL || 'https://app.libertegastrocafe.com';
const started = Date.now();
const res = await fetch(`${base}/api/qr/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const body = await res.text();
console.log('\nProduction probe (oturumsuz):');
console.log('endpoint:', `${base}/api/qr/generate`);
console.log('httpStatus:', res.status);
console.log('durationMs:', Date.now() - started);
console.log('body:', body.slice(0, 500));

const qrStatusRes = await fetch(`${base}/api/config?resource=qr-status`, diagFetchInit());
const qrStatus = await qrStatusRes.json();
console.log('\nqr-status:', JSON.stringify(qrStatus, null, 2));
