const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'workers',
  rootDir: '.',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/scripts/**',
  ],
  coverageThreshold: {
    global: { statements: 37, branches: 47, functions: 22, lines: 38 },
  },
};

