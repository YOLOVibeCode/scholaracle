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
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
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
        format: ['camelCase', 'UPPER_CASE']
      },
      {
        selector: 'variable',
        types: ['boolean'],
        format: ['PascalCase'],
        prefix: ['is', 'has', 'should', 'can', 'did', 'will']
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
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
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
    'complexity': ['error', 10],
    'max-depth': ['error', 3],
    'max-lines-per-function': [
      'error',
      { max: 50, skipBlankLines: true, skipComments: true }
    ]
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'max-lines-per-function': 'off',
        '@typescript-eslint/unbound-method': 'off',
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
            format: ['camelCase', 'UPPER_CASE'],
            filter: {
              regex: '^(result|mock|callArgs)$',
              match: true
            }
          },
          {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE']
          },
          {
            selector: 'variable',
            types: ['boolean'],
            format: ['PascalCase'],
            prefix: ['is', 'has', 'should', 'can', 'did', 'will']
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

