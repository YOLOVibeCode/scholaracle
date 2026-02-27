module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'web',
  rootDir: '.',
  roots: ['<rootDir>/lib', '<rootDir>/app', '<rootDir>/components'],
  testMatch: ['**/?(*.)+(spec|test).ts', '**/?(*.)+(spec|test).tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
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
