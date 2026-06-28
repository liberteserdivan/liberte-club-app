#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = ['.env', '.env.local', '.env.vercel.tmp'];

for (const name of candidates) {
  const envPath = join(root, name);
  if (!existsSync(envPath)) {
    console.log(`${name}: missing`);
    continue;
  }

  const raw = readFileSync(envPath);
  const text = raw.toString('utf8');
  console.log(`${name}: bytes=${raw.length} bom=${raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf}`);

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/codemagic|cm_api/i.test(trimmed)) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      console.log(`  bad line: ${trimmed.slice(0, 48)}`);
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    console.log(`  ${JSON.stringify(key)} len=${value.length} empty=${!value}`);
  }
}
