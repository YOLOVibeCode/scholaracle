const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'auth',
  rootDir: '.',
  testEnvironment: 'node',
};

