module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  overrides: [
    {
      files: ['src/adapter-runner.ts'],
      rules: {
        'no-console': 'off',
        'complexity': ['warn', 25],
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'variable', filter: { regex: '^(Canvas|GoogleClassroom|OneRoster|Aeries)Adapter$', match: true }, format: ['PascalCase'] },
          { selector: 'variable', filter: { regex: '^(Canvas|GoogleClassroom|OneRoster|Aeries)Adapter$', match: false }, format: ['camelCase', 'UPPER_CASE'] },
          { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        ],
      },
    },
  ],
};

