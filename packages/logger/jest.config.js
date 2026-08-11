const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'logger',
  rootDir: '.',
  testEnvironment: 'node',
  // No MongoDB needed for logger tests.
  globalSetup: undefined,
  globalTeardown: undefined,
  coverageThreshold: {
    global: { statements: 90, branches: 75, functions: 90, lines: 90 },
  },
};
