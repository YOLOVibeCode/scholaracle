const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'connector',
  rootDir: '.',
  testEnvironment: 'node',
  // Connector is a pure Node CLI tool with no MongoDB dependency.
  globalSetup: undefined,
  globalTeardown: undefined,
};


