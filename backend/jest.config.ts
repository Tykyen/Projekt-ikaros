// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/*.(spec|test).ts',
    '<rootDir>/scripts/**/*.(spec|test).ts',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  clearMocks: true,
};

export default config;
