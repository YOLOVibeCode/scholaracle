module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'web',
  rootDir: '.',
  roots: ['<rootDir>/lib', '<rootDir>/app', '<rootDir>/components'],
  testMatch: ['**/?(*.)+(spec|test).ts', '**/?(*.)+(spec|test).tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@scholaracle/studio-core$': '<rootDir>/../studio-core/src/index.ts',
    '^@scholaracle/contracts$': '<rootDir>/../contracts/src/index.ts',
    '^@scholaracle/interfaces$': '<rootDir>/../interfaces/src/index.ts',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          esModuleInterop: true,
          strict: true,
          paths: { '@/*': ['./*'] },
        },
      },
    ],
  },
  // No global setupFilesAfterEnv — component tests that need jest-dom matchers import '@testing-library/jest-dom' in-file
  // No MongoDB needed for web tests
  globalSetup: undefined,
  globalTeardown: undefined,
  maxWorkers: 1,
  forceExit: true,
  collectCoverageFrom: [
    'lib/**/*.ts',
    'lib/**/*.tsx',
    '!lib/**/*.test.ts',
    '!lib/**/*.test.tsx',
    '!lib/**/index.ts',
  ],
  coverageDirectory: 'coverage',
};
