/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/src/test/chrome-mock.ts'],
  moduleNameMapper: {
    '^@scholaracle/contracts$': '<rootDir>/../contracts/src/index.ts',
    '^@scholaracle/scraper-core$': '<rootDir>/../scraper-core/src/index.ts',
  },
};
