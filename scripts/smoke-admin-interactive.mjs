#!/usr/bin/env node
/**
 * Admin üye smoke testi — PIN'leri terminalde sorar, .env dosyası gerekmez.
 *
 * Kullanım:
 *   node scripts/smoke-admin-interactive.mjs
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Gizli PIN girişi (Windows PowerShell / CMD uyumlu)
async function askSecret(label) {
  const rl = readline.createInterface({ input, output });
  try {
    return String(await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
}

const adminPin = process.env.ADMIN_PIN || process.env.SMOKE_ADMIN_PIN || await askSecret(
  'Admin panel PIN (4 hane, tek satırda yaz)'
);
const customerPin = process.env.SMOKE_ADMIN_CUSTOMER_PIN
  || process.env.SMOKE_CUSTOMER_PIN
  || await askSecret(
    'Uygulama giriş PIN (5058665406 — 4 hane, tek satırda, Enter sonrası)'
  );

if (!adminPin || !customerPin) {
  console.error('\nHATA: İki PIN de gerekli. Boş bırakılamaz.\n');
  process.exit(1);
}

if (adminPin.length !== 4 || customerPin.length !== 4) {
  console.error(`\nHATA: PIN 4 hane olmalı. Girilen: admin=${adminPin.length} hane, giriş=${customerPin.length} hane.`);
  console.error('Tek satırda yazıp Enter\'a bas (ör. 6595 — Enter\'a erken basma).\n');
  process.exit(1);
}

console.log('\nCanlı sunucu test ediliyor (https://app.libertegastrocafe.com)…\n');

const child = spawn(
  process.execPath,
  [join(root, 'scripts', 'smoke-admin-members.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ADMIN_PIN: adminPin,
      SMOKE_ADMIN_CUSTOMER_PIN: customerPin
    }
  }
);

child.on('exit', (code) => process.exit(code ?? 1));
