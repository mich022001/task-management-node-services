export default {
  testEnvironment: 'node',
  transform: {},
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
  ],
};
