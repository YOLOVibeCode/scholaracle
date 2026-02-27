module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      // CLI entry point: console is intentional for user output
      files: ['src/harness/harness.ts'],
      rules: {
        'no-console': 'off',
        'complexity': ['warn', 25],
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['src/harness/validate-envelope.ts'],
      rules: { 'complexity': ['warn', 45] },
    },
    {
      files: ['src/oneroster/oneroster-client.ts'],
      rules: { 'no-constant-condition': 'off' },
    },
    {
      files: ['src/reconciliation/subject-reconciler.ts'],
      rules: { 'complexity': ['warn', 25] },
    },
    {
      // Live tests and harness scripts may use console/require
      files: ['src/**/*.live.test.ts', 'src/harness/**/*.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['src/aeries/aeries-adapter.ts'],
      rules: {
        'max-depth': ['error', 6],
        'complexity': ['warn', 25],
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
