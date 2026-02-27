const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
  coverageThreshold: {
    global: { statements: 56, branches: 35, functions: 62, lines: 57 },
  },
};

