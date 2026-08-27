const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@scholaracle/studio-core$': '<rootDir>/../studio-core/src/index.ts',
    '^@scholaracle/interfaces$': '<rootDir>/../interfaces/src/index.ts',
  },
  coverageThreshold: {
    global: { statements: 53, branches: 32, functions: 62, lines: 54 },
  },
};

