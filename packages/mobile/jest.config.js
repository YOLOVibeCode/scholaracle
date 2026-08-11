/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.generated.ts',
  ],
  // Starting thresholds — raise as screen/component coverage grows.
  coverageThreshold: {
    global: { statements: 28, branches: 16, functions: 25, lines: 28 },
  },
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
