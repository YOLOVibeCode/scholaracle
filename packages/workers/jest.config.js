const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'workers',
  rootDir: '.',
  testEnvironment: 'node',
};

