const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'studio-core',
  rootDir: '.',
  testEnvironment: 'node',
  globalSetup: undefined,
  globalTeardown: undefined,
  coverageThreshold: {
    global: { statements: 85, branches: 75, functions: 90, lines: 85 },
  },
};
