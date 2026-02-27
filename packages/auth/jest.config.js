const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'auth',
  rootDir: '.',
  testEnvironment: 'node',
  coverageThreshold: {
    global: { statements: 53, branches: 42, functions: 74, lines: 53 },
  },
};

