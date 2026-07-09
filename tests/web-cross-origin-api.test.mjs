import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from '../src/lib/apiClient.js';
import { isCrossOriginWebClient } from '../src/lib/siteOrigins.js';

test('Same-origin web relative API path kullanir', () => {
  assert.equal(resolveApiUrl('/api/auth/login', false, 'https://app.liberte.cafe'), '/api/auth/login');
});

test('Cross-origin web absolute API URL kullanir', () => {
  assert.equal(
    resolveApiUrl('/api/auth/login', true, 'https://app.liberte.cafe'),
    'https://app.liberte.cafe/api/auth/login'
  );
});

test('isCrossOriginWebClient window yokken false', () => {
  assert.equal(isCrossOriginWebClient('https://app.liberte.cafe'), false);
});
