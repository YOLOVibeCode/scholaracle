module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'interface',
        filter: {
          regex: '^(NotificationData|NotificationAction|DeliveryResult|AlertData)$',
          match: false
        },
        format: ['PascalCase'],
        prefix: ['I']
      },
      {
        selector: 'interface',
        filter: {
          regex: '^(NotificationData|NotificationAction|DeliveryResult|AlertData)$',
          match: true
        },
        format: ['PascalCase']
      },
      {
        selector: 'typeAlias',
        format: ['PascalCase']
      },
      {
        selector: 'class',
        format: ['PascalCase']
      },
      {
        selector: 'method',
        format: ['camelCase']
      },
      {
        selector: 'method',
        modifiers: ['private'],
        format: ['camelCase'],
        leadingUnderscore: 'require'
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase']
      },
      {
        selector: 'parameter',
        format: ['camelCase'],
        leadingUnderscore: 'allow'
      },
      {
        selector: 'enum',
        format: ['PascalCase']
      },
      {
        selector: 'enumMember',
        format: ['UPPER_CASE']
      }
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    // Return types: warn-level so hook stays quiet but CI --max-warnings=0 still enforces.
    // Inference is correct 99% of the time; prefer explicit at module boundaries.
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    'quotes': ['error', 'single', { avoidEscape: true }],
    'prefer-template': 'error',
    'no-useless-concat': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'no-throw-literal': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Complexity and function-length heuristics create pressure to artificially
    // split code, which often makes it worse. Disabled; rely on types/tests/review.
    'complexity': 'off',
    'max-lines-per-function': 'off',
    // Deep nesting is contextual — often legitimate in data-walking code. Warn, don't block.
    'max-depth': ['warn', 4]
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'complexity': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'interface',
            filter: {
              regex: '^(NotificationData|NotificationAction|DeliveryResult|AlertData)$',
              match: false
            },
            format: ['PascalCase'],
            prefix: ['I']
          },
          {
            selector: 'interface',
            filter: {
              regex: '^(NotificationData|NotificationAction|DeliveryResult|AlertData)$',
              match: true
            },
            format: ['PascalCase']
          },
          {
            selector: 'typeAlias',
            format: ['PascalCase']
          },
          {
            selector: 'class',
            format: ['PascalCase']
          },
          {
            selector: 'method',
            format: ['camelCase']
          },
          {
            selector: 'method',
            modifiers: ['private'],
            format: ['camelCase'],
            leadingUnderscore: 'require'
          },
          {
            selector: 'variable',
            format: ['camelCase', 'PascalCase', 'UPPER_CASE']
          },
          {
            selector: 'parameter',
            format: ['camelCase'],
            leadingUnderscore: 'allow'
          },
          {
            selector: 'enum',
            format: ['PascalCase']
          },
          {
            selector: 'enumMember',
            format: ['UPPER_CASE']
          }
        ],
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off'
      }
    }
  ]
};

