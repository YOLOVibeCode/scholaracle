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
        'max-depth': ['error', 6],
        'max-lines-per-function': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 90],
      },
    },
    {
      files: ['src/routes/students/students.ts'],
      rules: {
        'max-lines-per-function': ['warn', { max: 850, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 50],
      },
    },
    {
      files: ['src/server.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'variable', filter: { regex: '^(MongoQueue|SyncScheduler)$', match: true }, format: ['PascalCase'] },
          { selector: 'variable', filter: { regex: '^(MongoQueue|SyncScheduler)$', match: false }, format: ['camelCase', 'UPPER_CASE'] },
        ],
      },
    },
    {
      files: ['src/services/scraper-generator/**/*.ts'],
      rules: {
        'no-useless-escape': 'off',
        'max-lines-per-function': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 25],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
    {
      files: ['src/routes/settings/settings.ts'],
      rules: { complexity: ['warn', 25] },
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

