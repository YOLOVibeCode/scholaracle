const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
};

