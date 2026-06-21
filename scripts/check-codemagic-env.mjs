#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

if (!existsSync(envPath)) {
  console.log('ENV_FILE: missing');
  process.exit(0);
}

const keys = ['CODEMAGIC_API_TOKEN', 'CM_API_TOKEN', 'CODEMAGIC_APP_ID'];
const found = Object.fromEntries(keys.map((key) => [key, false]));

for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
    if (!(key in found)) continue;
  const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  found[key] = Boolean(value);
}

for (const [key, ok] of Object.entries(found)) {
  console.log(`${key}: ${ok ? 'SET' : 'EMPTY'}`);
}
