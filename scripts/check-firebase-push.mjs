#!/usr/bin/env node
/**
 * Firebase service account dosyasını doğrula — push third-party-auth teşhisi.
 * Kullanım: node scripts/check-firebase-push.mjs indirilen-key.json
 */
import { readFileSync } from 'node:fs';
import { parseServiceAccount, validateServiceAccount } from '../api/_lib/serviceAccount.js';
import { probeFcmCredentials } from '../api/_lib/fcmProbe.js';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Kullanım: node scripts/check-firebase-push.mjs indirilen-key.json');
  process.exit(1);
}

const raw = readFileSync(inputPath, 'utf8');
const account = parseServiceAccount(raw);
const structureError = validateServiceAccount(account);

if (structureError) {
  console.error('Yapı hatası:', structureError);
  process.exit(1);
}

const probe = await probeFcmCredentials(account);
if (!probe.ok) {
  console.error('FCM OAuth başarısız:', probe.message);
  console.error('Firebase Console → Service accounts → yeni private key indirin.');
  process.exit(1);
}

console.log('Service account geçerli ve FCM OAuth başarılı.');
console.log('project_id:', account.project_id);
console.log('client_email:', account.client_email);
