module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Use an ephemeral MongoDB for jest runs so test suites are self-contained.
  // This sets process.env.MONGODB_URI + MONGODB_DB_NAME before tests execute.
  // Note: package jest configs set rootDir to their package folder, so we go up to monorepo root.
  globalSetup: '<rootDir>/../../jest.mongodb.setup.js',
  globalTeardown: '<rootDir>/../../jest.mongodb.teardown.js',
  // Many test suites share the same local MongoDB database/collections.
  // Running in parallel can cause cross-suite interference (deleteMany collisions).
  // Keep Jest single-worker for deterministic results.
  maxWorkers: 1,
  // Force Jest to exit after tests complete, even if MongoDB connections are still open.
  // This prevents Jest from hanging indefinitely waiting for connections to close.
  // Tests should still close connections properly in afterAll hooks, but this is a safety net.
  forceExit: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        isolatedModules: true
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 51,
      functions: 61,
      lines: 64,
      statements: 62
    }
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary']
};

