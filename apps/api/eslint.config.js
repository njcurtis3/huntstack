import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow explicit any in API routes where Drizzle/Fastify types are loose
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused vars prefixed with _ (convention for intentionally unused)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
