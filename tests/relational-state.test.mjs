import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('USE_RELATIONAL_STATE bayrağı relationalConfig içinde tanımlı', () => {
  const source = readFileSync(join(root, 'api/_lib/relationalConfig.js'), 'utf8');
  assert.match(source, /USE_RELATIONAL_STATE/);
  assert.match(source, /GLOBAL_STATE_KEYS/);
  assert.match(source, /RELATIONAL_STATE_KEYS/);
});

test('appState loadAppState relational modu destekler', () => {
  const source = readFileSync(join(root, 'api/_lib/appState.js'), 'utf8');
  assert.match(source, /composeStateFromRelational/);
  assert.match(source, /composeStateForCustomer/);
  assert.match(source, /loadAppStateForCustomer/);
  assert.match(source, /persistStateToRelational/);
});

test('üye state sync hafif compose kullanır', () => {
  const stateApi = readFileSync(join(root, 'api/state.js'), 'utf8');
  assert.match(stateApi, /loadAppStateForCustomer/);
  assert.match(stateApi, /getSessionForBootstrap/);
  const relational = readFileSync(join(root, 'api/_lib/relationalState.js'), 'utf8');
  assert.match(relational, /composeStateForCustomer/);
});

test('adminLoyalty relational sadakat yolunu kullanır', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/adminLoyalty.js'), 'utf8');
  assert.match(source, /applyLoyaltyActionRelational/);
  assert.match(source, /loadCustomerSummaryRelational/);
});

test('migration script doğru şema yolunu kullanır', () => {
  const source = readFileSync(join(root, 'scripts/migrate-jsonb-to-relational.mjs'), 'utf8');
  assert.match(source, /scripts\/sql\/001_normalized_schema\.sql/);
  assert.match(source, /grantAdminByPhone/);
  assert.match(source, /customer_emails/);
});
