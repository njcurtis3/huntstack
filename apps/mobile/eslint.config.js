// Flat config. CommonJS on purpose: apps/mobile has no "type": "module" —
// React Native's Babel/Metro config resolution does not want one.
// eslint-config-expo/flat carries the React Native, React Hooks and import
// rules that match the installed SDK, so this file only adds the ignores.
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', '.expo/**', 'expo-env.d.ts'],
  },
  expoConfig,
])
