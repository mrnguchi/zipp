const project = (displayName, match) => ({
  displayName,
  testEnvironment: 'node',
  transform: {},
  testMatch: [`<rootDir>/dist-test/${match}`],
  testTimeout: 15000,
});
module.exports = {
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'dist-test/src/**/*.js',
    '!dist-test/src/**/*.spec.js',
    '!dist-test/src/generated/**',
  ],
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: { global: { branches: 80 } },
  projects: [
    project('unit', 'src/**/*.spec.js'),
    project('e2e', 'tests/e2e/**/*.spec.js'),
    project('integration', 'tests/integration/**/*.spec.js'),
  ],
};
