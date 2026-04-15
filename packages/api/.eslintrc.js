module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  overrides: [
    {
      files: ['src/routes/seed/seed.ts'],
      rules: {
        'max-depth': ['warn', 6],
      },
    },
    {
      files: ['src/server.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'variable', filter: { regex: '^(MongoQueue|SyncScheduler)$', match: true }, format: ['PascalCase'] },
          { selector: 'variable', filter: { regex: '^(MongoQueue|SyncScheduler)$', match: false }, format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        ],
      },
    },
    {
      files: ['src/services/scraper-generator/**/*.ts'],
      rules: {
        'no-useless-escape': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
    {
      files: ['src/routes/sync/sync.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
    {
      files: ['src/routes/seed/demo-data.ts'],
      rules: {
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'interface', filter: { regex: '^Demo', match: true }, format: ['PascalCase'] },
          { selector: 'interface', filter: { regex: '^Demo', match: false }, format: ['PascalCase'], prefix: ['I'] },
        ],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
    {
      files: ['src/routes/assets/assets.ts'],
      rules: {
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'variable', filter: { regex: '^Readable$', match: true }, format: ['PascalCase'] },
        ],
      },
    },
    {
      files: ['src/routes/admin/customers/customers.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    },
    {
      files: ['src/middleware/adminStepUp.ts', 'src/middleware/rateLimit.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
  ],
};
