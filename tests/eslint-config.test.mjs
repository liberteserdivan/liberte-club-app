import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ESLint config eslint-plugin-react ve jsx-uses-vars kullanır', () => {
  const source = readFileSync(join(root, 'eslint.config.js'), 'utf8');
  assert.match(source, /eslint-plugin-react/);
  assert.match(source, /react: reactPlugin/);
  assert.match(source, /'react\/jsx-uses-vars'/);
});

test('eslint-plugin-react package.json devDependencies içinde', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(
    pkg.devDependencies && pkg.devDependencies['eslint-plugin-react'],
    'eslint-plugin-react devDependency olmalı'
  );
});
