// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
]);
