module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ['dist', 'ios', 'android', '.expo', 'jest.config.js', '.eslintrc.js'],
  rules: {
    // React Native components are PascalCase functions returning JSX.
    '@typescript-eslint/naming-convention': 'off',
  },
  overrides: [
    {
      files: ['*.tsx'],
      rules: {
        // RN styles objects at file bottom + JSX pragma patterns
        '@typescript-eslint/no-use-before-define': 'off',
      },
    },
  ],
};
