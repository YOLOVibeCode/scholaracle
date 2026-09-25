const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'store-client',
  rootDir: '.',
  testEnvironment: 'node',
  globalSetup: undefined,
  globalTeardown: undefined,
};
