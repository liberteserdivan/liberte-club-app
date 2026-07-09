import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_API_ORIGIN,
  DEFAULT_PUBLIC_SITE_ORIGIN
} from '../src/lib/siteOrigins.js';
import { resolvePublicSiteOrigin } from '../api/_lib/siteOrigins.js';

test('Web ve API varsayilan domainleri ayridir', () => {
  assert.equal(DEFAULT_API_ORIGIN, 'https://app.liberte.cafe');
  assert.equal(DEFAULT_PUBLIC_SITE_ORIGIN, 'https://libertegastrocafe.com');
  assert.notEqual(DEFAULT_API_ORIGIN, DEFAULT_PUBLIC_SITE_ORIGIN);
});

test('Sunucu public site origin env olmadan libertegastrocafe.com', () => {
  const prev = process.env.PUBLIC_SITE_ORIGIN;
  delete process.env.PUBLIC_SITE_ORIGIN;
  assert.equal(resolvePublicSiteOrigin(), 'https://libertegastrocafe.com');
  if (prev) process.env.PUBLIC_SITE_ORIGIN = prev;
});
