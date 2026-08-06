/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@scholaracle/contracts$': '<rootDir>/../contracts/src/index.ts',
    // Use built dist so DOM-extractor source isn't typechecked under mobile tsconfig
    '^@scholaracle/scraper-core$': '<rootDir>/../scraper-core/dist/index.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: {
          ignoreCodes: [2488],
        },
      },
    ],
  },
};
