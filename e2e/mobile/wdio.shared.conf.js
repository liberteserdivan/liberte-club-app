export const config = {
  runner: 'local',
  maxInstances: 1,
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 300_000
  },
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  autoCompileOpts: {
    autoCompile: false
  }
};
