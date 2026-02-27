const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'workers',
  rootDir: '.',
  testEnvironment: 'node',
  coverageThreshold: {
    global: { statements: 37, branches: 47, functions: 22, lines: 38 },
  },
};

