const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
  coverageThreshold: {
    global: { statements: 53, branches: 32, functions: 62, lines: 54 },
  },
};

