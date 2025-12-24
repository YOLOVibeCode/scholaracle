const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'connector',
  rootDir: '.',
  testEnvironment: 'node',
};


