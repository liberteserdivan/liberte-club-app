// Liberte Club — temel ESLint (flat config).
// Amaç: build'i kırmadan temel React/Vite + Node hijyenini sağlamak.
// Kurallar ilk etapta 'warn' seviyesinde tutulur (CI/build'i kırmaz).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'public/**',
      'audit-export/**',
      'eslint.config.js',
      'vite.config.js'
    ]
  },

  // İstemci (tarayıcı) kodu — React + JSX
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    },
    plugins: { 'react-hooks': reactHooks, react: reactPlugin },
    rules: {
      ...js.configs.recommended.rules,
      // JSX'te kullanılan bileşen/değişkenleri "kullanılıyor" say — aksi halde
      // no-unused-vars JSX içinde geçen importları yanlışlıkla unused gösteriyordu.
      'react/jsx-uses-vars': 'warn',
      'react/jsx-uses-react': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-undef': 'warn',
      // Stilistik kurallar build'i kırmasın — ilk etapta uyarı seviyesinde
      'no-extra-boolean-cast': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // Sunucu / script / test kodu — Node ortamı
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-extra-boolean-cast': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn'
    }
  }
];
