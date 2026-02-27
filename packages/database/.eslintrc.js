module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/no-redundant-type-constituents': 'off',
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/naming-convention': [
          'error',
          { selector: 'interface', filter: { regex: 'Document$', match: true }, format: ['PascalCase'] },
          { selector: 'interface', filter: { regex: 'Document$', match: false }, format: ['PascalCase'], prefix: ['I'] },
          { selector: 'typeAlias', format: ['PascalCase'] },
          { selector: 'class', format: ['PascalCase'] },
          { selector: 'method', format: ['camelCase'] },
          { selector: 'method', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require' },
          { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
          { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
          { selector: 'enum', format: ['PascalCase'] },
          { selector: 'enumMember', format: ['UPPER_CASE'] },
        ],
      },
    },
    {
      files: ['**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  ],
};

