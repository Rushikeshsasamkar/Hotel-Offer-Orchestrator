/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testTimeout: 60000,
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
};
